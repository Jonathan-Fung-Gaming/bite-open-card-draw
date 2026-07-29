-- Karaoke Party owns only additive karaoke_-prefixed objects in the shared public schema.
-- Browser roles receive no table access. Trusted server code uses service_role-only RPCs.

create table public.karaoke_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  realtime_topic uuid not null,
  host_token_hash text not null,
  recovery_code_hash text not null,
  status text not null default 'open',
  queue_mode text not null default 'round_robin',
  state_version bigint not null default 0,
  next_rotation_order bigint not null default 1,
  next_enqueue_sequence bigint not null default 1,
  max_pending_per_participant smallint not null default 3,
  max_total_pending_requests smallint not null default 150,
  max_video_duration_seconds integer not null default 1200,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  constraint karaoke_rooms_room_code_key unique (room_code),
  constraint karaoke_rooms_realtime_topic_key unique (realtime_topic),
  constraint karaoke_rooms_host_token_hash_key unique (host_token_hash),
  constraint karaoke_rooms_recovery_code_hash_key unique (recovery_code_hash),
  constraint karaoke_rooms_room_code_check
    check (room_code ~ '^[A-HJ-NP-Z2-9]{7}$'),
  constraint karaoke_rooms_host_token_hash_check
    check (host_token_hash ~ '^[0-9a-f]{64}$'),
  constraint karaoke_rooms_recovery_code_hash_check
    check (recovery_code_hash ~ '^[0-9a-f]{64}$'),
  constraint karaoke_rooms_status_check
    check (status in ('open', 'closed', 'expired')),
  constraint karaoke_rooms_queue_mode_check
    check (queue_mode = 'round_robin'),
  constraint karaoke_rooms_state_version_check
    check (state_version >= 0),
  constraint karaoke_rooms_rotation_counter_check
    check (next_rotation_order between 1 and 1000000),
  constraint karaoke_rooms_enqueue_counter_check
    check (next_enqueue_sequence between 1 and 10000000),
  constraint karaoke_rooms_pending_limit_check
    check (max_pending_per_participant between 1 and 10),
  constraint karaoke_rooms_total_limit_check
    check (max_total_pending_requests between 1 and 500),
  constraint karaoke_rooms_video_duration_check
    check (max_video_duration_seconds between 60 and 7200),
  constraint karaoke_rooms_expiry_check
    check (expires_at > created_at and expires_at <= created_at + interval '24 hours'),
  constraint karaoke_rooms_closed_at_check
    check (
      (status = 'open' and closed_at is null)
      or (status in ('closed', 'expired') and closed_at is not null)
    ),
  constraint karaoke_rooms_updated_at_check
    check (updated_at >= created_at)
);

create table public.karaoke_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  session_token_hash text not null,
  display_name text not null,
  normalized_display_name text not null,
  rotation_order bigint not null,
  status text not null default 'active',
  joined_at timestamptz not null default statement_timestamp(),
  last_seen_at timestamptz not null default statement_timestamp(),
  removed_at timestamptz,
  constraint karaoke_participants_room_id_fkey
    foreign key (room_id) references public.karaoke_rooms(id) on delete cascade,
  constraint karaoke_participants_room_id_id_key unique (room_id, id),
  constraint karaoke_participants_session_token_hash_key unique (session_token_hash),
  constraint karaoke_participants_rotation_key unique (room_id, rotation_order),
  constraint karaoke_participants_session_token_hash_check
    check (session_token_hash ~ '^[0-9a-f]{64}$'),
  constraint karaoke_participants_display_name_check
    check (
      char_length(display_name) between 1 and 40
      and display_name = btrim(display_name)
      and display_name !~ '[[:cntrl:]]'
    ),
  constraint karaoke_participants_normalized_display_name_check
    check (
      char_length(normalized_display_name) between 1 and 40
      and normalized_display_name = lower(normalized_display_name)
      and normalized_display_name = btrim(normalized_display_name)
      and normalized_display_name !~ '[[:cntrl:]]'
    ),
  constraint karaoke_participants_rotation_order_check
    check (rotation_order between 1 and 999999),
  constraint karaoke_participants_status_check
    check (status in ('active', 'removed')),
  constraint karaoke_participants_removed_at_check
    check (
      (status = 'active' and removed_at is null)
      or (status = 'removed' and removed_at is not null)
    ),
  constraint karaoke_participants_last_seen_check
    check (last_seen_at >= joined_at)
);

create table public.karaoke_song_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  participant_id uuid not null,
  youtube_video_id text not null,
  title text not null,
  channel_title text not null,
  thumbnail_url text not null,
  duration_seconds integer not null,
  metadata_refreshed_at timestamptz not null,
  enqueue_sequence bigint not null,
  status text not null default 'pending',
  client_request_id uuid not null,
  requested_at timestamptz not null default statement_timestamp(),
  selected_at timestamptz,
  playback_started_at timestamptz,
  finished_at timestamptz,
  finish_reason text,
  constraint karaoke_song_requests_room_id_fkey
    foreign key (room_id) references public.karaoke_rooms(id) on delete cascade,
  constraint karaoke_song_requests_participant_room_fkey
    foreign key (room_id, participant_id)
    references public.karaoke_participants(room_id, id),
  constraint karaoke_song_requests_room_id_id_key unique (room_id, id),
  constraint karaoke_song_requests_enqueue_key unique (room_id, enqueue_sequence),
  constraint karaoke_song_requests_client_request_key unique (participant_id, client_request_id),
  constraint karaoke_song_requests_video_id_check
    check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  constraint karaoke_song_requests_title_check
    check (char_length(title) between 1 and 200 and title !~ '[[:cntrl:]]'),
  constraint karaoke_song_requests_channel_title_check
    check (char_length(channel_title) between 1 and 120 and channel_title !~ '[[:cntrl:]]'),
  constraint karaoke_song_requests_thumbnail_check
    check (char_length(thumbnail_url) between 8 and 2048 and thumbnail_url ~ '^https://'),
  constraint karaoke_song_requests_duration_check
    check (duration_seconds between 1 and 7200),
  constraint karaoke_song_requests_enqueue_sequence_check
    check (enqueue_sequence between 1 and 9999999),
  constraint karaoke_song_requests_status_check
    check (
      status in (
        'pending', 'selected', 'playing', 'completed', 'skipped',
        'failed_preplay', 'failed_during_playback', 'removed'
      )
    ),
  constraint karaoke_song_requests_finish_reason_check
    check (
      finish_reason is null
      or finish_reason in (
        'ended', 'host_skip', 'youtube_error_5', 'youtube_error_100',
        'youtube_error_101', 'youtube_error_150', 'youtube_error_153',
        'metadata_invalid', 'guest_removed', 'host_removed', 'participant_removed',
        'room_closed', 'room_expired'
      )
    ),
  constraint karaoke_song_requests_lifecycle_check
    check (
      (status = 'pending'
        and selected_at is null and playback_started_at is null
        and finished_at is null and finish_reason is null)
      or (status = 'selected'
        and selected_at is not null and playback_started_at is null
        and finished_at is null and finish_reason is null)
      or (status = 'playing'
        and selected_at is not null and playback_started_at is not null
        and finished_at is null and finish_reason is null)
      or (status = 'completed'
        and selected_at is not null and playback_started_at is not null
        and finished_at is not null and finish_reason = 'ended')
      or (status = 'skipped'
        and selected_at is not null and finished_at is not null
        and finish_reason = 'host_skip')
      or (status = 'failed_preplay'
        and selected_at is not null and playback_started_at is null
        and finished_at is not null
        and finish_reason in (
          'youtube_error_5', 'youtube_error_100', 'youtube_error_101',
          'youtube_error_150', 'youtube_error_153', 'metadata_invalid'
        ))
      or (status = 'failed_during_playback'
        and selected_at is not null and playback_started_at is not null
        and finished_at is not null
        and finish_reason in (
          'youtube_error_5', 'youtube_error_100', 'youtube_error_101',
          'youtube_error_150', 'youtube_error_153', 'metadata_invalid'
        ))
      or (status = 'removed'
        and finished_at is not null
        and finish_reason in (
          'guest_removed', 'host_removed', 'participant_removed', 'room_closed', 'room_expired'
        ))
    ),
  constraint karaoke_song_requests_timestamp_order_check
    check (
      metadata_refreshed_at <= requested_at + interval '5 minutes'
      and (selected_at is null or selected_at >= requested_at)
      and (playback_started_at is null or playback_started_at >= selected_at)
      and (finished_at is null or finished_at >= coalesce(playback_started_at, selected_at, requested_at))
    )
);

create table public.karaoke_playback_state (
  room_id uuid primary key,
  current_song_id uuid,
  rotation_cursor bigint not null default 0,
  player_state text not null default 'idle',
  controller_instance_id uuid,
  controller_lease_expires_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint karaoke_playback_state_room_id_fkey
    foreign key (room_id) references public.karaoke_rooms(id) on delete cascade,
  constraint karaoke_playback_state_current_song_room_fkey
    foreign key (room_id, current_song_id)
    references public.karaoke_song_requests(room_id, id),
  constraint karaoke_playback_state_cursor_check
    check (rotation_cursor between 0 and 999999),
  constraint karaoke_playback_state_player_state_check
    check (player_state in ('idle', 'selected', 'playing', 'paused', 'autoplay_blocked', 'error')),
  constraint karaoke_playback_state_current_state_check
    check (
      (current_song_id is null and player_state = 'idle')
      or (current_song_id is not null and player_state <> 'idle')
    ),
  constraint karaoke_playback_state_lease_pair_check
    check (
      (controller_instance_id is null and controller_lease_expires_at is null)
      or (controller_instance_id is not null and controller_lease_expires_at is not null)
    )
);

