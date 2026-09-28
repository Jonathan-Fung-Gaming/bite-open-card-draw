-- Crossplay is private: only trusted application-server calls reach the three-function interface.
-- The migration administrator owns SECURITY DEFINER functions; runtime has no table privileges.
create schema crossplay;
revoke all on schema crossplay from public, anon, authenticated, service_role;
do $$ begin
  if not exists(select 1 from pg_catalog.pg_roles where rolname='crossplay_runtime') then
    create role crossplay_runtime nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end $$;
grant usage on schema crossplay to crossplay_runtime;

create table crossplay.schema_metadata(version text primary key);
insert into crossplay.schema_metadata values('20260928010000');
create table crossplay.organizers (
  user_id uuid primary key references auth.users(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table crossplay.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  name text not null check(length(name) between 1 and 120 and name=btrim(name)),
  event_date date,
  status text not null default 'draft' check(status in ('draft','active','finished','archived')),
  config jsonb not null,
  frozen_config jsonb,
  seed text not null check(length(seed) between 1 and 200),
  version bigint not null default 0 check(version>=0),
  started_at timestamptz,
  finished_at timestamptz,
  corrections_only boolean not null default false,
  created_at timestamptz not null default now()
);
create table crossplay.tournament_staff (
  tournament_id uuid not null references crossplay.tournaments(id),
  user_id uuid not null references crossplay.organizers(user_id),
  role text not null check(role in ('owner','editor')),
  primary key(tournament_id,user_id)
);
create table crossplay.entrants (
  tournament_id uuid not null references crossplay.tournaments(id),
  id uuid not null default gen_random_uuid(),
  name text not null check(length(name) between 1 and 80 and name=btrim(name)),
  normalized_name text not null,
  seed integer not null check(seed between 0 and 2147483647),
  active boolean not null default true,
  primary key(tournament_id,id),
  unique(tournament_id,normalized_name)
);
create table crossplay.rounds (
  tournament_id uuid not null references crossplay.tournaments(id),
  id uuid not null default gen_random_uuid(),
  number integer not null check(number between 1 and 255),
  status text not null check(status in ('draft','published','completed')),
  engine_version text not null check(length(engine_version) between 1 and 200),
  input_hash text not null check(length(input_hash) between 1 and 200),
  input_version bigint not null,
  input_snapshot jsonb not null,
  published_at timestamptz,
  primary key(tournament_id,id),
  unique(tournament_id,number)
);
create unique index crossplay_one_draft on crossplay.rounds(tournament_id) where status='draft';
create table crossplay.matches (
  tournament_id uuid not null,
  round_id uuid not null,
  id uuid not null default gen_random_uuid(),
  table_number integer not null check(table_number between 1 and 128),
  kind text not null check(kind in ('played','bye','forfeit','double_forfeit')),
  status text not null default 'unreported' check(status in ('unreported','awaiting_confirmation','disputed','final')),
  revision integer not null default 0 check(revision>=0),
  official_revision_id uuid,
  current_report_id uuid,
  primary key(tournament_id,id),
  unique(tournament_id,round_id,id),
  unique(tournament_id,round_id,table_number),
  foreign key(tournament_id,round_id) references crossplay.rounds(tournament_id,id) on delete cascade
);
create table crossplay.match_sides (
  tournament_id uuid not null,
  round_id uuid not null,
  match_id uuid not null,
  side integer not null check(side in (1,2)),
  entrant_id uuid not null,
  primary key(tournament_id,match_id,side),
  unique(tournament_id,round_id,entrant_id),
  foreign key(tournament_id,round_id,match_id) references crossplay.matches(tournament_id,round_id,id) on delete cascade,
  foreign key(tournament_id,entrant_id) references crossplay.entrants(tournament_id,id)
);
create table crossplay.match_reports (
  tournament_id uuid not null,
  match_id uuid not null,
  id uuid not null default gen_random_uuid(),
  revision integer not null,
  submitted_by uuid not null,
  raw1 integer not null check(raw1 between -100000 and 100000),
  raw2 integer not null check(raw2 between -100000 and 100000),
  overtime1 integer not null check(overtime1 between 0 and 86400),
  overtime2 integer not null check(overtime2 between 0 and 86400),
  dispute_reason text check(length(dispute_reason) between 1 and 1000),
  created_at timestamptz not null default now(),
  primary key(tournament_id,match_id,id),
  unique(tournament_id,match_id,revision),
  foreign key(tournament_id,match_id) references crossplay.matches(tournament_id,id),
  foreign key(tournament_id,submitted_by) references crossplay.entrants(tournament_id,id)
);
create table crossplay.result_revisions (
  tournament_id uuid not null,
  match_id uuid not null,
  id uuid not null default gen_random_uuid(),
  revision integer not null,
  kind text not null check(kind in ('played','bye','forfeit','double_forfeit')),
  result jsonb not null,
  rules jsonb not null,
  actor jsonb not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key(tournament_id,match_id,id),
  unique(tournament_id,match_id,revision),
  foreign key(tournament_id,match_id) references crossplay.matches(tournament_id,id)
);
alter table crossplay.matches add constraint crossplay_official_revision_fk foreign key(tournament_id,id,official_revision_id)
  references crossplay.result_revisions(tournament_id,match_id,id) deferrable initially deferred;
alter table crossplay.matches add constraint crossplay_current_report_fk foreign key(tournament_id,id,current_report_id)
  references crossplay.match_reports(tournament_id,match_id,id) deferrable initially deferred;
create table crossplay.entrant_credentials (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  entrant_id uuid not null,
  invite_hash text not null unique check(invite_hash ~ '^[0-9a-f]{64}$'),
  consumed_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null,
  unique(tournament_id,entrant_id,id),
  foreign key(tournament_id,entrant_id) references crossplay.entrants(tournament_id,id) on delete cascade
);
create table crossplay.entrant_sessions (
  token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
  tournament_id uuid not null,
  entrant_id uuid not null,
  credential_id uuid not null,
  revoked_at timestamptz,
  expires_at timestamptz not null,
  foreign key(tournament_id,entrant_id,credential_id) references crossplay.entrant_credentials(tournament_id,entrant_id,id) on delete cascade
);
create table crossplay.mutation_requests (
  actor_key text not null,
  request_id uuid not null,
  fingerprint text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_key,request_id)
);
create table crossplay.audit_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references crossplay.tournaments(id),
  action text not null,
  actor jsonb not null,
  reason text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table crossplay.rate_limits (
  key text primary key,
  hits integer not null,
  ends_at timestamptz not null
);

