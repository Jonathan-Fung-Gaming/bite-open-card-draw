-- Frozen predecessor PIU schema only, captured before the twenty-chart migration. No migration replay.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
SET check_function_bodies=false;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_BOARD_MEMBERSHIP"(profile text, since timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end; $function$
;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_CACHE"(key text, action text, token uuid DEFAULT NULL::uuid, value jsonb DEFAULT NULL::jsonb, force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item public."PIU_TRAINER_LEADERBOARD_CACHE";
begin
 if action='get' then
  select * into item from public."PIU_TRAINER_LEADERBOARD_CACHE" where cache_key=key;
  if not found then return null; end if;
  return jsonb_build_object('payload',item.payload,'fetchedAtUtc',item.fetched_at,'attemptedAtUtc',item.attempted_at);
 end if;
 if action='lease' then
  insert into public."PIU_TRAINER_LEADERBOARD_CACHE"(cache_key) values(key) on conflict do nothing;
  update public."PIU_TRAINER_LEADERBOARD_CACHE" set lease_id=token,lease_until=now()+interval '90 seconds',attempted_at=now()
   where cache_key=key and token is not null and (lease_until is null or lease_until<now())
    and (attempted_at is null or attempted_at<now()-interval '2 minutes')
    and (force or fetched_at is null or fetched_at<now()-interval '24 hours');
  return to_jsonb(found);
 end if;
 if action='put' then
  if value is null or octet_length(value::text)>4194304 then raise exception 'INVALID_CACHE'; end if;
  update public."PIU_TRAINER_LEADERBOARD_CACHE" set payload=value,fetched_at=now(),lease_id=null,lease_until=null
   where cache_key=key and lease_id=token and lease_until>now();
  if not found then return 'false'::jsonb; end if;
  delete from public."PIU_TRAINER_LEADERBOARD_CACHE" where cache_key in
   (select cache_key from public."PIU_TRAINER_LEADERBOARD_CACHE" where left(cache_key,6)='board:' and (lease_until is null or lease_until<now()) order by fetched_at desc nulls last offset 128);
  return 'true'::jsonb;
 end if;
 if action='fail' then
  update public."PIU_TRAINER_LEADERBOARD_CACHE" set lease_id=null,lease_until=null where cache_key=key and lease_id=token;
  return to_jsonb(found);
 end if;
 raise exception 'INVALID_CACHE';
end; $function$
;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_CATALOG"(rev text DEFAULT NULL::text, page_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload text; selected text;
begin
 if page_offset<0 then raise exception 'INVALID'; end if;
 selected := coalesce(rev,(select revision from public."PIU_TRAINER_CATALOG_HEAD" where id));
 select c.payload into payload from public."PIU_TRAINER_CATALOGS" c where c.revision=selected;
 if payload is null then return null; end if;
 return jsonb_build_object('revision',selected,'chunk',substr(payload,page_offset+1,65536),'next',case when length(payload)>page_offset+65536 then page_offset+65536 else null end);
end; $function$
;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_CATALOG_LEASE"(token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 update public."PIU_TRAINER_CATALOG_HEAD" set lease_id=token,lease_until=now()+interval '60 seconds'
 where id and (lease_until is null or lease_until<now()) and not exists(select 1 from public."PIU_TRAINER_CATALOGS" c where c.revision="PIU_TRAINER_CATALOG_HEAD".revision and c.created_at>now()-interval '5 minutes');
 return found;
end; $function$
;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_CATALOG_PUT"(rev text, payload text, lease uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform 1 from public."PIU_TRAINER_CATALOG_HEAD" where id for update;
 if lease is null and (select revision is not null from public."PIU_TRAINER_CATALOG_HEAD" where id) then return false; end if;
 if lease is not null and not exists(select 1 from public."PIU_TRAINER_CATALOG_HEAD" where id and lease_id=lease and lease_until>now()) then return false; end if;
 insert into public."PIU_TRAINER_CATALOGS"(revision,payload) values(rev,payload) on conflict do nothing;
 update public."PIU_TRAINER_CATALOG_HEAD" set revision=rev,lease_until=null,lease_id=null where id;
 return true;
end; $function$
;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_COMMIT"(actor uuid, req uuid, fingerprint text, expected bigint, state jsonb, result jsonb, archive boolean, catalog_rev text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end; $function$
;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_DAILY_VALID"(record jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
end; $function$
;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_ENROLL"(actor uuid, manifest jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare account public."PIU_TRAINER_ACCOUNTS";
begin
 select * into account from public."PIU_TRAINER_ACCOUNTS" where user_id=actor for update;
 if not found or account.profile_id is null or manifest->>'profileId' is distinct from account.profile_id or jsonb_typeof(manifest->'sessions') is distinct from 'array' then raise exception 'INVALID_PROFILE'; end if;
 if account.training_plan is null then update public."PIU_TRAINER_ACCOUNTS" set training_plan=manifest,revision=revision+1 where user_id=actor; end if;
