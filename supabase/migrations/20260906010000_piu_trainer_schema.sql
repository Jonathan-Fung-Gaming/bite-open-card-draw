-- Additive PIU Trainer schema. All access is through verified-user server code.
create table public."PIU_TRAINER_ACCOUNTS" (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0 check(revision >= 0),
 settings jsonb not null default '{}'::jsonb
);
create table public."PIU_TRAINER_PLAN" (id text primary key, hash text not null, record jsonb not null);
create table public."PIU_TRAINER_CATALOGS" (revision text primary key, payload text not null, created_at timestamptz not null default now());
create table public."PIU_TRAINER_CATALOG_HEAD" (id boolean primary key default true check(id), revision text references public."PIU_TRAINER_CATALOGS"(revision), lease_until timestamptz, lease_id uuid);
insert into public."PIU_TRAINER_CATALOG_HEAD"(id) values(true);
create table public."PIU_TRAINER_RUNS" (
 user_id uuid not null references public."PIU_TRAINER_ACCOUNTS"(user_id),
 record jsonb not null check(jsonb_typeof(record)='object'),
 id uuid generated always as ((record->>'id')::uuid) stored not null,
 primary key(user_id,id), plan_id text generated always as (record->>'planSessionId') stored, unique(user_id,plan_id), check(record->>'status' in ('generated','in_progress','completed','partial','skipped'))
);
create table public."PIU_TRAINER_ASSIGNMENTS" (
 user_id uuid not null references public."PIU_TRAINER_ACCOUNTS"(user_id),
 record jsonb not null check(jsonb_typeof(record)='object'),
 id uuid generated always as ((record->>'id')::uuid) stored not null,
 primary key(user_id,id), run_id uuid generated always as ((record->>'sessionRunId')::uuid) stored, slot_id text generated always as (record->>'planSlotId') stored, current boolean generated always as ((record->>'isCurrent')::boolean) stored, foreign key(user_id,run_id) references public."PIU_TRAINER_RUNS"(user_id,id)
);
create table public."PIU_TRAINER_ATTEMPTS" (
 user_id uuid not null references public."PIU_TRAINER_ACCOUNTS"(user_id),
 record jsonb not null check(jsonb_typeof(record)='object'),
 id uuid generated always as ((record->>'id')::uuid) stored not null,
 primary key(user_id,id), assignment_id uuid generated always as ((record->>'assignmentId')::uuid) stored, unique(user_id,assignment_id), foreign key(user_id,assignment_id) references public."PIU_TRAINER_ASSIGNMENTS"(user_id,id), check(record->>'outcome' in ('pass','fail','stage_break','skipped'))
);
create table public."PIU_TRAINER_CORRECTIONS" (
 user_id uuid not null references public."PIU_TRAINER_ACCOUNTS"(user_id),
 record jsonb not null check(jsonb_typeof(record)='object'),
 id uuid generated always as ((record->>'id')::uuid) stored not null,
 primary key(user_id,id), attempt_id uuid generated always as ((record->>'attemptId')::uuid) stored, foreign key(user_id,attempt_id) references public."PIU_TRAINER_ATTEMPTS"(user_id,id)
);
create table public."PIU_TRAINER_CHECKINS" (
 user_id uuid not null references public."PIU_TRAINER_ACCOUNTS"(user_id),
 record jsonb not null check(jsonb_typeof(record)='object'),
 id uuid generated always as ((record->>'id')::uuid) stored not null,
 primary key(user_id,id), run_id uuid generated always as ((record->>'sessionRunId')::uuid) stored, set_number integer generated always as ((record->>'setNumber')::integer) stored, check(set_number between 1 and 6), unique(user_id,run_id,set_number), foreign key(user_id,run_id) references public."PIU_TRAINER_RUNS"(user_id,id)
);
create table public."PIU_TRAINER_REROLLS" (
 user_id uuid not null references public."PIU_TRAINER_ACCOUNTS"(user_id),
 record jsonb not null check(jsonb_typeof(record)='object'),
 id uuid generated always as ((record->>'id')::uuid) stored not null,
 primary key(user_id,id), run_id uuid generated always as ((record->>'sessionRunId')::uuid) stored, old_id uuid generated always as ((record->>'oldAssignmentId')::uuid) stored, new_id uuid generated always as ((record->>'newAssignmentId')::uuid) stored, foreign key(user_id,run_id) references public."PIU_TRAINER_RUNS"(user_id,id), foreign key(user_id,old_id) references public."PIU_TRAINER_ASSIGNMENTS"(user_id,id), foreign key(user_id,new_id) references public."PIU_TRAINER_ASSIGNMENTS"(user_id,id)
);
create unique index "PIU_TRAINER_CURRENT_SLOT" on public."PIU_TRAINER_ASSIGNMENTS"(user_id,run_id,slot_id) where current;
create table public."PIU_TRAINER_PREFERENCES" (
 user_id uuid not null references public."PIU_TRAINER_ACCOUNTS"(user_id), record jsonb not null,
 chart_id text generated always as (record->>'chartId') stored, mix text generated always as (record->>'mix') stored,
 mode text generated always as (record->>'targetMode') stored, status text generated always as (record->>'targetStatus') stored,
 primary key(user_id,chart_id,mix)
);
create unique index "PIU_TRAINER_TARGET" on public."PIU_TRAINER_PREFERENCES"(user_id,mode,status) where mode is not null and status in ('primary','backup');
create table public."PIU_TRAINER_ARCHIVED_CHARTS" (
 user_id uuid not null references public."PIU_TRAINER_ACCOUNTS"(user_id), record jsonb not null,
 chart_id text generated always as (record->>'chartId') stored, mix text generated always as (record->>'mix') stored,
 primary key(user_id,chart_id,mix)
);
create table public."PIU_TRAINER_RECEIPTS" (
 user_id uuid not null references public."PIU_TRAINER_ACCOUNTS"(user_id), request_id uuid not null,
 fingerprint text not null, result jsonb not null, primary key(user_id,request_id)
);
create table public."PIU_TRAINER_ARCHIVES" (
 user_id uuid not null references public."PIU_TRAINER_ACCOUNTS"(user_id), request_id uuid not null,
 revision bigint not null, catalog_revision text not null, payload jsonb not null, created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
create table public."PIU_TRAINER_IMPORTS" (
 user_id uuid not null references public."PIU_TRAINER_ACCOUNTS"(user_id), id uuid not null,
 expected_revision bigint not null, total_bytes integer not null check(total_bytes between 1 and 25000000),
 digest text not null, expires_at timestamptz not null default now()+interval '24 hours',
 primary key(user_id,id)
);
create table public."PIU_TRAINER_IMPORT_CHUNKS" (
 user_id uuid not null, import_id uuid not null, part integer not null check(part between 0 and 499),
 payload text not null check(octet_length(payload)<=524288), primary key(user_id,import_id,part),
 foreign key(user_id,import_id) references public."PIU_TRAINER_IMPORTS"(user_id,id) on delete cascade
);
create table public."PIU_TRAINER_RATE_LIMITS" (bucket text primary key, window_start timestamptz not null, count integer not null);

create function public."PIU_TRAINER_STATE"(actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('settings',a.settings,
 'runs', coalesce((select jsonb_agg(r.record order by r.record->>'generatedAtUtc',r.record->>'id') from public."PIU_TRAINER_RUNS" r where r.user_id=actor),'[]'::jsonb),
 'assignments', coalesce((select jsonb_agg(r.record order by r.record::text) from public."PIU_TRAINER_ASSIGNMENTS" r where r.user_id=actor),'[]'::jsonb),
 'attempts', coalesce((select jsonb_agg(r.record order by r.record->>'playedAtUtc',r.record->>'id') from public."PIU_TRAINER_ATTEMPTS" r where r.user_id=actor),'[]'::jsonb),
 'corrections', coalesce((select jsonb_agg(r.record order by r.record->>'correctedAtUtc',r.record->>'id') from public."PIU_TRAINER_CORRECTIONS" r where r.user_id=actor),'[]'::jsonb),
 'checkins', coalesce((select jsonb_agg(r.record order by r.record->>'capturedAtUtc',r.record->>'id') from public."PIU_TRAINER_CHECKINS" r where r.user_id=actor),'[]'::jsonb),
 'rerolls', coalesce((select jsonb_agg(r.record order by r.record->>'createdAtUtc',r.record->>'id') from public."PIU_TRAINER_REROLLS" r where r.user_id=actor),'[]'::jsonb),
 'preferences', coalesce((select jsonb_agg(r.record order by r.record::text) from public."PIU_TRAINER_PREFERENCES" r where r.user_id=actor),'[]'::jsonb),
 'archivedCharts', coalesce((select jsonb_agg(r.record order by r.record::text) from public."PIU_TRAINER_ARCHIVED_CHARTS" r where r.user_id=actor),'[]'::jsonb) ) from public."PIU_TRAINER_ACCOUNTS" a where a.user_id=actor;
$$;

create function public."PIU_TRAINER_READ"(actor uuid, expected bigint default null, page_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rev bigint; payload text; cat text;
begin
 if actor is null or page_offset<0 then raise exception 'INVALID'; end if;
 insert into public."PIU_TRAINER_ACCOUNTS"(user_id) values(actor) on conflict do nothing;
 select revision into rev from public."PIU_TRAINER_ACCOUNTS" where user_id=actor for share;
 select revision into cat from public."PIU_TRAINER_CATALOG_HEAD" where id;
 if expected is not null and expected<>rev then raise exception 'CONFLICT'; end if;
 if expected is null then return jsonb_build_object('revision',rev,'catalogRevision',cat); end if;
 payload := public."PIU_TRAINER_STATE"(actor)::text;
 return jsonb_build_object('revision',rev,'chunk',substr(payload,page_offset+1,65536),'next',case when length(payload)>page_offset+65536 then page_offset+65536 else null end);
end; $$;

create function public."PIU_TRAINER_RECEIPT"(actor uuid, req uuid, fingerprint text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt public."PIU_TRAINER_RECEIPTS";
begin
 select * into receipt from public."PIU_TRAINER_RECEIPTS" where user_id=actor and request_id=req;
 if not found then return null; end if;
 if receipt.fingerprint<>fingerprint then raise exception 'REQUEST_REUSED'; end if;
 return receipt.result;
end; $$;

create function public."PIU_TRAINER_COMMIT"(actor uuid, req uuid, fingerprint text, expected bigint, state jsonb, result jsonb, archive boolean, catalog_rev text)
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
 insert into public."PIU_TRAINER_ATTEMPTS"(user_id,record) select actor,value from jsonb_array_elements(state->'attempts');
 insert into public."PIU_TRAINER_CORRECTIONS"(user_id,record) select actor,value from jsonb_array_elements(state->'corrections');
 insert into public."PIU_TRAINER_CHECKINS"(user_id,record) select actor,value from jsonb_array_elements(state->'checkins');
 insert into public."PIU_TRAINER_REROLLS"(user_id,record) select actor,value from jsonb_array_elements(state->'rerolls');
 insert into public."PIU_TRAINER_PREFERENCES"(user_id,record) select actor,value from jsonb_array_elements(state->'preferences');
 insert into public."PIU_TRAINER_ARCHIVED_CHARTS"(user_id,record) select actor,value from jsonb_array_elements(state->'archivedCharts');
 if exists(select 1 from public."PIU_TRAINER_RUNS" r where r.user_id=actor and
  (select count(*) from public."PIU_TRAINER_ASSIGNMENTS" a where a.user_id=actor and a.run_id=r.id and a.current)
  <> case when r.record->>'status'='skipped' then 0 else 18 end) then raise exception 'INVALID_ASSIGNMENTS'; end if;
 if exists(select 1 from public."PIU_TRAINER_ATTEMPTS" t join public."PIU_TRAINER_ASSIGNMENTS" a on a.user_id=t.user_id and a.id=t.assignment_id where t.user_id=actor and not a.current) then raise exception 'INVALID_ATTEMPT'; end if;
 update public."PIU_TRAINER_ACCOUNTS" set settings=state->'settings',revision=rev+1 where user_id=actor;
 saved := jsonb_build_object('revision',rev+1,'value',result);
 insert into public."PIU_TRAINER_RECEIPTS" values(actor,req,fingerprint,saved);
 return saved;
end; $$;

create function public."PIU_TRAINER_CATALOG"(rev text default null, page_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payload text; selected text;
begin
 if page_offset<0 then raise exception 'INVALID'; end if;
 selected := coalesce(rev,(select revision from public."PIU_TRAINER_CATALOG_HEAD" where id));
 select c.payload into payload from public."PIU_TRAINER_CATALOGS" c where c.revision=selected;
 if payload is null then return null; end if;
 return jsonb_build_object('revision',selected,'chunk',substr(payload,page_offset+1,65536),'next',case when length(payload)>page_offset+65536 then page_offset+65536 else null end);
end; $$;

create function public."PIU_TRAINER_CATALOG_PUT"(rev text, payload text, lease uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public."PIU_TRAINER_CATALOG_HEAD" where id for update;
 if lease is null and (select revision is not null from public."PIU_TRAINER_CATALOG_HEAD" where id) then return false; end if;
 if lease is not null and not exists(select 1 from public."PIU_TRAINER_CATALOG_HEAD" where id and lease_id=lease and lease_until>now()) then return false; end if;
 insert into public."PIU_TRAINER_CATALOGS"(revision,payload) values(rev,payload) on conflict do nothing;
 update public."PIU_TRAINER_CATALOG_HEAD" set revision=rev,lease_until=null,lease_id=null where id;
 return true;
end; $$;
create function public."PIU_TRAINER_CATALOG_LEASE"(token uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public."PIU_TRAINER_CATALOG_HEAD" set lease_id=token,lease_until=now()+interval '60 seconds'
 where id and (lease_until is null or lease_until<now()) and not exists(select 1 from public."PIU_TRAINER_CATALOGS" c where c.revision="PIU_TRAINER_CATALOG_HEAD".revision and c.created_at>now()-interval '5 minutes');
 return found;
end; $$;

create function public."PIU_TRAINER_LIMIT"(key text, maximum integer, seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare used integer;
begin
 delete from public."PIU_TRAINER_RATE_LIMITS" where window_start<now()-interval '1 day';
 insert into public."PIU_TRAINER_RATE_LIMITS" as r(bucket,window_start,count) values(key,now(),1)
 on conflict(bucket) do update set count=case when r.window_start<now()-make_interval(secs=>seconds) then 1 else r.count+1 end,
 window_start=case when r.window_start<now()-make_interval(secs=>seconds) then now() else r.window_start end returning count into used;
 return used<=maximum;
end; $$;

create function public."PIU_TRAINER_IMPORT"(actor uuid, import_id uuid, action text, expected bigint default 0, size integer default 0, digest text default '', part integer default 0, payload text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
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
end; $$;

-- Grants are explicit and restricted to this migration's objects only.
do $$ declare obj record; begin
 for obj in select tablename from pg_tables where schemaname='public' and left(tablename,12)='PIU_TRAINER_' || '' loop
  execute format('alter table public.%I enable row level security',obj.tablename);
  execute format('revoke all on public.%I from public, anon, authenticated',obj.tablename);
  execute format('grant select,insert,update,delete on public.%I to service_role',obj.tablename);
 end loop;
 for obj in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and left(p.proname,12)='PIU_TRAINER_' || '' loop
  execute format('revoke all on function %s from public, anon, authenticated',obj.signature);
  execute format('grant execute on function %s to service_role',obj.signature);
 end loop;
end $$;
