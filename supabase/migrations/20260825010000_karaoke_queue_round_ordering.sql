alter table public.karaoke_song_requests
  add column queue_round bigint;

with ranked_active as (
  select
    s.id,
    pg_catalog.row_number() over (
      partition by s.room_id, s.participant_id
      order by s.enqueue_sequence
    ) - 1 as queue_round
  from public.karaoke_song_requests as s
  where s.status in ('pending', 'selected', 'playing')
)
update public.karaoke_song_requests as s
set queue_round = ranked_active.queue_round
from ranked_active
where ranked_active.id = s.id;

update public.karaoke_song_requests
set queue_round = 0
where queue_round is null;

alter table public.karaoke_song_requests
  alter column queue_round set default 0,
  alter column queue_round set not null,
  add constraint karaoke_song_requests_queue_round_check
    check (queue_round >= 0);

create unique index karaoke_song_requests_participant_active_round_idx
  on public.karaoke_song_requests (room_id, participant_id, queue_round)
  where status in ('pending', 'selected', 'playing');

create index karaoke_song_requests_room_pending_round_idx
  on public.karaoke_song_requests (room_id, queue_round, enqueue_sequence)
  where status = 'pending';

create or replace function public.karaoke_select_next_locked(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_song_id uuid;
begin
  perform ps.room_id
  from public.karaoke_playback_state as ps
  where ps.room_id = p_room_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'playback_state_missing';
  end if;
  if exists (
    select 1 from public.karaoke_playback_state as ps
    where ps.room_id = p_room_id and ps.current_song_id is not null
  ) then
    raise exception using errcode = '23514', message = 'current_song_already_selected';
  end if;

  select s.id
  into v_song_id
  from public.karaoke_song_requests as s
  join public.karaoke_participants as p
    on p.room_id = s.room_id and p.id = s.participant_id
  where s.room_id = p_room_id
    and s.status = 'pending'
    and p.status = 'active'
  order by s.queue_round, s.enqueue_sequence
  limit 1;

  if v_song_id is null then
    update public.karaoke_playback_state
    set current_song_id = null,
        player_state = 'idle',
        updated_at = statement_timestamp()
    where room_id = p_room_id;
    return null;
  end if;

  update public.karaoke_song_requests
  set status = 'selected', selected_at = statement_timestamp()
  where id = v_song_id and room_id = p_room_id and status = 'pending';
  if not found then
    raise exception using errcode = '40001', message = 'next_song_selection_conflict';
  end if;

  update public.karaoke_playback_state
  set current_song_id = v_song_id,
      player_state = 'selected',
      updated_at = statement_timestamp()
  where room_id = p_room_id;
  return v_song_id;
end;
$$;

create or replace function public.karaoke_project_upcoming(
  p_room_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1
    from public.karaoke_playback_state as ps
    where ps.room_id = p_room_id
  ) then
    raise exception using errcode = 'P0002', message = 'playback_state_missing';
  end if;
  if p_limit is null or p_limit <= 0 then
    return v_result;
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(ordered.item order by ordered.queue_round, ordered.enqueue_sequence),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      song.queue_round,
      song.enqueue_sequence,
      pg_catalog.jsonb_build_object(
        'id', song.id,
        'participantId', participant.id,
        'singerName', participant.display_name,
        'youtubeVideoId', song.youtube_video_id,
        'title', song.title,
        'channelTitle', song.channel_title,
        'thumbnailUrl', song.thumbnail_url,
        'durationSeconds', song.duration_seconds,
        'enqueueSequence', song.enqueue_sequence,
        'status', song.status
      ) as item
    from public.karaoke_song_requests as song
    join public.karaoke_participants as participant
      on participant.room_id = song.room_id
      and participant.id = song.participant_id
    where song.room_id = p_room_id
      and song.status = 'pending'
      and participant.status = 'active'
    order by song.queue_round, song.enqueue_sequence
    limit case when p_limit < 150 then p_limit else 150 end
  ) as ordered;

  return v_result;
end;
$$;