create function crossplay.schema_version() returns text language sql security definer set search_path='' as $$
  select version from crossplay.schema_metadata limit 1
$$;
create function crossplay.is_organizer(p_actor jsonb) returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from crossplay.organizers where user_id=(p_actor->>'userId')::uuid and active)
$$;
create function crossplay.is_staff(p_actor jsonb,p_tournament uuid) returns boolean language sql stable set search_path='' as $$
  select crossplay.is_organizer(p_actor) and exists(select 1 from crossplay.tournament_staff where tournament_id=p_tournament and user_id=(p_actor->>'userId')::uuid)
$$;
create function crossplay.session_entrant(p_actor jsonb,p_tournament uuid) returns uuid language sql stable set search_path='' as $$
  select s.entrant_id from crossplay.entrant_sessions s join crossplay.entrant_credentials c on c.id=s.credential_id
  where s.token_hash=p_actor->>'sessionHash' and s.tournament_id=p_tournament and s.revoked_at is null
    and s.expires_at>now() and c.revoked_at is null
$$;
create function crossplay.name_key(p_name text) returns text language sql immutable set search_path='' as $$
  select replace(replace(lower(btrim(regexp_replace(pg_catalog.normalize(p_name,'NFKC'),'[[:space:]]+',' ','g'))),'ß','ss'),'ς','σ')
$$;
create function crossplay.validate_config(p_config jsonb) returns void language plpgsql set search_path='' as $$
begin
  if jsonb_typeof(p_config) is distinct from 'object'
    or not (p_config ?& array['roundCount','penaltyIntervalSeconds','penaltyPoints','timeLimitSeconds'])
    or p_config->>'penaltyIntervalSeconds' !~ '^[0-9]+$' or (p_config->>'penaltyIntervalSeconds')::integer not between 1 and 3600
    or p_config->>'penaltyPoints' !~ '^[0-9]+$' or (p_config->>'penaltyPoints')::integer not between 0 and 100
    or (p_config->>'roundCount' is not null and (p_config->>'roundCount' !~ '^[0-9]+$' or (p_config->>'roundCount')::integer not between 1 and 255))
    or (p_config->>'timeLimitSeconds' is not null and (p_config->>'timeLimitSeconds' !~ '^[0-9]+$' or (p_config->>'timeLimitSeconds')::integer not between 1 and 86400))
    or p_config->>'penaltyIntervalSeconds' is null or p_config->>'penaltyPoints' is null then
    raise exception 'INVALID_CONFIG';
  end if;