end; $function$
;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_IMPORT"(actor uuid, import_id uuid, action text, expected bigint DEFAULT 0, size integer DEFAULT 0, digest text DEFAULT ''::text, part integer DEFAULT 0, payload text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item public."PIU_TRAINER_IMPORTS"; prior text; total bigint;
begin
 delete from public."PIU_TRAINER_IMPORTS" where expires_at<now();
 if action='create' then
  insert into public."PIU_TRAINER_IMPORTS"(user_id,id,expected_revision,total_bytes,digest) values(actor,import_id,expected,size,digest) on conflict do nothing;
 end if;
 select * into item from public."PIU_TRAINER_IMPORTS" i where i.user_id=actor and i.id=import_id for update;
 if not found then raise exception 'IMPORT_EXPIRED'; end if;
 if action='create' and (item.expected_revision<>expected or item.total_bytes<>size or item.digest<>digest) then raise exception 'REQUEST_REUSED'; end if;
 if action='put' then
  select c.payload into prior from public."PIU_TRAINER_IMPORT_CHUNKS" c where c.user_id=actor and c.import_id=item.id and c.part="PIU_TRAINER_IMPORT".part;
  if prior is not null and prior<>payload then raise exception 'REQUEST_REUSED'; end if;
  insert into public."PIU_TRAINER_IMPORT_CHUNKS" values(actor,import_id,part,payload) on conflict do nothing;
  select sum(octet_length(c.payload)) into total from public."PIU_TRAINER_IMPORT_CHUNKS" c where c.user_id=actor and c.import_id=item.id;
  if total>item.total_bytes then raise exception 'IMPORT_TOO_LARGE'; end if;
 end if;
 if action='get' then
  return jsonb_build_object('payload',(select c.payload from public."PIU_TRAINER_IMPORT_CHUNKS" c where c.user_id=actor and c.import_id=item.id and c.part="PIU_TRAINER_IMPORT".part),'size',item.total_bytes,'digest',item.digest,'expectedRevision',item.expected_revision);
 end if;
 return jsonb_build_object('id',item.id);
end; $function$
;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_LIMIT"(key text, maximum integer, seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare used integer;
begin
 delete from public."PIU_TRAINER_RATE_LIMITS" where window_start<now()-interval '1 day';
 insert into public."PIU_TRAINER_RATE_LIMITS" as r(bucket,window_start,count) values(key,now(),1)
 on conflict(bucket) do update set count=case when r.window_start<now()-make_interval(secs=>seconds) then 1 else r.count+1 end,
 window_start=case when r.window_start<now()-make_interval(secs=>seconds) then now() else r.window_start end returning count into used;
 return used<=maximum;
end; $function$
;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_PERSONAL"(profile text, action text, token uuid DEFAULT NULL::uuid, value jsonb DEFAULT NULL::jsonb, force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end; $function$
;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_PROFILE"(profile text, local_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare value public."PIU_TRAINER_PROFILES";
begin
 if profile not in ('hds','jonathan') or local_day is null then raise exception 'INVALID_PROFILE'; end if;
 update public."PIU_TRAINER_PROFILES" set enrolled_on=coalesce(enrolled_on,local_day) where id=profile returning * into value;
 if not found then raise exception 'INVALID_PROFILE'; end if;
 return jsonb_build_object('accountId',value.account_id,'profileId',value.id,'enrolledOn',value.enrolled_on);
end; $function$
;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_READ"(actor uuid, expected bigint DEFAULT NULL::bigint, page_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end; $function$
;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_RECEIPT"(actor uuid, req uuid, fingerprint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare receipt public."PIU_TRAINER_RECEIPTS";
begin
 select * into receipt from public."PIU_TRAINER_RECEIPTS" where user_id=actor and request_id=req;
 if not found then return null; end if;
 if receipt.fingerprint<>fingerprint then raise exception 'REQUEST_REUSED'; end if;
 return receipt.result;
end; $function$
;
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_STATE"(actor uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: PIU_TRAINER_ACCOUNTS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_ACCOUNTS" (
    user_id uuid NOT NULL,
    revision bigint DEFAULT 0 NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    profile_id text,
    training_plan jsonb,
    CONSTRAINT "PIU_TRAINER_ACCOUNTS_profile_id_check" CHECK ((profile_id = ANY (ARRAY['hds'::text, 'jonathan'::text]))),
    CONSTRAINT "PIU_TRAINER_ACCOUNTS_revision_check" CHECK ((revision >= 0))
);


--
-- Name: PIU_TRAINER_ARCHIVED_CHARTS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_ARCHIVED_CHARTS" (
    user_id uuid NOT NULL,
    record jsonb NOT NULL,
    chart_id text GENERATED ALWAYS AS ((record ->> 'chartId'::text)) STORED NOT NULL,
    mix text GENERATED ALWAYS AS ((record ->> 'mix'::text)) STORED NOT NULL
);


