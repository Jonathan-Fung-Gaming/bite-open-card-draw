\set ON_ERROR_STOP on

begin;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname like 'karaoke\_%' escape '\';
  if v_count <> 8 then
    raise exception 'expected 8 Karaoke Party tables, found %', v_count;
  end if;

  select count(*) into v_count
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname like 'karaoke\_%' escape '\'
    and c.relrowsecurity;
  if v_count <> 8 then
    raise exception 'all Karaoke Party tables must have RLS enabled';
  end if;

  select count(*) into v_count
  from pg_catalog.pg_policies as p
  where p.schemaname = 'public' and p.tablename like 'karaoke\_%' escape '\';
  if v_count <> 0 then
    raise exception 'browser-facing Karaoke Party policies are forbidden';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    cross join lateral (values ('anon'), ('authenticated')) as role_name(name)
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'karaoke\_%' escape '\'
      and (
        pg_catalog.has_table_privilege(role_name.name, c.oid, 'SELECT')
        or pg_catalog.has_table_privilege(role_name.name, c.oid, 'INSERT')
        or pg_catalog.has_table_privilege(role_name.name, c.oid, 'UPDATE')
        or pg_catalog.has_table_privilege(role_name.name, c.oid, 'DELETE')
      )
  ) then
    raise exception 'a broad/browser role has Karaoke Party table privileges';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'karaoke\_%' escape '\'
      and (
        not p.prosecdef
        or not coalesce(p.proconfig, array[]::text[]) @> array['search_path=""']::text[]
      )
  ) then
    raise exception 'every Karaoke Party function must be security definer with empty search_path';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    cross join lateral (values ('anon'), ('authenticated')) as role_name(name)
    where n.nspname = 'public'
      and p.proname like 'karaoke\_%' escape '\'
      and pg_catalog.has_function_privilege(role_name.name, p.oid, 'EXECUTE')
  ) then
    raise exception 'a broad/browser role can execute a Karaoke Party function';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) as acl
    where n.nspname = 'public'
      and p.proname like 'karaoke\_%' escape '\'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC can execute a Karaoke Party function';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'karaoke\_%' escape '\'
      and (
        not pg_catalog.has_table_privilege('service_role', c.oid, 'SELECT')
        or pg_catalog.has_table_privilege('service_role', c.oid, 'INSERT')
        or pg_catalog.has_table_privilege('service_role', c.oid, 'UPDATE')
        or pg_catalog.has_table_privilege('service_role', c.oid, 'DELETE')
        or pg_catalog.has_table_privilege('service_role', c.oid, 'TRUNCATE')
        or pg_catalog.has_table_privilege('service_role', c.oid, 'REFERENCES')
        or pg_catalog.has_table_privilege('service_role', c.oid, 'TRIGGER')
      )
  ) then
    raise exception 'service_role does not have the reviewed read-only Karaoke Party table privileges';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'karaoke\_%' escape '\'
      and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') is distinct from (
        p.proname = any (array[
          'karaoke_create_room',
          'karaoke_recover_host',
          'karaoke_join_room',
          'karaoke_get_room_snapshot',
          'karaoke_touch_participant',
          'karaoke_add_song',
          'karaoke_remove_own_song',
          'karaoke_host_remove_pending_song',
          'karaoke_host_remove_participant',
          'karaoke_claim_controller',
          'karaoke_refresh_controller_lease',
          'karaoke_release_controller',
          'karaoke_claim_next_song',
          'karaoke_mark_song_playing',
          'karaoke_complete_and_select_next',
          'karaoke_fail_and_select_replacement',
          'karaoke_pause_playback',
          'karaoke_resume_playback',
          'karaoke_close_room',
          'karaoke_consume_rate_limit',
          'karaoke_consume_rate_limits',
          'karaoke_reserve_youtube_quota',
          'karaoke_get_search_cache',
          'karaoke_put_search_cache',
          'karaoke_claim_search_fill',
          'karaoke_release_search_fill',
          'karaoke_cleanup_expired_rooms'
        ])
      )
  ) then
    raise exception 'service_role can execute outside the reviewed Karaoke Party RPC surface';
  end if;
end;
$$;

set local role anon;
do $$
begin
  begin
    execute 'select * from public.karaoke_rooms limit 1';
    raise exception 'anon table select unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.karaoke_get_search_cache('0123456789abcdef');
    raise exception 'anon RPC execution unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

