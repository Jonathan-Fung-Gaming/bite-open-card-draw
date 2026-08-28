alter table public.karaoke_song_requests
  add column front_tier_sequence bigint,
  add constraint karaoke_song_requests_front_tier_sequence_check
    check (front_tier_sequence is null or front_tier_sequence >= 0);

create unique index karaoke_song_requests_participant_active_front_idx
  on public.karaoke_song_requests (room_id, participant_id)
  where status in ('pending', 'selected', 'playing')
    and front_tier_sequence is not null;

create index karaoke_song_requests_room_pending_effective_tier_idx
  on public.karaoke_song_requests (
    room_id,
    (case when front_tier_sequence is not null then 0 else queue_round end),
    (case
      when front_tier_sequence is not null then front_tier_sequence
      else enqueue_sequence
    end),
    enqueue_sequence
  )
  where status = 'pending';

with participant_positions as (
  select
    s.id,
    s.room_id,
    s.queue_round,
    s.enqueue_sequence,
    pg_catalog.row_number() over (
      partition by s.room_id, s.participant_id
      order by s.queue_round, s.enqueue_sequence
    ) as participant_position
  from public.karaoke_song_requests as s
  where s.status in ('pending', 'selected', 'playing')
),
ranked_fronts as (
  select
    positioned.id,
    pg_catalog.row_number() over (
      partition by positioned.room_id
      order by positioned.queue_round, positioned.enqueue_sequence
    ) - 1 as front_tier_sequence
  from participant_positions as positioned
  where positioned.participant_position = 1
)
update public.karaoke_song_requests as s
set front_tier_sequence = ranked.front_tier_sequence
from ranked_fronts as ranked
where ranked.id = s.id;

create function public.karaoke_assign_front_tier_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.front_tier_sequence := null;

  if new.status in ('pending', 'selected', 'playing')
    and not exists (
      select 1
      from public.karaoke_song_requests as existing
      where existing.room_id = new.room_id
        and existing.participant_id = new.participant_id
        and existing.status in ('pending', 'selected', 'playing')
    ) then
    select room.state_version + 1
    into new.front_tier_sequence
    from public.karaoke_rooms as room
    where room.id = new.room_id;
  end if;

  return new;
end;
$$;

create trigger karaoke_song_request_assign_front_tier_trigger
before insert on public.karaoke_song_requests
for each row execute function public.karaoke_assign_front_tier_on_insert();

create function public.karaoke_promote_front_tier_after_terminal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_affected record;
  v_front_tier_sequence bigint;
begin
  for v_affected in
    select distinct old_row.room_id, old_row.participant_id
    from old_rows as old_row
    join new_rows as new_row on new_row.id = old_row.id
    where old_row.status in ('pending', 'selected', 'playing')
      and new_row.status not in ('pending', 'selected', 'playing')
      and old_row.front_tier_sequence is not null
  loop
    if not exists (
      select 1
      from public.karaoke_song_requests as front
      where front.room_id = v_affected.room_id
        and front.participant_id = v_affected.participant_id
        and front.status in ('pending', 'selected', 'playing')
        and front.front_tier_sequence is not null
    ) then
      select room.state_version + 1
      into v_front_tier_sequence
      from public.karaoke_rooms as room
      where room.id = v_affected.room_id;

      update public.karaoke_song_requests as promoted
      set front_tier_sequence = v_front_tier_sequence
      where promoted.id = (
        select candidate.id
        from public.karaoke_song_requests as candidate
        where candidate.room_id = v_affected.room_id
          and candidate.participant_id = v_affected.participant_id
          and candidate.status in ('pending', 'selected', 'playing')
        order by candidate.queue_round, candidate.enqueue_sequence
        limit 1
      );
    end if;
  end loop;

  return null;
end;
$$;

create trigger karaoke_song_request_promote_front_tier_trigger
after update on public.karaoke_song_requests
referencing old table as old_rows new table as new_rows
for each statement execute function public.karaoke_promote_front_tier_after_terminal();

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
  order by
    case when s.front_tier_sequence is not null then 0 else s.queue_round end,
    case
      when s.front_tier_sequence is not null then s.front_tier_sequence
      else s.enqueue_sequence
    end,
    s.enqueue_sequence
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
    pg_catalog.jsonb_agg(
      ordered.item
      order by ordered.effective_tier, ordered.front_order, ordered.enqueue_sequence
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      case when song.front_tier_sequence is not null then 0 else song.queue_round end
        as effective_tier,
      case
        when song.front_tier_sequence is not null then song.front_tier_sequence
        else song.enqueue_sequence
      end as front_order,
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
    order by effective_tier, front_order, song.enqueue_sequence
    limit case when p_limit < 150 then p_limit else 150 end
  ) as ordered;

  return v_result;
end;
$$;

revoke all on function public.karaoke_assign_front_tier_on_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.karaoke_promote_front_tier_after_terminal()
  from public, anon, authenticated, service_role;
revoke all on function public.karaoke_select_next_locked(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.karaoke_project_upcoming(uuid, integer)
  from public, anon, authenticated, service_role;

comment on column public.karaoke_song_requests.front_tier_sequence is
  'Internal ordering marker for when a participant request entered the current front tier; public song JSON intentionally omits this field.';