--
-- Name: PIU_TRAINER_ARCHIVES; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_ARCHIVES" (
    user_id uuid NOT NULL,
    request_id uuid NOT NULL,
    revision bigint NOT NULL,
    catalog_revision text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: PIU_TRAINER_ASSIGNMENTS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_ASSIGNMENTS" (
    user_id uuid NOT NULL,
    record jsonb NOT NULL,
    id uuid GENERATED ALWAYS AS (((record ->> 'id'::text))::uuid) STORED NOT NULL,
    run_id uuid GENERATED ALWAYS AS (((record ->> 'sessionRunId'::text))::uuid) STORED,
    slot_id text GENERATED ALWAYS AS ((record ->> 'planSlotId'::text)) STORED,
    current boolean GENERATED ALWAYS AS (((record ->> 'isCurrent'::text))::boolean) STORED,
    CONSTRAINT "PIU_TRAINER_ASSIGNMENTS_record_check" CHECK ((jsonb_typeof(record) = 'object'::text))
);


--
-- Name: PIU_TRAINER_ATTEMPTS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_ATTEMPTS" (
    user_id uuid NOT NULL,
    record jsonb NOT NULL,
    id uuid GENERATED ALWAYS AS (((record ->> 'id'::text))::uuid) STORED NOT NULL,
    assignment_id uuid GENERATED ALWAYS AS (((record ->> 'assignmentId'::text))::uuid) STORED,
    CONSTRAINT "PIU_TRAINER_ATTEMPTS_record_check" CHECK ((jsonb_typeof(record) = 'object'::text)),
    CONSTRAINT "PIU_TRAINER_ATTEMPTS_record_check1" CHECK (((record ->> 'outcome'::text) = ANY (ARRAY['pass'::text, 'fail'::text, 'stage_break'::text, 'skipped'::text])))
);


--
-- Name: PIU_TRAINER_CATALOGS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_CATALOGS" (
    revision text NOT NULL,
    payload text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: PIU_TRAINER_CATALOG_HEAD; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_CATALOG_HEAD" (
    id boolean DEFAULT true NOT NULL,
    revision text,
    lease_until timestamp with time zone,
    lease_id uuid,
    CONSTRAINT "PIU_TRAINER_CATALOG_HEAD_id_check" CHECK (id)
);


--
-- Name: PIU_TRAINER_CHECKINS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_CHECKINS" (
    user_id uuid NOT NULL,
    record jsonb NOT NULL,
    id uuid GENERATED ALWAYS AS (((record ->> 'id'::text))::uuid) STORED NOT NULL,
    run_id uuid GENERATED ALWAYS AS (((record ->> 'sessionRunId'::text))::uuid) STORED,
    set_number integer GENERATED ALWAYS AS (((record ->> 'setNumber'::text))::integer) STORED,
    CONSTRAINT "PIU_TRAINER_CHECKINS_record_check" CHECK ((jsonb_typeof(record) = 'object'::text)),
    CONSTRAINT "PIU_TRAINER_CHECKINS_set_number_check" CHECK (((set_number >= 1) AND (set_number <= 6)))
);


--
-- Name: PIU_TRAINER_COMPLETIONS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_COMPLETIONS" (
    user_id uuid NOT NULL,
    record jsonb NOT NULL,
    id uuid GENERATED ALWAYS AS (((record ->> 'id'::text))::uuid) STORED NOT NULL,
    assignment_id uuid GENERATED ALWAYS AS (((record ->> 'assignmentId'::text))::uuid) STORED NOT NULL,
    sequence integer GENERATED ALWAYS AS (((record ->> 'sequence'::text))::integer) STORED NOT NULL,
    completed boolean GENERATED ALWAYS AS (((record ->> 'completed'::text))::boolean) STORED NOT NULL,
    CONSTRAINT "PIU_TRAINER_COMPLETIONS_record_check" CHECK ((jsonb_typeof(record) = 'object'::text)),
    CONSTRAINT "PIU_TRAINER_COMPLETIONS_sequence_check" CHECK ((sequence > 0))
);


--
-- Name: PIU_TRAINER_CORRECTIONS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_CORRECTIONS" (
    user_id uuid NOT NULL,
    record jsonb NOT NULL,
    id uuid GENERATED ALWAYS AS (((record ->> 'id'::text))::uuid) STORED NOT NULL,
    attempt_id uuid GENERATED ALWAYS AS (((record ->> 'attemptId'::text))::uuid) STORED,
    CONSTRAINT "PIU_TRAINER_CORRECTIONS_record_check" CHECK ((jsonb_typeof(record) = 'object'::text))
);


--
-- Name: PIU_TRAINER_IMPORTS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_IMPORTS" (
    user_id uuid NOT NULL,
    id uuid NOT NULL,
    expected_revision bigint NOT NULL,
    total_bytes integer NOT NULL,
    digest text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    CONSTRAINT "PIU_TRAINER_IMPORTS_total_bytes_check" CHECK (((total_bytes >= 1) AND (total_bytes <= 25000000)))
);


--
-- Name: PIU_TRAINER_IMPORT_CHUNKS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_IMPORT_CHUNKS" (
    user_id uuid NOT NULL,
    import_id uuid NOT NULL,
    part integer NOT NULL,
    payload text NOT NULL,
    CONSTRAINT "PIU_TRAINER_IMPORT_CHUNKS_part_check" CHECK (((part >= 0) AND (part <= 499))),
    CONSTRAINT "PIU_TRAINER_IMPORT_CHUNKS_payload_check" CHECK ((octet_length(payload) <= 524288))
);


