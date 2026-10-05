-- Version-3 options are additive; preserve historical snapshots and service-only RPC grants.
CREATE OR REPLACE FUNCTION public."PIU_TRAINER_DAILY_VALID"(record jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare w jsonb:=record->'workout'; item jsonb; expanded boolean:=coalesce(w->>'selectionVersion' in ('2.0.0','3.0.0'),false);
 configurable boolean:=coalesce(w->>'selectionVersion'='3.0.0',false); settings jsonb:=w->'settings'; ranges jsonb;
 modes text; algorithm text; range_key text; minimum integer; maximum integer; floor integer; group_data jsonb;
 bpm_buckets text[]:=array['<150','150-159','160-169','170-179','180-189','190-199','200-209','210-219','220+','Unclassified'];
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
 if configurable then
  modes:=settings->>'modes'; algorithm:=settings->>'algorithm'; ranges:=settings->'ranges';
  if jsonb_typeof(settings) is distinct from 'object' or coalesce(modes,'') not in ('singles','doubles','both')
   or coalesce(algorithm,'') not in ('professional','standard') or w->>'orderVersion' is distinct from '3.0.0'
   or jsonb_typeof(ranges) is distinct from 'object' then return false; end if;
  foreach range_key in array array['warmupSingle','warmupDouble','pushSingle','pushDouble'] loop
   floor:=case when left(range_key,6)='warmup' then 10 else 20 end;
   if jsonb_typeof(ranges->range_key) is distinct from 'object'
    or jsonb_typeof(ranges->range_key->'min') is distinct from 'number' or coalesce(ranges->range_key->>'min','') !~ '^[0-9]+$'
    or jsonb_typeof(ranges->range_key->'max') is distinct from 'number' or coalesce(ranges->range_key->>'max','') !~ '^[0-9]+$' then return false; end if;
   minimum:=(ranges->range_key->>'min')::integer; maximum:=(ranges->range_key->>'max')::integer;
   if minimum<floor or maximum>30 or minimum>maximum then return false; end if;
  end loop;
  if exists(select 1 from (values('warmup','Single'),('warmup','Double'),('push','Single'),('push','Double')) bucket(phase,mode)
   where (select count(*) from jsonb_array_elements(w->'slots') s where s->>'phase'=bucket.phase and s->>'mode'=bucket.mode)
    <>case when modes='singles' and bucket.mode='Double' or modes='doubles' and bucket.mode='Single' then 0
     when bucket.phase='warmup' then case when modes='both' then 4 else 8 end else case when modes='both' then 6 else 12 end end) then return false; end if;
  if exists(select 1 from (values('Single','random'),('Single','improvement'),('Double','random'),('Double','improvement')) bucket(mode,lane)
   where (select count(*) from jsonb_array_elements(w->'slots') s where s->>'phase'='push' and s->>'mode'=bucket.mode and s->>'lane'=bucket.lane)
    <>case when modes='singles' and bucket.mode='Double' or modes='doubles' and bucket.mode='Single' then 0 when modes='both' then 3 else 6 end) then return false; end if;
  for item in select value from jsonb_array_elements(w->'slots') loop
   if coalesce(item->>'phase','') not in ('warmup','push') or coalesce(item->>'mode','') not in ('Single','Double')
    or (item->>'phase'='warmup' and item ? 'lane') then return false; end if;
   range_key:=(item->>'phase')||(item->>'mode');
   minimum:=(ranges->range_key->>'min')::integer; maximum:=(ranges->range_key->>'max')::integer;
   if jsonb_typeof(item->'minLevel') is distinct from 'number' or jsonb_typeof(item->'maxLevel') is distinct from 'number'
    or jsonb_typeof(item->'level') is distinct from 'number' or jsonb_typeof(item->'targetLevel') is distinct from 'number'
    or coalesce(item->>'level','') !~ '^[0-9]+$' or coalesce(item->>'targetLevel','') !~ '^[0-9]+$'
    or (item->>'minLevel')::numeric<>minimum or (item->>'maxLevel')::numeric<>maximum
    or (item->>'level')::integer not between minimum and maximum or (item->>'targetLevel')::integer not between minimum and maximum then return false; end if;
   if algorithm='standard' and item->>'phase'='push' then
    if not coalesce(item->>'bpmBucket'=any(bpm_buckets),false) then return false; end if;
   elsif item ? 'bpmBucket' then return false; end if;
  end loop;
  if algorithm='standard' then
   if jsonb_typeof(w->'standardGeneration') is distinct from 'object' or w->'standardGeneration'->>'version' is distinct from '1'
    or not (w->'standardGeneration' ? 'progressionRevision') or jsonb_typeof(w->'standardGeneration'->'progressionRevision') not in ('string','null')
    or jsonb_typeof(w->'standardGeneration'->'groups') is distinct from 'array'
    or jsonb_array_length(w->'standardGeneration'->'groups')<>(case when modes='both' then 20 else 10 end) then return false; end if;
   for group_data in select value from jsonb_array_elements(w->'standardGeneration'->'groups') loop
    if coalesce(group_data->>'mode','') not in ('Single','Double') or not coalesce(group_data->>'bpmBucket'=any(bpm_buckets),false)
     or (modes='singles' and group_data->>'mode'='Double') or (modes='doubles' and group_data->>'mode'='Single')
     or jsonb_typeof(group_data->'normalizedSkill') is distinct from 'number' and jsonb_typeof(group_data->'normalizedSkill') is distinct from 'null'
     or jsonb_typeof(group_data->'scoreCount') is distinct from 'number' or coalesce(group_data->>'scoreCount','') !~ '^[0-5]$'
     or jsonb_typeof(group_data->'confidence') is distinct from 'number' or (group_data->>'confidence')::numeric<>(group_data->>'scoreCount')::numeric/5
     or jsonb_typeof(group_data->'weakness') is distinct from 'number' or (group_data->>'weakness')::numeric not between 0 and 1 then return false; end if;
   end loop;
   if exists(select 1 from jsonb_array_elements(w->'standardGeneration'->'groups') g group by g->>'mode',g->>'bpmBucket' having count(*)>1) then return false; end if;
   for item in select value from jsonb_array_elements(w->'slots') where value->>'phase'='push' loop
    select value into group_data from jsonb_array_elements(w->'standardGeneration'->'groups') where value->>'mode'=item->>'mode' and value->>'bpmBucket'=item->>'bpmBucket';
    if not found or (item->>'targetLevel')::integer<>(item->>'minLevel')::integer+floor((1-(group_data->>'weakness')::numeric)*((item->>'maxLevel')::integer-(item->>'minLevel')::integer)+0.5)::integer then return false; end if;
   end loop;
  elsif w ? 'standardGeneration' then return false; end if;
 else
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
 if expected is null then return jsonb_build_object('revision',rev,'catalogRevision',cat,'planReady',true,'capabilities',jsonb_build_object('workouts',1,'personalSync',1,'sessionOptions',1)); end if;
 payload := public."PIU_TRAINER_STATE"(actor)::text;
 return jsonb_build_object('revision',rev,'chunk',substr(payload,page_offset+1,65536),'next',case when length(payload)>page_offset+65536 then page_offset+65536 else null end);
end; $function$
;