create or replace function public.karaoke_add_song(
  p_room_code text,
  p_guest_token_hash text,
  p_youtube_video_id text,
  p_title text,
  p_channel_title text,
  p_thumbnail_url text,
  p_duration_seconds integer,
  p_metadata_refreshed_at timestamptz,
  p_client_request_id uuid,
  p_request_id uuid,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.karaoke_rooms%rowtype;
  v_participant_id uuid;
  v_song_id uuid;
  v_queue_round bigint;
  v_duplicate_warning_count integer;
  v_replay jsonb;
  v_previous_version bigint;
  v_version bigint;
  v_result jsonb;
begin
  select r.* into v_room from public.karaoke_rooms as r where r.room_code = p_room_code;
  if not found then raise exception using errcode = 'P0002', message = 'room_not_found'; end if;
  perform public.karaoke_lock_room(v_room.id);
  select r.* into v_room from public.karaoke_rooms as r where r.id = v_room.id for update;
  perform public.karaoke_require_open_room(v_room.id);
  v_participant_id := public.karaoke_require_participant(v_room.id, p_guest_token_hash);
  v_replay := public.karaoke_replay_result(v_room.id, p_request_id, p_request_fingerprint);
  if v_replay is not null then return v_replay; end if;

  if p_client_request_id is null
    or p_youtube_video_id is null or p_youtube_video_id !~ '^[A-Za-z0-9_-]{11}$'
    or p_duration_seconds is null or p_duration_seconds < 1
    or p_duration_seconds > v_room.max_video_duration_seconds
    or p_metadata_refreshed_at is null
    or p_metadata_refreshed_at < statement_timestamp() - interval '10 minutes'
    or p_metadata_refreshed_at > statement_timestamp() + interval '1 minute' then
    raise exception using errcode = '22023', message = 'song_metadata_invalid';
  end if;
  if p_title is null or pg_catalog.char_length(p_title) not between 1 and 200
    or p_title ~ '[[:cntrl:]]'
    or p_channel_title is null or pg_catalog.char_length(p_channel_title) not between 1 and 120
    or p_channel_title ~ '[[:cntrl:]]'
    or p_thumbnail_url is null or pg_catalog.char_length(p_thumbnail_url) not between 8 and 2048
    or p_thumbnail_url !~ '^https://' then
    raise exception using errcode = '22023', message = 'song_text_metadata_invalid';
  end if;
  if (
    select pg_catalog.count(*) from public.karaoke_song_requests as s
    where s.room_id = v_room.id and s.participant_id = v_participant_id and s.status = 'pending'
  ) >= v_room.max_pending_per_participant then
    raise exception using errcode = '54000', message = 'participant_pending_limit_reached';
  end if;
  if (
    select pg_catalog.count(*) from public.karaoke_song_requests as s
    where s.room_id = v_room.id and s.status = 'pending'
  ) >= v_room.max_total_pending_requests then
    raise exception using errcode = '54000', message = 'room_pending_limit_reached';
  end if;

  select pg_catalog.count(*)::integer into v_duplicate_warning_count
  from public.karaoke_song_requests as s
  where s.room_id = v_room.id
    and s.youtube_video_id = p_youtube_video_id
    and s.status = 'pending';

  select pg_catalog.max(s.queue_round)
  into v_queue_round
  from public.karaoke_song_requests as s
  where s.room_id = v_room.id
    and s.participant_id = v_participant_id
    and s.status in ('pending', 'selected', 'playing');

  if v_queue_round is not null then
    v_queue_round := v_queue_round + 1;
  else
    select coalesce(pg_catalog.min(s.queue_round), 0)
    into v_queue_round
    from public.karaoke_song_requests as s
    where s.room_id = v_room.id
      and s.status in ('pending', 'selected', 'playing');
  end if;

  insert into public.karaoke_song_requests (
    room_id, participant_id, youtube_video_id, title, channel_title, thumbnail_url,
    duration_seconds, metadata_refreshed_at, enqueue_sequence, queue_round, client_request_id
  ) values (
    v_room.id, v_participant_id, p_youtube_video_id, p_title, p_channel_title,
    p_thumbnail_url, p_duration_seconds, p_metadata_refreshed_at,
    v_room.next_enqueue_sequence, v_queue_round, p_client_request_id
  ) returning id into v_song_id;
  update public.karaoke_rooms
  set next_enqueue_sequence = next_enqueue_sequence + 1
  where id = v_room.id;

  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object(
    'song', public.karaoke_song_json(v_song_id),
    'duplicateWarningCount', v_duplicate_warning_count,
    'stateVersion', v_version
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'guest', v_participant_id, 'add_song', v_song_id,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

revoke all on function public.karaoke_select_next_locked(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.karaoke_project_upcoming(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.karaoke_add_song(
  text, text, text, text, text, text, integer, timestamptz, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.karaoke_add_song(
  text, text, text, text, text, text, integer, timestamptz, uuid, uuid, text
) to service_role;

comment on column public.karaoke_song_requests.queue_round is
  'Internal stable scheduling round; public song JSON intentionally omits this field.';