--
-- Name: PIU_TRAINER_LEADERBOARD_CACHE; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_LEADERBOARD_CACHE" (
    cache_key text NOT NULL,
    payload jsonb,
    fetched_at timestamp with time zone,
    attempted_at timestamp with time zone,
    lease_id uuid,
    lease_until timestamp with time zone,
    CONSTRAINT "PIU_TRAINER_LEADERBOARD_CACHE_cache_key_check" CHECK (((cache_key = ANY (ARRAY['player:hds'::text, 'player:jonathan'::text])) OR (cache_key ~ '^board:[0-9a-f-]{36}$'::text)))
);


--
-- Name: PIU_TRAINER_OFFICIAL_MEMBERSHIP; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_OFFICIAL_MEMBERSHIP" (
    profile_id text NOT NULL,
    chart_id uuid NOT NULL,
    as_of timestamp with time zone NOT NULL,
    goal boolean NOT NULL,
    top300 boolean NOT NULL,
    played boolean NOT NULL
);


--
-- Name: PIU_TRAINER_PERSONAL_ACCOUNTS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_PERSONAL_ACCOUNTS" (
    profile_id text NOT NULL,
    external_user_id uuid NOT NULL,
    mapping_version text NOT NULL,
    available boolean DEFAULT true NOT NULL,
    revision bigint DEFAULT 0 NOT NULL,
    snapshot jsonb,
    staging jsonb,
    verified_at timestamp with time zone DEFAULT now() NOT NULL,
    attempted_at timestamp with time zone,
    retry_after timestamp with time zone,
    lease_id uuid,
    lease_until timestamp with time zone,
    CONSTRAINT "PIU_TRAINER_PERSONAL_ACCOUNTS_mapping_version_check" CHECK ((length(mapping_version) = 64)),
    CONSTRAINT "PIU_TRAINER_PERSONAL_ACCOUNTS_revision_check" CHECK ((revision >= 0)),
    CONSTRAINT "PIU_TRAINER_PERSONAL_ACCOUNTS_snapshot_check" CHECK (((snapshot IS NULL) OR ((jsonb_typeof(snapshot) = 'object'::text) AND (octet_length((snapshot)::text) <= 4194304)))),
    CONSTRAINT "PIU_TRAINER_PERSONAL_ACCOUNTS_staging_check" CHECK (((staging IS NULL) OR ((jsonb_typeof(staging) = 'object'::text) AND (octet_length((staging)::text) <= 4194304))))
);


--
-- Name: PIU_TRAINER_PLAN; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_PLAN" (
    id text NOT NULL,
    hash text NOT NULL,
    record jsonb NOT NULL
);


--
-- Name: PIU_TRAINER_PREFERENCES; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_PREFERENCES" (
    user_id uuid NOT NULL,
    record jsonb NOT NULL,
    chart_id text GENERATED ALWAYS AS ((record ->> 'chartId'::text)) STORED NOT NULL,
    mix text GENERATED ALWAYS AS ((record ->> 'mix'::text)) STORED NOT NULL,
    mode text GENERATED ALWAYS AS ((record ->> 'targetMode'::text)) STORED,
    status text GENERATED ALWAYS AS ((record ->> 'targetStatus'::text)) STORED
);


--
-- Name: PIU_TRAINER_PROFILES; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_PROFILES" (
    id text NOT NULL,
    account_id uuid NOT NULL,
    enrolled_on date,
    CONSTRAINT "PIU_TRAINER_PROFILES_id_check" CHECK ((id = ANY (ARRAY['hds'::text, 'jonathan'::text])))
);


--
-- Name: PIU_TRAINER_RATE_LIMITS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_RATE_LIMITS" (
    bucket text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    count integer NOT NULL
);


--
-- Name: PIU_TRAINER_RECEIPTS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_RECEIPTS" (
    user_id uuid NOT NULL,
    request_id uuid NOT NULL,
    fingerprint text NOT NULL,
    result jsonb NOT NULL
);


--
-- Name: PIU_TRAINER_REROLLS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_REROLLS" (
    user_id uuid NOT NULL,
    record jsonb NOT NULL,
    id uuid GENERATED ALWAYS AS (((record ->> 'id'::text))::uuid) STORED NOT NULL,
    run_id uuid GENERATED ALWAYS AS (((record ->> 'sessionRunId'::text))::uuid) STORED,
    old_id uuid GENERATED ALWAYS AS (((record ->> 'oldAssignmentId'::text))::uuid) STORED,
    new_id uuid GENERATED ALWAYS AS (((record ->> 'newAssignmentId'::text))::uuid) STORED,
    CONSTRAINT "PIU_TRAINER_REROLLS_record_check" CHECK ((jsonb_typeof(record) = 'object'::text))
);


--
-- Name: PIU_TRAINER_RUNS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PIU_TRAINER_RUNS" (
    user_id uuid NOT NULL,
    record jsonb NOT NULL,
    id uuid GENERATED ALWAYS AS (((record ->> 'id'::text))::uuid) STORED NOT NULL,
    plan_id text GENERATED ALWAYS AS ((record ->> 'planSessionId'::text)) STORED,
    CONSTRAINT "PIU_TRAINER_RUNS_record_check" CHECK ((jsonb_typeof(record) = 'object'::text)),
    CONSTRAINT "PIU_TRAINER_RUNS_record_check1" CHECK (((record ->> 'status'::text) = ANY (ARRAY['generated'::text, 'in_progress'::text, 'completed'::text, 'partial'::text, 'skipped'::text]))),
    CONSTRAINT "PIU_TRAINER_RUN_KIND" CHECK (public."PIU_TRAINER_DAILY_VALID"(record))
);