set local role service_role;
select public.karaoke_get_search_cache('service:probe:0123456789abcdef');
select public.karaoke_create_room(
  'DEFGHJK', '40000000-0000-4000-8000-000000000001',
  repeat('6', 64), repeat('7', 64), statement_timestamp() + interval '12 hours',
  '40000000-0000-4000-8000-000000000002', repeat('8', 64)
);
reset role;

do $$
declare
  v_result jsonb;
  v_snapshot jsonb;
  v_version bigint;
  v_controller uuid := '10000000-0000-4000-8000-000000000001';
  v_new_controller uuid := '10000000-0000-4000-8000-000000000002';
  v_current_song uuid;
  v_alice uuid;
  v_bob uuid;
  v_cara uuid;
  v_room_two uuid;
  v_action_count bigint;
  v_state_after_mutation bigint;
  v_room_expires_at timestamptz;
begin
  v_result := public.karaoke_create_room(
    'ABCDEFG', '00000000-0000-4000-8000-000000000001',
    repeat('a', 64), repeat('b', 64), statement_timestamp() + interval '12 hours',
    '00000000-0000-4000-8000-000000000001', repeat('1', 64)
  );
  if v_result #>> '{room,code}' <> 'ABCDEFG' then raise exception 'room create failed'; end if;
  v_room_expires_at := (v_result #>> '{room,expiresAt}')::timestamptz;
  begin
    perform public.karaoke_create_room(
      'ABCDEFG', '00000000-0000-4000-8000-000000000099',
      repeat('0', 64), repeat('1', 64), statement_timestamp() + interval '12 hours',
      '00000000-0000-4000-8000-000000000098', repeat('2', 64)
    );
    raise exception 'room code collision did not return a retryable conflict';
  exception when unique_violation then
    null;
  end;

  v_result := public.karaoke_join_room(
    'ABCDEFG', repeat('c', 64), ' Alice ',
    '00000000-0000-4000-8000-000000000002', repeat('2', 64)
  );
  v_alice := (v_result #>> '{participant,id}')::uuid;
  if (v_result->>'expiresAt')::timestamptz <> v_room_expires_at then
    raise exception 'join did not return the room expiry required for cookie retention';
  end if;
  select state_version into v_version
  from public.karaoke_rooms where room_code = 'ABCDEFG';
  select count(*) into v_action_count
  from public.karaoke_room_actions as a
  join public.karaoke_rooms as r on r.id = a.room_id
  where r.room_code = 'ABCDEFG';
  v_result := public.karaoke_touch_participant(
    'ABCDEFG', repeat('c', 64),
    '00000000-0000-4000-8000-000000000096', repeat('6', 64)
  );
  if (v_result->>'stateVersion')::bigint <> v_version
    or (select state_version from public.karaoke_rooms where room_code = 'ABCDEFG') <> v_version
    or (select count(*) from public.karaoke_room_actions as a
        join public.karaoke_rooms as r on r.id = a.room_id
        where r.room_code = 'ABCDEFG') <> v_action_count then
    raise exception 'participant heartbeat changed room state or action history';
  end if;
  v_result := public.karaoke_join_room(
    'ABCDEFG', repeat('d', 64), 'Bob',
    '00000000-0000-4000-8000-000000000003', repeat('3', 64)
  );
  v_bob := (v_result #>> '{participant,id}')::uuid;
  v_result := public.karaoke_join_room(
    'ABCDEFG', repeat('e', 64), 'Cara',
    '00000000-0000-4000-8000-000000000004', repeat('4', 64)
  );
  v_cara := (v_result #>> '{participant,id}')::uuid;

  v_result := public.karaoke_add_song(
    'ABCDEFG', repeat('c', 64), 'aaaaaaaaaaa', 'A1', 'Channel A',
    'https://i.ytimg.com/vi/aaaaaaaaaaa/default.jpg', 180, statement_timestamp(),
    '20000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000005', repeat('5', 64)
  );
  if public.karaoke_add_song(
    'ABCDEFG', repeat('c', 64), 'aaaaaaaaaaa', 'A1', 'Channel A',
    'https://i.ytimg.com/vi/aaaaaaaaaaa/default.jpg', 180, statement_timestamp(),
    '20000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000005', repeat('5', 64)
  ) <> v_result then
    raise exception 'duplicate add did not return the stored idempotent result';
  end if;
  begin
    perform public.karaoke_add_song(
      'ABCDEFG', repeat('c', 64), 'zzzzzzzzzzz', 'Changed payload', 'Channel A',
      'https://i.ytimg.com/vi/zzzzzzzzzzz/default.jpg', 180, statement_timestamp(),
      '20000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000005', repeat('f', 64)
    );
    raise exception 'conflicting idempotency fingerprint unexpectedly succeeded';
  exception when invalid_parameter_value then
    null;
  end;
  v_result := public.karaoke_add_song(
    'ABCDEFG', repeat('c', 64), 'aaaaaaaaaaa', 'A1 duplicate', 'Channel A',
    'https://i.ytimg.com/vi/aaaaaaaaaaa/default.jpg', 180, statement_timestamp(),
    '20000000-0000-4000-8000-000000000090',
    '00000000-0000-4000-8000-000000000090', repeat('9', 64)
  );
  if (v_result->>'duplicateWarningCount')::integer <> 1 then
    raise exception 'duplicate warning count was not returned';
  end if;
  perform public.karaoke_remove_own_song(
    'ABCDEFG', repeat('c', 64), (v_result #>> '{song,id}')::uuid,
    '00000000-0000-4000-8000-000000000091', repeat('a', 64)
  );
  perform public.karaoke_add_song(
    'ABCDEFG', repeat('c', 64), 'bbbbbbbbbbb', 'A2', 'Channel A',
    'https://i.ytimg.com/vi/bbbbbbbbbbb/default.jpg', 180, statement_timestamp(),
    '20000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000006', repeat('6', 64)
  );
  perform public.karaoke_add_song(
    'ABCDEFG', repeat('d', 64), 'ccccccccccc', 'B1', 'Channel B',
    'https://i.ytimg.com/vi/ccccccccccc/default.jpg', 180, statement_timestamp(),
    '20000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000007', repeat('7', 64)
  );
  perform public.karaoke_add_song(
    'ABCDEFG', repeat('e', 64), 'ddddddddddd', 'C1', 'Channel C',
    'https://i.ytimg.com/vi/ddddddddddd/default.jpg', 180, statement_timestamp(),
    '20000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000008', repeat('8', 64)
  );

  begin
    perform public.karaoke_remove_own_song(
      'ABCDEFG', repeat('c', 64),
      (select id from public.karaoke_song_requests where participant_id = v_bob and title = 'B1'),
      '00000000-0000-4000-8000-000000000099', repeat('9', 64)
    );
    raise exception 'guest removed another participant song';
  exception when insufficient_privilege then
    null;
  end;

  v_snapshot := public.karaoke_get_room_snapshot('ABCDEFG', repeat('a', 64), null, 20);
  if v_snapshot ? 'hostTokenHash' or v_snapshot::text like '%aaaaaaaaaaaaaaaa%' then
    raise exception 'snapshot leaked a credential digest';
  end if;
  v_snapshot := public.karaoke_get_room_snapshot(
    'ABCDEFG', repeat('0', 64), repeat('c', 64), 20
  );
  if (v_snapshot #>> '{capabilities,isHost}')::boolean is true
    or (v_snapshot #>> '{capabilities,isGuest}')::boolean is not true then
    raise exception 'snapshot did not fall back from stale host to valid guest credentials';
  end if;
  v_snapshot := public.karaoke_get_room_snapshot('ABCDEFG', repeat('a', 64), null, 20);
  if v_snapshot #>> '{upcoming,0,title}' <> 'A1'
    or v_snapshot #>> '{upcoming,1,title}' <> 'B1'
    or v_snapshot #>> '{upcoming,2,title}' <> 'C1'
    or v_snapshot #>> '{upcoming,3,title}' <> 'A2' then
    raise exception 'round-robin projection mismatch: %', v_snapshot->'upcoming';
  end if;

  select state_version into v_version from public.karaoke_rooms where room_code = 'ABCDEFG';
  perform public.karaoke_claim_controller(
    'ABCDEFG', repeat('a', 64), v_controller, false, v_version,
    '00000000-0000-4000-8000-000000000009', repeat('9', 64)
  );
  select state_version into v_version from public.karaoke_rooms where room_code = 'ABCDEFG';
  perform public.karaoke_join_room(
    'ABCDEFG', repeat('f', 64), 'Drew',
    '00000000-0000-4000-8000-000000000097', repeat('7', 64)
  );
  select state_version into v_state_after_mutation
  from public.karaoke_rooms where room_code = 'ABCDEFG';
  select count(*) into v_action_count
  from public.karaoke_room_actions as a
  join public.karaoke_rooms as r on r.id = a.room_id
  where r.room_code = 'ABCDEFG';
  v_result := public.karaoke_refresh_controller_lease(
    'ABCDEFG', repeat('a', 64), v_controller, v_version,
    '00000000-0000-4000-8000-000000000098', repeat('8', 64)
  );
  if (v_result->>'stateVersion')::bigint <> v_state_after_mutation
    or (select state_version from public.karaoke_rooms where room_code = 'ABCDEFG') <> v_state_after_mutation
    or (select count(*) from public.karaoke_room_actions as a
        join public.karaoke_rooms as r on r.id = a.room_id
        where r.room_code = 'ABCDEFG') <> v_action_count then
    raise exception 'controller renewal depended on or changed global room state';
  end if;
  v_result := public.karaoke_claim_next_song(
    'ABCDEFG', repeat('a', 64), v_controller, v_state_after_mutation,
    '00000000-0000-4000-8000-000000000010', repeat('a', 64)
  );
  if v_result #>> '{currentSong,title}' <> 'A1' then raise exception 'A1 was not selected'; end if;
  v_current_song := (v_result #>> '{currentSong,id}')::uuid;

  select state_version into v_version from public.karaoke_rooms where room_code = 'ABCDEFG';
  perform public.karaoke_mark_song_playing(
    'ABCDEFG', repeat('a', 64), v_controller, v_current_song, v_version,
    '00000000-0000-4000-8000-000000000011', repeat('b', 64)
  );
  select state_version into v_version from public.karaoke_rooms where room_code = 'ABCDEFG';
  v_result := public.karaoke_complete_and_select_next(
    'ABCDEFG', repeat('a', 64), v_controller, v_current_song, v_version, 'ended',
    '00000000-0000-4000-8000-000000000012', repeat('c', 64)
  );
  if v_result #>> '{currentSong,title}' <> 'B1' then raise exception 'B1 did not follow A1'; end if;
  v_current_song := (v_result #>> '{currentSong,id}')::uuid;

  select state_version into v_version from public.karaoke_rooms where room_code = 'ABCDEFG';
  v_result := public.karaoke_complete_and_select_next(
    'ABCDEFG', repeat('a', 64), v_controller, v_current_song, v_version, 'host_skip',
    '00000000-0000-4000-8000-000000000013', repeat('d', 64)
  );
  if v_result #>> '{currentSong,title}' <> 'C1' then
    raise exception 'host skip did not consume B turn';
  end if;
  v_current_song := (v_result #>> '{currentSong,id}')::uuid;

  select state_version into v_version from public.karaoke_rooms where room_code = 'ABCDEFG';
  v_result := public.karaoke_fail_and_select_replacement(
    'ABCDEFG', repeat('a', 64), v_controller, v_current_song, v_version,
    'preplay', 'youtube_error_100',
    '00000000-0000-4000-8000-000000000014', repeat('e', 64)
  );
  if v_result #>> '{currentSong,title}' <> 'A2' then
    raise exception 'preplay failure replacement/cursor behavior is wrong';
  end if;
  v_current_song := (v_result #>> '{currentSong,id}')::uuid;
  if (select rotation_cursor from public.karaoke_playback_state ps
      join public.karaoke_rooms r on r.id = ps.room_id where r.room_code = 'ABCDEFG')
      <> (select rotation_order from public.karaoke_participants where id = v_bob) then
    raise exception 'preplay failure advanced the cursor';
  end if;

  select state_version into v_version from public.karaoke_rooms where room_code = 'ABCDEFG';
  perform public.karaoke_mark_song_playing(
    'ABCDEFG', repeat('a', 64), v_controller, v_current_song, v_version,
    '00000000-0000-4000-8000-000000000015', repeat('f', 64)
  );
  select state_version into v_version from public.karaoke_rooms where room_code = 'ABCDEFG';
  v_result := public.karaoke_complete_and_select_next(
    'ABCDEFG', repeat('a', 64), v_controller, v_current_song, v_version, 'ended',
    '00000000-0000-4000-8000-000000000016', repeat('0', 64)
  );
  if v_result #>> '{playerState}' <> 'idle' then raise exception 'queue did not become idle'; end if;
  if public.karaoke_complete_and_select_next(
    'ABCDEFG', repeat('a', 64), v_controller, v_current_song, v_version, 'ended',
    '00000000-0000-4000-8000-000000000016', repeat('0', 64)
  ) <> v_result then
    raise exception 'idempotent completion did not return the stored result';
  end if;
  select state_version into v_version from public.karaoke_rooms where room_code = 'ABCDEFG';
  v_result := public.karaoke_complete_and_select_next(
    'ABCDEFG', repeat('a', 64), v_controller, v_current_song, v_version, 'ended',
    '00000000-0000-4000-8000-000000000017', repeat('1', 64)
  );
  if coalesce((v_result->>'stale')::boolean, false) is not true then
    raise exception 'duplicate completion with a new request was not a stale no-op';
  end if;

  update public.karaoke_playback_state as ps
  set controller_lease_expires_at = statement_timestamp() - interval '1 second'
  from public.karaoke_rooms as r
  where r.id = ps.room_id and r.room_code = 'ABCDEFG';
  select state_version into v_version from public.karaoke_rooms where room_code = 'ABCDEFG';
  begin
    perform public.karaoke_refresh_controller_lease(
      'ABCDEFG', repeat('a', 64), v_controller, v_version,
      '00000000-0000-4000-8000-000000000092', repeat('b', 64)
    );
    raise exception 'expired controller lease unexpectedly refreshed';
  exception when insufficient_privilege then
    null;
  end;
  perform public.karaoke_claim_controller(
    'ABCDEFG', repeat('a', 64), v_new_controller, false, v_version,
    '00000000-0000-4000-8000-000000000093', repeat('c', 64)
  );
  select state_version into v_version from public.karaoke_rooms where room_code = 'ABCDEFG';
  begin
    perform public.karaoke_refresh_controller_lease(
      'ABCDEFG', repeat('a', 64), v_controller, v_version,
      '00000000-0000-4000-8000-000000000094', repeat('d', 64)
    );
    raise exception 'old controller refreshed after takeover';
  exception when insufficient_privilege then
    null;
  end;

  perform public.karaoke_create_room(
    'BCDEFGH', '00000000-0000-4000-8000-000000000002',
    repeat('f', 64), repeat('9', 64), statement_timestamp() + interval '12 hours',
    '00000000-0000-4000-8000-000000000018', repeat('2', 64)
  );
  select id into v_room_two from public.karaoke_rooms where room_code = 'BCDEFGH';
  begin
    perform public.karaoke_get_room_snapshot('BCDEFGH', null, repeat('c', 64), 20);
    raise exception 'cross-room guest token unexpectedly worked';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.karaoke_song_requests (
      room_id, participant_id, youtube_video_id, title, channel_title, thumbnail_url,
      duration_seconds, metadata_refreshed_at, enqueue_sequence, client_request_id
    ) values (
      v_room_two, v_alice, 'eeeeeeeeeee', 'Cross room', 'Nope',
      'https://i.ytimg.com/vi/eeeeeeeeeee/default.jpg', 100, statement_timestamp(), 1,
      '20000000-0000-4000-8000-000000000099'
    );
    raise exception 'cross-room participant/song insert unexpectedly succeeded';
  exception when foreign_key_violation then
    null;
  end;

  v_result := public.karaoke_consume_rate_limit('youtube:hmac:0123456789abcdef', 1, 60, 1);
  if (v_result->>'allowed')::boolean is not true then raise exception 'first rate request denied'; end if;
  v_result := public.karaoke_consume_rate_limit('youtube:hmac:0123456789abcdef', 1, 60, 1);
  if (v_result->>'allowed')::boolean is not false then raise exception 'rate limit was not enforced'; end if;

  v_result := public.karaoke_consume_rate_limits(
    '[{"key":"unit:atomic:full-bucket","limit":1,"windowSeconds":60}]'::jsonb
  );
  if (v_result->>'allowed')::boolean is not true then
    raise exception 'initial atomic rate bundle was denied';
  end if;
  v_result := public.karaoke_consume_rate_limits(
    '[{"key":"unit:atomic:full-bucket","limit":1,"windowSeconds":60},{"key":"unit:atomic:empty-bucket","limit":1,"windowSeconds":60}]'::jsonb
  );
  if (v_result->>'allowed')::boolean is not false then
    raise exception 'atomic rate bundle did not reject a full member';
  end if;
  v_result := public.karaoke_consume_rate_limits(
    '[{"key":"unit:atomic:empty-bucket","limit":1,"windowSeconds":60}]'::jsonb
  );
  if (v_result->>'allowed')::boolean is not true then
    raise exception 'rejected atomic rate bundle partially consumed another member';
  end if;

  delete from public.karaoke_rate_limit_buckets
  where bucket_key in ('youtube:quota:search', 'youtube:quota:total');
  v_result := public.karaoke_reserve_youtube_quota(
    2, 1, 1, 1, '2026-03-08 07:59:59+00'::timestamptz
  );
  if (v_result->>'allowed')::boolean is not true
    or (v_result->>'windowStartsAt')::timestamptz <> '2026-03-07 08:00:00+00'::timestamptz
    or (v_result->>'windowEndsAt')::timestamptz <> '2026-03-08 08:00:00+00'::timestamptz then
    raise exception 'Pacific provider-day reservation boundary mismatch: %', v_result;
  end if;

  v_result := public.karaoke_reserve_youtube_quota(
    2, 1, 1, 1, '2026-03-08 07:59:59+00'::timestamptz
  );
  if (v_result->>'allowed')::boolean is not false
    or v_result->>'reason' <> 'total' then
    raise exception 'combined provider quota did not reject atomically: %', v_result;
  end if;
  if (
    select request_count
    from public.karaoke_rate_limit_buckets
    where bucket_key = 'youtube:quota:search'
      and window_start = '2026-03-07 08:00:00+00'::timestamptz
  ) <> 1 then
    raise exception 'rejected combined reservation partially consumed search quota';
  end if;

  v_result := public.karaoke_reserve_youtube_quota(
    2, 1, 1, 1, '2026-03-08 08:00:00+00'::timestamptz
  );
  if (v_result->>'allowed')::boolean is not true
    or (v_result->>'windowStartsAt')::timestamptz <> '2026-03-08 08:00:00+00'::timestamptz
    or (v_result->>'windowEndsAt')::timestamptz <> '2026-03-09 07:00:00+00'::timestamptz
    or pg_catalog.date_part('epoch', (
      (v_result->>'windowEndsAt')::timestamptz - (v_result->>'windowStartsAt')::timestamptz
    )) <> 82800 then
    raise exception 'spring DST provider day was not 23 hours: %', v_result;
  end if;

  delete from public.karaoke_rate_limit_buckets
  where bucket_key in ('youtube:quota:search', 'youtube:quota:total');
  v_result := public.karaoke_reserve_youtube_quota(
    2, 2, 1, 1, '2026-11-01 07:00:00+00'::timestamptz
  );
  if pg_catalog.date_part('epoch', (
    (v_result->>'windowEndsAt')::timestamptz - (v_result->>'windowStartsAt')::timestamptz
  )) <> 90000 then
    raise exception 'fall DST provider day was not 25 hours: %', v_result;
  end if;

  perform public.karaoke_put_search_cache(
    'search:hmac:0123456789abcdef', 'karaoke song', 'JP', 'en',
    '[{"videoId":"aaaaaaaaaaa","title":"Safe","channelTitle":"Channel","thumbnailUrl":"https://i.ytimg.com/vi/aaaaaaaaaaa/default.jpg","durationSeconds":180}]'::jsonb,
    statement_timestamp() + interval '1 hour'
  );
  if public.karaoke_get_search_cache('search:hmac:0123456789abcdef') #>> '{results,0,title}' <> 'Safe' then
    raise exception 'search cache round trip failed';
  end if;

  v_result := public.karaoke_claim_search_fill(
    'search:hmac:lease-0123456789abcdef',
    '30000000-0000-4000-8000-000000000001', 15
  );
  if (v_result->>'claimed')::boolean is not true then
    raise exception 'first search fill owner did not acquire the lease';
  end if;
  v_result := public.karaoke_claim_search_fill(
    'search:hmac:lease-0123456789abcdef',
    '30000000-0000-4000-8000-000000000002', 15
  );
  if (v_result->>'claimed')::boolean is not false then
    raise exception 'second search fill owner acquired an active lease';
  end if;
  v_result := public.karaoke_release_search_fill(
    'search:hmac:lease-0123456789abcdef',
    '30000000-0000-4000-8000-000000000002'
  );
  if (v_result->>'released')::boolean is not false then
    raise exception 'non-owner released a search fill lease';
  end if;
  v_result := public.karaoke_release_search_fill(
    'search:hmac:lease-0123456789abcdef',
    '30000000-0000-4000-8000-000000000001'
  );
  if (v_result->>'released')::boolean is not true then
    raise exception 'search fill owner could not release its lease';
  end if;
end;
$$;

do $$
declare
  v_room_id uuid;
  v_participant_id uuid;
  v_snapshot jsonb;
  v_index integer;
  v_song integer;
begin
  perform public.karaoke_create_room(
    'GHJKLMN', '50000000-0000-4000-8000-000000000001',
    repeat('1', 64), repeat('2', 64), statement_timestamp() + interval '12 hours',
    '50000000-0000-4000-8000-000000000002', repeat('3', 64),
    10::smallint, 150::smallint, 1200
  );
  select id into v_room_id from public.karaoke_rooms where room_code = 'GHJKLMN';
  for v_index in 1..15 loop
    insert into public.karaoke_participants (
      room_id, session_token_hash, display_name, normalized_display_name,
      rotation_order
    ) values (
      v_room_id, pg_catalog.lpad(pg_catalog.to_hex(v_index + 100), 64, '0'),
      'Queue Singer ' || v_index, pg_catalog.lower('Queue Singer ' || v_index),
      v_index
    ) returning id into v_participant_id;
    for v_song in 1..10 loop
      insert into public.karaoke_song_requests (
        room_id, participant_id, youtube_video_id, title, channel_title,
        thumbnail_url, duration_seconds, metadata_refreshed_at,
        enqueue_sequence, client_request_id
      ) values (
        v_room_id, v_participant_id,
        pg_catalog.lpad(((v_index - 1) * 10 + v_song)::text, 11, 'a'),
        'Queue Song ' || v_index || '-' || v_song, 'Queue Channel',
        'https://i.ytimg.com/vi/aaaaaaaaaaa/default.jpg', 180,
        statement_timestamp(), (v_index - 1) * 10 + v_song,
        pg_catalog.gen_random_uuid()
      );
    end loop;
  end loop;
  update public.karaoke_rooms
  set next_rotation_order = 16, next_enqueue_sequence = 151
  where id = v_room_id;
  v_snapshot := public.karaoke_get_room_snapshot(
    'GHJKLMN', repeat('1', 64), null, 150
  );
  if pg_catalog.jsonb_array_length(v_snapshot->'upcoming') <> 150 then
    raise exception 'snapshot truncated a valid 150-song queue';
  end if;
end;
$$;

do $$
declare
  v_result jsonb;
begin
  insert into public.karaoke_rate_limit_buckets (
    bucket_key, window_start, request_count, expires_at
  )
  select
    'cleanup:capacity:' || value,
    statement_timestamp() - interval '2 hours', 1,
    statement_timestamp() - interval '1 hour'
  from pg_catalog.generate_series(1, 1101) as value;
  insert into public.karaoke_search_fill_leases (
    cache_key, lease_token, lease_expires_at, created_at, updated_at
  ) values (
    'search:hmac:expired-0123456789abcdef', pg_catalog.gen_random_uuid(),
    statement_timestamp() - interval '1 minute',
    statement_timestamp() - interval '2 minutes',
    statement_timestamp() - interval '2 minutes'
  );
  v_result := public.karaoke_cleanup_expired_rooms(
    statement_timestamp(), 1, interval '7 days'
  );
  if (v_result->>'deletedRateLimitBuckets')::integer < 1101
    or (v_result->>'deletedSearchFillLeases')::integer < 1
    or exists (
      select 1 from public.karaoke_rate_limit_buckets
      where bucket_key like 'cleanup:capacity:%'
    ) then
    raise exception 'cleanup capacity left expired admission rows behind: %', v_result;
  end if;
end;
$$;

set constraints all immediate;
set constraints all deferred;

rollback;