create table public.karaoke_room_actions (
  room_id uuid not null,
  request_id uuid not null,
  actor_type text not null,
  actor_id uuid,
  action_type text not null,
  target_song_id uuid,
  request_fingerprint text not null,
  previous_version bigint not null,
  resulting_version bigint not null,
  sanitized_result jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (room_id, request_id),
  constraint karaoke_room_actions_room_id_fkey
    foreign key (room_id) references public.karaoke_rooms(id) on delete cascade,
  constraint karaoke_room_actions_actor_room_fkey
    foreign key (room_id, actor_id)
    references public.karaoke_participants(room_id, id),
  constraint karaoke_room_actions_song_room_fkey
    foreign key (room_id, target_song_id)
    references public.karaoke_song_requests(room_id, id),
  constraint karaoke_room_actions_actor_type_check
    check (actor_type in ('host', 'guest', 'recovery', 'system')),
  constraint karaoke_room_actions_actor_check
    check (
      (actor_type = 'guest' and actor_id is not null)
      or (actor_type <> 'guest' and actor_id is null)
    ),
  constraint karaoke_room_actions_action_type_check
    check (
      action_type in (
        'create_room', 'recover_host', 'join_room', 'touch_participant',
        'add_song', 'remove_own_song', 'host_remove_pending_song',
        'host_remove_participant', 'claim_controller', 'force_controller',
        'refresh_controller', 'release_controller', 'claim_next_song',
        'mark_song_playing', 'complete_song', 'skip_song', 'fail_song',
        'pause_playback', 'resume_playback', 'close_room', 'expire_room'
      )
    ),
  constraint karaoke_room_actions_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint karaoke_room_actions_version_check
    check (previous_version >= 0 and resulting_version = previous_version + 1),
  constraint karaoke_room_actions_result_check
    check (jsonb_typeof(sanitized_result) = 'object')
);