--
-- Name: PIU_TRAINER_ACCOUNTS PIU_TRAINER_ACCOUNTS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_ACCOUNTS"
    ADD CONSTRAINT "PIU_TRAINER_ACCOUNTS_pkey" PRIMARY KEY (user_id);


--
-- Name: PIU_TRAINER_ACCOUNTS PIU_TRAINER_ACCOUNTS_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_ACCOUNTS"
    ADD CONSTRAINT "PIU_TRAINER_ACCOUNTS_profile_id_key" UNIQUE (profile_id);


--
-- Name: PIU_TRAINER_ARCHIVED_CHARTS PIU_TRAINER_ARCHIVED_CHARTS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_ARCHIVED_CHARTS"
    ADD CONSTRAINT "PIU_TRAINER_ARCHIVED_CHARTS_pkey" PRIMARY KEY (user_id, chart_id, mix);


--
-- Name: PIU_TRAINER_ARCHIVES PIU_TRAINER_ARCHIVES_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_ARCHIVES"
    ADD CONSTRAINT "PIU_TRAINER_ARCHIVES_pkey" PRIMARY KEY (user_id, request_id);


--
-- Name: PIU_TRAINER_ASSIGNMENTS PIU_TRAINER_ASSIGNMENTS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_ASSIGNMENTS"
    ADD CONSTRAINT "PIU_TRAINER_ASSIGNMENTS_pkey" PRIMARY KEY (user_id, id);


--
-- Name: PIU_TRAINER_ATTEMPTS PIU_TRAINER_ATTEMPTS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_ATTEMPTS"
    ADD CONSTRAINT "PIU_TRAINER_ATTEMPTS_pkey" PRIMARY KEY (user_id, id);


--
-- Name: PIU_TRAINER_ATTEMPTS PIU_TRAINER_ATTEMPTS_user_id_assignment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_ATTEMPTS"
    ADD CONSTRAINT "PIU_TRAINER_ATTEMPTS_user_id_assignment_id_key" UNIQUE (user_id, assignment_id);


--
-- Name: PIU_TRAINER_CATALOGS PIU_TRAINER_CATALOGS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_CATALOGS"
    ADD CONSTRAINT "PIU_TRAINER_CATALOGS_pkey" PRIMARY KEY (revision);


--
-- Name: PIU_TRAINER_CATALOG_HEAD PIU_TRAINER_CATALOG_HEAD_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_CATALOG_HEAD"
    ADD CONSTRAINT "PIU_TRAINER_CATALOG_HEAD_pkey" PRIMARY KEY (id);


--
-- Name: PIU_TRAINER_CHECKINS PIU_TRAINER_CHECKINS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_CHECKINS"
    ADD CONSTRAINT "PIU_TRAINER_CHECKINS_pkey" PRIMARY KEY (user_id, id);


--
-- Name: PIU_TRAINER_CHECKINS PIU_TRAINER_CHECKINS_user_id_run_id_set_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_CHECKINS"
    ADD CONSTRAINT "PIU_TRAINER_CHECKINS_user_id_run_id_set_number_key" UNIQUE (user_id, run_id, set_number);


--
-- Name: PIU_TRAINER_COMPLETIONS PIU_TRAINER_COMPLETIONS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_COMPLETIONS"
    ADD CONSTRAINT "PIU_TRAINER_COMPLETIONS_pkey" PRIMARY KEY (user_id, id);


--
-- Name: PIU_TRAINER_COMPLETIONS PIU_TRAINER_COMPLETIONS_user_id_assignment_id_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_COMPLETIONS"
    ADD CONSTRAINT "PIU_TRAINER_COMPLETIONS_user_id_assignment_id_sequence_key" UNIQUE (user_id, assignment_id, sequence);


--
-- Name: PIU_TRAINER_CORRECTIONS PIU_TRAINER_CORRECTIONS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_CORRECTIONS"
    ADD CONSTRAINT "PIU_TRAINER_CORRECTIONS_pkey" PRIMARY KEY (user_id, id);


--
-- Name: PIU_TRAINER_IMPORTS PIU_TRAINER_IMPORTS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_IMPORTS"
    ADD CONSTRAINT "PIU_TRAINER_IMPORTS_pkey" PRIMARY KEY (user_id, id);


--
-- Name: PIU_TRAINER_IMPORT_CHUNKS PIU_TRAINER_IMPORT_CHUNKS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_IMPORT_CHUNKS"
    ADD CONSTRAINT "PIU_TRAINER_IMPORT_CHUNKS_pkey" PRIMARY KEY (user_id, import_id, part);


