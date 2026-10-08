-- Physical locations and device duty are independent of immutable Swiss pairings.
create table crossplay.table_settings (
  tournament_id uuid primary key references crossplay.tournaments(id) on delete cascade,
  version bigint not null default 1 check(version>0)
);
create table crossplay.physical_tables (
  tournament_id uuid not null references crossplay.table_settings(tournament_id) on delete cascade,
  number integer not null check(number between 1 and 128),
  available boolean not null default true,
  primary key(tournament_id,number)
);
create table crossplay.table_devices (
  tournament_id uuid not null references crossplay.table_settings(tournament_id) on delete cascade,
  device_id uuid not null,
  label text not null check(length(label) between 1 and 80),
  table_number integer,
  generation bigint not null,
  primary key(tournament_id,device_id),
  unique(tournament_id,table_number),
  foreign key(tournament_id,table_number) references crossplay.physical_tables(tournament_id,number)
);
create table crossplay.match_locations (
  tournament_id uuid not null, match_id uuid not null, round_id uuid not null,
  table_number integer not null, original_table_number integer not null,
  queue_order integer not null check(queue_order>0),
  primary key(tournament_id,match_id),
  foreign key(tournament_id,round_id,match_id) references crossplay.matches(tournament_id,round_id,id) on delete cascade,
  foreign key(tournament_id,table_number) references crossplay.physical_tables(tournament_id,number),
  unique(tournament_id,round_id,table_number,queue_order) deferrable initially deferred
);
alter table crossplay.match_sessions add column device_id uuid;

create function crossplay.tables_version() returns text language sql security definer set search_path='' as $$ select '20261008030000'::text $$;

create function crossplay.table_match_ready(p_tid uuid,p_mid uuid) returns boolean language sql stable set search_path='' as $$
  select not exists(select 1 from crossplay.table_settings where tournament_id=p_tid) or exists(
    select 1 from crossplay.match_locations l join crossplay.physical_tables t on t.tournament_id=l.tournament_id and t.number=l.table_number
    join crossplay.matches m on m.tournament_id=l.tournament_id and m.id=l.match_id
    join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id
    where l.tournament_id=p_tid and l.match_id=p_mid and t.available and m.status<>'final' and r.status<>'draft'
    and not exists(select 1 from crossplay.match_locations other join crossplay.matches om on om.tournament_id=other.tournament_id and om.id=other.match_id
      where other.tournament_id=p_tid and other.round_id=l.round_id and other.table_number=l.table_number and other.queue_order<l.queue_order and om.status<>'final'))
$$;

create function crossplay.table_device_busy(p_tid uuid,p_device uuid,p_except uuid default null) returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from crossplay.match_sessions s join crossplay.match_clock_sessions c on c.tournament_id=s.tournament_id and c.match_id=s.match_id and c.controller_actor=s.token_hash
    join crossplay.matches m on m.tournament_id=c.tournament_id and m.id=c.match_id
    where s.tournament_id=p_tid and s.device_id=p_device and s.revoked_at is null and m.status<>'final' and (p_except is null or m.id<>p_except))
$$;

create function crossplay.tables_json(p_actor jsonb,p_tid uuid) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('available',true,'enabled',s.tournament_id is not null,'version',coalesce(s.version,0),
    'tables',coalesce((select jsonb_agg(jsonb_build_object('number',number,'available',available) order by number) from crossplay.physical_tables where tournament_id=p_tid),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(jsonb_build_object('matchId',l.match_id,'tableNumber',l.table_number,'originalTableNumber',l.original_table_number,'queueOrder',l.queue_order,
      'ready',crossplay.table_match_ready(p_tid,l.match_id)) order by r.number,l.table_number,l.queue_order)
      from crossplay.match_locations l join crossplay.rounds r on r.tournament_id=l.tournament_id and r.id=l.round_id
      where l.tournament_id=p_tid and (r.status<>'draft' or crossplay.is_staff(p_actor,p_tid))),'[]'::jsonb))
    || case when crossplay.is_staff(p_actor,p_tid) then jsonb_build_object('devices',coalesce((select jsonb_agg(jsonb_build_object('deviceId',device_id,'label',label,'tableNumber',table_number,'generation',generation) order by label)
      from crossplay.table_devices where tournament_id=p_tid),'[]'::jsonb)) else '{}'::jsonb end
  from (select 1) singleton left join crossplay.table_settings s on s.tournament_id=p_tid
