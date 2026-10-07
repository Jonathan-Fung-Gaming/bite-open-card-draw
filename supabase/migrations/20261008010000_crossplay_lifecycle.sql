-- Additive Crossplay lifecycle capability. Runtime still has function-only access.
alter table crossplay.tournaments
  add column archived_from_status text,
  add column archived_at timestamptz,
  add column run_generation bigint not null default 0 check(run_generation>=0),
  add column requests_invalid_before timestamptz;
update crossplay.tournaments set archived_from_status='finished',archived_at=coalesce(finished_at,created_at) where status='archived';
alter table crossplay.tournaments add constraint crossplay_archive_state check(
  (status='archived' and archived_from_status is not null and archived_from_status in ('draft','active','finished') and archived_at is not null)
  or (status<>'archived' and archived_from_status is null and archived_at is null));

-- No FK: minimal replay markers intentionally outlive deleted tournaments.
alter table crossplay.mutation_requests add column tournament_id uuid,
  add column generation bigint, add column command text, add column retired boolean not null default false;
create index crossplay_request_tournament on crossplay.mutation_requests(tournament_id);
update crossplay.mutation_requests q set tournament_id=t.id,generation=0
from crossplay.tournaments t where q.response->>'tournamentId'=t.id::text or q.response->>'id'=t.id::text;
update crossplay.mutation_requests q set tournament_id=r.tournament_id,generation=0
from crossplay.rounds r where q.tournament_id is null and q.response->>'roundId'=r.id::text;

create function crossplay.lifecycle_version() returns text language sql security definer set search_path='' as $$ select '20261008010000'::text $$;
create or replace function crossplay.tournament_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name,'date',t.event_date,'status',t.status,'config',t.config,'seed',t.seed,'version',t.version,'createdAt',t.created_at,'correctionsOnly',t.corrections_only,
    'archivedFromStatus',t.archived_from_status,'runGeneration',t.run_generation,'lifecycleAvailable',true,
    'entrantCount',(select count(*) from crossplay.entrants where tournament_id=t.id),
    'currentRound',coalesce((select max(number) from crossplay.rounds where tournament_id=t.id and status<>'draft'),0))
  from crossplay.tournaments t where t.id=p_id
$$;

alter function crossplay.read_model(jsonb,text,text) rename to read_model_before_lifecycle;
create function crossplay.read_model(p_actor jsonb,p_tournament text default null,p_scope text default 'public') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t crossplay.tournaments%rowtype; result jsonb;
begin
  if p_tournament is not null then
    select * into t from crossplay.tournaments where id::text=p_tournament or slug=p_tournament;
    if t.status='archived' and t.archived_from_status='draft' and not crossplay.is_staff(p_actor,t.id) then raise exception 'NOT_FOUND'; end if;
  end if;
  result:=crossplay.read_model_before_lifecycle(p_actor,p_tournament,p_scope);
  if p_tournament is null and p_scope='public' then
    result:=jsonb_build_object('tournaments',coalesce((select jsonb_agg(item) from jsonb_array_elements(result->'tournaments') item where item->>'status'<>'archived'),'[]'::jsonb));
  end if;
  return result;
end $$;