--
-- Name: PIU_TRAINER_LEADERBOARD_CACHE PIU_TRAINER_LEADERBOARD_CACHE_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_LEADERBOARD_CACHE"
    ADD CONSTRAINT "PIU_TRAINER_LEADERBOARD_CACHE_pkey" PRIMARY KEY (cache_key);


--
-- Name: PIU_TRAINER_OFFICIAL_MEMBERSHIP PIU_TRAINER_OFFICIAL_MEMBERSHIP_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_OFFICIAL_MEMBERSHIP"
    ADD CONSTRAINT "PIU_TRAINER_OFFICIAL_MEMBERSHIP_pkey" PRIMARY KEY (profile_id, chart_id);


--
-- Name: PIU_TRAINER_PERSONAL_ACCOUNTS PIU_TRAINER_PERSONAL_ACCOUNTS_external_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_PERSONAL_ACCOUNTS"
    ADD CONSTRAINT "PIU_TRAINER_PERSONAL_ACCOUNTS_external_user_id_key" UNIQUE (external_user_id);


--
-- Name: PIU_TRAINER_PERSONAL_ACCOUNTS PIU_TRAINER_PERSONAL_ACCOUNTS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_PERSONAL_ACCOUNTS"
    ADD CONSTRAINT "PIU_TRAINER_PERSONAL_ACCOUNTS_pkey" PRIMARY KEY (profile_id);


--
-- Name: PIU_TRAINER_PLAN PIU_TRAINER_PLAN_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_PLAN"
    ADD CONSTRAINT "PIU_TRAINER_PLAN_pkey" PRIMARY KEY (id);


--
-- Name: PIU_TRAINER_PREFERENCES PIU_TRAINER_PREFERENCES_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_PREFERENCES"
    ADD CONSTRAINT "PIU_TRAINER_PREFERENCES_pkey" PRIMARY KEY (user_id, chart_id, mix);


--
-- Name: PIU_TRAINER_PROFILES PIU_TRAINER_PROFILES_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_PROFILES"
    ADD CONSTRAINT "PIU_TRAINER_PROFILES_account_id_key" UNIQUE (account_id);


--
-- Name: PIU_TRAINER_PROFILES PIU_TRAINER_PROFILES_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_PROFILES"
    ADD CONSTRAINT "PIU_TRAINER_PROFILES_pkey" PRIMARY KEY (id);


--
-- Name: PIU_TRAINER_RATE_LIMITS PIU_TRAINER_RATE_LIMITS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_RATE_LIMITS"
    ADD CONSTRAINT "PIU_TRAINER_RATE_LIMITS_pkey" PRIMARY KEY (bucket);


--
-- Name: PIU_TRAINER_RECEIPTS PIU_TRAINER_RECEIPTS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_RECEIPTS"
    ADD CONSTRAINT "PIU_TRAINER_RECEIPTS_pkey" PRIMARY KEY (user_id, request_id);


--
-- Name: PIU_TRAINER_REROLLS PIU_TRAINER_REROLLS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_REROLLS"
    ADD CONSTRAINT "PIU_TRAINER_REROLLS_pkey" PRIMARY KEY (user_id, id);


--
-- Name: PIU_TRAINER_RUNS PIU_TRAINER_RUNS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_RUNS"
    ADD CONSTRAINT "PIU_TRAINER_RUNS_pkey" PRIMARY KEY (user_id, id);


--
-- Name: PIU_TRAINER_RUNS PIU_TRAINER_RUNS_user_id_plan_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_RUNS"
    ADD CONSTRAINT "PIU_TRAINER_RUNS_user_id_plan_id_key" UNIQUE (user_id, plan_id);


--
-- Name: PIU_TRAINER_CURRENT_SLOT; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PIU_TRAINER_CURRENT_SLOT" ON public."PIU_TRAINER_ASSIGNMENTS" USING btree (user_id, run_id, slot_id) WHERE current;


--
-- Name: PIU_TRAINER_TARGET; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PIU_TRAINER_TARGET" ON public."PIU_TRAINER_PREFERENCES" USING btree (user_id, mode, status) WHERE ((mode IS NOT NULL) AND (status = ANY (ARRAY['primary'::text, 'backup'::text])));


--
-- Name: PIU_TRAINER_ARCHIVED_CHARTS PIU_TRAINER_ARCHIVED_CHARTS_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_ARCHIVED_CHARTS"
    ADD CONSTRAINT "PIU_TRAINER_ARCHIVED_CHARTS_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."PIU_TRAINER_ACCOUNTS"(user_id);


--
-- Name: PIU_TRAINER_ARCHIVES PIU_TRAINER_ARCHIVES_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_ARCHIVES"
    ADD CONSTRAINT "PIU_TRAINER_ARCHIVES_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."PIU_TRAINER_ACCOUNTS"(user_id);


--
-- Name: PIU_TRAINER_ASSIGNMENTS PIU_TRAINER_ASSIGNMENTS_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_ASSIGNMENTS"
    ADD CONSTRAINT "PIU_TRAINER_ASSIGNMENTS_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."PIU_TRAINER_ACCOUNTS"(user_id);


