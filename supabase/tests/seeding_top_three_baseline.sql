-- Isolated pre-change schema snapshot for the new migration only. No historical tests or full replay.
-- Minimal isolated prerequisites only. Never run against the hosted project.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
-- Isolated tournament intake/seeding persistence. No upstream credentials or sessions.
create schema tournament_seeding;
revoke all on schema tournament_seeding from public, anon, authenticated;
grant usage on schema tournament_seeding to service_role;

create table tournament_seeding.schema_metadata (version text primary key);
insert into tournament_seeding.schema_metadata values ('20260926010000');
create table tournament_seeding.events (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  revision bigint not null default 0 check (revision >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);
create table tournament_seeding.entrants (
  event_slug text not null references tournament_seeding.events(slug),
  id uuid not null,
  canonical_key text not null check (length(canonical_key) > 0),
  active boolean not null,
  accepted_submission_id uuid,
  data jsonb not null,
  primary key (event_slug, id)
);
create unique index tournament_seeding_active_names on tournament_seeding.entrants(event_slug, canonical_key) where active;
create table tournament_seeding.submissions (
  event_slug text not null,
  id uuid not null,
  entrant_id uuid not null,
  receipt_sequence bigint not null check (receipt_sequence > 0),
  actual_rating numeric not null check (actual_rating >= 0 and actual_rating != 'NaN'::numeric),
  ninth_contribution numeric check (ninth_contribution >= 0 and ninth_contribution != 'NaN'::numeric),
  predicted_rating numeric,
  status text not null check (status in ('pending_review','approved','rejected')),
  source_data jsonb not null,
  primary key (event_slug, id),
  unique (event_slug, receipt_sequence),
  foreign key (event_slug, entrant_id) references tournament_seeding.entrants(event_slug,id),
  check ((ninth_contribution is null and predicted_rating is null) or predicted_rating = 52.176654::numeric * ninth_contribution - 966.384379::numeric)
);
alter table tournament_seeding.entrants add constraint tournament_seeding_accepted_fk foreign key (event_slug, accepted_submission_id) references tournament_seeding.submissions(event_slug,id) deferrable initially deferred;
create table tournament_seeding.submission_scores (
  event_slug text not null,
  submission_id uuid not null,
  position smallint not null check (position between 1 and 9),
  contribution numeric not null check (contribution >= 0 and contribution != 'NaN'::numeric),
  primary key (event_slug, submission_id, position),
  foreign key (event_slug, submission_id) references tournament_seeding.submissions(event_slug,id)
);
create table tournament_seeding.runs (
  event_slug text not null references tournament_seeding.events(slug),
  id uuid not null,
  input_revision bigint not null,
  snapshot jsonb not null,
  published_at timestamptz,
  primary key (event_slug,id)
);
create table tournament_seeding.operations (
  event_slug text not null references tournament_seeding.events(slug),
  operation_key text not null,
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (event_slug, operation_key)
);
create table tournament_seeding.sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  data jsonb not null,
  expires_at timestamptz not null
);
create table tournament_seeding.receipts (
  id uuid primary key,
  data jsonb not null,
  expires_at timestamptz not null
);
create table tournament_seeding.rate_limits (
  key text primary key,
  hits integer not null,
  ends_at timestamptz not null
);

create function public.tournament_seeding_read_event(p_slug text,p_initial jsonb,p_schema_version text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from tournament_seeding.schema_metadata where version=p_schema_version) then raise exception 'SCHEMA_NOT_READY'; end if;
  if p_initial->>'slug' is distinct from p_slug or (p_initial->>'revision')::bigint != 0 then raise exception 'INVALID_INITIAL_EVENT'; end if;
  insert into tournament_seeding.events(slug,state) values(p_slug,p_initial) on conflict (slug) do nothing;
  return (select state from tournament_seeding.events where slug=p_slug);
end $$;

