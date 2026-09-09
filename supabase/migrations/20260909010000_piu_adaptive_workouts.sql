-- Ongoing workouts and server-only account evidence. Existing journal history is retained.
-- Retain validated chart membership independently of the disposable 128-board cache.
create table public."PIU_TRAINER_OFFICIAL_MEMBERSHIP" (
 profile_id text not null references public."PIU_TRAINER_PROFILES"(id),
 chart_id uuid not null,
 as_of timestamptz not null,
 goal boolean not null,
 top300 boolean not null,
 played boolean not null,
 primary key(profile_id,chart_id)
);
alter table public."PIU_TRAINER_OFFICIAL_MEMBERSHIP" enable row level security;
revoke all on public."PIU_TRAINER_OFFICIAL_MEMBERSHIP" from public,anon,authenticated;
grant all on public."PIU_TRAINER_OFFICIAL_MEMBERSHIP" to service_role;
-- Only boolean membership leaves this bounded server-side cache projection. Callers
-- must establish complete player coverage before using per-chart refinements.
create function public."PIU_TRAINER_BOARD_MEMBERSHIP"(profile text, since timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item record; board jsonb; row_data jsonb; player_id integer; tag text; threshold integer;
 as_of timestamptz; member_place integer; valid boolean; output jsonb:='[]';
begin
 if profile='hds' then player_id:=4626; tag:='HDS#9184'; threshold:=20;
 elsif profile='jonathan' then player_id:=5756; tag:='JONATHAN#5143'; threshold:=300;
 else raise exception 'INVALID_PROFILE'; end if;
 if since is null then return output; end if;
 for item in select cache_key,payload from public."PIU_TRAINER_LEADERBOARD_CACHE"
  where left(cache_key,6)='board:' order by fetched_at desc nulls last,cache_key limit 128 loop
  begin
   board:=item.payload->'board';
   if jsonb_typeof(board) is distinct from 'object' or (board ? 'mix' and board->>'mix' is distinct from 'Phoenix2')
    or jsonb_typeof(board->'data') is distinct from 'array' or jsonb_array_length(board->'data')>1000
    or coalesce(board->>'asOf','') !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then continue; end if;
   as_of:=(board->>'asOf')::timestamptz;
   valid:=true; member_place:=null;
   for row_data in select value from jsonb_array_elements(board->'data') loop
    if jsonb_typeof(row_data->'place') is distinct from 'number' or coalesce(row_data->>'place','') !~ '^[1-9][0-9]*$'
     or jsonb_typeof(row_data->'score') is distinct from 'number' or coalesce(row_data->>'score','') !~ '^[0-9]+$'
     or jsonb_typeof(row_data->'player'->'playerId') is distinct from 'number' or coalesce(row_data->'player'->>'playerId','') !~ '^[1-9][0-9]*$'
     or jsonb_typeof(row_data->'player'->'gameTag') is distinct from 'string' or length(row_data->'player'->>'gameTag') not between 1 and 1000
     or row_data->'player'->'isSupplemented' is distinct from 'false'::jsonb then valid:=false; exit; end if;
    if ((row_data->'player'->>'playerId')::integer=player_id) <> (row_data->'player'->>'gameTag'=tag) then valid:=false; exit; end if;
    if (row_data->'player'->>'playerId')::integer=player_id then member_place:=(row_data->>'place')::integer; end if;
   end loop;
   if not valid or exists(select 1 from jsonb_array_elements(board->'data') r group by r->'player'->>'playerId' having count(*)>1) then continue; end if;
   insert into public."PIU_TRAINER_OFFICIAL_MEMBERSHIP" as retained(profile_id,chart_id,as_of,goal,top300,played)
    values(profile,substr(item.cache_key,7)::uuid,as_of,coalesce(member_place<=threshold,false),coalesce(member_place<=300,false),member_place is not null)
    on conflict(profile_id,chart_id) do update set as_of=excluded.as_of,goal=excluded.goal,top300=excluded.top300,
     played=retained.played or excluded.played where excluded.as_of>retained.as_of;
  exception when others then
   -- One malformed cached board cannot erase prior validated goal evidence.
   continue;
  end;
 end loop;
 -- Older rows remain positive played history; callers only refine goals when
 -- their per-chart as-of is newer than the complete player snapshot.
 select coalesce(jsonb_agg(jsonb_build_object('chartId',retained.chart_id,'asOfUtc',retained.as_of,'goal',retained.goal,'top300',retained.top300,'played',retained.played) order by retained.chart_id),'[]') into output
  from (select * from public."PIU_TRAINER_OFFICIAL_MEMBERSHIP" where profile_id=profile order by chart_id limit 30000) retained;
 return output;
end; $$;
revoke all on function public."PIU_TRAINER_BOARD_MEMBERSHIP"(text,timestamptz) from public,anon,authenticated;
grant execute on function public."PIU_TRAINER_BOARD_MEMBERSHIP"(text,timestamptz) to service_role;

create function public."PIU_TRAINER_DAILY_VALID"(record jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare w jsonb:=record->'workout'; item jsonb;
begin
 if coalesce(record->>'kind','legacy')='legacy' then
  return record->>'planSessionId' is not null and not (record ? 'workout') and not (record ? 'plays') and not (record ? 'stepStates');
 end if;
 if record->>'kind'<>'daily' or record ? 'planSessionId' or record ? 'planSnapshot' or record ? 'planHash' or record ? 'planId'
  or jsonb_typeof(w) is distinct from 'object' or w->>'version' is distinct from '1' or coalesce(w->>'profileId','') not in ('hds','jonathan')
  or jsonb_typeof(w->'slots') is distinct from 'array' or jsonb_array_length(w->'slots')<>16
  or jsonb_typeof(w->'steps') is distinct from 'array' or jsonb_array_length(w->'steps') not between 16 and 24
  or jsonb_typeof(record->'plays') is distinct from 'array' or jsonb_typeof(record->'stepStates') is distinct from 'array' then return false; end if;
 if (select count(distinct s->>'id') from jsonb_array_elements(w->'slots') s)<>16
  or (select count(distinct s->>'id') from jsonb_array_elements(w->'steps') s)<>jsonb_array_length(w->'steps') then return false; end if;
 if exists(select 1 from (values('warmup','Single'),('warmup','Double'),('push','Single'),('push','Double')) bucket(phase,mode)
  where (select count(*) from jsonb_array_elements(w->'slots') s where s->>'phase'=bucket.phase and s->>'mode'=bucket.mode)<>4) then return false; end if;
 if exists(select 1 from jsonb_array_elements(w->'steps') s where not exists
  (select 1 from jsonb_array_elements(w->'slots') t where t->>'id'=s->>'slotId' and t->>'phase'=s->>'phase')
  or coalesce(s->>'repetition','') not in ('1','2') or (s->>'phase'='warmup' and s->>'repetition'<>'1') or jsonb_typeof(s->'included') is distinct from 'boolean') then return false; end if;
 if exists(select 1 from jsonb_array_elements(w->'slots') s where
  (select count(*) from jsonb_array_elements(w->'steps') t where t->>'slotId'=s->>'id' and t->>'repetition'='1')<>1) then return false; end if;
 if exists(select 1 from jsonb_array_elements(w->'steps') s group by s->>'slotId',s->>'repetition' having count(*)>1) then return false; end if;
 for item in select value from jsonb_array_elements(record->'plays') loop
  if item->>'id' is null or item->>'assignmentId' is null or item->>'stepId' is null
   or item->>'sequence' is null or (item->>'sequence')::integer<1 or jsonb_typeof(item->'completed') is distinct from 'boolean' or item->>'createdAtUtc' is null
   or not exists(select 1 from jsonb_array_elements(w->'steps') s where s->>'id'=item->>'stepId') then return false; end if;
  perform (item->>'id')::uuid, (item->>'assignmentId')::uuid, (item->>'createdAtUtc')::timestamptz;
 end loop;
 if exists(select 1 from jsonb_array_elements(record->'plays') p group by p->>'id' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(record->'plays') p group by p->>'stepId',p->>'sequence' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(record->'plays') p group by p->>'stepId' having min((p->>'sequence')::integer)<>1 or max((p->>'sequence')::integer)<>count(*)) then return false; end if;
 if exists(select 1 from jsonb_array_elements(record->'stepStates') s where jsonb_typeof(s->'included') is distinct from 'boolean'
  or not exists(select 1 from jsonb_array_elements(w->'steps') t where t->>'id'=s->>'stepId'))
  or exists(select 1 from jsonb_array_elements(record->'stepStates') s group by s->>'stepId' having count(*)>1) then return false; end if;
 return true;
exception when others then return false;
end; $$;
alter table public."PIU_TRAINER_RUNS" add constraint "PIU_TRAINER_RUN_KIND" check(public."PIU_TRAINER_DAILY_VALID"(record));

create table public."PIU_TRAINER_PERSONAL_ACCOUNTS" (
 profile_id text primary key references public."PIU_TRAINER_PROFILES"(id),
 external_user_id uuid not null unique,
 mapping_version text not null check(length(mapping_version)=64),
 available boolean not null default true,
 revision bigint not null default 0 check(revision>=0),
 snapshot jsonb check(snapshot is null or (jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=4194304)),
 staging jsonb check(staging is null or (jsonb_typeof(staging)='object' and octet_length(staging::text)<=4194304)),
 verified_at timestamptz not null default now(),
 attempted_at timestamptz,
 retry_after timestamptz,
 lease_id uuid,
 lease_until timestamptz
);

create function public."PIU_TRAINER_PERSONAL"(profile text, action text, token uuid default null, value jsonb default null, force boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public."PIU_TRAINER_PERSONAL_ACCOUNTS"; denied boolean;
begin
 if profile not in ('hds','jonathan') or profile is null then raise exception 'INVALID_PROFILE'; end if;
 if action='link' then
  if value->>'mappingVersion' is null or value->>'externalUserId' is null then raise exception 'INVALID_PERSONAL'; end if;
  insert into public."PIU_TRAINER_PERSONAL_ACCOUNTS"(profile_id,external_user_id,mapping_version)
   values(profile,(value->>'externalUserId')::uuid,value->>'mappingVersion')
   on conflict(profile_id) do update set external_user_id=excluded.external_user_id,mapping_version=excluded.mapping_version,
    snapshot=null,staging=null,available=true,verified_at=now(),revision="PIU_TRAINER_PERSONAL_ACCOUNTS".revision+1,lease_id=null,lease_until=null,retry_after=null
   where "PIU_TRAINER_PERSONAL_ACCOUNTS".mapping_version<>excluded.mapping_version;
  return 'true';
 end if;
 if action='get' then
  select * into item from public."PIU_TRAINER_PERSONAL_ACCOUNTS" where profile_id=profile;
  if not found then return null; end if;
  return jsonb_build_object('externalUserId',item.external_user_id,'mappingVersion',item.mapping_version,'available',item.available,
   'revision',item.revision,'snapshot',item.snapshot,'staging',item.staging,'attemptedAtUtc',item.attempted_at,'retryAfterUtc',item.retry_after);
 end if;
 if action='lease' then
  update public."PIU_TRAINER_PERSONAL_ACCOUNTS" set lease_id=token,lease_until=now()+interval '60 seconds',attempted_at=now()
   where profile_id=profile and token is not null and (lease_until is null or lease_until<now()) and (retry_after is null or retry_after<=now())
    and (attempted_at is null or attempted_at<now()-case when staging is null then interval '2 minutes' else interval '1 second' end)
    and (force or staging is not null or snapshot is null or (snapshot->>'fetchedAtUtc')::timestamptz<now()-interval '1 hour');
  return to_jsonb(found);
 end if;
 select * into item from public."PIU_TRAINER_PERSONAL_ACCOUNTS" where profile_id=profile for update;
 if not found or token is null or item.lease_id is distinct from token or item.lease_until<=now() then return 'false'; end if;
 if action in ('save','publish') then
  if jsonb_typeof(value) is distinct from 'object' or value->>'version' is distinct from '1' or value->>'mappingVersion' is distinct from item.mapping_version or value->>'catalogRevision' is null then raise exception 'INVALID_PERSONAL'; end if;
  if action='publish' then
   if value->'scoresComplete' is distinct from 'true'::jsonb or value->'journalComplete' is distinct from 'true'::jsonb
    or jsonb_typeof(value->'scoreChartIds') is distinct from 'array' or jsonb_typeof(value->'journalChartIds') is distinct from 'array'
    or jsonb_array_length(value->'scoreChartIds')>30000 or jsonb_array_length(value->'journalChartIds')>30000
    or value->>'fetchedAtUtc' is null or value->>'checkpointUtc' is null or value->>'fullSyncedAtUtc' is null then raise exception 'INCOMPLETE_PERSONAL'; end if;
   update public."PIU_TRAINER_PERSONAL_ACCOUNTS" set snapshot=value,staging=null,revision=revision+1,available=true,verified_at=now(),lease_id=null,lease_until=null,retry_after=null where profile_id=profile;
  else
   update public."PIU_TRAINER_PERSONAL_ACCOUNTS" set staging=value,available=true,lease_id=null,lease_until=null,retry_after=null where profile_id=profile;
  end if;
  return 'true';
 end if;
 if action='fail' then
  denied:=coalesce((value->>'denied')::boolean,false);
  update public."PIU_TRAINER_PERSONAL_ACCOUNTS" set available=case when denied then false else available end,
   staging=case when denied then null else staging end, lease_id=null,lease_until=null,
   retry_after=now()+make_interval(secs=>greatest(120,least(86400,coalesce((value->>'retrySeconds')::integer,120)))) where profile_id=profile;
  return 'true';
 end if;
 raise exception 'INVALID_PERSONAL';
end; $$;

-- Only the new cache/function are directly granted. Existing state/commit ACLs are preserved.
alter table public."PIU_TRAINER_PERSONAL_ACCOUNTS" enable row level security;
revoke all on public."PIU_TRAINER_PERSONAL_ACCOUNTS" from public,anon,authenticated;
grant select,insert,update,delete on public."PIU_TRAINER_PERSONAL_ACCOUNTS" to service_role;
revoke all on function public."PIU_TRAINER_PERSONAL"(text,text,uuid,jsonb,boolean),public."PIU_TRAINER_DAILY_VALID"(jsonb) from public,anon,authenticated;
grant execute on function public."PIU_TRAINER_PERSONAL"(text,text,uuid,jsonb,boolean),public."PIU_TRAINER_DAILY_VALID"(jsonb) to service_role;

create or replace function public."PIU_TRAINER_STATE"(actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('settings',a.settings,'profileId',a.profile_id,'trainingPlan',a.training_plan,
 'completions',coalesce((select jsonb_agg(c.record order by c.record->>'createdAtUtc',c.record->>'id') from public."PIU_TRAINER_COMPLETIONS" c where c.user_id=actor),'[]'::jsonb),
 'runs', coalesce((select jsonb_agg(r.record order by r.record->>'generatedAtUtc',r.record->>'id') from public."PIU_TRAINER_RUNS" r where r.user_id=actor),'[]'::jsonb),
 'assignments', coalesce((select jsonb_agg(r.record order by r.record::text) from public."PIU_TRAINER_ASSIGNMENTS" r where r.user_id=actor),'[]'::jsonb),
 'attempts', coalesce((select jsonb_agg(r.record order by r.record->>'playedAtUtc',r.record->>'id') from public."PIU_TRAINER_ATTEMPTS" r where r.user_id=actor),'[]'::jsonb),
 'corrections', coalesce((select jsonb_agg(r.record order by r.record->>'correctedAtUtc',r.record->>'id') from public."PIU_TRAINER_CORRECTIONS" r where r.user_id=actor),'[]'::jsonb),
 'checkins', coalesce((select jsonb_agg(r.record order by r.record->>'capturedAtUtc',r.record->>'id') from public."PIU_TRAINER_CHECKINS" r where r.user_id=actor),'[]'::jsonb),
 'rerolls', coalesce((select jsonb_agg(r.record order by r.record->>'createdAtUtc',r.record->>'id') from public."PIU_TRAINER_REROLLS" r where r.user_id=actor),'[]'::jsonb),
 'preferences', coalesce((select jsonb_agg(r.record order by r.record::text) from public."PIU_TRAINER_PREFERENCES" r where r.user_id=actor),'[]'::jsonb),
 'archivedCharts', coalesce((select jsonb_agg(r.record order by r.record::text) from public."PIU_TRAINER_ARCHIVED_CHARTS" r where r.user_id=actor),'[]'::jsonb) ) from public."PIU_TRAINER_ACCOUNTS" a where a.user_id=actor;
$$;

create or replace function public."PIU_TRAINER_READ"(actor uuid, expected bigint default null, page_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rev bigint; payload text; cat text;
begin
 if actor is null or page_offset<0 then raise exception 'INVALID'; end if;
 insert into public."PIU_TRAINER_ACCOUNTS"(user_id) values(actor) on conflict do nothing;
 select revision into rev from public."PIU_TRAINER_ACCOUNTS" where user_id=actor for share;
 select revision into cat from public."PIU_TRAINER_CATALOG_HEAD" where id;
 if expected is not null and expected<>rev then raise exception 'CONFLICT'; end if;
 if expected is null then return jsonb_build_object('revision',rev,'catalogRevision',cat,'planReady',true,'capabilities',jsonb_build_object('workouts',1,'personalSync',1)); end if;
 payload := public."PIU_TRAINER_STATE"(actor)::text;
 return jsonb_build_object('revision',rev,'chunk',substr(payload,page_offset+1,65536),'next',case when length(payload)>page_offset+65536 then page_offset+65536 else null end);
end; $$;


create or replace function public."PIU_TRAINER_COMMIT"(actor uuid, req uuid, fingerprint text, expected bigint, state jsonb, result jsonb, archive boolean, catalog_rev text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rev bigint; prior jsonb; saved jsonb;
begin
 if actor is null then raise exception 'INVALID'; end if;
 select revision into rev from public."PIU_TRAINER_ACCOUNTS" where user_id=actor for update;
 if not found then raise exception 'INVALID'; end if;
 prior := public."PIU_TRAINER_RECEIPT"(actor,req,fingerprint);
 if prior is not null then return prior; end if;
 if rev<>expected then raise exception 'CONFLICT'; end if;
 if archive then
  insert into public."PIU_TRAINER_ARCHIVES"(user_id,request_id,revision,catalog_revision,payload)
  values(actor,req,rev,catalog_rev,public."PIU_TRAINER_STATE"(actor));
 end if;
 delete from public."PIU_TRAINER_COMPLETIONS" where user_id=actor;
 delete from public."PIU_TRAINER_CORRECTIONS" where user_id=actor;
 delete from public."PIU_TRAINER_REROLLS" where user_id=actor;
 delete from public."PIU_TRAINER_ATTEMPTS" where user_id=actor;
 delete from public."PIU_TRAINER_CHECKINS" where user_id=actor;
 delete from public."PIU_TRAINER_ASSIGNMENTS" where user_id=actor;
 delete from public."PIU_TRAINER_RUNS" where user_id=actor;
 delete from public."PIU_TRAINER_PREFERENCES" where user_id=actor;
 delete from public."PIU_TRAINER_ARCHIVED_CHARTS" where user_id=actor;
 insert into public."PIU_TRAINER_RUNS"(user_id,record) select actor,value from jsonb_array_elements(state->'runs');
 insert into public."PIU_TRAINER_ASSIGNMENTS"(user_id,record) select actor,value from jsonb_array_elements(state->'assignments');
 insert into public."PIU_TRAINER_COMPLETIONS"(user_id,record) select actor,value from jsonb_array_elements(coalesce(state->'completions','[]'::jsonb));
 insert into public."PIU_TRAINER_ATTEMPTS"(user_id,record) select actor,value from jsonb_array_elements(state->'attempts');
 insert into public."PIU_TRAINER_CORRECTIONS"(user_id,record) select actor,value from jsonb_array_elements(state->'corrections');
 insert into public."PIU_TRAINER_CHECKINS"(user_id,record) select actor,value from jsonb_array_elements(state->'checkins');
 insert into public."PIU_TRAINER_REROLLS"(user_id,record) select actor,value from jsonb_array_elements(state->'rerolls');
 insert into public."PIU_TRAINER_PREFERENCES"(user_id,record) select actor,value from jsonb_array_elements(state->'preferences');
 insert into public."PIU_TRAINER_ARCHIVED_CHARTS"(user_id,record) select actor,value from jsonb_array_elements(state->'archivedCharts');
 if exists(select 1 from public."PIU_TRAINER_RUNS" r where r.user_id=actor and
  (select count(*) from public."PIU_TRAINER_ASSIGNMENTS" a where a.user_id=actor and a.run_id=r.id and a.current)
  <> case when r.record->>'status'='skipped' then 0 when r.record->>'kind'='daily' then 16 else coalesce((select sum(jsonb_array_length(s->'slots')) from jsonb_array_elements(r.record->'planSnapshot'->'sets') s),18) end) then raise exception 'INVALID_ASSIGNMENTS'; end if;
 if exists(select 1 from public."PIU_TRAINER_ATTEMPTS" t join public."PIU_TRAINER_ASSIGNMENTS" a on a.user_id=t.user_id and a.id=t.assignment_id where t.user_id=actor and not a.current) then raise exception 'INVALID_ATTEMPT'; end if;

 if exists(select 1 from public."PIU_TRAINER_RUNS" r where r.user_id=actor and r.record->>'kind'='daily'
  and r.record->'workout'->>'profileId' is distinct from (select profile_id from public."PIU_TRAINER_ACCOUNTS" where user_id=actor)) then raise exception 'INVALID_PROFILE'; end if;
 if exists(select 1 from public."PIU_TRAINER_RUNS" r cross join lateral jsonb_array_elements(r.record->'plays') p
  where r.user_id=actor and r.record->>'kind'='daily' and not exists
   (select 1 from public."PIU_TRAINER_ASSIGNMENTS" a cross join lateral jsonb_array_elements(r.record->'workout'->'steps') s
    where a.user_id=actor and a.run_id=r.id and a.id=(p->>'assignmentId')::uuid and a.slot_id=s->>'slotId' and s->>'id'=p->>'stepId')) then raise exception 'INVALID_PLAY'; end if;
 if exists(select 1 from public."PIU_TRAINER_RUNS" r cross join lateral jsonb_array_elements(r.record->'plays') p
  where r.user_id=actor and r.record->>'kind'='daily' group by p->>'id' having count(*)>1) then raise exception 'INVALID_PLAY'; end if;
 if exists(select 1 from public."PIU_TRAINER_ASSIGNMENTS" a join public."PIU_TRAINER_RUNS" r on r.user_id=a.user_id and r.id=a.run_id
  where a.user_id=actor and r.record->>'kind'='daily' and not exists(select 1 from jsonb_array_elements(r.record->'workout'->'slots') s where s->>'id'=a.slot_id)) then raise exception 'INVALID_SLOT'; end if;
 update public."PIU_TRAINER_ACCOUNTS" set settings=state->'settings',revision=rev+1 where user_id=actor;
 saved := jsonb_build_object('revision',rev+1,'value',result);
 insert into public."PIU_TRAINER_RECEIPTS" values(actor,req,fingerprint,saved);
 return saved;
end; $$;



revoke all on function public."PIU_TRAINER_STATE"(uuid),public."PIU_TRAINER_READ"(uuid,bigint,integer),public."PIU_TRAINER_COMMIT"(uuid,uuid,text,bigint,jsonb,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public."PIU_TRAINER_STATE"(uuid),public."PIU_TRAINER_READ"(uuid,bigint,integer),public."PIU_TRAINER_COMMIT"(uuid,uuid,text,bigint,jsonb,jsonb,boolean,text) to service_role;
