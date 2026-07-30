create table public.karaoke_search_fill_leases (
  cache_key text primary key,
  lease_token uuid not null,
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint karaoke_search_fill_leases_key_check
    check (char_length(cache_key) between 16 and 128 and cache_key ~ '^[0-9a-z:_-]+$'),
  constraint karaoke_search_fill_leases_expiry_check
    check (
      lease_expires_at > updated_at
      and lease_expires_at <= updated_at + interval '2 minutes'
      and updated_at >= created_at
    )
);

create index karaoke_search_fill_leases_expiry_idx
  on public.karaoke_search_fill_leases (lease_expires_at);

alter table public.karaoke_search_fill_leases enable row level security;

revoke all on table public.karaoke_search_fill_leases
  from public, anon, authenticated, service_role;
grant select on table public.karaoke_search_fill_leases to service_role;

create function public.karaoke_consume_rate_limits(p_buckets jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_bucket record;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_count integer;
begin
  if p_buckets is null
    or pg_catalog.jsonb_typeof(p_buckets) <> 'array'
    or pg_catalog.jsonb_array_length(p_buckets) not between 1 and 16 then
    raise exception using errcode = '22023', message = 'rate_limit_bundle_invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_buckets) as entry(value)
    where pg_catalog.jsonb_typeof(entry.value) <> 'object'
      or not (entry.value ?& array['key', 'limit', 'windowSeconds'])
      or entry.value->>'key' is null
      or pg_catalog.char_length(entry.value->>'key') not between 16 and 200
      or entry.value->>'key' !~ '^[0-9a-z:_-]+$'
      or entry.value->>'key' ~ '([0-9]{1,3}\.){3}[0-9]{1,3}'
      or entry.value->>'key' ~ '::'
      or coalesce(entry.value->>'limit', '') !~ '^[0-9]+$'
      or coalesce(entry.value->>'windowSeconds', '') !~ '^[0-9]+$'
      or (entry.value ? 'cost' and coalesce(entry.value->>'cost', '') !~ '^[0-9]+$')
      or (entry.value->>'limit')::integer not between 1 and 100000
      or (entry.value->>'windowSeconds')::integer not between 1 and 86400
      or coalesce((entry.value->>'cost')::integer, 1)
        not between 1 and (entry.value->>'limit')::integer
  ) then
    raise exception using errcode = '22023', message = 'rate_limit_bundle_entry_invalid';
  end if;

  if (
    select pg_catalog.count(*)
    from (
      select entry.value->>'key'
      from pg_catalog.jsonb_array_elements(p_buckets) as entry(value)
      group by entry.value->>'key'
      having pg_catalog.count(*) > 1
    ) as duplicates
  ) > 0 then
    raise exception using errcode = '22023', message = 'rate_limit_bundle_key_duplicate';
  end if;

  for v_bucket in
    select
      entry.value->>'key' as bucket_key,
      (entry.value->>'limit')::integer as bucket_limit,
      (entry.value->>'windowSeconds')::integer as window_seconds,
      coalesce((entry.value->>'cost')::integer, 1) as request_cost
    from pg_catalog.jsonb_array_elements(p_buckets) as entry(value)
    order by entry.value->>'key'
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('karaoke-rate:' || v_bucket.bucket_key, 0)
    );
  end loop;

  for v_bucket in
    select
      entry.value->>'key' as bucket_key,
      (entry.value->>'limit')::integer as bucket_limit,
      (entry.value->>'windowSeconds')::integer as window_seconds,
      coalesce((entry.value->>'cost')::integer, 1) as request_cost
    from pg_catalog.jsonb_array_elements(p_buckets) as entry(value)
    order by entry.value->>'key'
  loop
    v_window_start := pg_catalog.to_timestamp(
      pg_catalog.floor(
        pg_catalog.date_part('epoch', v_now) / v_bucket.window_seconds
      ) * v_bucket.window_seconds
    );
    v_window_end := v_window_start
      + pg_catalog.make_interval(secs => v_bucket.window_seconds);
    select b.request_count into v_count
    from public.karaoke_rate_limit_buckets as b
    where b.bucket_key = v_bucket.bucket_key
      and b.window_start = v_window_start;
    v_count := coalesce(v_count, 0);
    if v_count + v_bucket.request_cost > v_bucket.bucket_limit then
      return pg_catalog.jsonb_build_object(
        'allowed', false,
        'deniedKey', v_bucket.bucket_key,
        'retryAfterSeconds', case
          when pg_catalog.ceil(
            pg_catalog.date_part('epoch', v_window_end - v_now)
          )::integer < 1 then 1
          else pg_catalog.ceil(
            pg_catalog.date_part('epoch', v_window_end - v_now)
          )::integer
        end
      );
    end if;
  end loop;

  for v_bucket in
    select
      entry.value->>'key' as bucket_key,
      (entry.value->>'limit')::integer as bucket_limit,
      (entry.value->>'windowSeconds')::integer as window_seconds,
      coalesce((entry.value->>'cost')::integer, 1) as request_cost
    from pg_catalog.jsonb_array_elements(p_buckets) as entry(value)
    order by entry.value->>'key'
  loop
    v_window_start := pg_catalog.to_timestamp(
      pg_catalog.floor(
        pg_catalog.date_part('epoch', v_now) / v_bucket.window_seconds
      ) * v_bucket.window_seconds
    );
    v_window_end := v_window_start
      + pg_catalog.make_interval(secs => v_bucket.window_seconds);
    insert into public.karaoke_rate_limit_buckets (
      bucket_key, window_start, request_count, expires_at
    ) values (
      v_bucket.bucket_key, v_window_start, v_bucket.request_cost,
      v_window_end + pg_catalog.make_interval(secs => v_bucket.window_seconds)
    )
    on conflict (bucket_key, window_start) do update
    set request_count = public.karaoke_rate_limit_buckets.request_count
          + excluded.request_count,
        expires_at = excluded.expires_at;
  end loop;

  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'retryAfterSeconds', 0
  );