create function public.tournament_seeding_replay(p_slug text,p_key text,p_fingerprint text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare op tournament_seeding.operations%rowtype;
begin
  select * into op from tournament_seeding.operations where event_slug=p_slug and operation_key=p_key;
  if not found then return null; end if;
  if op.fingerprint != p_fingerprint then raise exception 'IDEMPOTENCY_MISMATCH'; end if;
  return op.result || '{"replayed":true}'::jsonb;
end $$;

create function public.tournament_seeding_commit(p_slug text,p_expected_revision bigint,p_state jsonb,p_key text,p_fingerprint text,p_response jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare current_event tournament_seeding.events%rowtype; item jsonb; v_snapshot jsonb; score jsonb; old_source jsonb; immutable_source jsonb; result jsonb; replay jsonb; added bigint; score_count integer; position integer; previous_score numeric; value numeric;
begin
  select * into current_event from tournament_seeding.events where slug=p_slug for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  replay := public.tournament_seeding_replay(p_slug,p_key,p_fingerprint);
  if replay is not null then return replay; end if;
  if current_event.revision != p_expected_revision then raise exception 'STALE_REVISION'; end if;
  if p_state->>'slug' is distinct from p_slug or (p_state->>'revision')::bigint != p_expected_revision+1 then raise exception 'INVALID_REVISION'; end if;
  if (p_state->>'inputRevision')::bigint not between (current_event.state->>'inputRevision')::bigint and (current_event.state->>'inputRevision')::bigint+1 then raise exception 'INVALID_INPUT_REVISION'; end if;
  if p_state#>>'{draft,run,status}' != 'ready' or jsonb_array_length(p_state#>'{draft,run,passes}') != 2 or (p_state#>>'{draft,inputRevision}')::bigint != (p_state->>'inputRevision')::bigint or (p_state#>>'{draft,run,inputRevision}')::bigint != (p_state->>'inputRevision')::bigint then raise exception 'INCOMPLETE_RUN'; end if;
  if jsonb_array_length(p_state->'entrants') > 5000 or jsonb_array_length(p_state->'submissions') > 50000 then raise exception 'EVENT_LIMIT'; end if;
  if exists (select 1 from tournament_seeding.submissions s where s.event_slug=p_slug and not exists(select 1 from jsonb_array_elements(p_state->'submissions') j where (j->>'id')::uuid=s.id)) then raise exception 'SOURCE_REMOVAL_FORBIDDEN'; end if;
  select count(*) into added from jsonb_array_elements(p_state->'submissions') j where not exists(select 1 from tournament_seeding.submissions s where s.event_slug=p_slug and s.id=(j->>'id')::uuid);
  if (p_state->>'nextSequence')::bigint != (current_event.state->>'nextSequence')::bigint+added then raise exception 'INVALID_SEQUENCE_COUNTER'; end if;

  -- Clear the partial index within this transaction, then validate final active identities.
  update tournament_seeding.entrants set active=false where event_slug=p_slug;
  for item in select * from jsonb_array_elements(p_state->'entrants') loop
    insert into tournament_seeding.entrants(event_slug,id,canonical_key,active,accepted_submission_id,data)
    values(p_slug,(item->>'id')::uuid,item->>'canonicalKey',item->>'mergedInto' is null,(item->>'acceptedSubmissionId')::uuid,item)
    on conflict(event_slug,id) do update set canonical_key=excluded.canonical_key,active=excluded.active,accepted_submission_id=excluded.accepted_submission_id,data=excluded.data;
  end loop;
  for item in select * from jsonb_array_elements(p_state->'submissions') loop
    immutable_source := item - array['status','identityConfirmed','reviewedAt','reviewedBy','reviewNote'];
    select source_data into old_source from tournament_seeding.submissions where event_slug=p_slug and id=(item->>'id')::uuid;
    if found and old_source is distinct from immutable_source then raise exception 'IMMUTABLE_SOURCE'; end if;
    score_count := jsonb_array_length(item->'contributions');
    if score_count != 9 and not (score_count<9 and (item->>'verifiedShortfall')::boolean and length(btrim(item->>'shortfallNote'))>0) then raise exception 'INVALID_SCORE_COUNT'; end if;
    if score_count<9 and (item->>'ninthContribution' is not null or item->>'predictedRating' is not null) then raise exception 'INVALID_SHORTFALL'; end if;
    if score_count=9 and (item->>'ninthContribution')::numeric is distinct from (item#>>'{contributions,8}')::numeric then raise exception 'INVALID_NINTH'; end if;
    insert into tournament_seeding.submissions(event_slug,id,entrant_id,receipt_sequence,actual_rating,ninth_contribution,predicted_rating,status,source_data)
    values(p_slug,(item->>'id')::uuid,(item->>'entrantId')::uuid,(item->>'sequence')::bigint,(item->>'actualRating')::numeric,(item->>'ninthContribution')::numeric,(item->>'predictedRating')::numeric,item->>'status',immutable_source)
    on conflict(event_slug,id) do update set status=excluded.status;
    previous_score := null; position := 0;
    for score in select * from jsonb_array_elements(item->'contributions') loop
      position := position+1; value := (score#>>'{}')::numeric;
      if previous_score is not null and value>previous_score then raise exception 'UNSORTED_SCORES'; end if;
      previous_score := value;
      insert into tournament_seeding.submission_scores(event_slug,submission_id,position,contribution) values(p_slug,(item->>'id')::uuid,position,value) on conflict do nothing;
    end loop;
  end loop;
  if exists(select 1 from tournament_seeding.entrants e join tournament_seeding.submissions s on s.event_slug=e.event_slug and s.id=e.accepted_submission_id where e.event_slug=p_slug and s.status!='approved') then raise exception 'UNAPPROVED_POINTER'; end if;
  for v_snapshot in select p_state->'draft' union all select p_state->'published' where p_state->>'published' is not null loop
    if v_snapshot is null or v_snapshot='null'::jsonb then continue; end if;
    if exists(select 1 from tournament_seeding.runs r where r.event_slug=p_slug and r.id=(v_snapshot->>'id')::uuid and r.snapshot is distinct from v_snapshot-'publishedAt') then raise exception 'IMMUTABLE_RUN'; end if;
    insert into tournament_seeding.runs(event_slug,id,input_revision,snapshot,published_at) values(p_slug,(v_snapshot->>'id')::uuid,(v_snapshot->>'inputRevision')::bigint,v_snapshot-'publishedAt',(v_snapshot->>'publishedAt')::timestamptz)
    on conflict(event_slug,id) do update set published_at=coalesce(tournament_seeding.runs.published_at,excluded.published_at);
  end loop;
  update tournament_seeding.events set state=p_state,revision=p_expected_revision+1,updated_at=clock_timestamp() where slug=p_slug;
  result := jsonb_build_object('state',p_state,'replayed',false,'response',p_response);
  insert into tournament_seeding.operations(event_slug,operation_key,fingerprint,result) values(p_slug,p_key,p_fingerprint,result);
  return result;
end $$;

create function public.tournament_seeding_session_put(p_session jsonb) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_session->>'kind' not in ('player','organizer') or (p_session->>'expiresAt')::timestamptz<=now() then raise exception 'INVALID_SESSION'; end if;
  insert into tournament_seeding.sessions values(p_session->>'tokenHash',p_session,(p_session->>'expiresAt')::timestamptz);
  delete from tournament_seeding.sessions where expires_at<now();
end $$;
create function public.tournament_seeding_session_get(p_hash text) returns jsonb language sql security invoker set search_path = '' as $$ select data from tournament_seeding.sessions where token_hash=p_hash and expires_at>now() $$;
create function public.tournament_seeding_session_delete(p_hash text) returns void language sql security invoker set search_path = '' as $$ delete from tournament_seeding.sessions where token_hash=p_hash $$;
create function public.tournament_seeding_receipt_put(p_receipt jsonb) returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into tournament_seeding.receipts values((p_receipt->>'id')::uuid,p_receipt,(p_receipt->>'expiresAt')::timestamptz);
  delete from tournament_seeding.receipts where expires_at<now();
end $$;
create function public.tournament_seeding_receipt_get(p_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select data from tournament_seeding.receipts where id=p_id and expires_at>now() $$;
create function public.tournament_seeding_rate_limit(p_key text,p_limit integer,p_window_seconds integer) returns boolean language plpgsql security invoker set search_path = '' as $$
declare count integer;
begin
  if p_limit<1 or p_window_seconds<1 or p_window_seconds>86400 then raise exception 'INVALID_RATE_LIMIT'; end if;
  insert into tournament_seeding.rate_limits as limits(key,hits,ends_at) values(p_key,1,clock_timestamp()+make_interval(secs=>p_window_seconds))
  on conflict(key) do update set hits=case when limits.ends_at<=clock_timestamp() then 1 else limits.hits+1 end,ends_at=case when limits.ends_at<=clock_timestamp() then clock_timestamp()+make_interval(secs=>p_window_seconds) else limits.ends_at end
  returning hits into count;
  delete from tournament_seeding.rate_limits where ends_at<clock_timestamp()-interval '1 day';
  return count<=p_limit;
end $$;

do $$ declare t text; f record; begin
  for t in select tablename from pg_catalog.pg_tables where schemaname='tournament_seeding' loop
    execute format('alter table tournament_seeding.%I enable row level security',t);
    execute format('revoke all on tournament_seeding.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on tournament_seeding.%I to service_role',t);
  end loop;
  for f in select p.oid::regprocedure as signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'tournament_seeding_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;

-- Add an explicit admin-only ninth-contribution source format. Existing sources remain valid.
create or replace function public.tournament_seeding_commit(p_slug text,p_expected_revision bigint,p_state jsonb,p_key text,p_fingerprint text,p_response jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare current_event tournament_seeding.events%rowtype; item jsonb; v_snapshot jsonb; score jsonb; old_source jsonb; immutable_source jsonb; result jsonb; replay jsonb; added bigint; score_count integer; position integer; previous_score numeric; value numeric;
begin
  select * into current_event from tournament_seeding.events where slug=p_slug for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  replay := public.tournament_seeding_replay(p_slug,p_key,p_fingerprint);
  if replay is not null then return replay; end if;
  if current_event.revision != p_expected_revision then raise exception 'STALE_REVISION'; end if;
  if p_state->>'slug' is distinct from p_slug or (p_state->>'revision')::bigint != p_expected_revision+1 then raise exception 'INVALID_REVISION'; end if;
  if (p_state->>'inputRevision')::bigint not between (current_event.state->>'inputRevision')::bigint and (current_event.state->>'inputRevision')::bigint+1 then raise exception 'INVALID_INPUT_REVISION'; end if;
  if p_state#>>'{draft,run,status}' != 'ready' or jsonb_array_length(p_state#>'{draft,run,passes}') != 2 or (p_state#>>'{draft,inputRevision}')::bigint != (p_state->>'inputRevision')::bigint or (p_state#>>'{draft,run,inputRevision}')::bigint != (p_state->>'inputRevision')::bigint then raise exception 'INCOMPLETE_RUN'; end if;
  if jsonb_array_length(p_state->'entrants') > 5000 or jsonb_array_length(p_state->'submissions') > 50000 then raise exception 'EVENT_LIMIT'; end if;
  if exists (select 1 from tournament_seeding.submissions s where s.event_slug=p_slug and not exists(select 1 from jsonb_array_elements(p_state->'submissions') j where (j->>'id')::uuid=s.id)) then raise exception 'SOURCE_REMOVAL_FORBIDDEN'; end if;
  select count(*) into added from jsonb_array_elements(p_state->'submissions') j where not exists(select 1 from tournament_seeding.submissions s where s.event_slug=p_slug and s.id=(j->>'id')::uuid);
  if (p_state->>'nextSequence')::bigint != (current_event.state->>'nextSequence')::bigint+added then raise exception 'INVALID_SEQUENCE_COUNTER'; end if;

  -- Clear the partial index within this transaction, then validate final active identities.
  update tournament_seeding.entrants set active=false where event_slug=p_slug;
  for item in select * from jsonb_array_elements(p_state->'entrants') loop
    insert into tournament_seeding.entrants(event_slug,id,canonical_key,active,accepted_submission_id,data)
    values(p_slug,(item->>'id')::uuid,item->>'canonicalKey',item->>'mergedInto' is null,(item->>'acceptedSubmissionId')::uuid,item)
    on conflict(event_slug,id) do update set canonical_key=excluded.canonical_key,active=excluded.active,accepted_submission_id=excluded.accepted_submission_id,data=excluded.data;
  end loop;
  for item in select * from jsonb_array_elements(p_state->'submissions') loop
    immutable_source := item - array['status','identityConfirmed','reviewedAt','reviewedBy','reviewNote'];
    select source_data into old_source from tournament_seeding.submissions where event_slug=p_slug and id=(item->>'id')::uuid;
    if found and old_source is distinct from immutable_source then raise exception 'IMMUTABLE_SOURCE'; end if;
    score_count := jsonb_array_length(item->'contributions');
    if item->>'scoreInputMode' = 'ninth_only' then
      if item->>'source' is distinct from 'admin_manual' or score_count is distinct from 0 then raise exception 'INVALID_MANUAL_NINTH'; end if;
      if coalesce((item->>'verifiedShortfall')::boolean,false) then
        if coalesce(length(btrim(item->>'shortfallNote')),0)=0 or item->>'ninthContribution' is not null or item->>'predictedRating' is not null then raise exception 'INVALID_SHORTFALL'; end if;
      elsif item->>'ninthContribution' is null or item->>'predictedRating' is null
        or (item->>'ninthContribution')::numeric < 0
        or (item->>'ninthContribution')::numeric in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
        or (item->>'predictedRating')::numeric is distinct from 52.176654::numeric * (item->>'ninthContribution')::numeric - 966.384379::numeric then
        raise exception 'INVALID_MANUAL_NINTH';
      end if;
    else
      if score_count != 9 and not (score_count<9 and (item->>'verifiedShortfall')::boolean and length(btrim(item->>'shortfallNote'))>0) then raise exception 'INVALID_SCORE_COUNT'; end if;
      if score_count<9 and (item->>'ninthContribution' is not null or item->>'predictedRating' is not null) then raise exception 'INVALID_SHORTFALL'; end if;
      if score_count=9 and (item->>'ninthContribution')::numeric is distinct from (item#>>'{contributions,8}')::numeric then raise exception 'INVALID_NINTH'; end if;
    end if;
    insert into tournament_seeding.submissions(event_slug,id,entrant_id,receipt_sequence,actual_rating,ninth_contribution,predicted_rating,status,source_data)
    values(p_slug,(item->>'id')::uuid,(item->>'entrantId')::uuid,(item->>'sequence')::bigint,(item->>'actualRating')::numeric,(item->>'ninthContribution')::numeric,(item->>'predictedRating')::numeric,item->>'status',immutable_source)
    on conflict(event_slug,id) do update set status=excluded.status;
    if item->>'scoreInputMode' = 'ninth_only' and item->>'ninthContribution' is not null then
      insert into tournament_seeding.submission_scores(event_slug,submission_id,position,contribution)
      values(p_slug,(item->>'id')::uuid,9,(item->>'ninthContribution')::numeric) on conflict do nothing;
    end if;
    previous_score := null; position := 0;
    for score in select * from jsonb_array_elements(item->'contributions') loop
      position := position+1; value := (score#>>'{}')::numeric;
      if previous_score is not null and value>previous_score then raise exception 'UNSORTED_SCORES'; end if;
      previous_score := value;
      insert into tournament_seeding.submission_scores(event_slug,submission_id,position,contribution) values(p_slug,(item->>'id')::uuid,position,value) on conflict do nothing;
    end loop;
  end loop;
  if exists(select 1 from tournament_seeding.entrants e join tournament_seeding.submissions s on s.event_slug=e.event_slug and s.id=e.accepted_submission_id where e.event_slug=p_slug and s.status!='approved') then raise exception 'UNAPPROVED_POINTER'; end if;
  for v_snapshot in select p_state->'draft' union all select p_state->'published' where p_state->>'published' is not null loop
    if v_snapshot is null or v_snapshot='null'::jsonb then continue; end if;
    if exists(select 1 from tournament_seeding.runs r where r.event_slug=p_slug and r.id=(v_snapshot->>'id')::uuid and r.snapshot is distinct from v_snapshot-'publishedAt') then raise exception 'IMMUTABLE_RUN'; end if;
    insert into tournament_seeding.runs(event_slug,id,input_revision,snapshot,published_at) values(p_slug,(v_snapshot->>'id')::uuid,(v_snapshot->>'inputRevision')::bigint,v_snapshot-'publishedAt',(v_snapshot->>'publishedAt')::timestamptz)
    on conflict(event_slug,id) do update set published_at=coalesce(tournament_seeding.runs.published_at,excluded.published_at);
  end loop;
  update tournament_seeding.events set state=p_state,revision=p_expected_revision+1,updated_at=clock_timestamp() where slug=p_slug;
  result := jsonb_build_object('state',p_state,'replayed',false,'response',p_response);
  insert into tournament_seeding.operations(event_slug,operation_key,fingerprint,result) values(p_slug,p_key,p_fingerprint,result);
  return result;
end $$;

revoke all on function public.tournament_seeding_commit(text,bigint,jsonb,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.tournament_seeding_commit(text,bigint,jsonb,text,text,jsonb) to service_role;
insert into tournament_seeding.schema_metadata(version) values ('20260926020000') on conflict do nothing;