--
-- Name: PIU_TRAINER_ASSIGNMENTS PIU_TRAINER_ASSIGNMENTS_user_id_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_ASSIGNMENTS"
    ADD CONSTRAINT "PIU_TRAINER_ASSIGNMENTS_user_id_run_id_fkey" FOREIGN KEY (user_id, run_id) REFERENCES public."PIU_TRAINER_RUNS"(user_id, id);


--
-- Name: PIU_TRAINER_ATTEMPTS PIU_TRAINER_ATTEMPTS_user_id_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_ATTEMPTS"
    ADD CONSTRAINT "PIU_TRAINER_ATTEMPTS_user_id_assignment_id_fkey" FOREIGN KEY (user_id, assignment_id) REFERENCES public."PIU_TRAINER_ASSIGNMENTS"(user_id, id);


--
-- Name: PIU_TRAINER_ATTEMPTS PIU_TRAINER_ATTEMPTS_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_ATTEMPTS"
    ADD CONSTRAINT "PIU_TRAINER_ATTEMPTS_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."PIU_TRAINER_ACCOUNTS"(user_id);


--
-- Name: PIU_TRAINER_CATALOG_HEAD PIU_TRAINER_CATALOG_HEAD_revision_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_CATALOG_HEAD"
    ADD CONSTRAINT "PIU_TRAINER_CATALOG_HEAD_revision_fkey" FOREIGN KEY (revision) REFERENCES public."PIU_TRAINER_CATALOGS"(revision);


--
-- Name: PIU_TRAINER_CHECKINS PIU_TRAINER_CHECKINS_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_CHECKINS"
    ADD CONSTRAINT "PIU_TRAINER_CHECKINS_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."PIU_TRAINER_ACCOUNTS"(user_id);


--
-- Name: PIU_TRAINER_CHECKINS PIU_TRAINER_CHECKINS_user_id_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_CHECKINS"
    ADD CONSTRAINT "PIU_TRAINER_CHECKINS_user_id_run_id_fkey" FOREIGN KEY (user_id, run_id) REFERENCES public."PIU_TRAINER_RUNS"(user_id, id);


--
-- Name: PIU_TRAINER_COMPLETIONS PIU_TRAINER_COMPLETIONS_user_id_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_COMPLETIONS"
    ADD CONSTRAINT "PIU_TRAINER_COMPLETIONS_user_id_assignment_id_fkey" FOREIGN KEY (user_id, assignment_id) REFERENCES public."PIU_TRAINER_ASSIGNMENTS"(user_id, id);


--
-- Name: PIU_TRAINER_COMPLETIONS PIU_TRAINER_COMPLETIONS_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_COMPLETIONS"
    ADD CONSTRAINT "PIU_TRAINER_COMPLETIONS_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."PIU_TRAINER_ACCOUNTS"(user_id);


--
-- Name: PIU_TRAINER_CORRECTIONS PIU_TRAINER_CORRECTIONS_user_id_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_CORRECTIONS"
    ADD CONSTRAINT "PIU_TRAINER_CORRECTIONS_user_id_attempt_id_fkey" FOREIGN KEY (user_id, attempt_id) REFERENCES public."PIU_TRAINER_ATTEMPTS"(user_id, id);


--
-- Name: PIU_TRAINER_CORRECTIONS PIU_TRAINER_CORRECTIONS_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_CORRECTIONS"
    ADD CONSTRAINT "PIU_TRAINER_CORRECTIONS_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."PIU_TRAINER_ACCOUNTS"(user_id);


--
-- Name: PIU_TRAINER_IMPORTS PIU_TRAINER_IMPORTS_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_IMPORTS"
    ADD CONSTRAINT "PIU_TRAINER_IMPORTS_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."PIU_TRAINER_ACCOUNTS"(user_id);


--
-- Name: PIU_TRAINER_IMPORT_CHUNKS PIU_TRAINER_IMPORT_CHUNKS_user_id_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_IMPORT_CHUNKS"
    ADD CONSTRAINT "PIU_TRAINER_IMPORT_CHUNKS_user_id_import_id_fkey" FOREIGN KEY (user_id, import_id) REFERENCES public."PIU_TRAINER_IMPORTS"(user_id, id) ON DELETE CASCADE;


--
-- Name: PIU_TRAINER_OFFICIAL_MEMBERSHIP PIU_TRAINER_OFFICIAL_MEMBERSHIP_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_OFFICIAL_MEMBERSHIP"
    ADD CONSTRAINT "PIU_TRAINER_OFFICIAL_MEMBERSHIP_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public."PIU_TRAINER_PROFILES"(id);


--
-- Name: PIU_TRAINER_PERSONAL_ACCOUNTS PIU_TRAINER_PERSONAL_ACCOUNTS_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_PERSONAL_ACCOUNTS"
    ADD CONSTRAINT "PIU_TRAINER_PERSONAL_ACCOUNTS_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public."PIU_TRAINER_PROFILES"(id);


--
-- Name: PIU_TRAINER_PREFERENCES PIU_TRAINER_PREFERENCES_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_PREFERENCES"
    ADD CONSTRAINT "PIU_TRAINER_PREFERENCES_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."PIU_TRAINER_ACCOUNTS"(user_id);


