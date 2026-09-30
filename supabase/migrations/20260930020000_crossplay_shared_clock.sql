-- Additive capability; the base schema_version remains compatible with the deployed app.
create table crossplay.match_starts (
  tournament_id uuid not null, match_id uuid not null, entrant_id uuid not null,
  method text not null check(method in ('fewer_firsts','more_seconds','random','organizer')),
  counts jsonb not null, played boolean not null default false,
  created_at timestamptz not null default now(), corrected_at timestamptz,
  primary key(tournament_id,match_id),
  foreign key(tournament_id,match_id) references crossplay.matches(tournament_id,id) on delete cascade,
  foreign key(tournament_id,entrant_id) references crossplay.entrants(tournament_id,id)
);
create table crossplay.match_start_accounting (
  tournament_id uuid not null, match_id uuid not null, entrant_id uuid not null,
  position text not null check(position in ('first','second')),
  source text not null check(source in ('played','unplayed_forfeit')),
  primary key(tournament_id,match_id,entrant_id),
  foreign key(tournament_id,match_id) references crossplay.matches(tournament_id,id) on delete cascade,
  foreign key(tournament_id,entrant_id) references crossplay.entrants(tournament_id,id)
);
create table crossplay.match_credentials (
  id uuid primary key default gen_random_uuid(), tournament_id uuid not null, match_id uuid not null,
  invite_hash text not null unique check(invite_hash ~ '^[0-9a-f]{64}$'),
  consumed_at timestamptz, revoked_at timestamptz, expires_at timestamptz not null,
  unique(tournament_id,match_id,id),
  foreign key(tournament_id,match_id) references crossplay.matches(tournament_id,id) on delete cascade
);
create table crossplay.match_sessions (
  token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
  tournament_id uuid not null, match_id uuid not null, credential_id uuid not null,
  revoked_at timestamptz, expires_at timestamptz not null,
  foreign key(tournament_id,match_id,credential_id) references crossplay.match_credentials(tournament_id,match_id,id) on delete cascade
);
create table crossplay.match_clock_sessions (
  tournament_id uuid not null, match_id uuid not null,
  rules jsonb not null,
  status text not null default 'ready' check(status in ('ready','running','paused','ended')),
  active_side integer not null check(active_side in (1,2)),
  used_ms1 bigint not null default 0 check(used_ms1>=0), used_ms2 bigint not null default 0 check(used_ms2>=0),
  anchor_at_ms bigint, epoch bigint not null default 1, sequence bigint not null default 0, version bigint not null default 0,
  controller_id uuid, controller_actor text,
  report_submitted boolean not null default false, review_required boolean not null default false,
  started_at timestamptz, ended_at timestamptz,
  primary key(tournament_id,match_id),
  foreign key(tournament_id,match_id) references crossplay.matches(tournament_id,id) on delete cascade
);
create table crossplay.match_clock_events (
  tournament_id uuid not null, match_id uuid not null, epoch bigint not null, sequence bigint not null,
  event jsonb not null, accepted_at timestamptz not null default now(),
  primary key(tournament_id,match_id,epoch,sequence),
  foreign key(tournament_id,match_id) references crossplay.match_clock_sessions(tournament_id,match_id)
);
create table crossplay.match_report_clocks (
  tournament_id uuid not null, match_id uuid not null, report_id uuid not null,
  clock_version bigint not null, confirmation_method text not null default 'shared_device' check(confirmation_method='shared_device'),
  acknowledged1 boolean not null default false, acknowledged2 boolean not null default false,
  primary key(tournament_id,match_id,report_id),
  foreign key(tournament_id,match_id,report_id) references crossplay.match_reports(tournament_id,match_id,id)
);

create function crossplay.clock_version() returns text language sql security definer set search_path='' as $$ select '20260930020000'::text $$;
create function crossplay.match_session_valid(p_actor jsonb,p_tid uuid,p_mid uuid) returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from crossplay.match_sessions s join crossplay.match_credentials c on c.id=s.credential_id
    where s.token_hash=p_actor->>'matchSessionHash' and s.tournament_id=p_tid and s.match_id=p_mid
    and s.revoked_at is null and s.expires_at>now() and c.revoked_at is null and c.expires_at>now())
$$;