end;
$$;

create function public.karaoke_claim_search_fill(
  p_cache_key text,
  p_lease_token uuid,
  p_lease_seconds integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_expires_at timestamptz;
  v_claimed boolean := false;
begin
  if p_cache_key is null
    or pg_catalog.char_length(p_cache_key) not between 16 and 128
    or p_cache_key !~ '^[0-9a-z:_-]+$'
    or p_lease_token is null
    or p_lease_seconds is null
    or p_lease_seconds not between 5 and 60 then
    raise exception using errcode = '22023', message = 'search_fill_lease_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('karaoke-search-fill:' || p_cache_key, 0)
  );
  v_expires_at := v_now + pg_catalog.make_interval(secs => p_lease_seconds);
  insert into public.karaoke_search_fill_leases (
    cache_key, lease_token, lease_expires_at, created_at, updated_at
  ) values (
    p_cache_key, p_lease_token, v_expires_at, v_now, v_now
  )
  on conflict (cache_key) do update
  set lease_token = excluded.lease_token,
      lease_expires_at = excluded.lease_expires_at,
      updated_at = excluded.updated_at
  where public.karaoke_search_fill_leases.lease_expires_at <= v_now
    or public.karaoke_search_fill_leases.lease_token = excluded.lease_token
  returning true, lease_expires_at into v_claimed, v_expires_at;

  if not coalesce(v_claimed, false) then
    select l.lease_expires_at into v_expires_at
    from public.karaoke_search_fill_leases as l
    where l.cache_key = p_cache_key;
  end if;

  return pg_catalog.jsonb_build_object(
    'claimed', coalesce(v_claimed, false),
    'retryAfterSeconds', case
      when coalesce(v_claimed, false) then 0
      else case
        when pg_catalog.ceil(
          pg_catalog.date_part('epoch', v_expires_at - v_now)
        )::integer < 1 then 1
        else pg_catalog.ceil(
          pg_catalog.date_part('epoch', v_expires_at - v_now)
        )::integer
      end
    end
  );
end;
$$;

create function public.karaoke_release_search_fill(
  p_cache_key text,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released boolean;
begin
  if p_cache_key is null
    or pg_catalog.char_length(p_cache_key) not between 16 and 128
    or p_cache_key !~ '^[0-9a-z:_-]+$'
    or p_lease_token is null then
    raise exception using errcode = '22023', message = 'search_fill_lease_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('karaoke-search-fill:' || p_cache_key, 0)
  );
  delete from public.karaoke_search_fill_leases as l
  where l.cache_key = p_cache_key and l.lease_token = p_lease_token;
  v_released := found;
  return pg_catalog.jsonb_build_object('released', v_released);
end;
$$;

create or replace function public.karaoke_join_room(
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
  v_display_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_display_name), '[[:space:]]+', ' ', 'g'
  );
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
    'expiresAt', v_room.expires_at,
    'stateVersion', v_version
  );
  perform public.karaoke_finish_mutation(
    v_room.id, p_request_id, 'guest', v_participant.id, 'join_room', null,
    p_request_fingerprint, v_previous_version, v_version, v_result
  );
  return v_result;
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

  while v_step < case when p_limit < 150 then p_limit else 150 end loop
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

create or replace function public.karaoke_get_room_snapshot(
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
  if p_upcoming_limit is null or p_upcoming_limit not between 0 and 150 then
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
        when v_room.status = 'open' and v_room.expires_at <= statement_timestamp()
          then 'expired'
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
      'controllerInstanceId', case
        when v_is_host then v_playback.controller_instance_id else null
      end,
      'controllerLeaseExpiresAt', case
        when v_is_host then v_playback.controller_lease_expires_at else null
      end
    ),
    'participants', v_participants,
    'upcoming', public.karaoke_project_upcoming(v_room.id, p_upcoming_limit),
    'ownPending', v_own_pending,
    'capabilities', pg_catalog.jsonb_build_object(
      'isHost', v_is_host,
      'isGuest', v_is_guest,
      'canManage', v_is_host and v_room.status = 'open'
        and v_room.expires_at > statement_timestamp(),
      'canAddSong', v_is_guest and v_room.status = 'open'
        and v_room.expires_at > statement_timestamp(),
      'canRemoveOwn', v_is_guest and v_room.status = 'open'
        and v_room.expires_at > statement_timestamp()
    ),
    'realtimeTopic', v_room.realtime_topic
  );