end $$;
create function crossplay.calculate_result(p_kind text,p_input jsonb,p_rules jsonb,p_winner_side integer default null) returns jsonb
language plpgsql immutable set search_path='' as $$
declare r1 integer; r2 integer; o1 integer:=0; o2 integer:=0; a1 integer; a2 integer; pts1 integer:=0; pts2 integer:=0; diff integer:=0;
begin
  if p_kind='played' then
    if not(p_input ?& array['raw1','raw2','overtime1','overtime2']) or exists(select 1 from jsonb_each_text(p_input) where key in ('raw1','raw2','overtime1','overtime2') and (value is null or value !~ '^-?[0-9]+$')) then raise exception 'INVALID_SCORE'; end if;
    r1:=(p_input->>'raw1')::integer; r2:=(p_input->>'raw2')::integer;
    o1:=(p_input->>'overtime1')::integer; o2:=(p_input->>'overtime2')::integer;
    if r1 not between -100000 and 100000 or r2 not between -100000 and 100000 or o1 not between 0 and 86400 or o2 not between 0 and 86400 then raise exception 'INVALID_SCORE'; end if;
    a1:=r1-(o1/(p_rules->>'penaltyIntervalSeconds')::integer)*(p_rules->>'penaltyPoints')::integer;
    a2:=r2-(o2/(p_rules->>'penaltyIntervalSeconds')::integer)*(p_rules->>'penaltyPoints')::integer;
    diff:=a1-a2; pts1:=case when diff>0 then 2 when diff=0 then 1 else 0 end; pts2:=2-pts1;
  elsif p_kind='bye' then pts1:=2;
  elsif p_kind='forfeit' then
    if p_winner_side not in (1,2) or p_winner_side is null then raise exception 'INVALID_WINNER'; end if;
    pts1:=case when p_winner_side=1 then 2 else 0 end; pts2:=2-pts1;
  elsif p_kind<>'double_forfeit' or p_kind is null then raise exception 'INVALID_OUTCOME';
  end if;
  return jsonb_build_object('raw1',r1,'raw2',r2,'overtime1',o1,'overtime2',o2,'adjusted1',a1,'adjusted2',a2,'points1',pts1,'points2',pts2,'difference1',diff);
end $$;
create function crossplay.tournament_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name,'date',t.event_date,'status',t.status,'config',t.config,'seed',t.seed,'version',t.version,'createdAt',t.created_at,'correctionsOnly',t.corrections_only,
    'entrantCount',(select count(*) from crossplay.entrants where tournament_id=t.id),
    'currentRound',coalesce((select max(number) from crossplay.rounds where tournament_id=t.id and status<>'draft'),0))
  from crossplay.tournaments t where t.id=p_id
$$;
create function crossplay.read_model(p_actor jsonb,p_tournament text default null,p_scope text default 'public') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t crossplay.tournaments%rowtype; staff boolean; player uuid; payload jsonb;
begin
  if p_scope not in ('public','admin') then raise exception 'INVALID_SCOPE'; end if;
  if p_scope='admin' and not crossplay.is_organizer(p_actor) then raise exception 'FORBIDDEN'; end if;
  if p_tournament is null then
    return jsonb_build_object('tournaments',coalesce((select jsonb_agg(crossplay.tournament_json(id) order by created_at desc) from crossplay.tournaments
      where case when p_scope='admin' then crossplay.is_staff(p_actor,id) else status<>'draft' end),'[]'::jsonb));
  end if;
  select * into t from crossplay.tournaments where id::text=p_tournament or slug=p_tournament;
  if not found then raise exception 'NOT_FOUND'; end if;
  staff:=crossplay.is_staff(p_actor,t.id); player:=crossplay.session_entrant(p_actor,t.id);
  if (t.status='draft' or p_scope='admin') and not staff then raise exception 'NOT_FOUND'; end if;
  payload:=jsonb_build_object('tournament',crossplay.tournament_json(t.id),
    'entrants',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'seed',seed,'active',active) order by seed) from crossplay.entrants where tournament_id=t.id),'[]'::jsonb),
    'viewer',jsonb_build_object('isOrganizer',staff,'entrantId',player),'standings','[]'::jsonb,
    'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',r.number,'status',r.status,'engineVersion',r.engine_version,'inputHash',r.input_hash,
      'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'roundNumber',r.number,'tableNumber',m.table_number,'player1Id',s1.entrant_id,'player2Id',s2.entrant_id,
        'kind',m.kind,'status',m.status,'revision',m.revision,'result',v.result,
        'report',case when staff or player in (s1.entrant_id,s2.entrant_id) then case when p.id is null then null else jsonb_build_object('id',p.id,'revision',p.revision,'submittedBy',p.submitted_by,'raw1',p.raw1,'raw2',p.raw2,'overtime1',p.overtime1,'overtime2',p.overtime2,'disputeReason',p.dispute_reason) end else null end) order by m.table_number)
        from crossplay.matches m join crossplay.match_sides s1 on s1.tournament_id=m.tournament_id and s1.match_id=m.id and s1.side=1
        left join crossplay.match_sides s2 on s2.tournament_id=m.tournament_id and s2.match_id=m.id and s2.side=2
        left join crossplay.result_revisions v on v.tournament_id=m.tournament_id and v.match_id=m.id and v.id=m.official_revision_id
        left join crossplay.match_reports p on p.tournament_id=m.tournament_id and p.match_id=m.id and p.id=m.current_report_id
        where m.tournament_id=t.id and m.round_id=r.id),'[]'::jsonb)) order by r.number)
      from crossplay.rounds r where r.tournament_id=t.id and (staff or r.status<>'draft')),'[]'::jsonb));
  if staff then payload:=payload||jsonb_build_object('audit',coalesce((select jsonb_agg(jsonb_build_object('id',id,'action',action,'reason',reason,'createdAt',created_at) order by created_at desc) from crossplay.audit_events where tournament_id=t.id),'[]'::jsonb)); end if;
  return payload;