create function crossplay.resolve_match_start(p_tid uuid,p_mid uuid) returns void language plpgsql set search_path='' as $$
declare a uuid; b uuid; starter uuid; method text; round_number integer; f1 integer; s1 integer; f2 integer; s2 integer;
begin
  if exists(select 1 from crossplay.match_starts where tournament_id=p_tid and match_id=p_mid) then return; end if;
  select side.entrant_id into a from crossplay.match_sides side where tournament_id=p_tid and match_id=p_mid and side=1;
  select side.entrant_id into b from crossplay.match_sides side where tournament_id=p_tid and match_id=p_mid and side=2;
  if a is null or b is null then raise exception 'INVALID_MATCH'; end if;
  select r.number into round_number from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id where m.tournament_id=p_tid and m.id=p_mid;
  if exists(select 1 from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id
    where m.tournament_id=p_tid and r.number<round_number and r.status<>'draft' and m.kind='played' and m.status='final'
    and exists(select 1 from crossplay.match_sides side where side.tournament_id=p_tid and side.match_id=m.id and side.entrant_id in (a,b))
    and not exists(select 1 from crossplay.match_starts start where start.tournament_id=p_tid and start.match_id=m.id and start.played)) then
    raise exception 'START_HISTORY_REQUIRED';
  end if;
  select count(*) filter(where h.entrant_id=a and h.position='first'),count(*) filter(where h.entrant_id=a and h.position='second'),
    count(*) filter(where h.entrant_id=b and h.position='first'),count(*) filter(where h.entrant_id=b and h.position='second')
    into f1,s1,f2,s2 from crossplay.match_start_accounting h join crossplay.matches m on m.tournament_id=h.tournament_id and m.id=h.match_id
    join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id where h.tournament_id=p_tid and r.number<round_number;
  if f1<>f2 then starter:=case when f1<f2 then a else b end; method:='fewer_firsts';
  elsif s1<>s2 then starter:=case when s1>s2 then a else b end; method:='more_seconds';
  else
    -- gen_random_uuid uses cryptographic randomness; its first byte is unrestricted.
    starter:=case when get_byte(decode(replace(gen_random_uuid()::text,'-',''),'hex'),0)%2=0 then a else b end; method:='random';
  end if;
  insert into crossplay.match_starts(tournament_id,match_id,entrant_id,method,counts)
    values(p_tid,p_mid,starter,method,jsonb_build_object('firsts1',f1,'seconds1',s1,'firsts2',f2,'seconds2',s2));
end $$;
create function crossplay.record_played_start(p_tid uuid,p_mid uuid) returns void language plpgsql set search_path='' as $$
begin
  update crossplay.match_starts set played=true where tournament_id=p_tid and match_id=p_mid;
  if not found then raise exception 'START_HISTORY_REQUIRED'; end if;
  delete from crossplay.match_start_accounting where tournament_id=p_tid and match_id=p_mid;
  insert into crossplay.match_start_accounting(tournament_id,match_id,entrant_id,position,source)
    select p_tid,p_mid,s.entrant_id,case when s.entrant_id=start.entrant_id then 'first' else 'second' end,'played'
    from crossplay.match_sides s join crossplay.match_starts start on start.tournament_id=s.tournament_id and start.match_id=s.match_id
    where s.tournament_id=p_tid and s.match_id=p_mid;
end $$;

