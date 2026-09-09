-- Support versioned 8-warmup / 12-push sessions while retaining historical 16-chart sessions.
-- Function signatures, grants, revision fences, replay receipts and existing records remain intact.

create or replace function public."PIU_TRAINER_DAILY_VALID"(record jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare w jsonb:=record->'workout'; item jsonb; expanded boolean:=coalesce(w->>'selectionVersion'='2.0.0',false);
begin
 if coalesce(record->>'kind','legacy')='legacy' then
  return record->>'planSessionId' is not null and not (record ? 'workout') and not (record ? 'plays') and not (record ? 'stepStates');
 end if;
 if record->>'kind'<>'daily' or record ? 'planSessionId' or record ? 'planSnapshot' or record ? 'planHash' or record ? 'planId'
  or jsonb_typeof(w) is distinct from 'object' or w->>'version' is distinct from '1' or coalesce(w->>'profileId','') not in ('hds','jonathan')
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
  <> case when r.record->>'status'='skipped' then 0 when r.record->>'kind'='daily' then jsonb_array_length(r.record->'workout'->'slots') else coalesce((select sum(jsonb_array_length(s->'slots')) from jsonb_array_elements(r.record->'planSnapshot'->'sets') s),18) end) then raise exception 'INVALID_ASSIGNMENTS'; end if;
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