create table public.karaoke_search_cache (
  cache_key text primary key,
  normalized_query text not null,
  region_code text,
  language_code text,
  results_json jsonb not null,
  fetched_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  constraint karaoke_search_cache_key_check
    check (char_length(cache_key) between 16 and 128 and cache_key ~ '^[0-9a-z:_-]+$'),
  constraint karaoke_search_cache_query_check
    check (char_length(normalized_query) between 1 and 200 and normalized_query !~ '[[:cntrl:]]'),
  constraint karaoke_search_cache_region_check
    check (region_code is null or region_code ~ '^[A-Z]{2}$'),
  constraint karaoke_search_cache_language_check
    check (language_code is null or language_code ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  constraint karaoke_search_cache_results_check
    check (jsonb_typeof(results_json) = 'array' and jsonb_array_length(results_json) <= 50),
  constraint karaoke_search_cache_expiry_check
    check (expires_at > fetched_at and expires_at <= fetched_at + interval '24 hours')
);

create table public.karaoke_rate_limit_buckets (
  bucket_key text not null,
  window_start timestamptz not null,
  request_count integer not null,
  expires_at timestamptz not null,
  primary key (bucket_key, window_start),
  constraint karaoke_rate_limit_buckets_key_check
    check (
      char_length(bucket_key) between 16 and 200
      and bucket_key ~ '^[0-9a-z:_-]+$'
      and bucket_key !~ '([0-9]{1,3}\.){3}[0-9]{1,3}'
      and bucket_key !~ '::'
    ),
  constraint karaoke_rate_limit_buckets_count_check
    check (request_count between 1 and 1000000),
  constraint karaoke_rate_limit_buckets_expiry_check
    check (expires_at > window_start and expires_at <= window_start + interval '7 days')
);

create unique index karaoke_participants_active_name_idx
  on public.karaoke_participants (room_id, normalized_display_name)
  where status = 'active';

create index karaoke_participants_room_active_rotation_idx
  on public.karaoke_participants (room_id, rotation_order)
  where status = 'active';

create unique index karaoke_song_requests_one_current_idx
  on public.karaoke_song_requests (room_id)
  where status in ('selected', 'playing');

create index karaoke_song_requests_room_pending_idx
  on public.karaoke_song_requests (room_id, enqueue_sequence)
  where status = 'pending';

create index karaoke_song_requests_participant_pending_idx
  on public.karaoke_song_requests (room_id, participant_id, enqueue_sequence)
  where status = 'pending';

create index karaoke_song_requests_room_status_idx
  on public.karaoke_song_requests (room_id, status, enqueue_sequence);

create index karaoke_room_actions_created_idx
  on public.karaoke_room_actions (room_id, created_at desc);

create index karaoke_search_cache_expiry_idx
  on public.karaoke_search_cache (expires_at);

create index karaoke_rate_limit_buckets_expiry_idx
  on public.karaoke_rate_limit_buckets (expires_at);

create index karaoke_rooms_cleanup_idx
  on public.karaoke_rooms (status, expires_at, closed_at);

create function public.karaoke_assert_digest(p_value text, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_value is null or p_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = p_name || '_invalid';
  end if;
end;
$$;

create function public.karaoke_assert_request(
  p_request_id uuid,
  p_request_fingerprint text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'request_id_required';
  end if;
  perform public.karaoke_assert_digest(p_request_fingerprint, 'request_fingerprint');
end;
$$;

create function public.karaoke_lock_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_room_id is null then
    raise exception using errcode = '22023', message = 'room_id_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('karaoke-room:' || p_room_id::text, 0)
  );
end;
$$;

create function public.karaoke_require_host(p_room_id uuid, p_host_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.karaoke_assert_digest(p_host_token_hash, 'host_token_hash');
  if not exists (
    select 1
    from public.karaoke_rooms as r
    where r.id = p_room_id and r.host_token_hash = p_host_token_hash
  ) then
    raise exception using errcode = '42501', message = 'host_credential_invalid';
  end if;
end;
$$;

create function public.karaoke_require_participant(
  p_room_id uuid,
  p_guest_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant_id uuid;
begin
  perform public.karaoke_assert_digest(p_guest_token_hash, 'guest_token_hash');
  select p.id
  into v_participant_id
  from public.karaoke_participants as p
  where p.room_id = p_room_id
    and p.session_token_hash = p_guest_token_hash
    and p.status = 'active';

  if v_participant_id is null then
    raise exception using errcode = '42501', message = 'guest_credential_invalid';
  end if;
  return v_participant_id;
end;
$$;

create function public.karaoke_replay_result(
  p_room_id uuid,
  p_request_id uuid,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.karaoke_room_actions%rowtype;
begin
  perform public.karaoke_assert_request(p_request_id, p_request_fingerprint);
  select a.*
  into v_action
  from public.karaoke_room_actions as a
  where a.room_id = p_room_id and a.request_id = p_request_id;

  if not found then
    return null;
  end if;
  if v_action.request_fingerprint <> p_request_fingerprint then
    raise exception using errcode = '22023', message = 'idempotency_fingerprint_mismatch';
  end if;
  return v_action.sanitized_result;
end;
$$;

create function public.karaoke_assert_expected_version(
  p_room_id uuid,
  p_expected_state_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual bigint;
begin
  if p_expected_state_version is null or p_expected_state_version < 0 then
    raise exception using errcode = '22023', message = 'expected_state_version_invalid';
  end if;
  select r.state_version into v_actual
  from public.karaoke_rooms as r where r.id = p_room_id;
  if v_actual <> p_expected_state_version then
    raise exception using
      errcode = '40001',
      message = 'stale_state_version',
      detail = pg_catalog.jsonb_build_object('currentVersion', v_actual)::text;
  end if;
end;
$$;

create function public.karaoke_assert_controller(
  p_room_id uuid,
  p_controller_instance_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_controller_instance_id is null then
    raise exception using errcode = '22023', message = 'controller_instance_id_required';
  end if;
  if not exists (
    select 1
    from public.karaoke_playback_state as ps
    where ps.room_id = p_room_id
      and ps.controller_instance_id = p_controller_instance_id
      and ps.controller_lease_expires_at > statement_timestamp()
  ) then
    raise exception using errcode = '42501', message = 'controller_lease_invalid';
  end if;
end;
$$;

create function public.karaoke_song_json(p_song_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select case when s.id is null then null else pg_catalog.jsonb_build_object(
    'id', s.id,
    'participantId', s.participant_id,
    'singerName', p.display_name,
    'youtubeVideoId', s.youtube_video_id,
    'title', s.title,
    'channelTitle', s.channel_title,
    'thumbnailUrl', s.thumbnail_url,
    'durationSeconds', s.duration_seconds,
    'enqueueSequence', s.enqueue_sequence,
    'status', s.status,
    'requestedAt', s.requested_at,
    'selectedAt', s.selected_at,
    'playbackStartedAt', s.playback_started_at,
    'finishedAt', s.finished_at,
    'finishReason', s.finish_reason
  ) end
  from public.karaoke_song_requests as s
  join public.karaoke_participants as p on p.id = s.participant_id and p.room_id = s.room_id
  where s.id = p_song_id;
$$;

create function public.karaoke_select_next_locked(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cursor bigint;
  v_song_id uuid;
begin
  select ps.rotation_cursor into v_cursor
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

  select candidate.song_id
  into v_song_id
  from (
    select p.rotation_order, oldest.id as song_id
    from public.karaoke_participants as p
    cross join lateral (
      select s.id
      from public.karaoke_song_requests as s
      where s.room_id = p_room_id
        and s.participant_id = p.id
        and s.status = 'pending'
      order by s.enqueue_sequence
      limit 1
    ) as oldest
    where p.room_id = p_room_id and p.status = 'active'
    order by
      case when p.rotation_order > v_cursor then 0 else 1 end,
      p.rotation_order
    limit 1
  ) as candidate;

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

create function public.karaoke_project_upcoming(p_room_id uuid, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cursor bigint;
  v_selected_ids uuid[] := array[]::uuid[];
  v_song_id uuid;
  v_rotation_order bigint;
  v_item jsonb;
  v_result jsonb := '[]'::jsonb;
  v_step integer := 0;
begin
  select coalesce(current_participant.rotation_order, ps.rotation_cursor)
  into v_cursor
  from public.karaoke_playback_state as ps
  left join public.karaoke_song_requests as current_song
    on current_song.room_id = ps.room_id and current_song.id = ps.current_song_id
  left join public.karaoke_participants as current_participant
    on current_participant.room_id = current_song.room_id
    and current_participant.id = current_song.participant_id
  where ps.room_id = p_room_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'playback_state_missing';
  end if;
  if p_limit is null or p_limit <= 0 then return v_result; end if;

  while v_step < least(p_limit, 50) loop
    v_step := v_step + 1;
    select candidate.song_id, candidate.rotation_order, candidate.item
    into v_song_id, v_rotation_order, v_item
    from (
      select
        participant.rotation_order,
        oldest.id as song_id,
        pg_catalog.jsonb_build_object(
          'id', oldest.id,
          'participantId', participant.id,
          'singerName', participant.display_name,
          'youtubeVideoId', oldest.youtube_video_id,
          'title', oldest.title,
          'channelTitle', oldest.channel_title,
          'thumbnailUrl', oldest.thumbnail_url,
          'durationSeconds', oldest.duration_seconds,
          'enqueueSequence', oldest.enqueue_sequence,
          'status', oldest.status
        ) as item
      from public.karaoke_participants as participant
      cross join lateral (
        select song.*
        from public.karaoke_song_requests as song
        where song.room_id = p_room_id
          and song.participant_id = participant.id
          and song.status = 'pending'
          and not (song.id = any(v_selected_ids))
        order by song.enqueue_sequence
        limit 1
      ) as oldest
      where participant.room_id = p_room_id and participant.status = 'active'
      order by
        case when participant.rotation_order > v_cursor then 0 else 1 end,
        participant.rotation_order
      limit 1
    ) as candidate;

    if v_song_id is null then exit; end if;
    v_result := v_result || pg_catalog.jsonb_build_array(v_item);
    v_selected_ids := v_selected_ids || v_song_id;
    v_cursor := v_rotation_order;
    v_song_id := null;
  end loop;
  return v_result;
end;
$$;

create function public.karaoke_finish_mutation(
  p_room_id uuid,
  p_request_id uuid,
  p_actor_type text,
  p_actor_id uuid,
  p_action_type text,
  p_target_song_id uuid,
  p_request_fingerprint text,
  p_previous_version bigint,
  p_resulting_version bigint,
  p_sanitized_result jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic uuid;
begin
  insert into public.karaoke_room_actions (
    room_id, request_id, actor_type, actor_id, action_type, target_song_id,
    request_fingerprint, previous_version, resulting_version, sanitized_result
  ) values (
    p_room_id, p_request_id, p_actor_type, p_actor_id, p_action_type, p_target_song_id,
    p_request_fingerprint, p_previous_version, p_resulting_version, p_sanitized_result
  );

  select r.realtime_topic into v_topic
  from public.karaoke_rooms as r where r.id = p_room_id;

  perform realtime.send(
    pg_catalog.jsonb_build_object('stateVersion', p_resulting_version),
    'room-state-changed',
    'karaoke-room:' || v_topic::text,
    false
  );
end;
$$;

create function public.karaoke_validate_playback_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid := new.room_id;
  v_playback public.karaoke_playback_state%rowtype;
  v_song_status text;
  v_active_song_id uuid;
begin
  select ps.* into v_playback
  from public.karaoke_playback_state as ps where ps.room_id = v_room_id;
  if not found then return null; end if;

  select s.id into v_active_song_id
  from public.karaoke_song_requests as s
  where s.room_id = v_room_id and s.status in ('selected', 'playing');

  if v_playback.current_song_id is null then
    if v_playback.player_state <> 'idle' or v_active_song_id is not null then
      raise exception using errcode = '23514', message = 'karaoke_playback_idle_integrity';
    end if;
    return null;
  end if;
  if v_active_song_id is distinct from v_playback.current_song_id then
    raise exception using errcode = '23514', message = 'karaoke_current_song_integrity';
  end if;

  select s.status into v_song_status
  from public.karaoke_song_requests as s
  where s.room_id = v_room_id and s.id = v_playback.current_song_id;
  if v_song_status = 'selected'
    and v_playback.player_state not in ('selected', 'paused', 'autoplay_blocked', 'error') then
    raise exception using errcode = '23514', message = 'karaoke_selected_state_integrity';
  end if;
  if v_song_status = 'playing'
    and v_playback.player_state not in ('playing', 'paused', 'autoplay_blocked', 'error') then
    raise exception using errcode = '23514', message = 'karaoke_playing_state_integrity';
  end if;
  return null;
end;
$$;

create constraint trigger karaoke_playback_state_integrity_trigger
after insert or update on public.karaoke_playback_state
deferrable initially deferred
for each row execute function public.karaoke_validate_playback_integrity();

create constraint trigger karaoke_song_request_integrity_trigger
after insert or update on public.karaoke_song_requests
deferrable initially deferred
for each row execute function public.karaoke_validate_playback_integrity();

create function public.karaoke_require_open_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.karaoke_rooms as r
    where r.id = p_room_id
      and r.status = 'open'
      and r.expires_at > statement_timestamp()
  ) then
    raise exception using errcode = '55000', message = 'room_closed_or_expired';
  end if;
end;
$$;

create function public.karaoke_bump_room_version(p_room_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version bigint;
begin
  update public.karaoke_rooms
  set state_version = state_version + 1,
      updated_at = statement_timestamp()
  where id = p_room_id
  returning state_version into v_version;
  if not found then
    raise exception using errcode = '23503', message = 'room_not_found';
  end if;
  return v_version;
end;
$$;

create function public.karaoke_create_room(
  p_room_code text,
  p_realtime_topic uuid,
  p_host_token_hash text,
  p_recovery_code_hash text,
  p_expires_at timestamptz,
  p_request_id uuid,
  p_request_fingerprint text,
  p_max_pending_per_participant smallint default 3,
  p_max_total_pending_requests smallint default 150,
  p_max_video_duration_seconds integer default 1200
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.karaoke_rooms%rowtype;
  v_previous_version bigint;
  v_version bigint;
  v_replay jsonb;
  v_result jsonb;
begin
  perform public.karaoke_assert_request(p_request_id, p_request_fingerprint);
  perform public.karaoke_assert_digest(p_host_token_hash, 'host_token_hash');
  perform public.karaoke_assert_digest(p_recovery_code_hash, 'recovery_code_hash');
  if p_room_code is null or p_room_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception using errcode = '22023', message = 'room_code_invalid';
  end if;
  if p_realtime_topic is null then
    raise exception using errcode = '22023', message = 'realtime_topic_required';
  end if;
  if p_expires_at is null
    or p_expires_at <= statement_timestamp()
    or p_expires_at > statement_timestamp() + interval '24 hours' then
    raise exception using errcode = '22023', message = 'room_expiry_invalid';
  end if;
  if p_max_pending_per_participant is null
    or p_max_total_pending_requests is null
    or p_max_video_duration_seconds is null
    or p_max_pending_per_participant not between 1 and 10
    or p_max_total_pending_requests not between 1 and 500
    or p_max_video_duration_seconds not between 60 and 7200 then
    raise exception using errcode = '22023', message = 'room_limits_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('karaoke-code:' || p_room_code, 0)
  );

  select r.* into v_room
  from public.karaoke_rooms as r where r.room_code = p_room_code;
  if found then
    if v_room.host_token_hash = p_host_token_hash then
      v_replay := public.karaoke_replay_result(
        v_room.id, p_request_id, p_request_fingerprint
      );
      if v_replay is not null then
        return v_replay;
      end if;
    end if;
    raise exception using errcode = '23505', message = 'room_code_in_use';
  end if;

  insert into public.karaoke_rooms (
    room_code, realtime_topic, host_token_hash, recovery_code_hash, expires_at,
    max_pending_per_participant, max_total_pending_requests,
    max_video_duration_seconds
  ) values (
    p_room_code, p_realtime_topic, p_host_token_hash, p_recovery_code_hash, p_expires_at,
    p_max_pending_per_participant, p_max_total_pending_requests,
    p_max_video_duration_seconds
  ) returning * into v_room;

  insert into public.karaoke_playback_state (room_id) values (v_room.id);
  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object(
    'room', pg_catalog.jsonb_build_object(
      'code', v_room.room_code,
      'status', v_room.status,
      'stateVersion', v_version,
      'expiresAt', v_room.expires_at,
      'maxPendingPerParticipant', v_room.max_pending_per_participant,
      'maxVideoDurationSeconds', v_room.max_video_duration_seconds
    )
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'host', null, 'create_room', null,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_recover_host(
  p_room_code text,
  p_recovery_code_hash text,
  p_new_host_token_hash text,
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
  v_window_start timestamptz;
  v_attempt_count integer;
  v_replay jsonb;
  v_previous_version bigint;
  v_version bigint;
  v_result jsonb;
begin
  perform public.karaoke_assert_request(p_request_id, p_request_fingerprint);
  perform public.karaoke_assert_digest(p_recovery_code_hash, 'recovery_code_hash');
  perform public.karaoke_assert_digest(p_new_host_token_hash, 'new_host_token_hash');

  select r.* into v_room
  from public.karaoke_rooms as r where r.room_code = p_room_code;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_recovery');
  end if;
  perform public.karaoke_lock_room(v_room.id);
  select r.* into v_room
  from public.karaoke_rooms as r where r.id = v_room.id for update;

  -- Room-global protection supplements the trusted route's HMAC-IP rate bucket.
  v_window_start := pg_catalog.to_timestamp(
    pg_catalog.floor(pg_catalog.date_part('epoch', statement_timestamp()) / 900) * 900
  );
  insert into public.karaoke_rate_limit_buckets (
    bucket_key, window_start, request_count, expires_at
  ) values (
    'recovery-room:' || v_room.id::text, v_window_start, 1,
    v_window_start + interval '30 minutes'
  )
  on conflict (bucket_key, window_start) do update
    set request_count = public.karaoke_rate_limit_buckets.request_count + 1
    where public.karaoke_rate_limit_buckets.request_count < 5
  returning request_count into v_attempt_count;

  if v_attempt_count is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'error', 'rate_limited',
      'retryAfterSeconds', greatest(
        0,
        pg_catalog.ceil(pg_catalog.date_part('epoch', v_window_start + interval '15 minutes' - statement_timestamp()))::integer
      )
    );
  end if;
  if v_room.recovery_code_hash <> p_recovery_code_hash
    or v_room.status <> 'open'
    or v_room.expires_at <= statement_timestamp() then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_recovery');
  end if;

  v_replay := public.karaoke_replay_result(
    v_room.id, p_request_id, p_request_fingerprint
  );
  if v_replay is not null then
    return v_replay;
  end if;

  v_previous_version := v_room.state_version;
  update public.karaoke_rooms
  set host_token_hash = p_new_host_token_hash
  where id = v_room.id;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'roomCode', v_room.room_code,
    'expiresAt', v_room.expires_at,
    'stateVersion', v_version
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'recovery', null, 'recover_host', null,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_join_room(
  p_room_code text,
  p_guest_token_hash text,
  p_display_name text,
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
  v_participant public.karaoke_participants%rowtype;
  v_display_name text;
  v_normalized_name text;
  v_replay jsonb;
  v_previous_version bigint;
  v_version bigint;
  v_result jsonb;
begin
  perform public.karaoke_assert_request(p_request_id, p_request_fingerprint);
  perform public.karaoke_assert_digest(p_guest_token_hash, 'guest_token_hash');
  v_display_name := pg_catalog.regexp_replace(pg_catalog.btrim(p_display_name), '[[:space:]]+', ' ', 'g');
  v_normalized_name := pg_catalog.lower(v_display_name);
  if v_display_name is null
    or pg_catalog.char_length(v_display_name) not between 1 and 40
    or v_display_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'display_name_invalid';
  end if;

  select r.* into v_room
  from public.karaoke_rooms as r where r.room_code = p_room_code;
  if not found then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  perform public.karaoke_lock_room(v_room.id);
  select r.* into v_room
  from public.karaoke_rooms as r where r.id = v_room.id for update;
  perform public.karaoke_require_open_room(v_room.id);

  v_replay := public.karaoke_replay_result(
    v_room.id, p_request_id, p_request_fingerprint
  );
  if v_replay is not null then
    perform public.karaoke_require_participant(v_room.id, p_guest_token_hash);
    return v_replay;
  end if;
  if exists (
    select 1 from public.karaoke_participants as p
    where p.session_token_hash = p_guest_token_hash
  ) then
    raise exception using errcode = '23505', message = 'guest_token_already_used';
  end if;
  if (
    select pg_catalog.count(*) from public.karaoke_participants as p
    where p.room_id = v_room.id and p.status = 'active'
  ) >= 50 then
    raise exception using errcode = '54000', message = 'participant_limit_reached';
  end if;

  insert into public.karaoke_participants (
    room_id, session_token_hash, display_name, normalized_display_name, rotation_order
  ) values (
    v_room.id, p_guest_token_hash, v_display_name, v_normalized_name,
    v_room.next_rotation_order
  ) returning * into v_participant;
  update public.karaoke_rooms
  set next_rotation_order = next_rotation_order + 1
  where id = v_room.id;

  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object(
    'participant', pg_catalog.jsonb_build_object(
      'id', v_participant.id,
      'displayName', v_participant.display_name,
      'rotationOrder', v_participant.rotation_order,
      'joinedAt', v_participant.joined_at
    ),
    'stateVersion', v_version
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'guest', v_participant.id, 'join_room', null,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_get_room_snapshot(
  p_room_code text,
  p_host_token_hash text default null,
  p_guest_token_hash text default null,
  p_upcoming_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.karaoke_rooms%rowtype;
  v_playback public.karaoke_playback_state%rowtype;
  v_participant_id uuid;
  v_is_host boolean := false;
  v_is_guest boolean := false;
  v_current_song jsonb;
  v_participants jsonb;
  v_own_pending jsonb;
begin
  if p_upcoming_limit is null or p_upcoming_limit not between 0 and 50 then
    raise exception using errcode = '22023', message = 'upcoming_limit_invalid';
  end if;
  select r.* into v_room
  from public.karaoke_rooms as r where r.room_code = p_room_code;
  if not found then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;

  if p_host_token_hash is not null then
    perform public.karaoke_assert_digest(p_host_token_hash, 'host_token_hash');
    v_is_host := v_room.host_token_hash = p_host_token_hash;
  end if;
  if not v_is_host and p_guest_token_hash is not null then
    perform public.karaoke_assert_digest(p_guest_token_hash, 'guest_token_hash');
    select p.id into v_participant_id
    from public.karaoke_participants as p
    where p.room_id = v_room.id
      and p.session_token_hash = p_guest_token_hash
      and p.status = 'active';
    v_is_guest := v_participant_id is not null;
  end if;
  if not v_is_host and not v_is_guest then
    raise exception using errcode = '42501', message = 'room_credential_invalid';
  end if;

  select ps.* into v_playback
  from public.karaoke_playback_state as ps where ps.room_id = v_room.id;
  v_current_song := public.karaoke_song_json(v_playback.current_song_id);

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', p.id,
        'displayName', p.display_name,
        'rotationOrder', p.rotation_order
      ) order by p.rotation_order
    ),
    '[]'::jsonb
  ) into v_participants
  from public.karaoke_participants as p
  where p.room_id = v_room.id and p.status = 'active';

  if v_is_guest then
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', s.id,
          'participantId', s.participant_id,
          'singerName', p.display_name,
          'youtubeVideoId', s.youtube_video_id,
          'title', s.title,
          'channelTitle', s.channel_title,
          'thumbnailUrl', s.thumbnail_url,
          'durationSeconds', s.duration_seconds,
          'enqueueSequence', s.enqueue_sequence,
          'status', s.status,
          'requestedAt', s.requested_at
        ) order by s.enqueue_sequence
      ),
      '[]'::jsonb
    ) into v_own_pending
    from public.karaoke_song_requests as s
    join public.karaoke_participants as p
      on p.room_id = s.room_id and p.id = s.participant_id
    where s.room_id = v_room.id
      and s.participant_id = v_participant_id
      and s.status = 'pending';
  else
    v_own_pending := '[]'::jsonb;
  end if;

  return pg_catalog.jsonb_build_object(
    'room', pg_catalog.jsonb_build_object(
      'code', v_room.room_code,
      'status', case
        when v_room.status = 'open' and v_room.expires_at <= statement_timestamp() then 'expired'
        else v_room.status
      end,
      'stateVersion', v_room.state_version,
      'expiresAt', v_room.expires_at,
      'maxPendingPerParticipant', v_room.max_pending_per_participant,
      'maxVideoDurationSeconds', v_room.max_video_duration_seconds
    ),
    'playback', pg_catalog.jsonb_build_object(
      'state', v_playback.player_state,
      'currentSong', v_current_song,
      'controllerInstanceId', case when v_is_host then v_playback.controller_instance_id else null end,
      'controllerLeaseExpiresAt', case when v_is_host then v_playback.controller_lease_expires_at else null end
    ),
    'participants', v_participants,
    'upcoming', public.karaoke_project_upcoming(v_room.id, p_upcoming_limit),
    'ownPending', v_own_pending,
    'capabilities', pg_catalog.jsonb_build_object(
      'isHost', v_is_host,
      'isGuest', v_is_guest,
      'canManage', v_is_host and v_room.status = 'open' and v_room.expires_at > statement_timestamp(),
      'canAddSong', v_is_guest and v_room.status = 'open' and v_room.expires_at > statement_timestamp(),
      'canRemoveOwn', v_is_guest and v_room.status = 'open' and v_room.expires_at > statement_timestamp()
    ),
    'realtimeTopic', v_room.realtime_topic
  );
end;
$$;

create function public.karaoke_touch_participant(
  p_room_code text,
  p_guest_token_hash text,
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

  update public.karaoke_participants
  set last_seen_at = statement_timestamp()
  where room_id = v_room.id and id = v_participant_id;
  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object('ok', true, 'stateVersion', v_version);
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'guest', v_participant_id, 'touch_participant', null,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_add_song(
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

  insert into public.karaoke_song_requests (
    room_id, participant_id, youtube_video_id, title, channel_title, thumbnail_url,
    duration_seconds, metadata_refreshed_at, enqueue_sequence, client_request_id
  ) values (
    v_room.id, v_participant_id, p_youtube_video_id, p_title, p_channel_title,
    p_thumbnail_url, p_duration_seconds, p_metadata_refreshed_at,
    v_room.next_enqueue_sequence, p_client_request_id
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

create function public.karaoke_remove_own_song(
  p_room_code text,
  p_guest_token_hash text,
  p_song_id uuid,
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

  update public.karaoke_song_requests
  set status = 'removed', finished_at = statement_timestamp(), finish_reason = 'guest_removed'
  where room_id = v_room.id
    and id = p_song_id
    and participant_id = v_participant_id
    and status = 'pending';
  if not found then
    raise exception using errcode = '42501', message = 'own_pending_song_not_found';
  end if;

  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object('ok', true, 'songId', p_song_id, 'stateVersion', v_version);
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'guest', v_participant_id, 'remove_own_song', p_song_id,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_host_remove_pending_song(
  p_room_code text,
  p_host_token_hash text,
  p_song_id uuid,
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
  perform public.karaoke_require_host(v_room.id, p_host_token_hash);
  v_replay := public.karaoke_replay_result(v_room.id, p_request_id, p_request_fingerprint);
  if v_replay is not null then return v_replay; end if;

  update public.karaoke_song_requests
  set status = 'removed', finished_at = statement_timestamp(), finish_reason = 'host_removed'
  where room_id = v_room.id and id = p_song_id and status = 'pending';
  if not found then
    raise exception using errcode = 'P0002', message = 'pending_song_not_found';
  end if;

  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object('ok', true, 'songId', p_song_id, 'stateVersion', v_version);
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'host', null, 'host_remove_pending_song', p_song_id,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_host_remove_participant(
  p_room_code text,
  p_host_token_hash text,
  p_participant_id uuid,
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
  v_removed_songs integer;
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
  perform public.karaoke_require_host(v_room.id, p_host_token_hash);
  v_replay := public.karaoke_replay_result(v_room.id, p_request_id, p_request_fingerprint);
  if v_replay is not null then return v_replay; end if;

  update public.karaoke_participants
  set status = 'removed', removed_at = statement_timestamp(), last_seen_at = statement_timestamp()
  where room_id = v_room.id and id = p_participant_id and status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'active_participant_not_found';
  end if;
  update public.karaoke_song_requests
  set status = 'removed', finished_at = statement_timestamp(), finish_reason = 'participant_removed'
  where room_id = v_room.id and participant_id = p_participant_id and status = 'pending';
  get diagnostics v_removed_songs = row_count;

  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'participantId', p_participant_id,
    'removedPendingCount', v_removed_songs,
    'stateVersion', v_version
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'host', null, 'host_remove_participant', null,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_claim_controller(
  p_room_code text,
  p_host_token_hash text,
  p_controller_instance_id uuid,
  p_force_takeover boolean,
  p_expected_state_version bigint,
  p_request_id uuid,
  p_request_fingerprint text,
  p_lease_seconds integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.karaoke_rooms%rowtype;
  v_playback public.karaoke_playback_state%rowtype;
  v_replay jsonb;
  v_previous_version bigint;
  v_version bigint;
  v_lease_expires_at timestamptz;
  v_result jsonb;
  v_action_type text;
begin
  if p_controller_instance_id is null or p_force_takeover is null
    or p_lease_seconds not between 10 and 120 then
    raise exception using errcode = '22023', message = 'controller_claim_invalid';
  end if;
  select r.* into v_room from public.karaoke_rooms as r where r.room_code = p_room_code;
  if not found then raise exception using errcode = 'P0002', message = 'room_not_found'; end if;
  perform public.karaoke_lock_room(v_room.id);
  select r.* into v_room from public.karaoke_rooms as r where r.id = v_room.id for update;
  perform public.karaoke_require_open_room(v_room.id);
  perform public.karaoke_require_host(v_room.id, p_host_token_hash);
  v_replay := public.karaoke_replay_result(v_room.id, p_request_id, p_request_fingerprint);
  if v_replay is not null then return v_replay; end if;
  perform public.karaoke_assert_expected_version(v_room.id, p_expected_state_version);

  select ps.* into v_playback from public.karaoke_playback_state as ps
  where ps.room_id = v_room.id for update;
  if v_playback.controller_instance_id is not null
    and v_playback.controller_instance_id <> p_controller_instance_id
    and v_playback.controller_lease_expires_at > statement_timestamp()
    and not p_force_takeover then
    raise exception using errcode = '55000', message = 'controller_already_claimed';
  end if;

  v_action_type := case
    when p_force_takeover
      and v_playback.controller_instance_id is distinct from p_controller_instance_id
      then 'force_controller'
    else 'claim_controller'
  end;
  v_lease_expires_at := statement_timestamp() + pg_catalog.make_interval(secs => p_lease_seconds);
  update public.karaoke_playback_state
  set controller_instance_id = p_controller_instance_id,
      controller_lease_expires_at = v_lease_expires_at,
      updated_at = statement_timestamp()
  where room_id = v_room.id;

  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'controllerInstanceId', p_controller_instance_id,
    'controllerLeaseExpiresAt', v_lease_expires_at,
    'stateVersion', v_version
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'host', null, v_action_type, null,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_refresh_controller_lease(
  p_room_code text,
  p_host_token_hash text,
  p_controller_instance_id uuid,
  p_expected_state_version bigint,
  p_request_id uuid,
  p_request_fingerprint text,
  p_lease_seconds integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.karaoke_rooms%rowtype;
  v_replay jsonb;
  v_previous_version bigint;
  v_version bigint;
  v_lease_expires_at timestamptz;
  v_result jsonb;
begin
  if p_lease_seconds not between 10 and 120 then
    raise exception using errcode = '22023', message = 'lease_seconds_invalid';
  end if;
  select r.* into v_room from public.karaoke_rooms as r where r.room_code = p_room_code;
  if not found then raise exception using errcode = 'P0002', message = 'room_not_found'; end if;
  perform public.karaoke_lock_room(v_room.id);
  select r.* into v_room from public.karaoke_rooms as r where r.id = v_room.id for update;
  perform public.karaoke_require_open_room(v_room.id);
  perform public.karaoke_require_host(v_room.id, p_host_token_hash);
  v_replay := public.karaoke_replay_result(v_room.id, p_request_id, p_request_fingerprint);
  if v_replay is not null then return v_replay; end if;
  perform public.karaoke_assert_expected_version(v_room.id, p_expected_state_version);
  perform public.karaoke_assert_controller(v_room.id, p_controller_instance_id);

  v_lease_expires_at := statement_timestamp() + pg_catalog.make_interval(secs => p_lease_seconds);
  update public.karaoke_playback_state
  set controller_lease_expires_at = v_lease_expires_at,
      updated_at = statement_timestamp()
  where room_id = v_room.id and controller_instance_id = p_controller_instance_id;
  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'controllerInstanceId', p_controller_instance_id,
    'controllerLeaseExpiresAt', v_lease_expires_at,
    'stateVersion', v_version
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'host', null, 'refresh_controller', null,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_release_controller(
  p_room_code text,
  p_host_token_hash text,
  p_controller_instance_id uuid,
  p_expected_state_version bigint,
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
  perform public.karaoke_require_host(v_room.id, p_host_token_hash);
  v_replay := public.karaoke_replay_result(v_room.id, p_request_id, p_request_fingerprint);
  if v_replay is not null then return v_replay; end if;
  perform public.karaoke_assert_expected_version(v_room.id, p_expected_state_version);
  if not exists (
    select 1 from public.karaoke_playback_state as ps
    where ps.room_id = v_room.id and ps.controller_instance_id = p_controller_instance_id
  ) then
    raise exception using errcode = '42501', message = 'controller_instance_invalid';
  end if;

  update public.karaoke_playback_state
  set controller_instance_id = null,
      controller_lease_expires_at = null,
      updated_at = statement_timestamp()
  where room_id = v_room.id;
  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object('ok', true, 'stateVersion', v_version);
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'host', null, 'release_controller', null,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_claim_next_song(
  p_room_code text,
  p_host_token_hash text,
  p_controller_instance_id uuid,
  p_expected_state_version bigint,
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
  v_song_id uuid;
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
  perform public.karaoke_require_host(v_room.id, p_host_token_hash);
  v_replay := public.karaoke_replay_result(v_room.id, p_request_id, p_request_fingerprint);
  if v_replay is not null then return v_replay; end if;
  perform public.karaoke_assert_expected_version(v_room.id, p_expected_state_version);
  perform public.karaoke_assert_controller(v_room.id, p_controller_instance_id);
  if exists (
    select 1 from public.karaoke_playback_state as ps
    where ps.room_id = v_room.id and ps.current_song_id is not null
  ) then
    raise exception using errcode = '55000', message = 'current_song_already_selected';
  end if;

  v_song_id := public.karaoke_select_next_locked(v_room.id);
  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'currentSong', public.karaoke_song_json(v_song_id),
    'playerState', case when v_song_id is null then 'idle' else 'selected' end,
    'stateVersion', v_version
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'host', null, 'claim_next_song', v_song_id,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_mark_song_playing(
  p_room_code text,
  p_host_token_hash text,
  p_controller_instance_id uuid,
  p_expected_current_song_id uuid,
  p_expected_state_version bigint,
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
  v_replay jsonb;
  v_previous_version bigint;
  v_version bigint;
  v_result jsonb;
begin
  if p_expected_current_song_id is null then
    raise exception using errcode = '22023', message = 'expected_current_song_id_required';
  end if;
  select r.* into v_room from public.karaoke_rooms as r where r.room_code = p_room_code;
  if not found then raise exception using errcode = 'P0002', message = 'room_not_found'; end if;
  perform public.karaoke_lock_room(v_room.id);
  select r.* into v_room from public.karaoke_rooms as r where r.id = v_room.id for update;
  perform public.karaoke_require_open_room(v_room.id);
  perform public.karaoke_require_host(v_room.id, p_host_token_hash);
  v_replay := public.karaoke_replay_result(v_room.id, p_request_id, p_request_fingerprint);
  if v_replay is not null then return v_replay; end if;
  perform public.karaoke_assert_expected_version(v_room.id, p_expected_state_version);
  perform public.karaoke_assert_controller(v_room.id, p_controller_instance_id);

  update public.karaoke_song_requests as s
  set status = 'playing', playback_started_at = statement_timestamp()
  from public.karaoke_playback_state as ps
  where ps.room_id = v_room.id
    and ps.current_song_id = p_expected_current_song_id
    and s.room_id = v_room.id
    and s.id = p_expected_current_song_id
    and s.status = 'selected';
  if not found then
    raise exception using errcode = '40001', message = 'current_song_conflict';
  end if;
  update public.karaoke_playback_state
  set player_state = 'playing', updated_at = statement_timestamp()
  where room_id = v_room.id and current_song_id = p_expected_current_song_id;

  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'currentSong', public.karaoke_song_json(p_expected_current_song_id),
    'playerState', 'playing',
    'stateVersion', v_version
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'host', null, 'mark_song_playing', p_expected_current_song_id,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_complete_and_select_next(
  p_room_code text,
  p_host_token_hash text,
  p_controller_instance_id uuid,
  p_expected_current_song_id uuid,
  p_expected_state_version bigint,
  p_finish_reason text,
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
  v_song public.karaoke_song_requests%rowtype;
  v_current_song_id uuid;
  v_rotation_order bigint;
  v_next_song_id uuid;
  v_replay jsonb;
  v_previous_version bigint;
  v_version bigint;
  v_result jsonb;
begin
  if p_expected_current_song_id is null or p_finish_reason is null
    or p_finish_reason not in ('ended', 'host_skip') then
    raise exception using errcode = '22023', message = 'completion_arguments_invalid';
  end if;
  select r.* into v_room from public.karaoke_rooms as r where r.room_code = p_room_code;
  if not found then raise exception using errcode = 'P0002', message = 'room_not_found'; end if;
  perform public.karaoke_lock_room(v_room.id);
  select r.* into v_room from public.karaoke_rooms as r where r.id = v_room.id for update;
  perform public.karaoke_require_open_room(v_room.id);
  perform public.karaoke_require_host(v_room.id, p_host_token_hash);
  v_replay := public.karaoke_replay_result(v_room.id, p_request_id, p_request_fingerprint);
  if v_replay is not null then return v_replay; end if;
  if p_finish_reason = 'ended' then
    perform public.karaoke_assert_controller(v_room.id, p_controller_instance_id);
  end if;

  select ps.current_song_id into v_current_song_id
  from public.karaoke_playback_state as ps where ps.room_id = v_room.id for update;
  if v_current_song_id is distinct from p_expected_current_song_id then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'stale', true,
      'currentSong', public.karaoke_song_json(v_current_song_id),
      'stateVersion', v_room.state_version
    );
  end if;
  perform public.karaoke_assert_expected_version(v_room.id, p_expected_state_version);

  select s.* into v_song
  from public.karaoke_song_requests as s
  where s.room_id = v_room.id and s.id = p_expected_current_song_id
  for update;
  if p_finish_reason = 'ended' and (v_song.status <> 'playing' or v_song.playback_started_at is null) then
    raise exception using errcode = '55000', message = 'song_not_playing';
  end if;
  if p_finish_reason = 'host_skip' and v_song.status not in ('selected', 'playing') then
    raise exception using errcode = '55000', message = 'song_not_skippable';
  end if;

  select p.rotation_order into v_rotation_order
  from public.karaoke_participants as p
  where p.room_id = v_room.id and p.id = v_song.participant_id;
  update public.karaoke_song_requests
  set status = case when p_finish_reason = 'ended' then 'completed' else 'skipped' end,
      finished_at = statement_timestamp(),
      finish_reason = p_finish_reason
  where room_id = v_room.id and id = v_song.id;
  update public.karaoke_playback_state
  set current_song_id = null,
      rotation_cursor = v_rotation_order,
      player_state = 'idle',
      updated_at = statement_timestamp()
  where room_id = v_room.id;
  v_next_song_id := public.karaoke_select_next_locked(v_room.id);

  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'finishedSongId', v_song.id,
    'finishReason', p_finish_reason,
    'currentSong', public.karaoke_song_json(v_next_song_id),
    'playerState', case when v_next_song_id is null then 'idle' else 'selected' end,
    'stateVersion', v_version
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'host', null,
    case when p_finish_reason = 'ended' then 'complete_song' else 'skip_song' end,
    v_song.id, p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_fail_and_select_replacement(
  p_room_code text,
  p_host_token_hash text,
  p_controller_instance_id uuid,
  p_expected_current_song_id uuid,
  p_expected_state_version bigint,
  p_failure_stage text,
  p_finish_reason text,
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
  v_song public.karaoke_song_requests%rowtype;
  v_current_song_id uuid;
  v_rotation_order bigint;
  v_next_song_id uuid;
  v_replay jsonb;
  v_previous_version bigint;
  v_version bigint;
  v_result jsonb;
begin
  if p_expected_current_song_id is null
    or p_failure_stage is null
    or p_finish_reason is null
    or p_failure_stage not in ('preplay', 'during_playback')
    or p_finish_reason not in (
      'youtube_error_5', 'youtube_error_100', 'youtube_error_101',
      'youtube_error_150', 'youtube_error_153', 'metadata_invalid'
    ) then
    raise exception using errcode = '22023', message = 'failure_arguments_invalid';
  end if;
  select r.* into v_room from public.karaoke_rooms as r where r.room_code = p_room_code;
  if not found then raise exception using errcode = 'P0002', message = 'room_not_found'; end if;
  perform public.karaoke_lock_room(v_room.id);
  select r.* into v_room from public.karaoke_rooms as r where r.id = v_room.id for update;
  perform public.karaoke_require_open_room(v_room.id);
  perform public.karaoke_require_host(v_room.id, p_host_token_hash);
  v_replay := public.karaoke_replay_result(v_room.id, p_request_id, p_request_fingerprint);
  if v_replay is not null then return v_replay; end if;
  perform public.karaoke_assert_controller(v_room.id, p_controller_instance_id);

  select ps.current_song_id into v_current_song_id
  from public.karaoke_playback_state as ps where ps.room_id = v_room.id for update;
  if v_current_song_id is distinct from p_expected_current_song_id then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'stale', true,
      'currentSong', public.karaoke_song_json(v_current_song_id),
      'stateVersion', v_room.state_version
    );
  end if;
  perform public.karaoke_assert_expected_version(v_room.id, p_expected_state_version);
  select s.* into v_song from public.karaoke_song_requests as s
  where s.room_id = v_room.id and s.id = p_expected_current_song_id for update;

  if p_failure_stage = 'preplay'
    and (v_song.status <> 'selected' or v_song.playback_started_at is not null) then
    raise exception using errcode = '55000', message = 'song_not_in_preplay';
  end if;
  if p_failure_stage = 'during_playback'
    and (v_song.status <> 'playing' or v_song.playback_started_at is null) then
    raise exception using errcode = '55000', message = 'song_not_playing';
  end if;

  update public.karaoke_song_requests
  set status = case
        when p_failure_stage = 'preplay' then 'failed_preplay'
        else 'failed_during_playback'
      end,
      finished_at = statement_timestamp(),
      finish_reason = p_finish_reason
  where room_id = v_room.id and id = v_song.id;
  if p_failure_stage = 'during_playback' then
    select p.rotation_order into v_rotation_order
    from public.karaoke_participants as p
    where p.room_id = v_room.id and p.id = v_song.participant_id;
  end if;
  update public.karaoke_playback_state
  set current_song_id = null,
      rotation_cursor = case
        when p_failure_stage = 'during_playback' then v_rotation_order
        else rotation_cursor
      end,
      player_state = 'idle',
      updated_at = statement_timestamp()
  where room_id = v_room.id;
  v_next_song_id := public.karaoke_select_next_locked(v_room.id);

  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'failedSongId', v_song.id,
    'failureStage', p_failure_stage,
    'finishReason', p_finish_reason,
    'currentSong', public.karaoke_song_json(v_next_song_id),
    'playerState', case when v_next_song_id is null then 'idle' else 'selected' end,
    'stateVersion', v_version
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'host', null, 'fail_song', v_song.id,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_pause_playback(
  p_room_code text,
  p_host_token_hash text,
  p_controller_instance_id uuid,
  p_expected_current_song_id uuid,
  p_expected_state_version bigint,
  p_request_id uuid,
  p_request_fingerprint text,
  p_pause_state text default 'paused'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.karaoke_rooms%rowtype;
  v_replay jsonb;
  v_previous_version bigint;
  v_version bigint;
  v_result jsonb;
begin
  if p_pause_state is null or p_pause_state not in ('paused', 'autoplay_blocked') then
    raise exception using errcode = '22023', message = 'pause_state_invalid';
  end if;
  select r.* into v_room from public.karaoke_rooms as r where r.room_code = p_room_code;
  if not found then raise exception using errcode = 'P0002', message = 'room_not_found'; end if;
  perform public.karaoke_lock_room(v_room.id);
  select r.* into v_room from public.karaoke_rooms as r where r.id = v_room.id for update;
  perform public.karaoke_require_open_room(v_room.id);
  perform public.karaoke_require_host(v_room.id, p_host_token_hash);
  v_replay := public.karaoke_replay_result(v_room.id, p_request_id, p_request_fingerprint);
  if v_replay is not null then return v_replay; end if;
  perform public.karaoke_assert_expected_version(v_room.id, p_expected_state_version);
  perform public.karaoke_assert_controller(v_room.id, p_controller_instance_id);

  update public.karaoke_playback_state
  set player_state = p_pause_state, updated_at = statement_timestamp()
  where room_id = v_room.id
    and current_song_id = p_expected_current_song_id
    and player_state in ('selected', 'playing', 'paused', 'autoplay_blocked');
  if not found then raise exception using errcode = '40001', message = 'current_song_conflict'; end if;

  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object(
    'ok', true, 'playerState', p_pause_state,
    'currentSong', public.karaoke_song_json(p_expected_current_song_id),
    'stateVersion', v_version
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'host', null, 'pause_playback', p_expected_current_song_id,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_resume_playback(
  p_room_code text,
  p_host_token_hash text,
  p_controller_instance_id uuid,
  p_expected_current_song_id uuid,
  p_expected_state_version bigint,
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
  v_player_state text;
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
  perform public.karaoke_require_host(v_room.id, p_host_token_hash);
  v_replay := public.karaoke_replay_result(v_room.id, p_request_id, p_request_fingerprint);
  if v_replay is not null then return v_replay; end if;
  perform public.karaoke_assert_expected_version(v_room.id, p_expected_state_version);
  perform public.karaoke_assert_controller(v_room.id, p_controller_instance_id);

  select case when s.playback_started_at is null then 'selected' else 'playing' end
  into v_player_state
  from public.karaoke_song_requests as s
  join public.karaoke_playback_state as ps
    on ps.room_id = s.room_id and ps.current_song_id = s.id
  where s.room_id = v_room.id
    and s.id = p_expected_current_song_id
    and ps.player_state in ('paused', 'autoplay_blocked');
  if not found then raise exception using errcode = '40001', message = 'current_song_conflict'; end if;
  update public.karaoke_playback_state
  set player_state = v_player_state, updated_at = statement_timestamp()
  where room_id = v_room.id;

  v_previous_version := v_room.state_version;
  v_version := public.karaoke_bump_room_version(v_room.id);
  v_result := pg_catalog.jsonb_build_object(
    'ok', true, 'playerState', v_player_state,
    'currentSong', public.karaoke_song_json(p_expected_current_song_id),
    'stateVersion', v_version
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'host', null, 'resume_playback', p_expected_current_song_id,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_close_room(
  p_room_code text,
  p_host_token_hash text,
  p_expected_state_version bigint,
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
  v_current_song_id uuid;
  v_replay jsonb;
  v_previous_version bigint;
  v_version bigint;
  v_result jsonb;
begin
  select r.* into v_room from public.karaoke_rooms as r where r.room_code = p_room_code;
  if not found then raise exception using errcode = 'P0002', message = 'room_not_found'; end if;
  perform public.karaoke_lock_room(v_room.id);
  select r.* into v_room from public.karaoke_rooms as r where r.id = v_room.id for update;
  perform public.karaoke_require_host(v_room.id, p_host_token_hash);
  v_replay := public.karaoke_replay_result(v_room.id, p_request_id, p_request_fingerprint);
  if v_replay is not null then return v_replay; end if;
  perform public.karaoke_assert_expected_version(v_room.id, p_expected_state_version);
  if v_room.status <> 'open' then
    raise exception using errcode = '55000', message = 'room_already_closed';
  end if;

  select ps.current_song_id into v_current_song_id
  from public.karaoke_playback_state as ps where ps.room_id = v_room.id for update;
  update public.karaoke_song_requests
  set status = 'removed', finished_at = statement_timestamp(), finish_reason = 'room_closed'
  where room_id = v_room.id and status in ('pending', 'selected', 'playing');
  update public.karaoke_playback_state
  set current_song_id = null,
      player_state = 'idle',
      controller_instance_id = null,
      controller_lease_expires_at = null,
      updated_at = statement_timestamp()
  where room_id = v_room.id;
  v_previous_version := v_room.state_version;
  update public.karaoke_rooms
  set status = 'closed',
      closed_at = statement_timestamp(),
      state_version = state_version + 1,
      updated_at = statement_timestamp()
  where id = v_room.id
  returning state_version into v_version;
  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 'closed',
    'stateVersion', v_version
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'host', null, 'close_room', v_current_song_id,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
end;
$$;

create function public.karaoke_consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer,
  p_request_cost integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_count integer;
  v_allowed boolean;
begin
  if p_bucket_key is null
    or pg_catalog.char_length(p_bucket_key) not between 16 and 200
    or p_bucket_key !~ '^[0-9a-z:_-]+$'
    or p_bucket_key ~ '([0-9]{1,3}\.){3}[0-9]{1,3}'
    or p_bucket_key ~ '::' then
    raise exception using errcode = '22023', message = 'rate_bucket_key_invalid';
  end if;
  if p_limit is null or p_window_seconds is null or p_request_cost is null
    or p_limit not between 1 and 100000
    or p_window_seconds not between 1 and 86400
    or p_request_cost not between 1 and p_limit then
    raise exception using errcode = '22023', message = 'rate_limit_arguments_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('karaoke-rate:' || p_bucket_key, 0)
  );
  v_window_start := pg_catalog.to_timestamp(
    pg_catalog.floor(pg_catalog.date_part('epoch', v_now) / p_window_seconds) * p_window_seconds
  );
  v_window_end := v_window_start + pg_catalog.make_interval(secs => p_window_seconds);
  insert into public.karaoke_rate_limit_buckets (
    bucket_key, window_start, request_count, expires_at
  ) values (
    p_bucket_key, v_window_start, p_request_cost,
    v_window_end + pg_catalog.make_interval(secs => p_window_seconds)
  )
  on conflict (bucket_key, window_start) do update
    set request_count = public.karaoke_rate_limit_buckets.request_count + excluded.request_count
    where public.karaoke_rate_limit_buckets.request_count + excluded.request_count <= p_limit
  returning request_count into v_count;

  v_allowed := v_count is not null;
  if not v_allowed then
    select b.request_count into v_count
    from public.karaoke_rate_limit_buckets as b
    where b.bucket_key = p_bucket_key and b.window_start = v_window_start;
  end if;
  return pg_catalog.jsonb_build_object(
    'allowed', v_allowed,
    'count', v_count,
    'remaining', greatest(0, p_limit - v_count),
    'retryAfterSeconds', case when v_allowed then 0 else greatest(
      0, pg_catalog.ceil(pg_catalog.date_part('epoch', v_window_end - v_now))::integer
    ) end,
    'windowEndsAt', v_window_end
  );
end;
$$;

create function public.karaoke_get_search_cache(p_cache_key text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'cacheKey', c.cache_key,
    'normalizedQuery', c.normalized_query,
    'regionCode', c.region_code,
    'languageCode', c.language_code,
    'results', c.results_json,
    'fetchedAt', c.fetched_at,
    'expiresAt', c.expires_at
  )
  from public.karaoke_search_cache as c
  where c.cache_key = p_cache_key and c.expires_at > statement_timestamp();
$$;

create function public.karaoke_put_search_cache(
  p_cache_key text,
  p_normalized_query text,
  p_region_code text,
  p_language_code text,
  p_results_json jsonb,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cache public.karaoke_search_cache%rowtype;
  v_item jsonb;
begin
  if p_expires_at is null
    or p_expires_at <= statement_timestamp()
    or p_expires_at > statement_timestamp() + interval '24 hours' then
    raise exception using errcode = '22023', message = 'search_cache_expiry_invalid';
  end if;
  if p_cache_key is null
    or pg_catalog.char_length(p_cache_key) not between 16 and 128
    or p_cache_key !~ '^[0-9a-z:_-]+$'
    or p_normalized_query is null
    or pg_catalog.char_length(p_normalized_query) not between 1 and 200
    or p_normalized_query <> pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.btrim(p_normalized_query), '[[:space:]]+', ' ', 'g'
    ))
    or p_normalized_query ~ '[[:cntrl:]]'
    or (p_region_code is not null and p_region_code !~ '^[A-Z]{2}$')
    or (p_language_code is not null and p_language_code !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$')
    or p_results_json is null
    or pg_catalog.jsonb_typeof(p_results_json) <> 'array'
    or pg_catalog.jsonb_array_length(p_results_json) > 50 then
    raise exception using errcode = '22023', message = 'search_cache_payload_invalid';
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_results_json) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
      or not (v_item ?& array['videoId', 'title', 'channelTitle', 'thumbnailUrl', 'durationSeconds'])
      or v_item - array['videoId', 'title', 'channelTitle', 'thumbnailUrl', 'durationSeconds'] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(v_item->'videoId') <> 'string'
      or pg_catalog.jsonb_typeof(v_item->'title') <> 'string'
      or pg_catalog.jsonb_typeof(v_item->'channelTitle') <> 'string'
      or pg_catalog.jsonb_typeof(v_item->'thumbnailUrl') <> 'string'
      or pg_catalog.jsonb_typeof(v_item->'durationSeconds') <> 'number'
      or v_item->>'videoId' !~ '^[A-Za-z0-9_-]{11}$'
      or pg_catalog.char_length(v_item->>'title') not between 1 and 200
      or v_item->>'title' ~ '[[:cntrl:]]'
      or pg_catalog.char_length(v_item->>'channelTitle') not between 1 and 120
      or v_item->>'channelTitle' ~ '[[:cntrl:]]'
      or pg_catalog.char_length(v_item->>'thumbnailUrl') not between 8 and 2048
      or v_item->>'thumbnailUrl' !~ '^https://'
      or (v_item->>'durationSeconds') !~ '^[0-9]{1,4}$'
      or (v_item->>'durationSeconds')::integer not between 1 and 7200 then
      raise exception using errcode = '22023', message = 'search_cache_result_invalid';
    end if;
  end loop;
  insert into public.karaoke_search_cache (
    cache_key, normalized_query, region_code, language_code,
    results_json, fetched_at, expires_at
  ) values (
    p_cache_key, p_normalized_query, p_region_code, p_language_code,
    p_results_json, statement_timestamp(), p_expires_at
  )
  on conflict (cache_key) do update
  set normalized_query = excluded.normalized_query,
      region_code = excluded.region_code,
      language_code = excluded.language_code,
      results_json = excluded.results_json,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  returning * into v_cache;

  return pg_catalog.jsonb_build_object(
    'cacheKey', v_cache.cache_key,
    'normalizedQuery', v_cache.normalized_query,
    'regionCode', v_cache.region_code,
    'languageCode', v_cache.language_code,
    'results', v_cache.results_json,
    'fetchedAt', v_cache.fetched_at,
    'expiresAt', v_cache.expires_at
  );
end;
$$;

create function public.karaoke_cleanup_expired_rooms(
  p_now timestamptz default statement_timestamp(),
  p_batch_size integer default 100,
  p_retention interval default interval '7 days'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_room public.karaoke_rooms%rowtype;
  v_previous_version bigint;
  v_version bigint;
  v_result jsonb;
  v_expired_count integer := 0;
  v_purged_count integer := 0;
  v_cache_count integer := 0;
  v_bucket_count integer := 0;
begin
  if p_now is null or p_batch_size is null or p_retention is null
    or p_batch_size not between 1 and 500
    or p_retention < interval '1 day' or p_retention > interval '30 days' then
    raise exception using errcode = '22023', message = 'cleanup_arguments_invalid';
  end if;

  for v_candidate in
    select r.id
    from public.karaoke_rooms as r
    where r.status = 'open' and r.expires_at <= p_now
    order by r.expires_at
    limit p_batch_size
  loop
    perform public.karaoke_lock_room(v_candidate.id);
    select r.* into v_room
    from public.karaoke_rooms as r
    where r.id = v_candidate.id and r.status = 'open' and r.expires_at <= p_now
    for update;
    if not found then continue; end if;

    update public.karaoke_song_requests
    set status = 'removed', finished_at = p_now, finish_reason = 'room_expired'
    where room_id = v_room.id and status in ('pending', 'selected', 'playing');
    update public.karaoke_playback_state
    set current_song_id = null,
        player_state = 'idle',
        controller_instance_id = null,
        controller_lease_expires_at = null,
        updated_at = p_now
    where room_id = v_room.id;
    v_previous_version := v_room.state_version;
    update public.karaoke_rooms
    set status = 'expired', closed_at = p_now,
        state_version = state_version + 1, updated_at = p_now
    where id = v_room.id
    returning state_version into v_version;
    v_result := pg_catalog.jsonb_build_object(
      'ok', true, 'status', 'expired', 'stateVersion', v_version
    );
    perform public.karaoke_finish_mutation(
      v_room.id, pg_catalog.gen_random_uuid(), 'system', null, 'expire_room', null,
      pg_catalog.repeat('0', 64), v_previous_version, v_version, v_result
    );
    v_expired_count := v_expired_count + 1;
  end loop;

  for v_candidate in
    select r.id
    from public.karaoke_rooms as r
    where r.status in ('closed', 'expired')
      and r.closed_at <= p_now - p_retention
    order by r.closed_at
    limit p_batch_size
  loop
    perform public.karaoke_lock_room(v_candidate.id);
    delete from public.karaoke_rooms as r
    where r.id = v_candidate.id
      and r.status in ('closed', 'expired')
      and r.closed_at <= p_now - p_retention;
    if found then v_purged_count := v_purged_count + 1; end if;
  end loop;

  delete from public.karaoke_search_cache as c
  where c.ctid in (
    select expired.ctid
    from public.karaoke_search_cache as expired
    where expired.expires_at <= p_now
    order by expired.expires_at
    limit p_batch_size * 10
  );
  get diagnostics v_cache_count = row_count;
  delete from public.karaoke_rate_limit_buckets as b
  where b.ctid in (
    select expired.ctid
    from public.karaoke_rate_limit_buckets as expired
    where expired.expires_at <= p_now
    order by expired.expires_at
    limit p_batch_size * 10
  );
  get diagnostics v_bucket_count = row_count;

  return pg_catalog.jsonb_build_object(
    'expiredRooms', v_expired_count,
    'purgedRooms', v_purged_count,
    'deletedSearchCacheRows', v_cache_count,
    'deletedRateLimitBuckets', v_bucket_count
  );
end;
$$;

alter table public.karaoke_rooms enable row level security;
alter table public.karaoke_participants enable row level security;
alter table public.karaoke_song_requests enable row level security;
alter table public.karaoke_playback_state enable row level security;
alter table public.karaoke_room_actions enable row level security;
alter table public.karaoke_search_cache enable row level security;
alter table public.karaoke_rate_limit_buckets enable row level security;

revoke all on table public.karaoke_rooms from public, anon, authenticated;
revoke all on table public.karaoke_participants from public, anon, authenticated;
revoke all on table public.karaoke_song_requests from public, anon, authenticated;
revoke all on table public.karaoke_playback_state from public, anon, authenticated;
revoke all on table public.karaoke_room_actions from public, anon, authenticated;
revoke all on table public.karaoke_search_cache from public, anon, authenticated;
revoke all on table public.karaoke_rate_limit_buckets from public, anon, authenticated;

grant select on table public.karaoke_rooms to service_role;
grant select on table public.karaoke_participants to service_role;
grant select on table public.karaoke_song_requests to service_role;
grant select on table public.karaoke_playback_state to service_role;
grant select on table public.karaoke_room_actions to service_role;
grant select on table public.karaoke_search_cache to service_role;
grant select on table public.karaoke_rate_limit_buckets to service_role;

revoke all on function public.karaoke_assert_digest(text, text) from public, anon, authenticated;
revoke all on function public.karaoke_assert_request(uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_lock_room(uuid) from public, anon, authenticated;
revoke all on function public.karaoke_require_host(uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_require_participant(uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_replay_result(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_assert_expected_version(uuid, bigint) from public, anon, authenticated;
revoke all on function public.karaoke_assert_controller(uuid, uuid) from public, anon, authenticated;
revoke all on function public.karaoke_song_json(uuid) from public, anon, authenticated;
revoke all on function public.karaoke_select_next_locked(uuid) from public, anon, authenticated;
revoke all on function public.karaoke_project_upcoming(uuid, integer) from public, anon, authenticated;
revoke all on function public.karaoke_finish_mutation(uuid, uuid, text, uuid, text, uuid, text, bigint, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.karaoke_validate_playback_integrity() from public, anon, authenticated;
revoke all on function public.karaoke_require_open_room(uuid) from public, anon, authenticated;
revoke all on function public.karaoke_bump_room_version(uuid) from public, anon, authenticated;

revoke all on function public.karaoke_create_room(text, uuid, text, text, timestamptz, uuid, text, smallint, smallint, integer) from public, anon, authenticated;
revoke all on function public.karaoke_recover_host(text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_join_room(text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_get_room_snapshot(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.karaoke_touch_participant(text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_add_song(text, text, text, text, text, text, integer, timestamptz, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_remove_own_song(text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_host_remove_pending_song(text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_host_remove_participant(text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_claim_controller(text, text, uuid, boolean, bigint, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.karaoke_refresh_controller_lease(text, text, uuid, bigint, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.karaoke_release_controller(text, text, uuid, bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_claim_next_song(text, text, uuid, bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_mark_song_playing(text, text, uuid, uuid, bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_complete_and_select_next(text, text, uuid, uuid, bigint, text, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_fail_and_select_replacement(text, text, uuid, uuid, bigint, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_pause_playback(text, text, uuid, uuid, bigint, uuid, text, text) from public, anon, authenticated;
revoke all on function public.karaoke_resume_playback(text, text, uuid, uuid, bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_close_room(text, text, bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.karaoke_consume_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.karaoke_get_search_cache(text) from public, anon, authenticated;
revoke all on function public.karaoke_put_search_cache(text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.karaoke_cleanup_expired_rooms(timestamptz, integer, interval) from public, anon, authenticated;

grant execute on function public.karaoke_create_room(text, uuid, text, text, timestamptz, uuid, text, smallint, smallint, integer) to service_role;
grant execute on function public.karaoke_recover_host(text, text, text, uuid, text) to service_role;
grant execute on function public.karaoke_join_room(text, text, text, uuid, text) to service_role;
grant execute on function public.karaoke_get_room_snapshot(text, text, text, integer) to service_role;
grant execute on function public.karaoke_touch_participant(text, text, uuid, text) to service_role;
grant execute on function public.karaoke_add_song(text, text, text, text, text, text, integer, timestamptz, uuid, uuid, text) to service_role;
grant execute on function public.karaoke_remove_own_song(text, text, uuid, uuid, text) to service_role;
grant execute on function public.karaoke_host_remove_pending_song(text, text, uuid, uuid, text) to service_role;
grant execute on function public.karaoke_host_remove_participant(text, text, uuid, uuid, text) to service_role;
grant execute on function public.karaoke_claim_controller(text, text, uuid, boolean, bigint, uuid, text, integer) to service_role;
grant execute on function public.karaoke_refresh_controller_lease(text, text, uuid, bigint, uuid, text, integer) to service_role;
grant execute on function public.karaoke_release_controller(text, text, uuid, bigint, uuid, text) to service_role;
grant execute on function public.karaoke_claim_next_song(text, text, uuid, bigint, uuid, text) to service_role;
grant execute on function public.karaoke_mark_song_playing(text, text, uuid, uuid, bigint, uuid, text) to service_role;
grant execute on function public.karaoke_complete_and_select_next(text, text, uuid, uuid, bigint, text, uuid, text) to service_role;
grant execute on function public.karaoke_fail_and_select_replacement(text, text, uuid, uuid, bigint, text, text, uuid, text) to service_role;
grant execute on function public.karaoke_pause_playback(text, text, uuid, uuid, bigint, uuid, text, text) to service_role;
grant execute on function public.karaoke_resume_playback(text, text, uuid, uuid, bigint, uuid, text) to service_role;
grant execute on function public.karaoke_close_room(text, text, bigint, uuid, text) to service_role;
grant execute on function public.karaoke_consume_rate_limit(text, integer, integer, integer) to service_role;
grant execute on function public.karaoke_get_search_cache(text) to service_role;
grant execute on function public.karaoke_put_search_cache(text, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.karaoke_cleanup_expired_rooms(timestamptz, integer, interval) to service_role;
