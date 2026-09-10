-- Add the explicitly authorized WAFFLE shared journal. Preserve existing profiles and all history.
alter table public."PIU_TRAINER_ACCOUNTS" drop constraint "PIU_TRAINER_ACCOUNTS_profile_id_check";
alter table public."PIU_TRAINER_ACCOUNTS" add constraint "PIU_TRAINER_ACCOUNTS_profile_id_check" check(profile_id in ('hds','jonathan','waffle'));
alter table public."PIU_TRAINER_PROFILES" drop constraint "PIU_TRAINER_PROFILES_id_check";
alter table public."PIU_TRAINER_PROFILES" add constraint "PIU_TRAINER_PROFILES_id_check" check(id in ('hds','jonathan','waffle'));
alter table public."PIU_TRAINER_LEADERBOARD_CACHE" drop constraint "PIU_TRAINER_LEADERBOARD_CACHE_cache_key_check";
alter table public."PIU_TRAINER_LEADERBOARD_CACHE" add constraint "PIU_TRAINER_LEADERBOARD_CACHE_cache_key_check"
 check(cache_key in ('player:hds','player:jonathan','player:waffle') or cache_key ~ '^board:[0-9a-f-]{36}$');

with seeded as (
 insert into public."PIU_TRAINER_ACCOUNTS"(user_id,profile_id,settings)
 values(gen_random_uuid(),'waffle','{"workout":{"warmupStart":17,"pushSingle":22,"pushDouble":24,"pushPlays":2,"allowedSongTypes":["Arcade","ShortCut","Remix","FullSong"]}}'::jsonb)
 returning user_id,profile_id
) insert into public."PIU_TRAINER_PROFILES"(id,account_id) select profile_id,user_id from seeded;

-- Replace bodies only: signatures and existing service-only grants remain unchanged.
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_PROFILE"(profile text, local_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare value public."PIU_TRAINER_PROFILES";
begin
 if profile not in ('hds','jonathan','waffle') or local_day is null then raise exception 'INVALID_PROFILE'; end if;
 update public."PIU_TRAINER_PROFILES" set enrolled_on=coalesce(enrolled_on,local_day) where id=profile returning * into value;
 if not found then raise exception 'INVALID_PROFILE'; end if;
 return jsonb_build_object('accountId',value.account_id,'profileId',value.id,'enrolledOn',value.enrolled_on);
end; $function$
;

CREATE OR REPLACE FUNCTION public."PIU_TRAINER_DAILY_VALID"(record jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare w jsonb:=record->'workout'; item jsonb; expanded boolean:=coalesce(w->>'selectionVersion'='2.0.0',false);
begin
 if coalesce(record->>'kind','legacy')='legacy' then
  return record->>'planSessionId' is not null and not (record ? 'workout') and not (record ? 'plays') and not (record ? 'stepStates');
 end if;
 if record->>'kind'<>'daily' or record ? 'planSessionId' or record ? 'planSnapshot' or record ? 'planHash' or record ? 'planId'
  or jsonb_typeof(w) is distinct from 'object' or w->>'version' is distinct from '1' or coalesce(w->>'profileId','') not in ('hds','jonathan','waffle')
  or jsonb_typeof(w->'slots') is distinct from 'array' or jsonb_array_length(w->'slots')<>(case when expanded then 20 else 16 end)
  or jsonb_typeof(w->'steps') is distinct from 'array' or (expanded and jsonb_array_length(w->'steps')<>32) or (not expanded and jsonb_array_length(w->'steps') not between 16 and 24)
  or jsonb_typeof(record->'plays') is distinct from 'array' or jsonb_typeof(record->'stepStates') is distinct from 'array' then return false; end if;
 if (select count(distinct s->>'id') from jsonb_array_elements(w->'slots') s)<>(case when expanded then 20 else 16 end)
  or (select count(distinct s->>'id') from jsonb_array_elements(w->'steps') s)<>jsonb_array_length(w->'steps') then return false; end if;
 if exists(select 1 from (values('warmup','Single'),('warmup','Double'),('push','Single'),('push','Double')) bucket(phase,mode)
  where (select count(*) from jsonb_array_elements(w->'slots') s where s->>'phase'=bucket.phase and s->>'mode'=bucket.mode)<>(case when expanded and bucket.phase='push' then 6 else 4 end)) then return false; end if;
 if expanded then
  if w->>'orderVersion' is distinct from '2.0.0' then return false; end if;
  if exists(select 1 from (values('Single','random'),('Single','improvement'),('Double','random'),('Double','improvement')) bucket(mode,lane)
   where (select count(*) from jsonb_array_elements(w->'slots') s where s->>'phase'='push' and s->>'mode'=bucket.mode and s->>'lane'=bucket.lane)<>3) then return false; end if;
  if exists(select 1 from jsonb_array_elements(w->'slots') s where
   (s->>'phase'='warmup' and s ? 'lane') or
   (s->>'phase'='push' and not coalesce((s->>'minLevel')::integer>=20 and (s->>'targetLevel')::integer between (s->>'minLevel')::integer and (s->>'maxLevel')::integer
    and (s->>'level')::integer between (s->>'minLevel')::integer and (s->>'maxLevel')::integer and (s->>'maxLevel')::integer<=30,false))) then return false; end if;
 end if;
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

CREATE OR REPLACE FUNCTION public."PIU_TRAINER_PERSONAL"(profile text, action text, token uuid DEFAULT NULL::uuid, value jsonb DEFAULT NULL::jsonb, force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item public."PIU_TRAINER_PERSONAL_ACCOUNTS"; denied boolean;
begin
 if profile not in ('hds','jonathan','waffle') or profile is null then raise exception 'INVALID_PROFILE'; end if;
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
 elsif profile='waffle' then player_id:=7548; tag:='WAFFLE#1473'; threshold:=200;
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