alter function crossplay.clock_read(jsonb,uuid) rename to clock_read_before_lifecycle;
create function crossplay.clock_read(p_actor jsonb,p_match_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; t crossplay.tournaments%rowtype;
begin
  result:=crossplay.clock_read_before_lifecycle(p_actor,p_match_id);
  select * into t from crossplay.tournaments where id=(result->>'tournamentId')::uuid;
  return result||jsonb_build_object('tournamentStatus',t.status,'runGeneration',t.run_generation,
    'canControl',t.status='active' and (result->>'canControl')::boolean);
end $$;

-- Called only under the tournament lock; deleting a parent never leaves a partial run.
create function crossplay.clear_tournament_play(p_tid uuid) returns void language plpgsql set search_path='' as $$
begin
  update crossplay.matches set current_report_id=null,official_revision_id=null where tournament_id=p_tid;
  delete from crossplay.match_report_clocks where tournament_id=p_tid;
  delete from crossplay.match_clock_events where tournament_id=p_tid;
  delete from crossplay.match_reports where tournament_id=p_tid;
  delete from crossplay.result_revisions where tournament_id=p_tid;
  delete from crossplay.rounds where tournament_id=p_tid;
  delete from crossplay.entrant_credentials where tournament_id=p_tid;
end $$;

alter function crossplay.execute(jsonb,text,jsonb,uuid,bigint) rename to execute_before_lifecycle;
create function crossplay.execute(p_actor jsonb,p_command text,p_payload jsonb,p_request_id uuid,p_expected_version bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t crossplay.tournaments%rowtype; tid uuid; target_id uuid; actor_key_value text; fingerprint_value text;
  prior crossplay.mutation_requests%rowtype; response jsonb; counts jsonb; lifecycle boolean;
begin
  if p_request_id is null or jsonb_typeof(p_actor) is distinct from 'object' or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'INVALID_REQUEST'; end if;
  lifecycle:=p_command in ('archive_tournament','restore_tournament','reset_tournament','delete_tournament');
  actor_key_value:=coalesce(p_actor->>'userId',p_actor->>'sessionHash','anonymous');
  fingerprint_value:=md5(case when p_payload ? '_requestHash' then jsonb_build_object('actor',p_actor,'command',p_command,'requestHash',p_payload->>'_requestHash')::text
    else jsonb_build_object('actor',p_actor,'command',p_command,'payload',p_payload,'expectedVersion',p_expected_version)::text end);
  if p_command='claim_invite' then
    select tournament_id into tid from crossplay.entrant_credentials where invite_hash=p_payload->>'inviteHash';
  elsif p_command<>'create_tournament' then tid:=(p_payload->>'tournamentId')::uuid; end if;
  -- The outer boundary always locks before the legacy request lock, including claims.
  if tid is not null then select * into t from crossplay.tournaments where id=tid for update; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_key_value||p_request_id::text,0));
  select * into prior from crossplay.mutation_requests where actor_key=actor_key_value and request_id=p_request_id;
  if found then
    if prior.fingerprint<>fingerprint_value then raise exception 'IDEMPOTENCY_MISMATCH'; end if;
    if prior.retired or (prior.command is null and t.requests_invalid_before is not null and prior.created_at<t.requests_invalid_before
      and p_command not in ('create_tournament','copy_tournament')) then raise exception 'STALE_ACTION'; end if;
    if lifecycle and not crossplay.is_organizer(p_actor) then raise exception 'FORBIDDEN'; end if;
    return prior.response;
  end if;

  if lifecycle then
    if not crossplay.is_organizer(p_actor) then raise exception 'FORBIDDEN'; end if;
    if t.id is null then raise exception 'NOT_FOUND'; end if;
    if not crossplay.is_staff(p_actor,tid) then raise exception 'FORBIDDEN'; end if;
    if p_expected_version is distinct from t.version then raise exception 'STALE_VERSION'; end if;
    if p_command in ('reset_tournament','delete_tournament') and (p_payload->>'confirmationName') is distinct from t.name then raise exception 'CONFIRMATION_REQUIRED'; end if;
    if p_command='archive_tournament' and t.status='archived' or p_command='restore_tournament' and t.status<>'archived' then raise exception 'INVALID_LIFECYCLE_STATE'; end if;
    perform 1 from crossplay.matches where tournament_id=tid order by id for update;
    perform 1 from crossplay.match_clock_sessions where tournament_id=tid order by match_id for update;
    counts:=jsonb_build_object('previousStatus',t.status,'generation',t.run_generation,
      'players',(select count(*) from crossplay.entrants where tournament_id=tid),
      'rounds',(select count(*) from crossplay.rounds where tournament_id=tid),
      'matches',(select count(*) from crossplay.matches where tournament_id=tid));
    if p_command='archive_tournament' then
      delete from crossplay.rounds where tournament_id=tid and status='draft';
      update crossplay.match_credentials c set revoked_at=now() from crossplay.matches m
        where c.tournament_id=tid and m.tournament_id=tid and m.id=c.match_id and m.status<>'final' and c.revoked_at is null;
      update crossplay.match_sessions c set revoked_at=now() from crossplay.matches m
        where c.tournament_id=tid and m.tournament_id=tid and m.id=c.match_id and m.status<>'final' and c.revoked_at is null;
      update crossplay.match_clock_sessions c set controller_id=null,controller_actor=null,epoch=c.epoch+1,sequence=0,version=c.version+1,
        status=case when c.status='running' then 'paused' else c.status end,anchor_at_ms=null,
        review_required=c.review_required or c.status='running' or (c.status in ('ready','paused') and c.controller_actor is not null)
        from crossplay.matches m where c.tournament_id=tid and m.tournament_id=tid and m.id=c.match_id and m.status<>'final';
      -- Changing controller epochs does not invalidate saved ended scores/agreements.
      update crossplay.match_report_clocks r set clock_version=c.version from crossplay.match_clock_sessions c,crossplay.matches m
        where r.tournament_id=tid and c.tournament_id=tid and c.match_id=r.match_id and m.tournament_id=tid and m.id=r.match_id
        and m.current_report_id=r.report_id and m.status<>'final' and c.status='ended' and c.report_submitted;
      update crossplay.matches set revision=revision+1 where tournament_id=tid and status<>'final';
      update crossplay.tournaments set status='archived',archived_from_status=t.status,archived_at=now(),version=version+1,requests_invalid_before=statement_timestamp() where id=tid;
    elsif p_command='restore_tournament' then
      update crossplay.tournaments set status=t.archived_from_status,archived_from_status=null,archived_at=null,version=version+1 where id=tid;
    else
      perform crossplay.clear_tournament_play(tid);
      if p_command='reset_tournament' then
        update crossplay.entrants set active=true where tournament_id=tid;
        update crossplay.tournaments set status='draft',started_at=null,finished_at=null,frozen_config=null,corrections_only=false,
          archived_from_status=null,archived_at=null,version=version+1,run_generation=run_generation+1,requests_invalid_before=statement_timestamp() where id=tid;
      else
        delete from crossplay.entrants where tournament_id=tid;
        delete from crossplay.tournament_staff where tournament_id=tid;
        delete from crossplay.audit_events where tournament_id=tid;
        delete from crossplay.tournaments where id=tid;
      end if;
    end if;
    if p_command<>'restore_tournament' then
      update crossplay.mutation_requests set retired=true,response='{"error":"STALE_ACTION"}'::jsonb
        where tournament_id=tid and (p_command='delete_tournament' or coalesce(command,'') not in
          ('create_tournament','copy_tournament','archive_tournament','restore_tournament','reset_tournament','delete_tournament'));
    end if;
    if p_command='delete_tournament' then response:=jsonb_build_object('ok',true,'id',tid,'deleted',true);
    else
      insert into crossplay.audit_events(tournament_id,action,actor,details) values(tid,p_command,p_actor,counts);
      select jsonb_build_object('ok',true,'id',id,'slug',slug,'status',status,'version',version,'runGeneration',run_generation) into response from crossplay.tournaments where id=tid;
    end if;
    insert into crossplay.mutation_requests(actor_key,request_id,fingerprint,response,tournament_id,generation,command)
      values(actor_key_value,p_request_id,fingerprint_value,response,tid,t.run_generation,p_command);
    return response;
  end if;

  if t.status='archived' and p_command<>'copy_tournament' then
    if p_command<>'claim_invite' and not crossplay.is_staff(p_actor,tid) and crossplay.session_entrant(p_actor,tid) is null then raise exception 'FORBIDDEN'; end if;
    raise exception 'TOURNAMENT_ARCHIVED';
  end if;
  response:=crossplay.execute_before_lifecycle(p_actor,p_command,p_payload,p_request_id,p_expected_version);
  target_id:=case when p_command in ('create_tournament','copy_tournament') then (response->>'id')::uuid else tid end;
  update crossplay.mutation_requests set tournament_id=target_id,generation=coalesce((select run_generation from crossplay.tournaments where id=target_id),0),command=p_command
    where actor_key=actor_key_value and request_id=p_request_id;
  return response;