$$;

alter function crossplay.read_model(jsonb,text,text) rename to read_model_before_tables;
create function crossplay.read_model(p_actor jsonb,p_tournament text default null,p_scope text default 'public') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; tid uuid;
begin
  result:=crossplay.read_model_before_tables(p_actor,p_tournament,p_scope);
  if p_tournament is not null then
    tid:=(result->'tournament'->>'id')::uuid;
    result:=result||jsonb_build_object('tables',crossplay.tables_json(p_actor,tid));
  end if;
  return result;
end $$;

alter function crossplay.clock_read(jsonb,uuid) rename to clock_read_before_tables;
create function crossplay.clock_read(p_actor jsonb,p_match_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; tid uuid; l crossplay.match_locations%rowtype;
begin
  result:=crossplay.clock_read_before_tables(p_actor,p_match_id); tid:=(result->>'tournamentId')::uuid;
  select * into l from crossplay.match_locations where tournament_id=tid and match_id=p_match_id;
  return result||jsonb_build_object('tablesAvailable',true,'tablesEnabled',exists(select 1 from crossplay.table_settings where tournament_id=tid),
    'operationsVersion',coalesce((select version from crossplay.table_settings where tournament_id=tid),0),
    'physicalTableNumber',l.table_number,'queueOrder',l.queue_order,'tableReady',crossplay.table_match_ready(tid,p_match_id));
end $$;

-- New rounds keep engine pairing slots. Locations are a separate deterministic projection.
create function crossplay.allocate_tables(p_tid uuid,p_round uuid) returns void language plpgsql set search_path='' as $$
declare numbers integer[]; item record; i integer:=0; n integer;
begin
  if not exists(select 1 from crossplay.table_settings where tournament_id=p_tid) then return; end if;
  select array_agg(number order by number) into numbers from crossplay.physical_tables where tournament_id=p_tid and available;
  n:=coalesce(array_length(numbers,1),0); if n=0 then raise exception 'NO_TABLES_AVAILABLE'; end if;
  for item in select m.id,m.table_number from crossplay.matches m where m.tournament_id=p_tid and m.round_id=p_round and m.kind<>'bye' order by m.table_number loop
    insert into crossplay.match_locations(tournament_id,match_id,round_id,table_number,original_table_number,queue_order)
      values(p_tid,item.id,p_round,numbers[1+(i%n)],numbers[1+(i%n)],1+(i/n));
    i:=i+1;
  end loop;
end $$;

-- All wrappers acquire the tournament lock before any lower-level request/clock lock.
alter function crossplay.execute(jsonb,text,jsonb,uuid,bigint) rename to execute_before_tables;
create function crossplay.execute(p_actor jsonb,p_command text,p_payload jsonb,p_request_id uuid,p_expected_version bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; tid uuid; rid uuid; replay boolean;
begin
  tid:=(p_payload->>'tournamentId')::uuid;
  if tid is not null then perform 1 from crossplay.tournaments where id=tid for update; end if;
  select exists(select 1 from crossplay.mutation_requests where actor_key=coalesce(p_actor->>'userId',p_actor->>'sessionHash','anonymous') and request_id=p_request_id) into replay;
  result:=crossplay.execute_before_tables(p_actor,p_command,p_payload,p_request_id,p_expected_version);
  if not replay and p_command='generate_round' and exists(select 1 from crossplay.table_settings where tournament_id=tid) then
    select id into rid from crossplay.rounds where tournament_id=tid and status='draft';
    perform crossplay.allocate_tables(tid,rid);
  elsif not replay and p_command='reset_tournament' then
    update crossplay.table_devices set table_number=null,generation=(select run_generation from crossplay.tournaments where id=tid) where tournament_id=tid;
    update crossplay.table_settings set version=version+1 where tournament_id=tid;
  end if;
  return result;
end $$;

alter function crossplay.clock_execute(jsonb,text,jsonb,uuid,bigint) rename to clock_execute_before_tables;
create function crossplay.clock_execute(p_actor jsonb,p_command text,p_payload jsonb,p_request_id uuid,p_expected_clock_version bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tid uuid; mid uuid; managed boolean; did uuid; tab integer;
begin
  if p_command='claim_match_link' then select tournament_id,match_id into tid,mid from crossplay.match_credentials where invite_hash=p_payload->>'inviteHash';
  else mid:=(p_payload->>'matchId')::uuid; select tournament_id into tid from crossplay.matches where id=mid; end if;
  perform 1 from crossplay.tournaments where id=tid for update;
  if exists(select 1 from crossplay.mutation_requests where actor_key='clock:'||coalesce(p_actor->>'userId',p_actor->>'matchSessionHash','anonymous') and request_id=p_request_id) then
    return crossplay.clock_execute_before_tables(p_actor,p_command,p_payload,p_request_id,p_expected_clock_version);
  end if;
  managed:=exists(select 1 from crossplay.table_settings where tournament_id=tid);
  if managed and p_command in ('takeover_clock','issue_match_link') then raise exception 'DEVICE_ASSIGNMENT_REQUIRED'; end if;
  if managed and p_command in ('claim_clock','append_events') then
    if not crossplay.is_staff(p_actor,tid) and not crossplay.match_session_valid(p_actor,tid,mid) then raise exception 'FORBIDDEN'; end if;
    if (p_command='claim_clock' or exists(select 1 from jsonb_array_elements(p_payload->'events') e where e->>'kind' in ('start','resume','switch')))
      and not crossplay.table_match_ready(tid,mid) then raise exception 'TABLE_NOT_READY'; end if;
    if p_command='claim_clock' then
      select device_id into did from crossplay.match_sessions where token_hash=p_actor->>'matchSessionHash' and tournament_id=tid and match_id=mid;
      select table_number into tab from crossplay.match_locations where tournament_id=tid and match_id=mid;
      if did is null or not exists(select 1 from crossplay.table_devices d join crossplay.tournaments t on t.id=d.tournament_id
        where d.tournament_id=tid and d.device_id=did and d.table_number=tab and d.generation=t.run_generation) then raise exception 'DEVICE_ASSIGNMENT_REQUIRED'; end if;
    end if;
  end if;
  return crossplay.clock_execute_before_tables(p_actor,p_command,p_payload,p_request_id,p_expected_clock_version);
end $$;

create function crossplay.table_execute(p_actor jsonb,p_command text,p_payload jsonb,p_request_id uuid,p_expected_version bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tid uuid:=(p_payload->>'tournamentId')::uuid; t crossplay.tournaments%rowtype; v bigint; prior crossplay.mutation_requests%rowtype;
  actor text:='tables:'||coalesce(p_actor->>'userId','anonymous'); fp text; result jsonb; numbers integer[]; num integer; target integer;
  did uuid; other uuid; mid uuid; item record; pos integer; reason text; c crossplay.match_clock_sessions%rowtype; old crossplay.match_locations%rowtype;
begin
  if p_request_id is null then raise exception 'INVALID_REQUEST'; end if;
  select * into t from crossplay.tournaments where id=tid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not crossplay.is_staff(p_actor,tid) then raise exception 'FORBIDDEN'; end if;
  fp:=md5(jsonb_build_object('command',p_command,'payload',p_payload,'version',p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtextextended(actor||p_request_id::text,0));
  select * into prior from crossplay.mutation_requests where actor_key=actor and request_id=p_request_id;
  if found then
    if prior.retired or prior.generation<>t.run_generation then raise exception 'STALE_ACTION'; end if;
    if prior.fingerprint<>fp then raise exception 'IDEMPOTENCY_MISMATCH'; end if;
    return prior.response;
  end if;
  if t.status='archived' then raise exception 'TOURNAMENT_ARCHIVED'; end if;
  if t.status not in ('draft','active') then raise exception 'TOURNAMENT_CLOSED'; end if;
  select coalesce((select version from crossplay.table_settings where tournament_id=tid),0) into v;
  if p_expected_version is distinct from v then raise exception 'STALE_TABLE_VERSION'; end if;
  reason:=nullif(btrim(p_payload->>'reason'),'');
  if length(reason)>1000 then raise exception 'INVALID_REASON'; end if;
  if p_command='configure_tables' then
    if jsonb_typeof(p_payload->'numbers') is distinct from 'array' then raise exception 'INVALID_TABLES'; end if;
    select array_agg(value::integer order by value::integer) into numbers from jsonb_array_elements_text(p_payload->'numbers');
    if coalesce(array_length(numbers,1),0) not between 1 and 128 or exists(select 1 from unnest(numbers) n where n not between 1 and 128)
      or (select count(distinct n) from unnest(numbers) n)<>array_length(numbers,1) then raise exception 'INVALID_TABLES'; end if;
    if v=0 and exists(select 1 from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id
      where m.tournament_id=tid and r.status<>'draft' and m.kind<>'bye' and m.status<>'final' and not m.table_number=any(numbers)) then raise exception 'TABLES_IN_USE'; end if;
    insert into crossplay.table_settings(tournament_id) values(tid) on conflict do nothing;
    foreach num in array numbers loop insert into crossplay.physical_tables(tournament_id,number) values(tid,num) on conflict do nothing; end loop;
    if v=0 then
      insert into crossplay.physical_tables(tournament_id,number,available)
        select distinct tid,m.table_number,m.table_number=any(numbers) from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id
        where m.tournament_id=tid and r.status<>'draft' and m.kind<>'bye' on conflict do nothing;
      insert into crossplay.match_locations(tournament_id,match_id,round_id,table_number,original_table_number,queue_order)
        select tid,m.id,m.round_id,m.table_number,m.table_number,1 from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id
        where m.tournament_id=tid and r.status<>'draft' and m.kind<>'bye';
    end if;
  elsif v=0 then raise exception 'TABLES_NOT_ENABLED';
  elsif p_command='assign_device' then
    did:=(p_payload->>'deviceId')::uuid; num:=(p_payload->>'tableNumber')::integer;
    if did is null or length(btrim(coalesce(p_payload->>'label',''))) not between 1 and 80 then raise exception 'INVALID_DEVICE'; end if;
    if not exists(select 1 from crossplay.physical_tables where tournament_id=tid and number=num and available) then raise exception 'TABLE_UNAVAILABLE'; end if;
    select device_id into other from crossplay.table_devices where tournament_id=tid and table_number=num and device_id<>did;
    if other is not null then raise exception 'TABLE_DEVICE_OCCUPIED'; end if;
    if crossplay.table_device_busy(tid,did) and not exists(select 1 from crossplay.table_devices where tournament_id=tid and device_id=did and table_number=num) then raise exception 'DEVICE_BUSY'; end if;
    insert into crossplay.table_devices(tournament_id,device_id,label,table_number,generation) values(tid,did,btrim(p_payload->>'label'),num,t.run_generation)
      on conflict(tournament_id,device_id) do update set label=excluded.label,table_number=excluded.table_number,generation=excluded.generation;
  elsif p_command='retire_device' then
    did:=(p_payload->>'deviceId')::uuid;
    if crossplay.table_device_busy(tid,did) then raise exception 'DEVICE_BUSY'; end if;
    update crossplay.table_devices set table_number=null where tournament_id=tid and device_id=did;
    if not found then raise exception 'INVALID_DEVICE'; end if;
  elsif p_command='set_table_available' then
    num:=(p_payload->>'tableNumber')::integer;
    if jsonb_typeof(p_payload->'available') is distinct from 'boolean' then raise exception 'INVALID_TABLES'; end if;
    if (p_payload->>'available')::boolean=false and exists(select 1 from crossplay.match_locations l join crossplay.matches m on m.tournament_id=l.tournament_id and m.id=l.match_id
      join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id
      where l.tournament_id=tid and l.table_number=num and m.status<>'final' and r.status<>'draft') then raise exception 'TABLES_IN_USE'; end if;
    update crossplay.physical_tables set available=(p_payload->>'available')::boolean where tournament_id=tid and number=num;
    if not found then raise exception 'TABLE_UNAVAILABLE'; end if;
    if (p_payload->>'available')::boolean=false then update crossplay.table_devices set table_number=null where tournament_id=tid and table_number=num; end if;
  elsif p_command in ('move_match','close_table') then
    target:=(p_payload->>'targetTable')::integer;
    if reason is null then raise exception 'REASON_REQUIRED'; end if;
    if not exists(select 1 from crossplay.physical_tables where tournament_id=tid and number=target and available) then raise exception 'TABLE_UNAVAILABLE'; end if;
    num:=(p_payload->>'tableNumber')::integer; mid:=(p_payload->>'matchId')::uuid;
    if p_command='close_table' and (num is null or num=target or not exists(select 1 from crossplay.physical_tables where tournament_id=tid and number=num)) then raise exception 'INVALID_TABLES'; end if;
    for item in select l.* from crossplay.match_locations l join crossplay.matches m on m.tournament_id=l.tournament_id and m.id=l.match_id
      join crossplay.rounds r on r.tournament_id=l.tournament_id and r.id=l.round_id
      where l.tournament_id=tid and m.status<>'final' and r.status<>'draft' and
      (p_command='close_table' and l.table_number=num or p_command='move_match' and l.match_id=mid) order by l.round_id,l.queue_order,l.match_id loop
      select * into c from crossplay.match_clock_sessions where tournament_id=tid and match_id=item.match_id for update;
      if found and (c.status='running' or c.controller_actor is not null) then raise exception 'RELEASE_CLOCK_BEFORE_MOVE'; end if;
      select coalesce(max(queue_order),0)+1 into pos from crossplay.match_locations where tournament_id=tid and round_id=item.round_id and table_number=target;
      update crossplay.match_locations set table_number=target,queue_order=pos where tournament_id=tid and match_id=item.match_id;
      insert into crossplay.audit_events(tournament_id,action,actor,reason,details) values(tid,'move_match',p_actor,reason,jsonb_build_object('matchId',item.match_id,'fromTable',item.table_number,'toTable',target));
    end loop;
    if p_command='move_match' and not found then raise exception 'INVALID_MATCH'; end if;
    if p_command='close_table' then
      update crossplay.physical_tables set available=false where tournament_id=tid and number=num;
      update crossplay.table_devices set table_number=null where tournament_id=tid and table_number=num;
    end if;
  elsif p_command='reorder_queue' then
    mid:=(p_payload->>'matchId')::uuid;
    select l.* into old from crossplay.match_locations l join crossplay.matches m on m.tournament_id=l.tournament_id and m.id=l.match_id where l.tournament_id=tid and l.match_id=mid and m.status<>'final';
    if not found then raise exception 'INVALID_MATCH'; end if;
    if exists(select 1 from crossplay.match_locations l join crossplay.match_clock_sessions c on c.tournament_id=l.tournament_id and c.match_id=l.match_id
      join crossplay.matches m on m.tournament_id=l.tournament_id and m.id=l.match_id where l.tournament_id=tid and l.round_id=old.round_id and l.table_number=old.table_number and m.status<>'final' and (c.controller_actor is not null or c.status='running')) then raise exception 'RELEASE_CLOCK_BEFORE_MOVE'; end if;
    select min(l.queue_order) into pos from crossplay.match_locations l join crossplay.matches m on m.tournament_id=l.tournament_id and m.id=l.match_id
      where l.tournament_id=tid and l.round_id=old.round_id and l.table_number=old.table_number and m.status<>'final';
    update crossplay.match_locations l set queue_order=l.queue_order+1 from crossplay.matches m
      where l.tournament_id=tid and l.round_id=old.round_id and l.table_number=old.table_number and m.tournament_id=tid and m.id=l.match_id and m.status<>'final';
    update crossplay.match_locations set queue_order=pos where tournament_id=tid and match_id=mid;
  else raise exception 'INVALID_COMMAND'; end if;
  if p_command in ('configure_tables','set_table_available','close_table') then
    delete from crossplay.rounds where tournament_id=tid and status='draft';
    update crossplay.tournaments set version=version+1 where id=tid;
  end if;
  update crossplay.table_settings set version=case when v=0 then 1 else version+1 end where tournament_id=tid;
  insert into crossplay.audit_events(tournament_id,action,actor,reason,details) values(tid,p_command,p_actor,reason,p_payload-'sessionHash'-'inviteHash');
  result:=crossplay.tables_json(p_actor,tid);
  insert into crossplay.mutation_requests(actor_key,request_id,fingerprint,response,tournament_id,generation,command) values(actor,p_request_id,fp,result,tid,t.run_generation,'tables:'||p_command);
  return result;
end $$;

-- Server supplies only hashed session material. Browser device IDs never authorize an actor.
create function crossplay.table_enter_match(p_actor jsonb,p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare mid uuid:=(p_payload->>'matchId')::uuid; did uuid:=(p_payload->>'deviceId')::uuid; cid uuid:=(p_payload->>'controllerId')::uuid;
  tid uuid; t crossplay.tournaments%rowtype; l crossplay.match_locations%rowtype; c crossplay.match_clock_sessions%rowtype;
  v bigint; actor text:='table-entry:'||coalesce(p_actor->>'userId','anonymous'); fp text; prior crossplay.mutation_requests%rowtype;
  mode text:=coalesce(p_payload->>'mode','open'); sh text:=p_payload->>'sessionHash'; ih text:=p_payload->>'inviteHash'; existing text:=p_payload->>'existingHash';
  reason text:=nullif(btrim(p_payload->>'reason'),''); result jsonb; chosen text; old_device uuid; fresh boolean:=false;
begin
  if p_request_id is null or did is null or cid is null or mode not in ('open','replace','release') then raise exception 'INVALID_REQUEST'; end if;
  select tournament_id into tid from crossplay.matches where id=mid;
  select * into t from crossplay.tournaments where id=tid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not crossplay.is_staff(p_actor,tid) then raise exception 'FORBIDDEN'; end if;
  if t.status='archived' then raise exception 'TOURNAMENT_ARCHIVED'; end if;
  if t.status<>'active' then raise exception 'TOURNAMENT_NOT_ACTIVE'; end if;
  -- A committed response may set a cookie before the client retries. Cookie state
  -- is only an adoption hint and is not part of the requested operation.
  fp:=md5((p_payload-'existingHash')::text);
  perform pg_advisory_xact_lock(hashtextextended(actor||p_request_id::text,0));
  select * into prior from crossplay.mutation_requests where actor_key=actor and request_id=p_request_id;
  if found then
    if prior.retired or prior.generation<>t.run_generation then raise exception 'STALE_ACTION'; end if;
    if prior.fingerprint<>fp then raise exception 'IDEMPOTENCY_MISMATCH'; end if;
    if (prior.response->>'sessionCreated')::boolean and not crossplay.match_session_valid(jsonb_build_object('matchSessionHash',sh),tid,mid) then raise exception 'STALE_ACTION'; end if;
    return prior.response;
  end if;
  select version into v from crossplay.table_settings where tournament_id=tid;
  if v is null then raise exception 'TABLES_NOT_ENABLED'; end if;
  if (p_payload->>'expectedOperationsVersion')::bigint is distinct from v then raise exception 'STALE_TABLE_VERSION'; end if;
  select * into l from crossplay.match_locations where tournament_id=tid and match_id=mid;
  select * into c from crossplay.match_clock_sessions where tournament_id=tid and match_id=mid for update;
  if (select status from crossplay.matches where tournament_id=tid and id=mid)='final' then raise exception 'RESULT_LOCKED'; end if;
  if mode<>'open' then
    if reason is null or length(reason)>1000 then raise exception 'REASON_REQUIRED'; end if;
    if c.match_id is null or (p_payload->>'expectedClockVersion')::bigint is distinct from c.version or (p_payload->>'expectedEpoch')::bigint is distinct from c.epoch then raise exception 'STALE_CLOCK_VERSION'; end if;
  end if;
  if mode<>'release' then
    if not crossplay.table_match_ready(tid,mid) then raise exception 'TABLE_NOT_READY'; end if;
    if crossplay.table_device_busy(tid,did,mid) then raise exception 'DEVICE_BUSY'; end if;
  end if;
  select device_id into old_device from crossplay.match_sessions where token_hash=c.controller_actor;
  if mode in ('replace','release') then
    perform crossplay.clock_execute_before_tables(p_actor,'revoke_match_link',jsonb_build_object('matchId',mid,'reason',reason),gen_random_uuid(),null);
    update crossplay.table_devices set table_number=null where tournament_id=tid and (device_id=old_device or table_number=l.table_number);
  end if;
  if mode='release' then
    result:=jsonb_build_object('sessionCreated',false,'snapshot',crossplay.clock_read(p_actor,mid));
  else
    if mode='replace' then
      insert into crossplay.table_devices(tournament_id,device_id,label,table_number,generation) values(tid,did,left(coalesce(nullif(p_payload->>'label',''),'Table device'),80),l.table_number,t.run_generation)
        on conflict(tournament_id,device_id) do update set table_number=excluded.table_number,generation=excluded.generation;
    elsif not exists(select 1 from crossplay.table_devices where tournament_id=tid and device_id=did and table_number=l.table_number and generation=t.run_generation) then raise exception 'DEVICE_ASSIGNMENT_REQUIRED'; end if;
    if mode='open' and c.controller_actor is not null then
      if existing=c.controller_actor and crossplay.match_session_valid(jsonb_build_object('matchSessionHash',existing),tid,mid) and cid=c.controller_id then
        update crossplay.match_sessions set device_id=did where token_hash=existing; chosen:=existing;
      else
        result:=jsonb_build_object('sessionCreated',false,'snapshot',crossplay.clock_read(p_actor,mid));
      end if;
    else
      if coalesce(sh,'') !~ '^[0-9a-f]{64}$' or coalesce(ih,'') !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_REQUEST'; end if;
      perform crossplay.clock_execute_before_tables(p_actor,'issue_match_link',jsonb_build_object('matchId',mid,'inviteHash',ih),gen_random_uuid(),null);
      perform crossplay.clock_execute_before_tables('{}','claim_match_link',jsonb_build_object('matchId',mid,'inviteHash',ih,'sessionHash',sh),gen_random_uuid(),null);
      update crossplay.match_sessions set device_id=did where token_hash=sh;
      perform crossplay.clock_execute_before_tables(jsonb_build_object('matchSessionHash',sh),'claim_clock',jsonb_build_object('matchId',mid,'controllerId',cid),gen_random_uuid(),null);
      chosen:=sh; fresh:=true;
    end if;
    if chosen is not null then result:=jsonb_build_object('sessionCreated',fresh,'snapshot',crossplay.clock_read(jsonb_build_object('matchSessionHash',chosen),mid)); end if;
  end if;
  if mode<>'open' then
    update crossplay.table_settings set version=version+1 where tournament_id=tid;
    insert into crossplay.audit_events(tournament_id,action,actor,reason,details) values(tid,'device_'||mode,p_actor,reason,jsonb_build_object('matchId',mid,'deviceId',did,'oldDeviceId',old_device));
    result:=jsonb_set(result,'{snapshot,operationsVersion}',to_jsonb(v+1));
  end if;
  insert into crossplay.mutation_requests(actor_key,request_id,fingerprint,response,tournament_id,generation,command) values(actor,p_request_id,fp,result,tid,t.run_generation,'table-entry:'||mode);
  return result;
end $$;

do $$ declare obj record; begin
  for obj in select tablename from pg_tables where schemaname='crossplay' and tablename in ('table_settings','physical_tables','table_devices','match_locations') loop
    execute format('alter table crossplay.%I enable row level security',obj.tablename);
    execute format('revoke all on crossplay.%I from public,anon,authenticated,service_role,crossplay_runtime',obj.tablename);
  end loop;
  for obj in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crossplay' and p.proname in
    ('tables_version','table_match_ready','table_device_busy','tables_json','read_model','read_model_before_tables','clock_read','clock_read_before_tables','allocate_tables','execute','execute_before_tables','clock_execute','clock_execute_before_tables','table_execute','table_enter_match') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role,crossplay_runtime',obj.signature);
  end loop;
end $$;
grant execute on function crossplay.tables_version(),crossplay.read_model(jsonb,text,text),crossplay.clock_read(jsonb,uuid),crossplay.execute(jsonb,text,jsonb,uuid,bigint),crossplay.clock_execute(jsonb,text,jsonb,uuid,bigint),crossplay.table_execute(jsonb,text,jsonb,uuid,bigint),crossplay.table_enter_match(jsonb,jsonb,uuid) to crossplay_runtime;