--
-- Name: PIU_TRAINER_PROFILES PIU_TRAINER_PROFILES_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_PROFILES"
    ADD CONSTRAINT "PIU_TRAINER_PROFILES_account_id_fkey" FOREIGN KEY (account_id) REFERENCES public."PIU_TRAINER_ACCOUNTS"(user_id);


--
-- Name: PIU_TRAINER_RECEIPTS PIU_TRAINER_RECEIPTS_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_RECEIPTS"
    ADD CONSTRAINT "PIU_TRAINER_RECEIPTS_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."PIU_TRAINER_ACCOUNTS"(user_id);


--
-- Name: PIU_TRAINER_REROLLS PIU_TRAINER_REROLLS_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_REROLLS"
    ADD CONSTRAINT "PIU_TRAINER_REROLLS_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."PIU_TRAINER_ACCOUNTS"(user_id);


--
-- Name: PIU_TRAINER_REROLLS PIU_TRAINER_REROLLS_user_id_new_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_REROLLS"
    ADD CONSTRAINT "PIU_TRAINER_REROLLS_user_id_new_id_fkey" FOREIGN KEY (user_id, new_id) REFERENCES public."PIU_TRAINER_ASSIGNMENTS"(user_id, id);


--
-- Name: PIU_TRAINER_REROLLS PIU_TRAINER_REROLLS_user_id_old_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_REROLLS"
    ADD CONSTRAINT "PIU_TRAINER_REROLLS_user_id_old_id_fkey" FOREIGN KEY (user_id, old_id) REFERENCES public."PIU_TRAINER_ASSIGNMENTS"(user_id, id);


--
-- Name: PIU_TRAINER_REROLLS PIU_TRAINER_REROLLS_user_id_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_REROLLS"
    ADD CONSTRAINT "PIU_TRAINER_REROLLS_user_id_run_id_fkey" FOREIGN KEY (user_id, run_id) REFERENCES public."PIU_TRAINER_RUNS"(user_id, id);


--
-- Name: PIU_TRAINER_RUNS PIU_TRAINER_RUNS_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PIU_TRAINER_RUNS"
    ADD CONSTRAINT "PIU_TRAINER_RUNS_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."PIU_TRAINER_ACCOUNTS"(user_id);


--
-- Name: PIU_TRAINER_ACCOUNTS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_ACCOUNTS" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_ARCHIVED_CHARTS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_ARCHIVED_CHARTS" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_ARCHIVES; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_ARCHIVES" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_ASSIGNMENTS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_ASSIGNMENTS" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_ATTEMPTS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_ATTEMPTS" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_CATALOGS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_CATALOGS" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_CATALOG_HEAD; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_CATALOG_HEAD" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_CHECKINS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_CHECKINS" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_COMPLETIONS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_COMPLETIONS" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_CORRECTIONS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_CORRECTIONS" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_IMPORTS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_IMPORTS" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_IMPORT_CHUNKS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_IMPORT_CHUNKS" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_LEADERBOARD_CACHE; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_LEADERBOARD_CACHE" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_OFFICIAL_MEMBERSHIP; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_OFFICIAL_MEMBERSHIP" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_PERSONAL_ACCOUNTS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_PERSONAL_ACCOUNTS" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_PLAN; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_PLAN" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_PREFERENCES; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_PREFERENCES" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_PROFILES; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_PROFILES" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_RATE_LIMITS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_RATE_LIMITS" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_RECEIPTS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_RECEIPTS" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_REROLLS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_REROLLS" ENABLE ROW LEVEL SECURITY;

--
-- Name: PIU_TRAINER_RUNS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PIU_TRAINER_RUNS" ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE "PIU_TRAINER_ACCOUNTS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_ACCOUNTS" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_ARCHIVED_CHARTS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_ARCHIVED_CHARTS" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_ARCHIVES"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_ARCHIVES" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_ASSIGNMENTS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_ASSIGNMENTS" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_ATTEMPTS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_ATTEMPTS" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_CATALOGS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_CATALOGS" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_CATALOG_HEAD"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_CATALOG_HEAD" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_CHECKINS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_CHECKINS" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_COMPLETIONS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_COMPLETIONS" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_CORRECTIONS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_CORRECTIONS" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_IMPORTS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_IMPORTS" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_IMPORT_CHUNKS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_IMPORT_CHUNKS" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_LEADERBOARD_CACHE"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_LEADERBOARD_CACHE" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_OFFICIAL_MEMBERSHIP"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_OFFICIAL_MEMBERSHIP" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_PERSONAL_ACCOUNTS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_PERSONAL_ACCOUNTS" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_PLAN"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_PLAN" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_PREFERENCES"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_PREFERENCES" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_PROFILES"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_PROFILES" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_RATE_LIMITS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_RATE_LIMITS" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_RECEIPTS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_RECEIPTS" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_REROLLS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_REROLLS" TO service_role;


--
-- Name: TABLE "PIU_TRAINER_RUNS"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."PIU_TRAINER_RUNS" TO service_role;


--
-- PostgreSQL database dump complete
--



DO $$ DECLARE obj record; BEGIN
 FOR obj IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND left(p.proname,12)='PIU_TRAINER_' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public,anon,authenticated',obj.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',obj.signature);
 END LOOP;
END $$;