end;
$$;

create or replace function public.karaoke_touch_participant(
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
begin
  perform public.karaoke_assert_request(p_request_id, p_request_fingerprint);
  select r.* into v_room
  from public.karaoke_rooms as r where r.room_code = p_room_code;
  if not found then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  perform public.karaoke_require_open_room(v_room.id);
  v_participant_id := public.karaoke_require_participant(
    v_room.id, p_guest_token_hash
  );
  update public.karaoke_participants
  set last_seen_at = statement_timestamp()
  where room_id = v_room.id and id = v_participant_id and status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'guest_credential_invalid';
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'stateVersion', v_room.state_version
  );
end;
$$;

create or replace function public.karaoke_refresh_controller_lease(
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
  v_lease_expires_at timestamptz;
begin
  if p_lease_seconds is null or p_lease_seconds not between 10 and 120 then
    raise exception using errcode = '22023', message = 'lease_seconds_invalid';
  end if;
  if p_expected_state_version is null or p_expected_state_version < 0 then
    raise exception using errcode = '22023', message = 'state_version_invalid';
  end if;
  perform public.karaoke_assert_request(p_request_id, p_request_fingerprint);
  select r.* into v_room
  from public.karaoke_rooms as r where r.room_code = p_room_code;
  if not found then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  perform public.karaoke_lock_room(v_room.id);
  select r.* into v_room
  from public.karaoke_rooms as r where r.id = v_room.id for update;
  perform public.karaoke_require_open_room(v_room.id);
  perform public.karaoke_require_host(v_room.id, p_host_token_hash);
  perform public.karaoke_assert_controller(v_room.id, p_controller_instance_id);

  v_lease_expires_at := statement_timestamp()
    + pg_catalog.make_interval(secs => p_lease_seconds);
  update public.karaoke_playback_state
  set controller_lease_expires_at = v_lease_expires_at,
      updated_at = statement_timestamp()
  where room_id = v_room.id and controller_instance_id = p_controller_instance_id;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'controllerInstanceId', p_controller_instance_id,
    'controllerLeaseExpiresAt', v_lease_expires_at,
    'stateVersion', v_room.state_version
  );
end;
$$;

create or replace function public.karaoke_cleanup_expired_rooms(
  p_now timestamptz default statement_timestamp(),
  p_batch_size integer default 500,
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
  v_lease_count integer := 0;
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
    limit p_batch_size * 100
  );
  get diagnostics v_cache_count = row_count;
  delete from public.karaoke_rate_limit_buckets as b
  where b.ctid in (
    select expired.ctid
    from public.karaoke_rate_limit_buckets as expired
    where expired.expires_at <= p_now
    order by expired.expires_at
    limit p_batch_size * 10000
  );
  get diagnostics v_bucket_count = row_count;
  delete from public.karaoke_search_fill_leases as l
  where l.ctid in (
    select expired.ctid
    from public.karaoke_search_fill_leases as expired
    where expired.lease_expires_at <= p_now
    order by expired.lease_expires_at
    limit p_batch_size * 1000
  );
  get diagnostics v_lease_count = row_count;

  return pg_catalog.jsonb_build_object(
    'expiredRooms', v_expired_count,
    'purgedRooms', v_purged_count,
    'deletedSearchCacheRows', v_cache_count,
    'deletedRateLimitBuckets', v_bucket_count,
    'deletedSearchFillLeases', v_lease_count
  );
end;
$$;

revoke all on function public.karaoke_consume_rate_limits(jsonb)
  from public, anon, authenticated;
revoke all on function public.karaoke_claim_search_fill(text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.karaoke_release_search_fill(text, uuid)
  from public, anon, authenticated;

grant execute on function public.karaoke_consume_rate_limits(jsonb) to service_role;
grant execute on function public.karaoke_claim_search_fill(text, uuid, integer)
  to service_role;
grant execute on function public.karaoke_release_search_fill(text, uuid)
  to service_role;

comment on table public.karaoke_search_fill_leases
  is 'Short-lived service-owned leases that deduplicate cross-instance YouTube search fills.';
comment on function public.karaoke_consume_rate_limits(jsonb)
  is 'Atomically admits or rejects a validated bundle of coordinated fixed-window limits.';
comment on function public.karaoke_claim_search_fill(text, uuid, integer)
  is 'Claims or renews an ownership-checked short search-cache fill lease.';
comment on function public.karaoke_release_search_fill(text, uuid)
  is 'Releases a search-cache fill lease only for its current opaque owner token.';