end $$;

-- This helper checks server-generated pairings again against authoritative database history.
create function crossplay.validate_pairs(p_tournament uuid,p_pairs jsonb) returns void language plpgsql set search_path='' as $$
declare n integer; assigned integer; byes integer; entry jsonb; p1 uuid; p2 uuid;
begin
  select count(*) into n from crossplay.entrants where tournament_id=p_tournament and active;
  if n<2 then raise exception 'INSUFFICIENT_PLAYERS'; end if;
  if jsonb_typeof(p_pairs) is distinct from 'array' or jsonb_array_length(p_pairs)<>(n+1)/2 then raise exception 'INCOMPLETE_PAIRINGS'; end if;
  select count(*),count(*) filter(where id is null) into assigned,byes from (
    select value->>'player1Id' id from jsonb_array_elements(p_pairs) union all select value->>'player2Id' from jsonb_array_elements(p_pairs)) s;
  if byes<>n%2 or assigned-byes<>n then raise exception 'INCOMPLETE_PAIRINGS'; end if;
  if (select count(distinct id) from (select value->>'player1Id' id from jsonb_array_elements(p_pairs) union all select value->>'player2Id' from jsonb_array_elements(p_pairs)) s where id is not null)<>n then raise exception 'DUPLICATE_ASSIGNMENT'; end if;
  for entry in select value from jsonb_array_elements(p_pairs) loop
    p1:=(entry->>'player1Id')::uuid; p2:=(entry->>'player2Id')::uuid;
    if p1 is null or not exists(select 1 from crossplay.entrants where tournament_id=p_tournament and id=p1 and active)
      or (p2 is not null and not exists(select 1 from crossplay.entrants where tournament_id=p_tournament and id=p2 and active)) then raise exception 'INVALID_ENTRANT'; end if;
    if p2 is null then
      if exists(select 1 from crossplay.match_sides s join crossplay.matches m on m.tournament_id=s.tournament_id and m.id=s.match_id
        join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id
        join crossplay.result_revisions v on v.tournament_id=m.tournament_id and v.match_id=m.id and v.id=m.official_revision_id
        where s.tournament_id=p_tournament and s.entrant_id=p1 and r.status<>'draft' and v.kind in ('bye','forfeit') and (v.result->>case s.side when 1 then 'points1' else 'points2' end)::integer=2) then raise exception 'REPEATED_BYE'; end if;
    elsif exists(select 1 from crossplay.match_sides a join crossplay.match_sides b on a.tournament_id=b.tournament_id and a.match_id=b.match_id and a.side<>b.side
      join crossplay.rounds r on r.tournament_id=a.tournament_id and r.id=a.round_id where a.tournament_id=p_tournament and a.entrant_id=p1 and b.entrant_id=p2 and r.status<>'draft') then raise exception 'REPEATED_OPPONENT';
    end if;
  end loop;
end $$;

create function crossplay.finalize_match(p_tournament uuid,p_match uuid,p_kind text,p_input jsonb,p_actor jsonb,p_reason text) returns void language plpgsql set search_path='' as $$
declare m crossplay.matches%rowtype; rules jsonb; computed jsonb; winner_side integer; rid uuid;
begin
  select * into strict m from crossplay.matches where tournament_id=p_tournament and id=p_match;
  select frozen_config into rules from crossplay.tournaments where id=p_tournament;
  rules:=rules||jsonb_build_object('roundingPolicy','completed_intervals','rulesVersion','crossplay-v1','winUnits',2,'drawUnits',1,'lossUnits',0);
  if p_kind='forfeit' then select side into winner_side from crossplay.match_sides where tournament_id=p_tournament and match_id=p_match and entrant_id=(p_input->>'winnerId')::uuid; end if;
  computed:=crossplay.calculate_result(p_kind,p_input,rules,winner_side);
  insert into crossplay.result_revisions(tournament_id,match_id,revision,kind,result,rules,actor,reason)
    values(p_tournament,p_match,m.revision+1,p_kind,computed,rules,p_actor,p_reason) returning id into rid;
  update crossplay.matches set kind=p_kind,status='final',revision=m.revision+1,official_revision_id=rid,current_report_id=null where tournament_id=p_tournament and id=p_match;
