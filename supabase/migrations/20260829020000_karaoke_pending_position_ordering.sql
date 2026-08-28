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

  with ranked_pending as (
    select
      s.id,
      s.front_tier_sequence,
      s.enqueue_sequence,
      pg_catalog.row_number() over (
        partition by s.room_id, s.participant_id
        order by s.queue_round, s.enqueue_sequence
      ) - 1 as effective_tier
    from public.karaoke_song_requests as s
    join public.karaoke_participants as p
      on p.room_id = s.room_id and p.id = s.participant_id
    where s.room_id = p_room_id
      and s.status = 'pending'
      and p.status = 'active'
  )
  select pending.id
  into v_song_id
  from ranked_pending as pending
  order by
    pending.effective_tier,
    case
      when pending.effective_tier = 0 then pending.front_tier_sequence
      else null
    end nulls last,
    pending.enqueue_sequence
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

  with ranked_pending as (
    select
      song.id,
      song.participant_id,
      song.youtube_video_id,
      song.title,
      song.channel_title,
      song.thumbnail_url,
      song.duration_seconds,
      song.enqueue_sequence,
      song.status,
      song.front_tier_sequence,
      participant.display_name,
      pg_catalog.row_number() over (
        partition by song.room_id, song.participant_id
        order by song.queue_round, song.enqueue_sequence
      ) - 1 as effective_tier
    from public.karaoke_song_requests as song
    join public.karaoke_participants as participant
      on participant.room_id = song.room_id
      and participant.id = song.participant_id
    where song.room_id = p_room_id
      and song.status = 'pending'
      and participant.status = 'active'
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      ordered.item
      order by ordered.effective_tier, ordered.tier_order, ordered.enqueue_sequence
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      pending.effective_tier,
      case
        when pending.effective_tier = 0 then coalesce(
          pending.front_tier_sequence,
          room.state_version + 1
        )
        else pending.enqueue_sequence
      end as tier_order,
      pending.enqueue_sequence,
      pg_catalog.jsonb_build_object(
        'id', pending.id,
        'participantId', pending.participant_id,
        'singerName', pending.display_name,
        'youtubeVideoId', pending.youtube_video_id,
        'title', pending.title,
        'channelTitle', pending.channel_title,
        'thumbnailUrl', pending.thumbnail_url,
        'durationSeconds', pending.duration_seconds,
        'enqueueSequence', pending.enqueue_sequence,
        'status', pending.status
      ) as item
    from ranked_pending as pending
    join public.karaoke_rooms as room on room.id = p_room_id
    order by effective_tier, tier_order, pending.enqueue_sequence
    limit case when p_limit < 150 then p_limit else 150 end
  ) as ordered;

  return v_result;
end;
$$;

revoke all on function public.karaoke_select_next_locked(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.karaoke_project_upcoming(uuid, integer)
  from public, anon, authenticated, service_role;
