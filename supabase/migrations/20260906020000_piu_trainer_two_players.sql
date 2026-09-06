-- Two shared profiles; the consuming app intentionally has no person authentication.
-- Production read-only preflight found zero PIU accounts. Preserve all legacy UUIDs regardless.
alter table public."PIU_TRAINER_ACCOUNTS" drop constraint "PIU_TRAINER_ACCOUNTS_user_id_fkey";
alter table public."PIU_TRAINER_ACCOUNTS" add column profile_id text unique check(profile_id in ('hds','jonathan'));
alter table public."PIU_TRAINER_ACCOUNTS" add column training_plan jsonb;
create table public."PIU_TRAINER_PROFILES" (
 id text primary key check(id in ('hds','jonathan')),
 account_id uuid unique not null references public."PIU_TRAINER_ACCOUNTS"(user_id),
 enrolled_on date
);
with seeded as (
 insert into public."PIU_TRAINER_ACCOUNTS"(user_id,profile_id) values(gen_random_uuid(),'hds'),(gen_random_uuid(),'jonathan') returning user_id,profile_id
) insert into public."PIU_TRAINER_PROFILES"(id,account_id) select profile_id,user_id from seeded;
create table public."PIU_TRAINER_COMPLETIONS" (
 user_id uuid not null references public."PIU_TRAINER_ACCOUNTS"(user_id),
 record jsonb not null check(jsonb_typeof(record)='object'),
 id uuid generated always as ((record->>'id')::uuid) stored not null,
 assignment_id uuid generated always as ((record->>'assignmentId')::uuid) stored not null,
 sequence integer generated always as ((record->>'sequence')::integer) stored not null check(sequence>0),
 completed boolean generated always as ((record->>'completed')::boolean) stored not null,
 primary key(user_id,id), unique(user_id,assignment_id,sequence),
 foreign key(user_id,assignment_id) references public."PIU_TRAINER_ASSIGNMENTS"(user_id,id)
);
create table public."PIU_TRAINER_LEADERBOARD_CACHE" (
 cache_key text primary key check(cache_key in ('player:hds','player:jonathan') or cache_key ~ '^board:[0-9a-f-]{36}$'),
 payload jsonb, fetched_at timestamptz, attempted_at timestamptz,
 lease_id uuid, lease_until timestamptz
);
create function public."PIU_TRAINER_PROFILE"(profile text,local_day date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare value public."PIU_TRAINER_PROFILES";
begin
 if profile not in ('hds','jonathan') or local_day is null then raise exception 'INVALID_PROFILE'; end if;
 update public."PIU_TRAINER_PROFILES" set enrolled_on=coalesce(enrolled_on,local_day) where id=profile returning * into value;
 if not found then raise exception 'INVALID_PROFILE'; end if;
 return jsonb_build_object('accountId',value.account_id,'profileId',value.id,'enrolledOn',value.enrolled_on);
end; $$;
create function public."PIU_TRAINER_ENROLL"(actor uuid,manifest jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare account public."PIU_TRAINER_ACCOUNTS";
begin
 select * into account from public."PIU_TRAINER_ACCOUNTS" where user_id=actor for update;
 if not found or account.profile_id is null or manifest->>'profileId' is distinct from account.profile_id or jsonb_typeof(manifest->'sessions') is distinct from 'array' then raise exception 'INVALID_PROFILE'; end if;
 if account.training_plan is null then update public."PIU_TRAINER_ACCOUNTS" set training_plan=manifest,revision=revision+1 where user_id=actor; end if;
end; $$;
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
 if expected is null then return jsonb_build_object('revision',rev,'catalogRevision',cat,'planReady',(select training_plan is not null from public."PIU_TRAINER_ACCOUNTS" where user_id=actor)); end if;
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
  <> case when r.record->>'status'='skipped' then 0 else coalesce((select sum(jsonb_array_length(s->'slots')) from jsonb_array_elements(r.record->'planSnapshot'->'sets') s),18) end) then raise exception 'INVALID_ASSIGNMENTS'; end if;
 if exists(select 1 from public."PIU_TRAINER_ATTEMPTS" t join public."PIU_TRAINER_ASSIGNMENTS" a on a.user_id=t.user_id and a.id=t.assignment_id where t.user_id=actor and not a.current) then raise exception 'INVALID_ATTEMPT'; end if;
 update public."PIU_TRAINER_ACCOUNTS" set settings=state->'settings',revision=rev+1 where user_id=actor;
 saved := jsonb_build_object('revision',rev+1,'value',result);
 insert into public."PIU_TRAINER_RECEIPTS" values(actor,req,fingerprint,saved);
 return saved;
end; $$;


create function public."PIU_TRAINER_CACHE"(key text,action text,token uuid default null,value jsonb default null,force boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
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
end; $$;
-- Explicit grants only for this migration's three tables and new functions.
alter table public."PIU_TRAINER_PROFILES" enable row level security;
alter table public."PIU_TRAINER_COMPLETIONS" enable row level security;
alter table public."PIU_TRAINER_LEADERBOARD_CACHE" enable row level security;
revoke all on public."PIU_TRAINER_PROFILES",public."PIU_TRAINER_COMPLETIONS",public."PIU_TRAINER_LEADERBOARD_CACHE" from public,anon,authenticated;
grant select,insert,update,delete on public."PIU_TRAINER_PROFILES",public."PIU_TRAINER_COMPLETIONS",public."PIU_TRAINER_LEADERBOARD_CACHE" to service_role;
revoke all on function public."PIU_TRAINER_PROFILE"(text,date),public."PIU_TRAINER_ENROLL"(uuid,jsonb),public."PIU_TRAINER_CACHE"(text,text,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public."PIU_TRAINER_PROFILE"(text,date),public."PIU_TRAINER_ENROLL"(uuid,jsonb),public."PIU_TRAINER_CACHE"(text,text,uuid,jsonb,boolean) to service_role;