end $$;

create function crossplay.execute(p_actor jsonb,p_command text,p_payload jsonb,p_request_id uuid,p_expected_version bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare v_actor_key text; fingerprint text; prior crossplay.mutation_requests%rowtype; response jsonb:='{"ok":true}';
  t crossplay.tournaments%rowtype; m crossplay.matches%rowtype; r crossplay.rounds%rowtype; report crossplay.match_reports%rowtype; credential crossplay.entrant_credentials%rowtype;
  tid uuid; eid uuid; rid uuid; mid uuid; entry jsonb; cfg jsonb; player uuid; n integer; rounds_count integer; seq integer; name_value text; reason text; pairs jsonb;
  match_command boolean; admin_command boolean; changed boolean:=true;
begin
  if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_actor) is distinct from 'object' then raise exception 'INVALID_REQUEST'; end if;
  v_actor_key:=coalesce(p_actor->>'userId',p_actor->>'sessionHash','anonymous');
  fingerprint:=md5(case when p_payload ? '_requestHash' then jsonb_build_object('actor',p_actor,'command',p_command,'requestHash',p_payload->>'_requestHash')::text
    else jsonb_build_object('actor',p_actor,'command',p_command,'payload',p_payload,'expectedVersion',p_expected_version)::text end);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor_key||p_request_id::text,0));
  select * into prior from crossplay.mutation_requests where mutation_requests.actor_key=v_actor_key and request_id=p_request_id;
  if found then
    if prior.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_MISMATCH'; end if;
    return prior.response;
  end if;
  reason:=nullif(btrim(p_payload->>'reason'),'');
  if reason is not null and length(reason)>1000 then raise exception 'INVALID_REASON'; end if;
  match_command:=p_command in ('submit_report','confirm_report','dispute_report','finalize_result');
  admin_command:=p_command not in ('claim_invite','submit_report','confirm_report','dispute_report');
  if admin_command and not crossplay.is_organizer(p_actor) then raise exception 'FORBIDDEN'; end if;

  if p_command='claim_invite' then
    if p_payload->>'inviteHash' !~ '^[0-9a-f]{64}$' or p_payload->>'sessionHash' !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_INVITE'; end if;
    select * into credential from crossplay.entrant_credentials where invite_hash=p_payload->>'inviteHash' for update;
    if not found or credential.consumed_at is not null or credential.revoked_at is not null or credential.expires_at<=now() then raise exception 'INVALID_INVITE'; end if;
    select * into t from crossplay.tournaments where id=credential.tournament_id;
    if t.status in ('finished','archived') then raise exception 'TOURNAMENT_CLOSED'; end if;
    update crossplay.entrant_credentials set consumed_at=now() where id=credential.id;
    insert into crossplay.entrant_sessions(token_hash,tournament_id,entrant_id,credential_id,expires_at)
      values(p_payload->>'sessionHash',credential.tournament_id,credential.entrant_id,credential.id,now()+interval '30 days');
    response:=jsonb_build_object('tournamentId',t.id,'slug',t.slug,'entrantId',credential.entrant_id);
    changed:=false;
  elsif p_command='create_tournament' then
    cfg:=p_payload->'config'; perform crossplay.validate_config(cfg);
    insert into crossplay.tournaments(slug,name,event_date,config,seed)
      values(p_payload->>'slug',btrim(p_payload->>'name'),(p_payload->>'date')::date,cfg,p_payload->>'seed') returning * into t;
    tid:=t.id;
    insert into crossplay.tournament_staff values(tid,(p_actor->>'userId')::uuid,'owner');
    response:=jsonb_build_object('id',tid,'slug',t.slug);
  else
    tid:=(p_payload->>'tournamentId')::uuid;
    select * into t from crossplay.tournaments where id=tid for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if admin_command and not crossplay.is_staff(p_actor,tid) then raise exception 'FORBIDDEN'; end if;
    if not match_command and (p_expected_version is null or p_expected_version<>t.version) then raise exception 'STALE_VERSION'; end if;
    player:=crossplay.session_entrant(p_actor,tid);
    if not admin_command and player is null then raise exception 'FORBIDDEN'; end if;

    if p_command='copy_tournament' then
      insert into crossplay.tournaments(slug,name,event_date,config,seed)
        values(p_payload->>'slug',btrim(p_payload->>'name'),null,t.config,p_payload->>'seed') returning * into t;
      tid:=t.id;
      insert into crossplay.tournament_staff values(tid,(p_actor->>'userId')::uuid,'owner');
      response:=jsonb_build_object('id',tid,'slug',t.slug);
    elsif p_command='update_settings' then
      if t.status in ('finished','archived') then raise exception 'TOURNAMENT_CLOSED'; end if;
      cfg:=p_payload->'config'; perform crossplay.validate_config(cfg);
      if t.started_at is not null and cfg is distinct from t.frozen_config then raise exception 'RULES_LOCKED'; end if;
      update crossplay.tournaments set name=btrim(p_payload->>'name'),event_date=(p_payload->>'date')::date,config=cfg where id=tid;
    elsif p_command='add_entrants' then
      if t.started_at is not null or t.status<>'draft' then raise exception 'ROSTER_LOCKED'; end if;
      if jsonb_typeof(p_payload->'entrants') is distinct from 'array' or jsonb_array_length(p_payload->'entrants')<1 then raise exception 'INVALID_ENTRANTS'; end if;
      if (select count(*) from crossplay.entrants where tournament_id=tid)+jsonb_array_length(p_payload->'entrants')>256 then raise exception 'CAPACITY_EXCEEDED'; end if;
      for entry in select value from jsonb_array_elements(p_payload->'entrants') loop
        name_value:=pg_catalog.normalize(btrim(entry->>'name'),'NFKC');
        insert into crossplay.entrants(tournament_id,id,name,normalized_name,seed)
          values(tid,(entry->>'id')::uuid,name_value,crossplay.name_key(name_value),(entry->>'seed')::integer);
      end loop;
    elsif p_command='update_entrant' then
      if t.status in ('finished','archived') then raise exception 'TOURNAMENT_CLOSED'; end if;
      name_value:=pg_catalog.normalize(btrim(p_payload->>'name'),'NFKC');
      update crossplay.entrants set name=name_value,normalized_name=crossplay.name_key(name_value) where tournament_id=tid and id=(p_payload->>'entrantId')::uuid;
      if not found then raise exception 'NOT_FOUND'; end if;
    elsif p_command='remove_entrant' then
      if t.started_at is not null or t.status<>'draft' then raise exception 'ROSTER_LOCKED'; end if;
      delete from crossplay.rounds where tournament_id=tid and status='draft';
      delete from crossplay.entrants where tournament_id=tid and id=(p_payload->>'entrantId')::uuid;
      if not found then raise exception 'NOT_FOUND'; end if;
    elsif p_command='withdraw_entrant' then
      if t.status<>'active' then raise exception 'TOURNAMENT_NOT_ACTIVE'; end if;
      update crossplay.entrants set active=false where tournament_id=tid and id=(p_payload->>'entrantId')::uuid and active;
      if not found then raise exception 'NOT_FOUND'; end if;
    elsif p_command='generate_round' then
      if t.status not in ('draft','active') then raise exception 'TOURNAMENT_CLOSED'; end if;
      if t.corrections_only then raise exception 'CORRECTIONS_ONLY'; end if;
      if exists(select 1 from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id where m.tournament_id=tid and r.status<>'draft' and m.status<>'final') then raise exception 'UNRESOLVED_MATCHES'; end if;
      select count(*) into n from crossplay.entrants where tournament_id=tid and active;
      rounds_count:=coalesce((t.config->>'roundCount')::integer,ceil(log(2,greatest(n,2)))::integer);
      if t.started_at is null and rounds_count>(case when n%2=0 then n-1 else n end) then raise exception 'TOO_MANY_ROUNDS'; end if;
      seq:=(p_payload->>'roundNumber')::integer;
      if seq is null or seq<>coalesce((select max(number) from crossplay.rounds where tournament_id=tid and status<>'draft'),0)+1 or seq>rounds_count then raise exception 'INVALID_ROUND'; end if;
      pairs:=p_payload->'pairs'; perform crossplay.validate_pairs(tid,pairs);
      delete from crossplay.rounds where tournament_id=tid and status='draft';
      insert into crossplay.rounds(tournament_id,number,status,engine_version,input_hash,input_version,input_snapshot)
        values(tid,seq,'draft',p_payload->>'engineVersion',p_payload->>'inputHash',t.version+1,crossplay.read_model(p_actor,tid::text,'admin')) returning id into rid;
      n:=0;
      for entry in select value from jsonb_array_elements(pairs) loop
        n:=n+1;
        insert into crossplay.matches(tournament_id,round_id,table_number,kind) values(tid,rid,n,case when entry->>'player2Id' is null then 'bye' else 'played' end) returning id into mid;
        insert into crossplay.match_sides values(tid,rid,mid,1,(entry->>'player1Id')::uuid);
        if entry->>'player2Id' is not null then insert into crossplay.match_sides values(tid,rid,mid,2,(entry->>'player2Id')::uuid); end if;
      end loop;
      response:=response||jsonb_build_object('roundId',rid);
    elsif p_command='publish_round' then
      if t.status not in ('draft','active') then raise exception 'TOURNAMENT_CLOSED'; end if;
      select * into r from crossplay.rounds where tournament_id=tid and id=(p_payload->>'roundId')::uuid and status='draft';
      if not found or r.input_version<>t.version then raise exception 'STALE_PAIRINGS'; end if;
      if exists(select 1 from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id where m.tournament_id=tid and r.status<>'draft' and m.status<>'final') then raise exception 'UNRESOLVED_MATCHES'; end if;
      select jsonb_agg(jsonb_build_object('player1Id',a.entrant_id,'player2Id',b.entrant_id)) into pairs from crossplay.matches m
        join crossplay.match_sides a on a.tournament_id=m.tournament_id and a.match_id=m.id and a.side=1
        left join crossplay.match_sides b on b.tournament_id=m.tournament_id and b.match_id=m.id and b.side=2 where m.tournament_id=tid and m.round_id=r.id;
      perform crossplay.validate_pairs(tid,pairs);
      if t.started_at is null then
        select count(*) into n from crossplay.entrants where tournament_id=tid and active;
        cfg:=t.config||jsonb_build_object('roundCount',coalesce((t.config->>'roundCount')::integer,ceil(log(2,n))::integer));
        update crossplay.tournaments set status='active',config=cfg,frozen_config=cfg,started_at=now() where id=tid;
      end if;
      update crossplay.rounds set status='completed' where tournament_id=tid and status='published';
      update crossplay.rounds set status='published',published_at=now() where tournament_id=tid and id=r.id;
      for m in select * from crossplay.matches where tournament_id=tid and round_id=r.id and kind='bye' loop
        perform crossplay.finalize_match(tid,m.id,'bye','{}',p_actor,null);
      end loop;
    elsif match_command then
      if t.status<>'active' then raise exception 'TOURNAMENT_NOT_ACTIVE'; end if;
      select * into m from crossplay.matches where tournament_id=tid and id=(p_payload->>'matchId')::uuid for update;
      if not found then raise exception 'NOT_FOUND'; end if;
      if (p_payload->>'expectedRevision')::integer is distinct from m.revision then raise exception 'STALE_REVISION'; end if;
      if not exists(select 1 from crossplay.rounds where tournament_id=tid and id=m.round_id and status<>'draft') or m.kind='bye' then raise exception 'INVALID_MATCH'; end if;
      if not admin_command and not exists(select 1 from crossplay.match_sides where tournament_id=tid and match_id=m.id and entrant_id=player) then raise exception 'FORBIDDEN'; end if;
      if p_command='submit_report' then
        if m.status not in ('unreported','awaiting_confirmation') then raise exception 'RESULT_LOCKED'; end if;
        perform crossplay.calculate_result('played',p_payload,t.frozen_config);
        insert into crossplay.match_reports(tournament_id,match_id,revision,submitted_by,raw1,raw2,overtime1,overtime2)
          values(tid,m.id,m.revision+1,player,(p_payload->>'raw1')::integer,(p_payload->>'raw2')::integer,(p_payload->>'overtime1')::integer,(p_payload->>'overtime2')::integer) returning id into rid;
        update crossplay.matches set current_report_id=rid,revision=m.revision+1,status='awaiting_confirmation' where tournament_id=tid and id=m.id;
      elsif p_command in ('confirm_report','dispute_report') then
        if m.status<>'awaiting_confirmation' or (p_payload->>'reportId')::uuid is distinct from m.current_report_id then raise exception 'STALE_REPORT'; end if;
        select * into strict report from crossplay.match_reports where tournament_id=tid and match_id=m.id and id=m.current_report_id;
        if report.submitted_by=player then raise exception 'OPPONENT_REQUIRED'; end if;
        if p_command='confirm_report' then
          perform crossplay.finalize_match(tid,m.id,'played',jsonb_build_object('raw1',report.raw1,'raw2',report.raw2,'overtime1',report.overtime1,'overtime2',report.overtime2),p_actor,null);
        else
          if reason is null then raise exception 'REASON_REQUIRED'; end if;
          update crossplay.match_reports set dispute_reason=reason where tournament_id=tid and match_id=m.id and id=report.id;
          update crossplay.matches set status='disputed',revision=m.revision+1 where tournament_id=tid and id=m.id;
        end if;
      else
        if p_payload->>'kind' not in ('played','forfeit','double_forfeit') or p_payload->>'kind' is null then raise exception 'INVALID_OUTCOME'; end if;
        if (m.status in ('final','disputed') or p_payload->>'kind'<>'played') and reason is null then raise exception 'REASON_REQUIRED'; end if;
        perform crossplay.finalize_match(tid,m.id,p_payload->>'kind',p_payload,p_actor,reason);
      end if;
    elsif p_command='finish_tournament' then
      if t.status<>'active' then raise exception 'TOURNAMENT_NOT_ACTIVE'; end if;
      if exists(select 1 from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id where m.tournament_id=tid and r.status<>'draft' and m.status<>'final') then raise exception 'UNRESOLVED_MATCHES'; end if;
      if coalesce((select max(number) from crossplay.rounds where tournament_id=tid and status<>'draft'),0)<(t.frozen_config->>'roundCount')::integer and reason is null then raise exception 'EARLY_FINISH_REASON_REQUIRED'; end if;
      update crossplay.tournaments set status='finished',finished_at=now() where id=tid;
      update crossplay.rounds set status='completed' where tournament_id=tid and status='published';
    elsif p_command='reopen_tournament' then
      if t.status<>'finished' then raise exception 'TOURNAMENT_NOT_FINISHED'; end if;
      if reason is null then raise exception 'REASON_REQUIRED'; end if;
      update crossplay.tournaments set status='active',finished_at=null,corrections_only=true where id=tid;
    elsif p_command='archive_tournament' then
      if t.status<>'finished' then raise exception 'TOURNAMENT_NOT_FINISHED'; end if;
      update crossplay.tournaments set status='archived' where id=tid;
    elsif p_command='issue_invite' then
      if t.status in ('finished','archived') then raise exception 'TOURNAMENT_CLOSED'; end if;
      eid:=(p_payload->>'entrantId')::uuid;
      if not exists(select 1 from crossplay.entrants where tournament_id=tid and id=eid) then raise exception 'NOT_FOUND'; end if;
      update crossplay.entrant_credentials set revoked_at=now() where tournament_id=tid and entrant_id=eid and revoked_at is null;
      update crossplay.entrant_sessions set revoked_at=now() where tournament_id=tid and entrant_id=eid and revoked_at is null;
      insert into crossplay.entrant_credentials(tournament_id,entrant_id,invite_hash,expires_at) values(tid,eid,p_payload->>'inviteHash',now()+interval '7 days');
      update crossplay.rounds set input_version=t.version+1 where tournament_id=tid and status='draft';
    else raise exception 'UNKNOWN_COMMAND';
    end if;
  end if;

  if changed then
    if p_command not in ('generate_round','publish_round','issue_invite') then delete from crossplay.rounds where tournament_id=tid and status='draft'; end if;
    update crossplay.tournaments set version=version+1 where id=tid;
    insert into crossplay.audit_events(tournament_id,action,actor,reason,details) values(tid,p_command,
      case when p_actor ? 'sessionHash' then jsonb_build_object('entrantId',player) else p_actor end,reason,
      jsonb_build_object('matchId',p_payload->>'matchId','entrantId',p_payload->>'entrantId'));
  end if;
  insert into crossplay.mutation_requests(actor_key,request_id,fingerprint,response) values(v_actor_key,p_request_id,fingerprint,response);
  return response;