create function crossplay.clock_read(p_actor jsonb,p_match_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare m crossplay.matches%rowtype; c crossplay.match_clock_sessions%rowtype; t crossplay.tournaments%rowtype;
  staff boolean; shared boolean; player uuid; state jsonb; report jsonb; actor_key text;
begin
  select * into m from crossplay.matches where id=p_match_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  staff:=crossplay.is_staff(p_actor,m.tournament_id); shared:=crossplay.match_session_valid(p_actor,m.tournament_id,m.id);
  player:=crossplay.session_entrant(p_actor,m.tournament_id);
  if not staff and not shared and not exists(select 1 from crossplay.match_sides where tournament_id=m.tournament_id and match_id=m.id and entrant_id=player) then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from crossplay.rounds where tournament_id=m.tournament_id and id=m.round_id and status<>'draft') or m.kind='bye' then raise exception 'INVALID_MATCH'; end if;
  select * into t from crossplay.tournaments where id=m.tournament_id;
  select * into c from crossplay.match_clock_sessions where tournament_id=m.tournament_id and match_id=m.id;
  actor_key:=coalesce(p_actor->>'userId',p_actor->>'matchSessionHash');
  if found then state:=jsonb_build_object('status',c.status,'activeSide',c.active_side,'usedMs',jsonb_build_array(c.used_ms1,c.used_ms2),
    'anchorAtMs',c.anchor_at_ms,'epoch',c.epoch,'sequence',c.sequence,'version',c.version,'reportSubmitted',c.report_submitted,'reviewRequired',c.review_required); end if;
  select jsonb_build_object('id',r.id,'revision',r.revision,'raw1',r.raw1,'raw2',r.raw2,'overtime1',r.overtime1,'overtime2',r.overtime2,
    'adjusted1',r.raw1-(r.overtime1/(t.frozen_config->>'penaltyIntervalSeconds')::integer)*(t.frozen_config->>'penaltyPoints')::integer,
    'adjusted2',r.raw2-(r.overtime2/(t.frozen_config->>'penaltyIntervalSeconds')::integer)*(t.frozen_config->>'penaltyPoints')::integer,
    'acknowledgedSides',(case when rc.acknowledged1 then '[1]'::jsonb else '[]'::jsonb end)||(case when rc.acknowledged2 then '[2]'::jsonb else '[]'::jsonb end),
    'confirmationMethod',rc.confirmation_method,'clockVersion',rc.clock_version,'disputeReason',r.dispute_reason) into report
    from crossplay.match_reports r join crossplay.match_report_clocks rc on rc.tournament_id=r.tournament_id and rc.match_id=r.match_id and rc.report_id=r.id
    where r.tournament_id=m.tournament_id and r.match_id=m.id and (r.id=m.current_report_id or m.status='final') order by r.revision desc limit 1;
  return jsonb_build_object('tournamentId',t.id,'matchId',m.id,'tournamentName',t.name,'roundNumber',(select number from crossplay.rounds where tournament_id=t.id and id=m.round_id),
    'tableNumber',m.table_number,'matchStatus',m.status,'matchRevision',m.revision,
    'players',(select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'side',s.side) order by s.side) from crossplay.match_sides s join crossplay.entrants e on e.tournament_id=s.tournament_id and e.id=s.entrant_id where s.tournament_id=t.id and s.match_id=m.id),
    'rules',coalesce(c.rules,t.frozen_config,t.config),'state',state,'controllerId',c.controller_id,
    'start',(select jsonb_build_object('entrantId',start.entrant_id,'side',s.side,'method',start.method,'counts',start.counts,'played',start.played)
      from crossplay.match_starts start join crossplay.match_sides s on s.tournament_id=start.tournament_id and s.match_id=start.match_id and s.entrant_id=start.entrant_id where start.tournament_id=t.id and start.match_id=m.id),
    'report',report,'result',(select result from crossplay.result_revisions where tournament_id=t.id and match_id=m.id and id=m.official_revision_id),
    'officialConfirmationMethod',(select case when rr.actor->>'confirmationMethod'='shared_device' then 'shared_device' when rr.actor ? 'userId' then 'organizer' else 'individual' end
      from crossplay.result_revisions rr where rr.tournament_id=t.id and rr.match_id=m.id and rr.id=m.official_revision_id),
    'canControl',(staff or shared) and (c.controller_actor is null or c.controller_actor=actor_key), 'isOrganizer',staff,
    'serverNowMs',floor(extract(epoch from statement_timestamp())*1000)::bigint);
end $$;

-- Existing callers continue through the same result machinery. The hook only adds accounting
-- and closes an existing clock; it does not change point/differential calculation.
alter function crossplay.finalize_match(uuid,uuid,text,jsonb,jsonb,text) rename to finalize_match_base;
create function crossplay.finalize_match(p_tournament uuid,p_match uuid,p_kind text,p_input jsonb,p_actor jsonb,p_reason text) returns void
language plpgsql set search_path='' as $$
declare entry record; n integer; current_round integer; played boolean;
begin
  select coalesce((select start.played from crossplay.match_starts start where tournament_id=p_tournament and match_id=p_match),false) into played;
  select r.number into current_round from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id where m.tournament_id=p_tournament and m.id=p_match;
  if not played then
    delete from crossplay.match_start_accounting where tournament_id=p_tournament and match_id=p_match;
    if p_kind in ('forfeit','double_forfeit') then
      for entry in select entrant_id from crossplay.match_sides where tournament_id=p_tournament and match_id=p_match and (p_kind='double_forfeit' or entrant_id is distinct from (p_input->>'winnerId')::uuid) loop
        select count(*) into n from crossplay.match_start_accounting h join crossplay.matches m on m.tournament_id=h.tournament_id and m.id=h.match_id
          join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id where h.tournament_id=p_tournament and h.entrant_id=entry.entrant_id and h.source='unplayed_forfeit' and r.number<current_round;
        insert into crossplay.match_start_accounting values(p_tournament,p_match,entry.entrant_id,case when n%2=0 then 'first' else 'second' end,'unplayed_forfeit');
      end loop;
    end if;
  end if;
  perform crossplay.finalize_match_base(p_tournament,p_match,p_kind,p_input,p_actor,p_reason);
  update crossplay.match_clock_sessions set status='ended',anchor_at_ms=null,ended_at=coalesce(ended_at,now()),report_submitted=true,
    version=version+case when status<>'ended' then 1 else 0 end,review_required=case when status='running' then true else review_required end
    where tournament_id=p_tournament and match_id=p_match;