end $$;

alter function crossplay.clock_execute(jsonb,text,jsonb,uuid,bigint) rename to clock_execute_before_lifecycle;
create function crossplay.clock_execute(p_actor jsonb,p_command text,p_payload jsonb,p_request_id uuid,p_expected_clock_version bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tid uuid; mid uuid; t crossplay.tournaments%rowtype; response jsonb; actor_key_value text; prior crossplay.mutation_requests%rowtype;
begin
  if p_request_id is null or jsonb_typeof(p_actor) is distinct from 'object' or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'INVALID_REQUEST'; end if;
  if p_command='claim_match_link' then
    select tournament_id,match_id into tid,mid from crossplay.match_credentials where invite_hash=p_payload->>'inviteHash';
    if tid is null then raise exception 'INVALID_INVITE'; end if;
  else
    mid:=(p_payload->>'matchId')::uuid;
    select tournament_id into tid from crossplay.matches where id=mid;
  end if;
  select * into t from crossplay.tournaments where id=tid for update;
  if not found or not exists(select 1 from crossplay.matches where tournament_id=tid and id=mid) then raise exception 'NOT_FOUND'; end if;
  if p_command<>'claim_match_link' and not crossplay.is_staff(p_actor,tid) and not crossplay.match_session_valid(p_actor,tid,mid) then raise exception 'FORBIDDEN'; end if;
  if t.status='archived' then raise exception 'TOURNAMENT_ARCHIVED'; end if;
  actor_key_value:='clock:'||coalesce(p_actor->>'userId',p_actor->>'matchSessionHash','anonymous');
  perform pg_advisory_xact_lock(hashtextextended(actor_key_value||p_request_id::text,0));
  select * into prior from crossplay.mutation_requests where actor_key=actor_key_value and request_id=p_request_id;
  if found and prior.retired then raise exception 'STALE_ACTION'; end if;
  response:=crossplay.clock_execute_before_lifecycle(p_actor,p_command,p_payload,p_request_id,p_expected_clock_version);
  update crossplay.mutation_requests set tournament_id=tid,generation=t.run_generation,command='clock:'||p_command
    where actor_key=actor_key_value and request_id=p_request_id;
  return response;
end $$;

do $$ declare obj record; begin
  for obj in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crossplay' and p.proname in
    ('lifecycle_version','read_model','read_model_before_lifecycle','clock_read','clock_read_before_lifecycle','clear_tournament_play','execute','execute_before_lifecycle','clock_execute','clock_execute_before_lifecycle') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role,crossplay_runtime',obj.signature);
  end loop;
end $$;
grant execute on function crossplay.lifecycle_version(),crossplay.read_model(jsonb,text,text),crossplay.clock_read(jsonb,uuid),
  crossplay.execute(jsonb,text,jsonb,uuid,bigint),crossplay.clock_execute(jsonb,text,jsonb,uuid,bigint) to crossplay_runtime;