end $$;

create function crossplay.consume_rate_limit(p_key text,p_limit integer,p_window_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare hits integer;
begin
  if length(p_key) not between 1 and 200 or p_limit not between 1 and 1000 or p_window_seconds not between 1 and 86400 then raise exception 'INVALID_RATE_LIMIT'; end if;
  insert into crossplay.rate_limits as limits(key,hits,ends_at) values(p_key,1,clock_timestamp()+make_interval(secs=>p_window_seconds))
    on conflict(key) do update set hits=case when limits.ends_at<=clock_timestamp() then 1 else limits.hits+1 end,
      ends_at=case when limits.ends_at<=clock_timestamp() then clock_timestamp()+make_interval(secs=>p_window_seconds) else limits.ends_at end returning limits.hits into hits;
  delete from crossplay.rate_limits where ends_at<clock_timestamp()-interval '1 day';
  return hits<=p_limit;
end $$;

do $$ declare obj record; begin
  for obj in select tablename from pg_catalog.pg_tables where schemaname='crossplay' loop
    execute format('alter table crossplay.%I enable row level security',obj.tablename);
    execute format('revoke all on crossplay.%I from public,anon,authenticated,service_role,crossplay_runtime',obj.tablename);
  end loop;
  for obj in select p.oid::regprocedure signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='crossplay' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role,crossplay_runtime',obj.signature);
  end loop;
end $$;
grant execute on function crossplay.schema_version(),crossplay.read_model(jsonb,text,text),crossplay.execute(jsonb,text,jsonb,uuid,bigint),crossplay.consume_rate_limit(text,integer,integer) to crossplay_runtime;
alter default privileges in schema crossplay revoke execute on functions from public;
alter default privileges in schema crossplay revoke all on tables from public,anon,authenticated,service_role;