end $$;

alter function crossplay.execute(jsonb,text,jsonb,uuid,bigint) rename to execute_base;
create function crossplay.execute(p_actor jsonb,p_command text,p_payload jsonb,p_request_id uuid,p_expected_version bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  -- Serialize the clock/manual choice with clock creation before checking which path applies.
  -- A check before taking this lock could miss an uncommitted clock, then submit manually.
  if p_command in ('submit_report','confirm_report','dispute_report','finalize_result') then
    perform 1 from crossplay.tournaments where id=(p_payload->>'tournamentId')::uuid for update;
  end if;
  if p_command in ('submit_report','confirm_report','dispute_report','finalize_result') and exists(select 1 from crossplay.match_clock_sessions
    where tournament_id=(p_payload->>'tournamentId')::uuid and match_id=(p_payload->>'matchId')::uuid) then
    if p_command<>'finalize_result' then raise exception 'CLOCK_REPORT_REQUIRED'; end if;
    if nullif(btrim(p_payload->>'reason'),'') is null then raise exception 'REASON_REQUIRED'; end if;
  end if;
  return crossplay.execute_base(p_actor,p_command,p_payload,p_request_id,p_expected_version);
end $$;

create function crossplay.clock_execute(p_actor jsonb,p_command text,p_payload jsonb,p_request_id uuid,p_expected_clock_version bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tid uuid; mid uuid; t crossplay.tournaments%rowtype; m crossplay.matches%rowtype; c crossplay.match_clock_sessions%rowtype;
  credential crossplay.match_credentials%rowtype; report crossplay.match_reports%rowtype; meta crossplay.match_report_clocks%rowtype;
  prior crossplay.mutation_requests%rowtype; v_actor_key text; v_fingerprint text; staff boolean; shared boolean;
  event jsonb; kind text; elapsed bigint; at_ms bigint; v_side integer; reason text; response jsonb; rid uuid; eid uuid;
  raw1 integer; raw2 integer; overtime1 integer; overtime2 integer; result_change boolean:=false; starter_side integer; audit_actor jsonb;
begin
  if p_request_id is null or jsonb_typeof(p_actor) is distinct from 'object' or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'INVALID_REQUEST'; end if;
  v_actor_key:=coalesce(p_actor->>'userId',p_actor->>'matchSessionHash','anonymous');
  v_fingerprint:=md5(jsonb_build_object('actor',p_actor,'command',p_command,'payload',p_payload,'version',p_expected_clock_version)::text);
  perform pg_advisory_xact_lock(hashtextextended('clock:'||v_actor_key||p_request_id::text,0));
  if p_command='claim_match_link' then
    if coalesce(p_payload->>'inviteHash','') !~ '^[0-9a-f]{64}$' or coalesce(p_payload->>'sessionHash','') !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_INVITE'; end if;
    select * into credential from crossplay.match_credentials where invite_hash=p_payload->>'inviteHash';
    if not found or credential.revoked_at is not null or credential.expires_at<=now() then raise exception 'INVALID_INVITE'; end if;
    mid:=credential.match_id; tid:=credential.tournament_id;
    if p_payload->>'matchId' is not null and (p_payload->>'matchId')::uuid<>mid then raise exception 'FORBIDDEN'; end if;
  else
    mid:=(p_payload->>'matchId')::uuid;
    select tournament_id into tid from crossplay.matches where id=mid;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;
  -- Use the same lock order as the existing result commands to avoid deadlocks.
  select * into t from crossplay.tournaments where id=tid for update;
  select * into m from crossplay.matches where tournament_id=tid and id=mid for update;
  if p_command='claim_match_link' then
    select * into credential from crossplay.match_credentials where invite_hash=p_payload->>'inviteHash' for update;
    if credential.revoked_at is not null or credential.expires_at<=now() then raise exception 'INVALID_INVITE'; end if;
  end if;
  staff:=crossplay.is_staff(p_actor,tid); shared:=crossplay.match_session_valid(p_actor,tid,mid);
  if p_command<>'claim_match_link' and not staff and not shared then raise exception 'FORBIDDEN'; end if;
  if p_command in ('issue_match_link','revoke_match_link','takeover_clock','correct_clock','correct_starter','record_manual_start') and not staff then raise exception 'FORBIDDEN'; end if;
  select * into prior from crossplay.mutation_requests where mutation_requests.actor_key='clock:'||v_actor_key and request_id=p_request_id;
  if found then if prior.fingerprint<>v_fingerprint then raise exception 'IDEMPOTENCY_MISMATCH'; end if; return prior.response; end if;
  if not exists(select 1 from crossplay.rounds where tournament_id=tid and id=m.round_id and status<>'draft') or m.kind='bye' then raise exception 'INVALID_MATCH'; end if;
  if t.status<>'active' then raise exception 'TOURNAMENT_NOT_ACTIVE'; end if;
  reason:=nullif(btrim(p_payload->>'reason'),'');
  if length(reason)>1000 then raise exception 'INVALID_REASON'; end if;
  if p_command in ('revoke_match_link','takeover_clock','correct_clock','correct_starter','record_manual_start') and reason is null then raise exception 'REASON_REQUIRED'; end if;
  audit_actor:=case when staff then jsonb_build_object('userId',p_actor->>'userId') else jsonb_build_object('matchId',mid,'confirmationMethod','shared_device') end;
  select * into c from crossplay.match_clock_sessions where tournament_id=tid and match_id=mid for update;

  if p_command='issue_match_link' then
    if m.status='final' or t.frozen_config->>'timeLimitSeconds' is null then raise exception 'CLOCK_UNAVAILABLE'; end if;
    update crossplay.match_credentials set revoked_at=now() where tournament_id=tid and match_id=mid and revoked_at is null;
    update crossplay.match_sessions set revoked_at=now() where tournament_id=tid and match_id=mid and revoked_at is null;
    insert into crossplay.match_credentials(tournament_id,match_id,invite_hash,expires_at) values(tid,mid,p_payload->>'inviteHash',now()+interval '7 days');
    if c.match_id is not null and c.controller_actor is not null then
      update crossplay.match_clock_sessions set controller_actor=null,controller_id=null,epoch=epoch+1,sequence=0,version=version+1,
        status=case when status='running' then 'paused' else status end,anchor_at_ms=null,review_required=true where tournament_id=tid and match_id=mid;
    end if;
    response:=jsonb_build_object('matchId',mid,'tournamentId',tid);
  elsif p_command='claim_match_link' then
    if credential.consumed_at is not null then raise exception 'INVALID_INVITE'; end if;
    update crossplay.match_credentials set consumed_at=now() where id=credential.id;
    insert into crossplay.match_sessions(token_hash,tournament_id,match_id,credential_id,expires_at) values(p_payload->>'sessionHash',tid,mid,credential.id,credential.expires_at);
    response:=crossplay.clock_read(jsonb_build_object('matchSessionHash',p_payload->>'sessionHash'),mid);
  elsif p_command='claim_clock' then
    if (c.match_id is null and m.status<>'unreported') or m.status not in ('unreported','awaiting_confirmation','disputed') or t.frozen_config->>'timeLimitSeconds' is null then raise exception 'CLOCK_UNAVAILABLE'; end if;
    if (p_payload->>'controllerId')::uuid is null then raise exception 'INVALID_CONTROLLER'; end if;
    if c.match_id is not null and c.controller_actor is not null and (c.controller_actor<>v_actor_key or c.controller_id is distinct from (p_payload->>'controllerId')::uuid) then raise exception 'CONTROLLER_CONFLICT'; end if;
    perform crossplay.resolve_match_start(tid,mid);
    select s.side into starter_side from crossplay.match_sides s join crossplay.match_starts start on start.tournament_id=s.tournament_id and start.match_id=s.match_id and start.entrant_id=s.entrant_id where s.tournament_id=tid and s.match_id=mid;
    insert into crossplay.match_clock_sessions(tournament_id,match_id,rules,active_side,controller_id,controller_actor)
      values(tid,mid,t.frozen_config,starter_side,(p_payload->>'controllerId')::uuid,v_actor_key)
      on conflict(tournament_id,match_id) do update set controller_id=excluded.controller_id,controller_actor=excluded.controller_actor;
  elsif p_command='append_events' then
    if c.match_id is null or c.controller_actor is distinct from v_actor_key or c.controller_id is distinct from (p_payload->>'controllerId')::uuid then raise exception 'CONTROLLER_CONFLICT'; end if;
    if (p_payload->>'epoch')::bigint is distinct from c.epoch then raise exception 'STALE_EPOCH'; end if;
    if p_expected_clock_version is distinct from c.version then raise exception 'STALE_CLOCK_VERSION'; end if;
    if c.report_submitted or m.status<>'unreported' then raise exception 'RESULT_LOCKED'; end if;
    if jsonb_typeof(p_payload->'events') is distinct from 'array' or jsonb_array_length(p_payload->'events') not between 1 and 100 then raise exception 'INVALID_EVENTS'; end if;
    for event in select value from jsonb_array_elements(p_payload->'events') loop
      if jsonb_typeof(event) is distinct from 'object' or coalesce(event->>'sequence','') !~ '^[0-9]+$' or (event->>'sequence')::bigint<>c.sequence+1 then raise exception 'INVALID_SEQUENCE'; end if;
      if coalesce(event->>'elapsedMs','') !~ '^[0-9]+$' or coalesce(event->>'atMs','') !~ '^[0-9]+$' then raise exception 'INVALID_TIME'; end if;
      elapsed:=(event->>'elapsedMs')::bigint; at_ms:=(event->>'atMs')::bigint; kind:=event->>'kind'; v_side:=(event->>'side')::integer;
      if elapsed>172800000 or at_ms>9007199254740991 then raise exception 'INVALID_TIME'; end if;
      if c.review_required then raise exception 'TIMING_REVIEW_REQUIRED'; end if;
      if kind='start' then
        if c.status<>'ready' or elapsed<>0 or (v_side is not null and v_side<>c.active_side) then raise exception 'INVALID_TRANSITION'; end if;
        c.status:='running'; c.started_at:=now(); perform crossplay.record_played_start(tid,mid);
      elsif kind='resume' then
        if c.status not in ('paused','ended') or elapsed<>0 then raise exception 'INVALID_TRANSITION'; end if;
        c.status:='running'; c.ended_at:=null;
      elsif kind in ('switch','pause','end','recover') then
        if kind='switch' and (c.status<>'running' or v_side is distinct from c.active_side) then raise exception 'INVALID_TRANSITION'; end if;
        if kind='pause' and c.status<>'running' then raise exception 'INVALID_TRANSITION'; end if;
        if kind='end' and c.status not in ('running','paused') then raise exception 'INVALID_TRANSITION'; end if;
        if kind='recover' and c.status='ready' then raise exception 'INVALID_TRANSITION'; end if;
        if c.status='running' then
          if c.active_side=1 then c.used_ms1:=c.used_ms1+elapsed; else c.used_ms2:=c.used_ms2+elapsed; end if;
        elsif elapsed<>0 then raise exception 'INVALID_TIME'; end if;
        if kind='switch' then c.active_side:=3-c.active_side;
        elsif kind='pause' then c.status:='paused';
        elsif kind='end' then c.status:='ended'; c.ended_at:=now(); end if;
      else raise exception 'INVALID_TRANSITION'; end if;
      if c.used_ms1>(c.rules->>'timeLimitSeconds')::bigint*1000+86400999 or c.used_ms2>(c.rules->>'timeLimitSeconds')::bigint*1000+86400999 then raise exception 'INVALID_TIME'; end if;
      c.review_required:=c.review_required or coalesce((event->>'reviewRequired')::boolean,false);
      c.anchor_at_ms:=case when c.status='running' then at_ms else null end; c.sequence:=c.sequence+1; c.version:=c.version+1;
      insert into crossplay.match_clock_events values(tid,mid,c.epoch,c.sequence,event,now());
    end loop;
    update crossplay.match_clock_sessions set status=c.status,active_side=c.active_side,used_ms1=c.used_ms1,used_ms2=c.used_ms2,anchor_at_ms=c.anchor_at_ms,
      sequence=c.sequence,version=c.version,review_required=c.review_required,started_at=c.started_at,ended_at=c.ended_at where tournament_id=tid and match_id=mid;
  elsif p_command='submit_shared_report' then
    if not shared then raise exception 'FORBIDDEN'; end if;
    if m.status not in ('unreported','awaiting_confirmation') then raise exception 'RESULT_LOCKED'; end if;
    if (p_payload->>'expectedRevision')::integer is distinct from m.revision then raise exception 'STALE_REVISION'; end if;
    if c.match_id is null or c.status<>'ended' then raise exception 'CLOCK_NOT_ENDED'; end if;
    if c.review_required then raise exception 'TIMING_REVIEW_REQUIRED'; end if;
    if (p_payload->>'clockVersion')::bigint is distinct from c.version then raise exception 'STALE_CLOCK_VERSION'; end if;
    overtime1:=greatest(0,c.used_ms1-(c.rules->>'timeLimitSeconds')::bigint*1000)/1000;
    overtime2:=greatest(0,c.used_ms2-(c.rules->>'timeLimitSeconds')::bigint*1000)/1000;
    perform crossplay.calculate_result('played',p_payload||jsonb_build_object('overtime1',overtime1,'overtime2',overtime2),c.rules);
    select entrant_id into eid from crossplay.match_sides where tournament_id=tid and match_id=mid and side=1;
    insert into crossplay.match_reports(tournament_id,match_id,revision,submitted_by,raw1,raw2,overtime1,overtime2)
      values(tid,mid,m.revision+1,eid,(p_payload->>'raw1')::integer,(p_payload->>'raw2')::integer,overtime1,overtime2) returning id into rid;
    insert into crossplay.match_report_clocks(tournament_id,match_id,report_id,clock_version) values(tid,mid,rid,c.version);
    update crossplay.matches set revision=revision+1,current_report_id=rid,status='awaiting_confirmation' where tournament_id=tid and id=mid;
    update crossplay.match_clock_sessions set report_submitted=true where tournament_id=tid and match_id=mid;
    result_change:=true;
  elsif p_command in ('acknowledge_shared_report','dispute_shared_report') then
    if not shared then raise exception 'FORBIDDEN'; end if;
    if (p_payload->>'expectedRevision')::integer is distinct from m.revision then raise exception 'STALE_REVISION'; end if;
    if m.status<>'awaiting_confirmation' or (p_payload->>'reportId')::uuid is distinct from m.current_report_id then raise exception 'STALE_REPORT'; end if;
    select * into strict report from crossplay.match_reports where tournament_id=tid and match_id=mid and id=m.current_report_id;
    select * into meta from crossplay.match_report_clocks where tournament_id=tid and match_id=mid and report_id=report.id;
    if not found or meta.clock_version<>c.version or c.status<>'ended' or c.review_required then raise exception 'STALE_CLOCK_VERSION'; end if;
    if p_command='dispute_shared_report' then
      if reason is null then raise exception 'REASON_REQUIRED'; end if;
      update crossplay.match_reports set dispute_reason=reason where tournament_id=tid and match_id=mid and id=report.id;
      update crossplay.matches set status='disputed',revision=revision+1 where tournament_id=tid and id=mid;
      result_change:=true;
    else
      v_side:=(p_payload->>'side')::integer;
      if v_side is null or v_side not in (1,2) then raise exception 'INVALID_SIDE'; end if;
      update crossplay.match_report_clocks set acknowledged1=acknowledged1 or v_side=1,acknowledged2=acknowledged2 or v_side=2
        where tournament_id=tid and match_id=mid and report_id=report.id returning * into meta;
      if meta.acknowledged1 and meta.acknowledged2 then
        perform crossplay.finalize_match(tid,mid,'played',jsonb_build_object('raw1',report.raw1,'raw2',report.raw2,'overtime1',report.overtime1,'overtime2',report.overtime2),audit_actor||jsonb_build_object('reportId',report.id,'clockVersion',c.version),null);
        result_change:=true;
      end if;
    end if;
  elsif p_command='revoke_match_link' then
    update crossplay.match_credentials set revoked_at=now() where tournament_id=tid and match_id=mid and revoked_at is null;
    update crossplay.match_sessions set revoked_at=now() where tournament_id=tid and match_id=mid and revoked_at is null;
    update crossplay.match_clock_sessions set controller_id=null,controller_actor=null,epoch=epoch+1,sequence=0,version=version+1,
      status=case when status='running' then 'paused' else status end,anchor_at_ms=null,review_required=review_required or controller_actor is not null where tournament_id=tid and match_id=mid;
  elsif p_command='takeover_clock' then
    if c.match_id is null or m.status='final' then raise exception 'CLOCK_UNAVAILABLE'; end if;
    if (p_payload->>'controllerId')::uuid is null then raise exception 'INVALID_CONTROLLER'; end if;
    update crossplay.match_clock_sessions set controller_id=(p_payload->>'controllerId')::uuid,controller_actor=v_actor_key,epoch=epoch+1,sequence=0,version=version+1,
      status=case when status='ended' then 'ended' else 'paused' end,anchor_at_ms=null,review_required=true where tournament_id=tid and match_id=mid;
  elsif p_command='correct_clock' then
    if c.match_id is null or m.status='final' then raise exception 'CLOCK_UNAVAILABLE'; end if;
    if p_expected_clock_version is distinct from c.version then raise exception 'STALE_CLOCK_VERSION'; end if;
    if jsonb_typeof(p_payload->'usedMs') is distinct from 'array' or jsonb_array_length(p_payload->'usedMs')<>2 or coalesce(p_payload#>>'{usedMs,0}','') !~ '^[0-9]+$' or coalesce(p_payload#>>'{usedMs,1}','') !~ '^[0-9]+$' then raise exception 'INVALID_TIME'; end if;
    c.used_ms1:=(p_payload#>>'{usedMs,0}')::bigint; c.used_ms2:=(p_payload#>>'{usedMs,1}')::bigint; v_side:=(p_payload->>'activeSide')::integer;
    if v_side is null or v_side not in (1,2) or c.used_ms1>(c.rules->>'timeLimitSeconds')::bigint*1000+86400999 or c.used_ms2>(c.rules->>'timeLimitSeconds')::bigint*1000+86400999 then raise exception 'INVALID_TIME'; end if;
    update crossplay.match_clock_sessions set used_ms1=c.used_ms1,used_ms2=c.used_ms2,active_side=v_side,epoch=epoch+1,sequence=0,version=version+1,
      status=case when status='ended' then 'ended' when status='ready' then 'ready' else 'paused' end,anchor_at_ms=null,review_required=false,report_submitted=false where tournament_id=tid and match_id=mid;
    if m.current_report_id is not null then
      update crossplay.matches set current_report_id=null,status='unreported',revision=revision+1 where tournament_id=tid and id=mid; result_change:=true;
    end if;
  elsif p_command in ('correct_starter','record_manual_start') then
    eid:=(p_payload->>'entrantId')::uuid;
    if not exists(select 1 from crossplay.match_sides where tournament_id=tid and match_id=mid and entrant_id=eid) then raise exception 'INVALID_STARTER'; end if;
    if p_command='record_manual_start' and c.match_id is not null then raise exception 'CLOCK_ALREADY_EXISTS'; end if;
    insert into crossplay.match_starts(tournament_id,match_id,entrant_id,method,counts,played,corrected_at)
      values(tid,mid,eid,'organizer','{}',p_command='record_manual_start',now())
      on conflict(tournament_id,match_id) do update set entrant_id=excluded.entrant_id,method='organizer',corrected_at=now(),played=match_starts.played or excluded.played;
    if (select played from crossplay.match_starts where tournament_id=tid and match_id=mid) then perform crossplay.record_played_start(tid,mid); end if;
    if c.status='ready' then
      update crossplay.match_clock_sessions set active_side=(select side from crossplay.match_sides where tournament_id=tid and match_id=mid and entrant_id=eid),version=version+1 where tournament_id=tid and match_id=mid;
    end if;
  else raise exception 'UNKNOWN_COMMAND'; end if;

  if result_change then
    delete from crossplay.rounds where tournament_id=tid and status='draft';
    update crossplay.tournaments set version=version+1 where id=tid;
  end if;
  if p_command<>'append_events' and p_command<>'claim_match_link' then
    insert into crossplay.audit_events(tournament_id,action,actor,reason,details) values(tid,p_command,audit_actor,reason,
      jsonb_build_object('matchId',mid,'clockVersion',c.version,'entrantId',p_payload->>'entrantId','usedMs',p_payload->'usedMs','reportId',p_payload->>'reportId'));
  end if;
  response:=coalesce(response,crossplay.clock_read(p_actor,mid));
  insert into crossplay.mutation_requests(actor_key,request_id,fingerprint,response) values('clock:'||v_actor_key,p_request_id,v_fingerprint,response);
  return response;
end $$;

do $$ declare obj record; begin
  for obj in select tablename from pg_tables where schemaname='crossplay' and tablename in ('match_starts','match_start_accounting','match_credentials','match_sessions','match_clock_sessions','match_clock_events','match_report_clocks') loop
    execute format('alter table crossplay.%I enable row level security',obj.tablename);
    execute format('revoke all on crossplay.%I from public,anon,authenticated,service_role,crossplay_runtime',obj.tablename);
  end loop;
  for obj in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crossplay' and p.proname in
    ('clock_version','match_session_valid','resolve_match_start','record_played_start','clock_read','finalize_match','finalize_match_base','execute','execute_base','clock_execute') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role,crossplay_runtime',obj.signature);
  end loop;
end $$;
grant execute on function crossplay.clock_version(),crossplay.clock_read(jsonb,uuid),crossplay.clock_execute(jsonb,text,jsonb,uuid,bigint),crossplay.execute(jsonb,text,jsonb,uuid,bigint) to crossplay_runtime;
