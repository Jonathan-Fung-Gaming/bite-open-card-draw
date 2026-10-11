-- Existing Crossplay schema snapshot for isolated CI setup; no historical migration replay.
-- Source: crossplay_display_20261008, display_version 20261008040000, PostgreSQL 17.
-- Minimal isolated prerequisites; never run this file against the shared hosted project.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);

do $$ begin
  if not exists(select 1 from pg_roles where rolname='crossplay_runtime') then create role crossplay_runtime nologin; end if;
end $$;
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11 (Debian 17.11-1.pgdg13+2)
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

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

--
-- Name: crossplay; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA crossplay;


--
-- Name: allocate_tables(uuid, uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.allocate_tables(p_tid uuid, p_round uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare numbers integer[]; item record; i integer:=0; n integer;
begin
  if not exists(select 1 from crossplay.table_settings where tournament_id=p_tid) then return; end if;
  select array_agg(number order by number) into numbers from crossplay.physical_tables where tournament_id=p_tid and available;
  n:=coalesce(array_length(numbers,1),0); if n=0 then raise exception 'NO_TABLES_AVAILABLE'; end if;
  for item in select m.id,m.table_number from crossplay.matches m where m.tournament_id=p_tid and m.round_id=p_round and m.kind<>'bye' order by m.table_number loop
    insert into crossplay.match_locations(tournament_id,match_id,round_id,table_number,original_table_number,queue_order)
      values(p_tid,item.id,p_round,numbers[1+(i%n)],numbers[1+(i%n)],1+(i/n));
    i:=i+1;
  end loop;
end $$;


--
-- Name: calculate_result(text, jsonb, jsonb, integer); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.calculate_result(p_kind text, p_input jsonb, p_rules jsonb, p_winner_side integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
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
end $_$;


--
-- Name: clear_tournament_play(uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.clear_tournament_play(p_tid uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  update crossplay.matches set current_report_id=null,official_revision_id=null where tournament_id=p_tid;
  delete from crossplay.match_report_clocks where tournament_id=p_tid;
  delete from crossplay.match_clock_events where tournament_id=p_tid;
  delete from crossplay.match_reports where tournament_id=p_tid;
  delete from crossplay.result_revisions where tournament_id=p_tid;
  delete from crossplay.rounds where tournament_id=p_tid;
  delete from crossplay.entrant_credentials where tournament_id=p_tid;
end $$;


--
-- Name: clock_execute(jsonb, text, jsonb, uuid, bigint); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.clock_execute(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_clock_version bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare tid uuid; mid uuid; managed boolean; did uuid; tab integer;
begin
  if p_command='claim_match_link' then select tournament_id,match_id into tid,mid from crossplay.match_credentials where invite_hash=p_payload->>'inviteHash';
  else mid:=(p_payload->>'matchId')::uuid; select tournament_id into tid from crossplay.matches where id=mid; end if;
  perform 1 from crossplay.tournaments where id=tid for update;
  if exists(select 1 from crossplay.mutation_requests where actor_key='clock:'||coalesce(p_actor->>'userId',p_actor->>'matchSessionHash','anonymous') and request_id=p_request_id) then
    return crossplay.clock_execute_before_tables(p_actor,p_command,p_payload,p_request_id,p_expected_clock_version);
  end if;
  managed:=exists(select 1 from crossplay.table_settings where tournament_id=tid);
  if managed and p_command in ('takeover_clock','issue_match_link') then raise exception 'DEVICE_ASSIGNMENT_REQUIRED'; end if;
  if managed and p_command in ('claim_clock','append_events') then
    if not crossplay.is_staff(p_actor,tid) and not crossplay.match_session_valid(p_actor,tid,mid) then raise exception 'FORBIDDEN'; end if;
    if (p_command='claim_clock' or exists(select 1 from jsonb_array_elements(p_payload->'events') e where e->>'kind' in ('start','resume','switch')))
      and not crossplay.table_match_ready(tid,mid) then raise exception 'TABLE_NOT_READY'; end if;
    if p_command='claim_clock' then
      select device_id into did from crossplay.match_sessions where token_hash=p_actor->>'matchSessionHash' and tournament_id=tid and match_id=mid;
      select table_number into tab from crossplay.match_locations where tournament_id=tid and match_id=mid;
      if did is null or not exists(select 1 from crossplay.table_devices d join crossplay.tournaments t on t.id=d.tournament_id
        where d.tournament_id=tid and d.device_id=did and d.table_number=tab and d.generation=t.run_generation) then raise exception 'DEVICE_ASSIGNMENT_REQUIRED'; end if;
    end if;
  end if;
  return crossplay.clock_execute_before_tables(p_actor,p_command,p_payload,p_request_id,p_expected_clock_version);
end $$;


--
-- Name: clock_execute_before_lifecycle(jsonb, text, jsonb, uuid, bigint); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.clock_execute_before_lifecycle(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_clock_version bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--
-- Name: clock_execute_before_tables(jsonb, text, jsonb, uuid, bigint); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.clock_execute_before_tables(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_clock_version bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: clock_read(jsonb, uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.clock_read(p_actor jsonb, p_match_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare result jsonb; tid uuid; l crossplay.match_locations%rowtype;
begin
  result:=crossplay.clock_read_before_tables(p_actor,p_match_id); tid:=(result->>'tournamentId')::uuid;
  select * into l from crossplay.match_locations where tournament_id=tid and match_id=p_match_id;
  return result||jsonb_build_object('tablesAvailable',true,'tablesEnabled',exists(select 1 from crossplay.table_settings where tournament_id=tid),
    'operationsVersion',coalesce((select version from crossplay.table_settings where tournament_id=tid),0),
    'physicalTableNumber',l.table_number,'queueOrder',l.queue_order,'tableReady',crossplay.table_match_ready(tid,p_match_id));
end $$;


--
-- Name: clock_read_before_lifecycle(jsonb, uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.clock_read_before_lifecycle(p_actor jsonb, p_match_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: clock_read_before_tables(jsonb, uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.clock_read_before_tables(p_actor jsonb, p_match_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare result jsonb; tid uuid; current_epoch bigint; current_sequence bigint; turn_sequence bigint; turn_ms bigint;
begin
  result:=crossplay.clock_read_before_turn_time(p_actor,p_match_id);
  if jsonb_typeof(result->'state') is distinct from 'object' then return result; end if;
  tid:=(result->>'tournamentId')::uuid;
  current_epoch:=(result->'state'->>'epoch')::bigint;
  current_sequence:=(result->'state'->>'sequence')::bigint;
  select coalesce(max(sequence),0) into turn_sequence from crossplay.match_clock_events
    where tournament_id=tid and match_id=p_match_id and epoch=current_epoch and sequence<=current_sequence
      and event->>'kind' in ('start','switch');
  select coalesce(sum((event->>'elapsedMs')::bigint),0) into turn_ms from crossplay.match_clock_events
    where tournament_id=tid and match_id=p_match_id and epoch=current_epoch
      and sequence>turn_sequence and sequence<=current_sequence;
  return jsonb_set(result,'{state,currentTurnMs}',to_jsonb(turn_ms));
end $$;


--
-- Name: clock_read_before_turn_time(jsonb, uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.clock_read_before_turn_time(p_actor jsonb, p_match_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare result jsonb; t crossplay.tournaments%rowtype;
begin
  result:=crossplay.clock_read_before_lifecycle(p_actor,p_match_id);
  select * into t from crossplay.tournaments where id=(result->>'tournamentId')::uuid;
  return result||jsonb_build_object('tournamentStatus',t.status,'runGeneration',t.run_generation,
    'canControl',t.status='active' and (result->>'canControl')::boolean);
end $$;


--
-- Name: clock_version(); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.clock_version() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ select '20260930020000'::text $$;


--
-- Name: consume_rate_limit(text, integer, integer); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare hits integer;
begin
  if length(p_key) not between 1 and 200 or p_limit not between 1 and 1000 or p_window_seconds not between 1 and 86400 then raise exception 'INVALID_RATE_LIMIT'; end if;
  insert into crossplay.rate_limits as limits(key,hits,ends_at) values(p_key,1,clock_timestamp()+make_interval(secs=>p_window_seconds))
    on conflict(key) do update set hits=case when limits.ends_at<=clock_timestamp() then 1 else limits.hits+1 end,
      ends_at=case when limits.ends_at<=clock_timestamp() then clock_timestamp()+make_interval(secs=>p_window_seconds) else limits.ends_at end returning limits.hits into hits;
  delete from crossplay.rate_limits where ends_at<clock_timestamp()-interval '1 day';
  return hits<=p_limit;
end $$;


--
-- Name: display_read(text); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.display_read(p_tournament text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare source jsonb; tid uuid; projected jsonb; statuses jsonb;
begin
  -- Never accept an actor: an organizer's browser receives the same projection.
  source:=crossplay.read_model('{}'::jsonb,p_tournament,'public');
  tid:=(source#>>'{tournament,id}')::uuid;
  if tid is null or not exists(select 1 from crossplay.rounds where tournament_id=tid and status<>'draft') then
    raise exception 'NOT_FOUND';
  end if;
  projected:=jsonb_build_object(
    'tournament',jsonb_build_object('id',tid,'slug',source#>'{tournament,slug}','name',source#>'{tournament,name}',
      'status',source#>'{tournament,status}','config',jsonb_build_object('roundCount',source#>'{tournament,config,roundCount}'),
      'currentRound',source#>'{tournament,currentRound}','runGeneration',source#>'{tournament,runGeneration}'),
    -- The existing public seed order is needed for identical shared-rank ordering.
    'entrants',source->'entrants',
    'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',r->'id','number',r->'number','status',r->'status',
      'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m->'id','roundNumber',m->'roundNumber',
        'tableNumber',m->'tableNumber','player1Id',m->'player1Id','player2Id',m->'player2Id','kind',m->'kind','status',m->'status',
        'result',case when m->>'status'='final' and m->'result'<>'null'::jsonb then jsonb_build_object(
          'adjusted1',m#>'{result,adjusted1}','adjusted2',m#>'{result,adjusted2}','points1',m#>'{result,points1}',
          'points2',m#>'{result,points2}','difference1',m#>'{result,difference1}') else null end) order by (m->>'tableNumber')::integer)
        from jsonb_array_elements(r->'matches') m),'[]'::jsonb)) order by (r->>'number')::integer)
      from jsonb_array_elements(source->'rounds') r where r->>'status'<>'draft'),'[]'::jsonb),
    'tables',jsonb_build_object('enabled',coalesce(source#>'{tables,enabled}','false'::jsonb),
      'locations',coalesce(source#>'{tables,locations}','[]'::jsonb)));
  select coalesce(jsonb_object_agg(m.id::text,jsonb_build_object(
    'status',case
      when m.status='final' then 'final'
      when m.status='disputed' or c.review_required then 'organizer_review'
      when m.status='awaiting_confirmation' then 'awaiting_confirmation'
      when source#>>'{tournament,status}'<>'active' then 'outstanding'
      when l.match_id is not null and not crossplay.table_match_ready(tid,m.id) then 'queued'
      when c.status='running' then 'playing'
      when c.status='paused' then 'paused'
      when c.status='ended' then 'reporting'
      when c.status='ready' then 'ready'
      else 'outstanding' end,
    'completedAt',case when m.status='final' then v.created_at else null end)), '{}'::jsonb) into statuses
  from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id
  left join crossplay.match_clock_sessions c on c.tournament_id=m.tournament_id and c.match_id=m.id
  left join crossplay.match_locations l on l.tournament_id=m.tournament_id and l.match_id=m.id
  left join crossplay.result_revisions v on v.tournament_id=m.tournament_id and v.match_id=m.id and v.id=m.official_revision_id
  where m.tournament_id=tid and r.status<>'draft';
  return jsonb_build_object('snapshot',projected,'matches',statuses,
    'serverNowMs',floor(extract(epoch from statement_timestamp())*1000)::bigint);
end $$;


--
-- Name: display_version(); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.display_version() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select '20261008040000'::text $$;


--
-- Name: execute(jsonb, text, jsonb, uuid, bigint); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.execute(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare result jsonb; tid uuid; rid uuid; replay boolean;
begin
  tid:=(p_payload->>'tournamentId')::uuid;
  if tid is not null then perform 1 from crossplay.tournaments where id=tid for update; end if;
  select exists(select 1 from crossplay.mutation_requests where actor_key=coalesce(p_actor->>'userId',p_actor->>'sessionHash','anonymous') and request_id=p_request_id) into replay;
  result:=crossplay.execute_before_tables(p_actor,p_command,p_payload,p_request_id,p_expected_version);
  if not replay and p_command='generate_round' and exists(select 1 from crossplay.table_settings where tournament_id=tid) then
    select id into rid from crossplay.rounds where tournament_id=tid and status='draft';
    perform crossplay.allocate_tables(tid,rid);
  elsif not replay and p_command='reset_tournament' then
    update crossplay.table_devices set table_number=null,generation=(select run_generation from crossplay.tournaments where id=tid) where tournament_id=tid;
    update crossplay.table_settings set version=version+1 where tournament_id=tid;
  end if;
  return result;
end $$;


--
-- Name: execute_base(jsonb, text, jsonb, uuid, bigint); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.execute_base(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--
-- Name: execute_before_lifecycle(jsonb, text, jsonb, uuid, bigint); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.execute_before_lifecycle(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: execute_before_tables(jsonb, text, jsonb, uuid, bigint); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.execute_before_tables(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: finalize_match(uuid, uuid, text, jsonb, jsonb, text); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.finalize_match(p_tournament uuid, p_match uuid, p_kind text, p_input jsonb, p_actor jsonb, p_reason text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: finalize_match_base(uuid, uuid, text, jsonb, jsonb, text); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.finalize_match_base(p_tournament uuid, p_match uuid, p_kind text, p_input jsonb, p_actor jsonb, p_reason text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: is_organizer(jsonb); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.is_organizer(p_actor jsonb) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select exists(select 1 from crossplay.organizers where user_id=(p_actor->>'userId')::uuid and active)
$$;


--
-- Name: is_staff(jsonb, uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.is_staff(p_actor jsonb, p_tournament uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select crossplay.is_organizer(p_actor) and exists(select 1 from crossplay.tournament_staff where tournament_id=p_tournament and user_id=(p_actor->>'userId')::uuid)
$$;


--
-- Name: lifecycle_version(); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.lifecycle_version() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ select '20261008010000'::text $$;


--
-- Name: match_session_valid(jsonb, uuid, uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.match_session_valid(p_actor jsonb, p_tid uuid, p_mid uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select exists(select 1 from crossplay.match_sessions s join crossplay.match_credentials c on c.id=s.credential_id
    where s.token_hash=p_actor->>'matchSessionHash' and s.tournament_id=p_tid and s.match_id=p_mid
    and s.revoked_at is null and s.expires_at>now() and c.revoked_at is null and c.expires_at>now())
$$;


--
-- Name: name_key(text); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.name_key(p_name text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select replace(replace(lower(btrim(regexp_replace(pg_catalog.normalize(p_name,'NFKC'),'[[:space:]]+',' ','g'))),'ß','ss'),'ς','σ')
$$;


--
-- Name: read_model(jsonb, text, text); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.read_model(p_actor jsonb, p_tournament text DEFAULT NULL::text, p_scope text DEFAULT 'public'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare result jsonb; tid uuid;
begin
  result:=crossplay.read_model_before_tables(p_actor,p_tournament,p_scope);
  if p_tournament is not null then
    tid:=(result->'tournament'->>'id')::uuid;
    result:=result||jsonb_build_object('tables',crossplay.tables_json(p_actor,tid));
  end if;
  return result;
end $$;


--
-- Name: read_model_before_lifecycle(jsonb, text, text); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.read_model_before_lifecycle(p_actor jsonb, p_tournament text DEFAULT NULL::text, p_scope text DEFAULT 'public'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: read_model_before_tables(jsonb, text, text); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.read_model_before_tables(p_actor jsonb, p_tournament text DEFAULT NULL::text, p_scope text DEFAULT 'public'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: record_played_start(uuid, uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.record_played_start(p_tid uuid, p_mid uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  update crossplay.match_starts set played=true where tournament_id=p_tid and match_id=p_mid;
  if not found then raise exception 'START_HISTORY_REQUIRED'; end if;
  delete from crossplay.match_start_accounting where tournament_id=p_tid and match_id=p_mid;
  insert into crossplay.match_start_accounting(tournament_id,match_id,entrant_id,position,source)
    select p_tid,p_mid,s.entrant_id,case when s.entrant_id=start.entrant_id then 'first' else 'second' end,'played'
    from crossplay.match_sides s join crossplay.match_starts start on start.tournament_id=s.tournament_id and start.match_id=s.match_id
    where s.tournament_id=p_tid and s.match_id=p_mid;
end $$;


--
-- Name: resolve_match_start(uuid, uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.resolve_match_start(p_tid uuid, p_mid uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: schema_version(); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.schema_version() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select version from crossplay.schema_metadata limit 1
$$;


--
-- Name: session_entrant(jsonb, uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.session_entrant(p_actor jsonb, p_tournament uuid) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select s.entrant_id from crossplay.entrant_sessions s join crossplay.entrant_credentials c on c.id=s.credential_id
  where s.token_hash=p_actor->>'sessionHash' and s.tournament_id=p_tournament and s.revoked_at is null
    and s.expires_at>now() and c.revoked_at is null
$$;


--
-- Name: table_device_busy(uuid, uuid, uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.table_device_busy(p_tid uuid, p_device uuid, p_except uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select exists(select 1 from crossplay.match_sessions s join crossplay.match_clock_sessions c on c.tournament_id=s.tournament_id and c.match_id=s.match_id and c.controller_actor=s.token_hash
    join crossplay.matches m on m.tournament_id=c.tournament_id and m.id=c.match_id
    where s.tournament_id=p_tid and s.device_id=p_device and s.revoked_at is null and m.status<>'final' and (p_except is null or m.id<>p_except))
$$;


--
-- Name: table_enter_match(jsonb, jsonb, uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.table_enter_match(p_actor jsonb, p_payload jsonb, p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare mid uuid:=(p_payload->>'matchId')::uuid; did uuid:=(p_payload->>'deviceId')::uuid; cid uuid:=(p_payload->>'controllerId')::uuid;
  tid uuid; t crossplay.tournaments%rowtype; l crossplay.match_locations%rowtype; c crossplay.match_clock_sessions%rowtype;
  v bigint; actor text:='table-entry:'||coalesce(p_actor->>'userId','anonymous'); fp text; prior crossplay.mutation_requests%rowtype;
  mode text:=coalesce(p_payload->>'mode','open'); sh text:=p_payload->>'sessionHash'; ih text:=p_payload->>'inviteHash'; existing text:=p_payload->>'existingHash';
  reason text:=nullif(btrim(p_payload->>'reason'),''); result jsonb; chosen text; old_device uuid; fresh boolean:=false;
begin
  if p_request_id is null or did is null or cid is null or mode not in ('open','replace','release') then raise exception 'INVALID_REQUEST'; end if;
  select tournament_id into tid from crossplay.matches where id=mid;
  select * into t from crossplay.tournaments where id=tid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not crossplay.is_staff(p_actor,tid) then raise exception 'FORBIDDEN'; end if;
  if t.status='archived' then raise exception 'TOURNAMENT_ARCHIVED'; end if;
  if t.status<>'active' then raise exception 'TOURNAMENT_NOT_ACTIVE'; end if;
  -- A committed response may set a cookie before the client retries. Cookie state
  -- is only an adoption hint and is not part of the requested operation.
  fp:=md5((p_payload-'existingHash')::text);
  perform pg_advisory_xact_lock(hashtextextended(actor||p_request_id::text,0));
  select * into prior from crossplay.mutation_requests where actor_key=actor and request_id=p_request_id;
  if found then
    if prior.retired or prior.generation<>t.run_generation then raise exception 'STALE_ACTION'; end if;
    if prior.fingerprint<>fp then raise exception 'IDEMPOTENCY_MISMATCH'; end if;
    if (prior.response->>'sessionCreated')::boolean and not crossplay.match_session_valid(jsonb_build_object('matchSessionHash',sh),tid,mid) then raise exception 'STALE_ACTION'; end if;
    return prior.response;
  end if;
  select version into v from crossplay.table_settings where tournament_id=tid;
  if v is null then raise exception 'TABLES_NOT_ENABLED'; end if;
  if (p_payload->>'expectedOperationsVersion')::bigint is distinct from v then raise exception 'STALE_TABLE_VERSION'; end if;
  select * into l from crossplay.match_locations where tournament_id=tid and match_id=mid;
  select * into c from crossplay.match_clock_sessions where tournament_id=tid and match_id=mid for update;
  if (select status from crossplay.matches where tournament_id=tid and id=mid)='final' then raise exception 'RESULT_LOCKED'; end if;
  if mode<>'open' then
    if reason is null or length(reason)>1000 then raise exception 'REASON_REQUIRED'; end if;
    if c.match_id is null or (p_payload->>'expectedClockVersion')::bigint is distinct from c.version or (p_payload->>'expectedEpoch')::bigint is distinct from c.epoch then raise exception 'STALE_CLOCK_VERSION'; end if;
  end if;
  if mode<>'release' then
    if not crossplay.table_match_ready(tid,mid) then raise exception 'TABLE_NOT_READY'; end if;
    if crossplay.table_device_busy(tid,did,mid) then raise exception 'DEVICE_BUSY'; end if;
  end if;
  select device_id into old_device from crossplay.match_sessions where token_hash=c.controller_actor;
  if mode in ('replace','release') then
    perform crossplay.clock_execute_before_tables(p_actor,'revoke_match_link',jsonb_build_object('matchId',mid,'reason',reason),gen_random_uuid(),null);
    update crossplay.table_devices set table_number=null where tournament_id=tid and (device_id=old_device or table_number=l.table_number);
  end if;
  if mode='release' then
    result:=jsonb_build_object('sessionCreated',false,'snapshot',crossplay.clock_read(p_actor,mid));
  else
    if mode='replace' then
      insert into crossplay.table_devices(tournament_id,device_id,label,table_number,generation) values(tid,did,left(coalesce(nullif(p_payload->>'label',''),'Table device'),80),l.table_number,t.run_generation)
        on conflict(tournament_id,device_id) do update set table_number=excluded.table_number,generation=excluded.generation;
    elsif not exists(select 1 from crossplay.table_devices where tournament_id=tid and device_id=did and table_number=l.table_number and generation=t.run_generation) then raise exception 'DEVICE_ASSIGNMENT_REQUIRED'; end if;
    if mode='open' and c.controller_actor is not null then
      if existing=c.controller_actor and crossplay.match_session_valid(jsonb_build_object('matchSessionHash',existing),tid,mid) and cid=c.controller_id then
        update crossplay.match_sessions set device_id=did where token_hash=existing; chosen:=existing;
      else
        result:=jsonb_build_object('sessionCreated',false,'snapshot',crossplay.clock_read(p_actor,mid));
      end if;
    else
      if coalesce(sh,'') !~ '^[0-9a-f]{64}$' or coalesce(ih,'') !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_REQUEST'; end if;
      perform crossplay.clock_execute_before_tables(p_actor,'issue_match_link',jsonb_build_object('matchId',mid,'inviteHash',ih),gen_random_uuid(),null);
      perform crossplay.clock_execute_before_tables('{}','claim_match_link',jsonb_build_object('matchId',mid,'inviteHash',ih,'sessionHash',sh),gen_random_uuid(),null);
      update crossplay.match_sessions set device_id=did where token_hash=sh;
      perform crossplay.clock_execute_before_tables(jsonb_build_object('matchSessionHash',sh),'claim_clock',jsonb_build_object('matchId',mid,'controllerId',cid),gen_random_uuid(),null);
      chosen:=sh; fresh:=true;
    end if;
    if chosen is not null then result:=jsonb_build_object('sessionCreated',fresh,'snapshot',crossplay.clock_read(jsonb_build_object('matchSessionHash',chosen),mid)); end if;
  end if;
  if mode<>'open' then
    update crossplay.table_settings set version=version+1 where tournament_id=tid;
    insert into crossplay.audit_events(tournament_id,action,actor,reason,details) values(tid,'device_'||mode,p_actor,reason,jsonb_build_object('matchId',mid,'deviceId',did,'oldDeviceId',old_device));
    result:=jsonb_set(result,'{snapshot,operationsVersion}',to_jsonb(v+1));
  end if;
  insert into crossplay.mutation_requests(actor_key,request_id,fingerprint,response,tournament_id,generation,command) values(actor,p_request_id,fp,result,tid,t.run_generation,'table-entry:'||mode);
  return result;
end $_$;


--
-- Name: table_execute(jsonb, text, jsonb, uuid, bigint); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.table_execute(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare tid uuid:=(p_payload->>'tournamentId')::uuid; t crossplay.tournaments%rowtype; v bigint; prior crossplay.mutation_requests%rowtype;
  actor text:='tables:'||coalesce(p_actor->>'userId','anonymous'); fp text; result jsonb; numbers integer[]; num integer; target integer;
  did uuid; other uuid; mid uuid; item record; pos integer; reason text; c crossplay.match_clock_sessions%rowtype; old crossplay.match_locations%rowtype;
begin
  if p_request_id is null then raise exception 'INVALID_REQUEST'; end if;
  select * into t from crossplay.tournaments where id=tid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not crossplay.is_staff(p_actor,tid) then raise exception 'FORBIDDEN'; end if;
  fp:=md5(jsonb_build_object('command',p_command,'payload',p_payload,'version',p_expected_version)::text);
  perform pg_advisory_xact_lock(hashtextextended(actor||p_request_id::text,0));
  select * into prior from crossplay.mutation_requests where actor_key=actor and request_id=p_request_id;
  if found then
    if prior.retired or prior.generation<>t.run_generation then raise exception 'STALE_ACTION'; end if;
    if prior.fingerprint<>fp then raise exception 'IDEMPOTENCY_MISMATCH'; end if;
    return prior.response;
  end if;
  if t.status='archived' then raise exception 'TOURNAMENT_ARCHIVED'; end if;
  if t.status not in ('draft','active') then raise exception 'TOURNAMENT_CLOSED'; end if;
  select coalesce((select version from crossplay.table_settings where tournament_id=tid),0) into v;
  if p_expected_version is distinct from v then raise exception 'STALE_TABLE_VERSION'; end if;
  reason:=nullif(btrim(p_payload->>'reason'),'');
  if length(reason)>1000 then raise exception 'INVALID_REASON'; end if;
  if p_command='configure_tables' then
    if jsonb_typeof(p_payload->'numbers') is distinct from 'array' then raise exception 'INVALID_TABLES'; end if;
    select array_agg(value::integer order by value::integer) into numbers from jsonb_array_elements_text(p_payload->'numbers');
    if coalesce(array_length(numbers,1),0) not between 1 and 128 or exists(select 1 from unnest(numbers) n where n not between 1 and 128)
      or (select count(distinct n) from unnest(numbers) n)<>array_length(numbers,1) then raise exception 'INVALID_TABLES'; end if;
    if v=0 and exists(select 1 from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id
      where m.tournament_id=tid and r.status<>'draft' and m.kind<>'bye' and m.status<>'final' and not m.table_number=any(numbers)) then raise exception 'TABLES_IN_USE'; end if;
    insert into crossplay.table_settings(tournament_id) values(tid) on conflict do nothing;
    foreach num in array numbers loop insert into crossplay.physical_tables(tournament_id,number) values(tid,num) on conflict do nothing; end loop;
    if v=0 then
      insert into crossplay.physical_tables(tournament_id,number,available)
        select distinct tid,m.table_number,m.table_number=any(numbers) from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id
        where m.tournament_id=tid and r.status<>'draft' and m.kind<>'bye' on conflict do nothing;
      insert into crossplay.match_locations(tournament_id,match_id,round_id,table_number,original_table_number,queue_order)
        select tid,m.id,m.round_id,m.table_number,m.table_number,1 from crossplay.matches m join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id
        where m.tournament_id=tid and r.status<>'draft' and m.kind<>'bye';
    end if;
  elsif v=0 then raise exception 'TABLES_NOT_ENABLED';
  elsif p_command='assign_device' then
    did:=(p_payload->>'deviceId')::uuid; num:=(p_payload->>'tableNumber')::integer;
    if did is null or length(btrim(coalesce(p_payload->>'label',''))) not between 1 and 80 then raise exception 'INVALID_DEVICE'; end if;
    if not exists(select 1 from crossplay.physical_tables where tournament_id=tid and number=num and available) then raise exception 'TABLE_UNAVAILABLE'; end if;
    select device_id into other from crossplay.table_devices where tournament_id=tid and table_number=num and device_id<>did;
    if other is not null then raise exception 'TABLE_DEVICE_OCCUPIED'; end if;
    if crossplay.table_device_busy(tid,did) and not exists(select 1 from crossplay.table_devices where tournament_id=tid and device_id=did and table_number=num) then raise exception 'DEVICE_BUSY'; end if;
    insert into crossplay.table_devices(tournament_id,device_id,label,table_number,generation) values(tid,did,btrim(p_payload->>'label'),num,t.run_generation)
      on conflict(tournament_id,device_id) do update set label=excluded.label,table_number=excluded.table_number,generation=excluded.generation;
  elsif p_command='retire_device' then
    did:=(p_payload->>'deviceId')::uuid;
    if crossplay.table_device_busy(tid,did) then raise exception 'DEVICE_BUSY'; end if;
    update crossplay.table_devices set table_number=null where tournament_id=tid and device_id=did;
    if not found then raise exception 'INVALID_DEVICE'; end if;
  elsif p_command='set_table_available' then
    num:=(p_payload->>'tableNumber')::integer;
    if jsonb_typeof(p_payload->'available') is distinct from 'boolean' then raise exception 'INVALID_TABLES'; end if;
    if (p_payload->>'available')::boolean=false and exists(select 1 from crossplay.match_locations l join crossplay.matches m on m.tournament_id=l.tournament_id and m.id=l.match_id
      join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id
      where l.tournament_id=tid and l.table_number=num and m.status<>'final' and r.status<>'draft') then raise exception 'TABLES_IN_USE'; end if;
    update crossplay.physical_tables set available=(p_payload->>'available')::boolean where tournament_id=tid and number=num;
    if not found then raise exception 'TABLE_UNAVAILABLE'; end if;
    if (p_payload->>'available')::boolean=false then update crossplay.table_devices set table_number=null where tournament_id=tid and table_number=num; end if;
  elsif p_command in ('move_match','close_table') then
    target:=(p_payload->>'targetTable')::integer;
    if reason is null then raise exception 'REASON_REQUIRED'; end if;
    if not exists(select 1 from crossplay.physical_tables where tournament_id=tid and number=target and available) then raise exception 'TABLE_UNAVAILABLE'; end if;
    num:=(p_payload->>'tableNumber')::integer; mid:=(p_payload->>'matchId')::uuid;
    if p_command='close_table' and (num is null or num=target or not exists(select 1 from crossplay.physical_tables where tournament_id=tid and number=num)) then raise exception 'INVALID_TABLES'; end if;
    for item in select l.* from crossplay.match_locations l join crossplay.matches m on m.tournament_id=l.tournament_id and m.id=l.match_id
      join crossplay.rounds r on r.tournament_id=l.tournament_id and r.id=l.round_id
      where l.tournament_id=tid and m.status<>'final' and r.status<>'draft' and
      (p_command='close_table' and l.table_number=num or p_command='move_match' and l.match_id=mid) order by l.round_id,l.queue_order,l.match_id loop
      select * into c from crossplay.match_clock_sessions where tournament_id=tid and match_id=item.match_id for update;
      if found and (c.status='running' or c.controller_actor is not null) then raise exception 'RELEASE_CLOCK_BEFORE_MOVE'; end if;
      select coalesce(max(queue_order),0)+1 into pos from crossplay.match_locations where tournament_id=tid and round_id=item.round_id and table_number=target;
      update crossplay.match_locations set table_number=target,queue_order=pos where tournament_id=tid and match_id=item.match_id;
      insert into crossplay.audit_events(tournament_id,action,actor,reason,details) values(tid,'move_match',p_actor,reason,jsonb_build_object('matchId',item.match_id,'fromTable',item.table_number,'toTable',target));
    end loop;
    if p_command='move_match' and not found then raise exception 'INVALID_MATCH'; end if;
    if p_command='close_table' then
      update crossplay.physical_tables set available=false where tournament_id=tid and number=num;
      update crossplay.table_devices set table_number=null where tournament_id=tid and table_number=num;
    end if;
  elsif p_command='reorder_queue' then
    mid:=(p_payload->>'matchId')::uuid;
    select l.* into old from crossplay.match_locations l join crossplay.matches m on m.tournament_id=l.tournament_id and m.id=l.match_id where l.tournament_id=tid and l.match_id=mid and m.status<>'final';
    if not found then raise exception 'INVALID_MATCH'; end if;
    if exists(select 1 from crossplay.match_locations l join crossplay.match_clock_sessions c on c.tournament_id=l.tournament_id and c.match_id=l.match_id
      join crossplay.matches m on m.tournament_id=l.tournament_id and m.id=l.match_id where l.tournament_id=tid and l.round_id=old.round_id and l.table_number=old.table_number and m.status<>'final' and (c.controller_actor is not null or c.status='running')) then raise exception 'RELEASE_CLOCK_BEFORE_MOVE'; end if;
    select min(l.queue_order) into pos from crossplay.match_locations l join crossplay.matches m on m.tournament_id=l.tournament_id and m.id=l.match_id
      where l.tournament_id=tid and l.round_id=old.round_id and l.table_number=old.table_number and m.status<>'final';
    update crossplay.match_locations l set queue_order=l.queue_order+1 from crossplay.matches m
      where l.tournament_id=tid and l.round_id=old.round_id and l.table_number=old.table_number and m.tournament_id=tid and m.id=l.match_id and m.status<>'final';
    update crossplay.match_locations set queue_order=pos where tournament_id=tid and match_id=mid;
  else raise exception 'INVALID_COMMAND'; end if;
  if p_command in ('configure_tables','set_table_available','close_table') then
    delete from crossplay.rounds where tournament_id=tid and status='draft';
    update crossplay.tournaments set version=version+1 where id=tid;
  end if;
  update crossplay.table_settings set version=case when v=0 then 1 else version+1 end where tournament_id=tid;
  insert into crossplay.audit_events(tournament_id,action,actor,reason,details) values(tid,p_command,p_actor,reason,p_payload-'sessionHash'-'inviteHash');
  result:=crossplay.tables_json(p_actor,tid);
  insert into crossplay.mutation_requests(actor_key,request_id,fingerprint,response,tournament_id,generation,command) values(actor,p_request_id,fp,result,tid,t.run_generation,'tables:'||p_command);
  return result;
end $$;


--
-- Name: table_match_ready(uuid, uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.table_match_ready(p_tid uuid, p_mid uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select not exists(select 1 from crossplay.table_settings where tournament_id=p_tid) or exists(
    select 1 from crossplay.match_locations l join crossplay.physical_tables t on t.tournament_id=l.tournament_id and t.number=l.table_number
    join crossplay.matches m on m.tournament_id=l.tournament_id and m.id=l.match_id
    join crossplay.rounds r on r.tournament_id=m.tournament_id and r.id=m.round_id
    where l.tournament_id=p_tid and l.match_id=p_mid and t.available and m.status<>'final' and r.status<>'draft'
    and not exists(select 1 from crossplay.match_locations other join crossplay.matches om on om.tournament_id=other.tournament_id and om.id=other.match_id
      where other.tournament_id=p_tid and other.round_id=l.round_id and other.table_number=l.table_number and other.queue_order<l.queue_order and om.status<>'final'))
$$;


--
-- Name: tables_json(jsonb, uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.tables_json(p_actor jsonb, p_tid uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select jsonb_build_object('available',true,'enabled',s.tournament_id is not null,'version',coalesce(s.version,0),
    'tables',coalesce((select jsonb_agg(jsonb_build_object('number',number,'available',available) order by number) from crossplay.physical_tables where tournament_id=p_tid),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(jsonb_build_object('matchId',l.match_id,'tableNumber',l.table_number,'originalTableNumber',l.original_table_number,'queueOrder',l.queue_order,
      'ready',crossplay.table_match_ready(p_tid,l.match_id)) order by r.number,l.table_number,l.queue_order)
      from crossplay.match_locations l join crossplay.rounds r on r.tournament_id=l.tournament_id and r.id=l.round_id
      where l.tournament_id=p_tid and (r.status<>'draft' or crossplay.is_staff(p_actor,p_tid))),'[]'::jsonb))
    || case when crossplay.is_staff(p_actor,p_tid) then jsonb_build_object('devices',coalesce((select jsonb_agg(jsonb_build_object('deviceId',device_id,'label',label,'tableNumber',table_number,'generation',generation) order by label)
      from crossplay.table_devices where tournament_id=p_tid),'[]'::jsonb)) else '{}'::jsonb end
  from (select 1) singleton left join crossplay.table_settings s on s.tournament_id=p_tid
$$;


--
-- Name: tables_version(); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.tables_version() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ select '20261008030000'::text $$;


--
-- Name: tournament_json(uuid); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.tournament_json(p_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name,'date',t.event_date,'status',t.status,'config',t.config,'seed',t.seed,'version',t.version,'createdAt',t.created_at,'correctionsOnly',t.corrections_only,
    'archivedFromStatus',t.archived_from_status,'runGeneration',t.run_generation,'lifecycleAvailable',true,
    'entrantCount',(select count(*) from crossplay.entrants where tournament_id=t.id),
    'currentRound',coalesce((select max(number) from crossplay.rounds where tournament_id=t.id and status<>'draft'),0))
  from crossplay.tournaments t where t.id=p_id
$$;


--
-- Name: validate_config(jsonb); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.validate_config(p_config jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
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
end $_$;


--
-- Name: validate_pairs(uuid, jsonb); Type: FUNCTION; Schema: crossplay; Owner: -
--

CREATE FUNCTION crossplay.validate_pairs(p_tournament uuid, p_pairs jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_events; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.audit_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tournament_id uuid NOT NULL,
    action text NOT NULL,
    actor jsonb NOT NULL,
    reason text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entrant_credentials; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.entrant_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tournament_id uuid NOT NULL,
    entrant_id uuid NOT NULL,
    invite_hash text NOT NULL,
    consumed_at timestamp with time zone,
    revoked_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT entrant_credentials_invite_hash_check CHECK ((invite_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: entrant_sessions; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.entrant_sessions (
    token_hash text NOT NULL,
    tournament_id uuid NOT NULL,
    entrant_id uuid NOT NULL,
    credential_id uuid NOT NULL,
    revoked_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT entrant_sessions_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: entrants; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.entrants (
    tournament_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    normalized_name text NOT NULL,
    seed integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT entrants_name_check CHECK ((((length(name) >= 1) AND (length(name) <= 80)) AND (name = btrim(name)))),
    CONSTRAINT entrants_seed_check CHECK (((seed >= 0) AND (seed <= 2147483647)))
);


--
-- Name: match_clock_events; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.match_clock_events (
    tournament_id uuid NOT NULL,
    match_id uuid NOT NULL,
    epoch bigint NOT NULL,
    sequence bigint NOT NULL,
    event jsonb NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: match_clock_sessions; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.match_clock_sessions (
    tournament_id uuid NOT NULL,
    match_id uuid NOT NULL,
    rules jsonb NOT NULL,
    status text DEFAULT 'ready'::text NOT NULL,
    active_side integer NOT NULL,
    used_ms1 bigint DEFAULT 0 NOT NULL,
    used_ms2 bigint DEFAULT 0 NOT NULL,
    anchor_at_ms bigint,
    epoch bigint DEFAULT 1 NOT NULL,
    sequence bigint DEFAULT 0 NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    controller_id uuid,
    controller_actor text,
    report_submitted boolean DEFAULT false NOT NULL,
    review_required boolean DEFAULT false NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    CONSTRAINT match_clock_sessions_active_side_check CHECK ((active_side = ANY (ARRAY[1, 2]))),
    CONSTRAINT match_clock_sessions_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'running'::text, 'paused'::text, 'ended'::text]))),
    CONSTRAINT match_clock_sessions_used_ms1_check CHECK ((used_ms1 >= 0)),
    CONSTRAINT match_clock_sessions_used_ms2_check CHECK ((used_ms2 >= 0))
);


--
-- Name: match_credentials; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.match_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tournament_id uuid NOT NULL,
    match_id uuid NOT NULL,
    invite_hash text NOT NULL,
    consumed_at timestamp with time zone,
    revoked_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT match_credentials_invite_hash_check CHECK ((invite_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: match_locations; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.match_locations (
    tournament_id uuid NOT NULL,
    match_id uuid NOT NULL,
    round_id uuid NOT NULL,
    table_number integer NOT NULL,
    original_table_number integer NOT NULL,
    queue_order integer NOT NULL,
    CONSTRAINT match_locations_queue_order_check CHECK ((queue_order > 0))
);


--
-- Name: match_report_clocks; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.match_report_clocks (
    tournament_id uuid NOT NULL,
    match_id uuid NOT NULL,
    report_id uuid NOT NULL,
    clock_version bigint NOT NULL,
    confirmation_method text DEFAULT 'shared_device'::text NOT NULL,
    acknowledged1 boolean DEFAULT false NOT NULL,
    acknowledged2 boolean DEFAULT false NOT NULL,
    CONSTRAINT match_report_clocks_confirmation_method_check CHECK ((confirmation_method = 'shared_device'::text))
);


--
-- Name: match_reports; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.match_reports (
    tournament_id uuid NOT NULL,
    match_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    revision integer NOT NULL,
    submitted_by uuid NOT NULL,
    raw1 integer NOT NULL,
    raw2 integer NOT NULL,
    overtime1 integer NOT NULL,
    overtime2 integer NOT NULL,
    dispute_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT match_reports_dispute_reason_check CHECK (((length(dispute_reason) >= 1) AND (length(dispute_reason) <= 1000))),
    CONSTRAINT match_reports_overtime1_check CHECK (((overtime1 >= 0) AND (overtime1 <= 86400))),
    CONSTRAINT match_reports_overtime2_check CHECK (((overtime2 >= 0) AND (overtime2 <= 86400))),
    CONSTRAINT match_reports_raw1_check CHECK (((raw1 >= '-100000'::integer) AND (raw1 <= 100000))),
    CONSTRAINT match_reports_raw2_check CHECK (((raw2 >= '-100000'::integer) AND (raw2 <= 100000)))
);


--
-- Name: match_sessions; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.match_sessions (
    token_hash text NOT NULL,
    tournament_id uuid NOT NULL,
    match_id uuid NOT NULL,
    credential_id uuid NOT NULL,
    revoked_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    device_id uuid,
    CONSTRAINT match_sessions_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: match_sides; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.match_sides (
    tournament_id uuid NOT NULL,
    round_id uuid NOT NULL,
    match_id uuid NOT NULL,
    side integer NOT NULL,
    entrant_id uuid NOT NULL,
    CONSTRAINT match_sides_side_check CHECK ((side = ANY (ARRAY[1, 2])))
);


--
-- Name: match_start_accounting; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.match_start_accounting (
    tournament_id uuid NOT NULL,
    match_id uuid NOT NULL,
    entrant_id uuid NOT NULL,
    "position" text NOT NULL,
    source text NOT NULL,
    CONSTRAINT match_start_accounting_position_check CHECK (("position" = ANY (ARRAY['first'::text, 'second'::text]))),
    CONSTRAINT match_start_accounting_source_check CHECK ((source = ANY (ARRAY['played'::text, 'unplayed_forfeit'::text])))
);


--
-- Name: match_starts; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.match_starts (
    tournament_id uuid NOT NULL,
    match_id uuid NOT NULL,
    entrant_id uuid NOT NULL,
    method text NOT NULL,
    counts jsonb NOT NULL,
    played boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    corrected_at timestamp with time zone,
    CONSTRAINT match_starts_method_check CHECK ((method = ANY (ARRAY['fewer_firsts'::text, 'more_seconds'::text, 'random'::text, 'organizer'::text])))
);


--
-- Name: matches; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.matches (
    tournament_id uuid NOT NULL,
    round_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_number integer NOT NULL,
    kind text NOT NULL,
    status text DEFAULT 'unreported'::text NOT NULL,
    revision integer DEFAULT 0 NOT NULL,
    official_revision_id uuid,
    current_report_id uuid,
    CONSTRAINT matches_kind_check CHECK ((kind = ANY (ARRAY['played'::text, 'bye'::text, 'forfeit'::text, 'double_forfeit'::text]))),
    CONSTRAINT matches_revision_check CHECK ((revision >= 0)),
    CONSTRAINT matches_status_check CHECK ((status = ANY (ARRAY['unreported'::text, 'awaiting_confirmation'::text, 'disputed'::text, 'final'::text]))),
    CONSTRAINT matches_table_number_check CHECK (((table_number >= 1) AND (table_number <= 128)))
);


--
-- Name: mutation_requests; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.mutation_requests (
    actor_key text NOT NULL,
    request_id uuid NOT NULL,
    fingerprint text NOT NULL,
    response jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tournament_id uuid,
    generation bigint,
    command text,
    retired boolean DEFAULT false NOT NULL
);


--
-- Name: organizers; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.organizers (
    user_id uuid NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: physical_tables; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.physical_tables (
    tournament_id uuid NOT NULL,
    number integer NOT NULL,
    available boolean DEFAULT true NOT NULL,
    CONSTRAINT physical_tables_number_check CHECK (((number >= 1) AND (number <= 128)))
);


--
-- Name: rate_limits; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.rate_limits (
    key text NOT NULL,
    hits integer NOT NULL,
    ends_at timestamp with time zone NOT NULL
);


--
-- Name: result_revisions; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.result_revisions (
    tournament_id uuid NOT NULL,
    match_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    revision integer NOT NULL,
    kind text NOT NULL,
    result jsonb NOT NULL,
    rules jsonb NOT NULL,
    actor jsonb NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT result_revisions_kind_check CHECK ((kind = ANY (ARRAY['played'::text, 'bye'::text, 'forfeit'::text, 'double_forfeit'::text])))
);


--
-- Name: rounds; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.rounds (
    tournament_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    number integer NOT NULL,
    status text NOT NULL,
    engine_version text NOT NULL,
    input_hash text NOT NULL,
    input_version bigint NOT NULL,
    input_snapshot jsonb NOT NULL,
    published_at timestamp with time zone,
    CONSTRAINT rounds_engine_version_check CHECK (((length(engine_version) >= 1) AND (length(engine_version) <= 200))),
    CONSTRAINT rounds_input_hash_check CHECK (((length(input_hash) >= 1) AND (length(input_hash) <= 200))),
    CONSTRAINT rounds_number_check CHECK (((number >= 1) AND (number <= 255))),
    CONSTRAINT rounds_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'completed'::text])))
);


--
-- Name: schema_metadata; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.schema_metadata (
    version text NOT NULL
);


--
-- Name: table_devices; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.table_devices (
    tournament_id uuid NOT NULL,
    device_id uuid NOT NULL,
    label text NOT NULL,
    table_number integer,
    generation bigint NOT NULL,
    CONSTRAINT table_devices_label_check CHECK (((length(label) >= 1) AND (length(label) <= 80)))
);


--
-- Name: table_settings; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.table_settings (
    tournament_id uuid NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    CONSTRAINT table_settings_version_check CHECK ((version > 0))
);


--
-- Name: tournament_staff; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.tournament_staff (
    tournament_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    CONSTRAINT tournament_staff_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'editor'::text])))
);


--
-- Name: tournaments; Type: TABLE; Schema: crossplay; Owner: -
--

CREATE TABLE crossplay.tournaments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    event_date date,
    status text DEFAULT 'draft'::text NOT NULL,
    config jsonb NOT NULL,
    frozen_config jsonb,
    seed text NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    corrections_only boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_from_status text,
    archived_at timestamp with time zone,
    run_generation bigint DEFAULT 0 NOT NULL,
    requests_invalid_before timestamp with time zone,
    CONSTRAINT crossplay_archive_state CHECK ((((status = 'archived'::text) AND (archived_from_status IS NOT NULL) AND (archived_from_status = ANY (ARRAY['draft'::text, 'active'::text, 'finished'::text])) AND (archived_at IS NOT NULL)) OR ((status <> 'archived'::text) AND (archived_from_status IS NULL) AND (archived_at IS NULL)))),
    CONSTRAINT tournaments_name_check CHECK ((((length(name) >= 1) AND (length(name) <= 120)) AND (name = btrim(name)))),
    CONSTRAINT tournaments_run_generation_check CHECK ((run_generation >= 0)),
    CONSTRAINT tournaments_seed_check CHECK (((length(seed) >= 1) AND (length(seed) <= 200))),
    CONSTRAINT tournaments_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'::text)),
    CONSTRAINT tournaments_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'finished'::text, 'archived'::text]))),
    CONSTRAINT tournaments_version_check CHECK ((version >= 0))
);


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: entrant_credentials entrant_credentials_invite_hash_key; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.entrant_credentials
    ADD CONSTRAINT entrant_credentials_invite_hash_key UNIQUE (invite_hash);


--
-- Name: entrant_credentials entrant_credentials_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.entrant_credentials
    ADD CONSTRAINT entrant_credentials_pkey PRIMARY KEY (id);


--
-- Name: entrant_credentials entrant_credentials_tournament_id_entrant_id_id_key; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.entrant_credentials
    ADD CONSTRAINT entrant_credentials_tournament_id_entrant_id_id_key UNIQUE (tournament_id, entrant_id, id);


--
-- Name: entrant_sessions entrant_sessions_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.entrant_sessions
    ADD CONSTRAINT entrant_sessions_pkey PRIMARY KEY (token_hash);


--
-- Name: entrants entrants_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.entrants
    ADD CONSTRAINT entrants_pkey PRIMARY KEY (tournament_id, id);


--
-- Name: entrants entrants_tournament_id_normalized_name_key; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.entrants
    ADD CONSTRAINT entrants_tournament_id_normalized_name_key UNIQUE (tournament_id, normalized_name);


--
-- Name: match_clock_events match_clock_events_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_clock_events
    ADD CONSTRAINT match_clock_events_pkey PRIMARY KEY (tournament_id, match_id, epoch, sequence);


--
-- Name: match_clock_sessions match_clock_sessions_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_clock_sessions
    ADD CONSTRAINT match_clock_sessions_pkey PRIMARY KEY (tournament_id, match_id);


--
-- Name: match_credentials match_credentials_invite_hash_key; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_credentials
    ADD CONSTRAINT match_credentials_invite_hash_key UNIQUE (invite_hash);


--
-- Name: match_credentials match_credentials_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_credentials
    ADD CONSTRAINT match_credentials_pkey PRIMARY KEY (id);


--
-- Name: match_credentials match_credentials_tournament_id_match_id_id_key; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_credentials
    ADD CONSTRAINT match_credentials_tournament_id_match_id_id_key UNIQUE (tournament_id, match_id, id);


--
-- Name: match_locations match_locations_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_locations
    ADD CONSTRAINT match_locations_pkey PRIMARY KEY (tournament_id, match_id);


--
-- Name: match_locations match_locations_tournament_id_round_id_table_number_queue_o_key; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_locations
    ADD CONSTRAINT match_locations_tournament_id_round_id_table_number_queue_o_key UNIQUE (tournament_id, round_id, table_number, queue_order) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: match_report_clocks match_report_clocks_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_report_clocks
    ADD CONSTRAINT match_report_clocks_pkey PRIMARY KEY (tournament_id, match_id, report_id);


--
-- Name: match_reports match_reports_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_reports
    ADD CONSTRAINT match_reports_pkey PRIMARY KEY (tournament_id, match_id, id);


--
-- Name: match_reports match_reports_tournament_id_match_id_revision_key; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_reports
    ADD CONSTRAINT match_reports_tournament_id_match_id_revision_key UNIQUE (tournament_id, match_id, revision);


--
-- Name: match_sessions match_sessions_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_sessions
    ADD CONSTRAINT match_sessions_pkey PRIMARY KEY (token_hash);


--
-- Name: match_sides match_sides_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_sides
    ADD CONSTRAINT match_sides_pkey PRIMARY KEY (tournament_id, match_id, side);


--
-- Name: match_sides match_sides_tournament_id_round_id_entrant_id_key; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_sides
    ADD CONSTRAINT match_sides_tournament_id_round_id_entrant_id_key UNIQUE (tournament_id, round_id, entrant_id);


--
-- Name: match_start_accounting match_start_accounting_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_start_accounting
    ADD CONSTRAINT match_start_accounting_pkey PRIMARY KEY (tournament_id, match_id, entrant_id);


--
-- Name: match_starts match_starts_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_starts
    ADD CONSTRAINT match_starts_pkey PRIMARY KEY (tournament_id, match_id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (tournament_id, id);


--
-- Name: matches matches_tournament_id_round_id_id_key; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.matches
    ADD CONSTRAINT matches_tournament_id_round_id_id_key UNIQUE (tournament_id, round_id, id);


--
-- Name: matches matches_tournament_id_round_id_table_number_key; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.matches
    ADD CONSTRAINT matches_tournament_id_round_id_table_number_key UNIQUE (tournament_id, round_id, table_number);


--
-- Name: mutation_requests mutation_requests_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.mutation_requests
    ADD CONSTRAINT mutation_requests_pkey PRIMARY KEY (actor_key, request_id);


--
-- Name: organizers organizers_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.organizers
    ADD CONSTRAINT organizers_pkey PRIMARY KEY (user_id);


--
-- Name: physical_tables physical_tables_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.physical_tables
    ADD CONSTRAINT physical_tables_pkey PRIMARY KEY (tournament_id, number);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (key);


--
-- Name: result_revisions result_revisions_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.result_revisions
    ADD CONSTRAINT result_revisions_pkey PRIMARY KEY (tournament_id, match_id, id);


--
-- Name: result_revisions result_revisions_tournament_id_match_id_revision_key; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.result_revisions
    ADD CONSTRAINT result_revisions_tournament_id_match_id_revision_key UNIQUE (tournament_id, match_id, revision);


--
-- Name: rounds rounds_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.rounds
    ADD CONSTRAINT rounds_pkey PRIMARY KEY (tournament_id, id);


--
-- Name: rounds rounds_tournament_id_number_key; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.rounds
    ADD CONSTRAINT rounds_tournament_id_number_key UNIQUE (tournament_id, number);


--
-- Name: schema_metadata schema_metadata_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.schema_metadata
    ADD CONSTRAINT schema_metadata_pkey PRIMARY KEY (version);


--
-- Name: table_devices table_devices_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.table_devices
    ADD CONSTRAINT table_devices_pkey PRIMARY KEY (tournament_id, device_id);


--
-- Name: table_devices table_devices_tournament_id_table_number_key; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.table_devices
    ADD CONSTRAINT table_devices_tournament_id_table_number_key UNIQUE (tournament_id, table_number);


--
-- Name: table_settings table_settings_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.table_settings
    ADD CONSTRAINT table_settings_pkey PRIMARY KEY (tournament_id);


--
-- Name: tournament_staff tournament_staff_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.tournament_staff
    ADD CONSTRAINT tournament_staff_pkey PRIMARY KEY (tournament_id, user_id);


--
-- Name: tournaments tournaments_pkey; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.tournaments
    ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);


--
-- Name: tournaments tournaments_slug_key; Type: CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.tournaments
    ADD CONSTRAINT tournaments_slug_key UNIQUE (slug);


--
-- Name: crossplay_one_draft; Type: INDEX; Schema: crossplay; Owner: -
--

CREATE UNIQUE INDEX crossplay_one_draft ON crossplay.rounds USING btree (tournament_id) WHERE (status = 'draft'::text);


--
-- Name: crossplay_request_tournament; Type: INDEX; Schema: crossplay; Owner: -
--

CREATE INDEX crossplay_request_tournament ON crossplay.mutation_requests USING btree (tournament_id);


--
-- Name: audit_events audit_events_tournament_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.audit_events
    ADD CONSTRAINT audit_events_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES crossplay.tournaments(id);


--
-- Name: matches crossplay_current_report_fk; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.matches
    ADD CONSTRAINT crossplay_current_report_fk FOREIGN KEY (tournament_id, id, current_report_id) REFERENCES crossplay.match_reports(tournament_id, match_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: matches crossplay_official_revision_fk; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.matches
    ADD CONSTRAINT crossplay_official_revision_fk FOREIGN KEY (tournament_id, id, official_revision_id) REFERENCES crossplay.result_revisions(tournament_id, match_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: entrant_credentials entrant_credentials_tournament_id_entrant_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.entrant_credentials
    ADD CONSTRAINT entrant_credentials_tournament_id_entrant_id_fkey FOREIGN KEY (tournament_id, entrant_id) REFERENCES crossplay.entrants(tournament_id, id) ON DELETE CASCADE;


--
-- Name: entrant_sessions entrant_sessions_tournament_id_entrant_id_credential_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.entrant_sessions
    ADD CONSTRAINT entrant_sessions_tournament_id_entrant_id_credential_id_fkey FOREIGN KEY (tournament_id, entrant_id, credential_id) REFERENCES crossplay.entrant_credentials(tournament_id, entrant_id, id) ON DELETE CASCADE;


--
-- Name: entrants entrants_tournament_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.entrants
    ADD CONSTRAINT entrants_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES crossplay.tournaments(id);


--
-- Name: match_clock_events match_clock_events_tournament_id_match_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_clock_events
    ADD CONSTRAINT match_clock_events_tournament_id_match_id_fkey FOREIGN KEY (tournament_id, match_id) REFERENCES crossplay.match_clock_sessions(tournament_id, match_id);


--
-- Name: match_clock_sessions match_clock_sessions_tournament_id_match_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_clock_sessions
    ADD CONSTRAINT match_clock_sessions_tournament_id_match_id_fkey FOREIGN KEY (tournament_id, match_id) REFERENCES crossplay.matches(tournament_id, id) ON DELETE CASCADE;


--
-- Name: match_credentials match_credentials_tournament_id_match_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_credentials
    ADD CONSTRAINT match_credentials_tournament_id_match_id_fkey FOREIGN KEY (tournament_id, match_id) REFERENCES crossplay.matches(tournament_id, id) ON DELETE CASCADE;


--
-- Name: match_locations match_locations_tournament_id_round_id_match_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_locations
    ADD CONSTRAINT match_locations_tournament_id_round_id_match_id_fkey FOREIGN KEY (tournament_id, round_id, match_id) REFERENCES crossplay.matches(tournament_id, round_id, id) ON DELETE CASCADE;


--
-- Name: match_locations match_locations_tournament_id_table_number_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_locations
    ADD CONSTRAINT match_locations_tournament_id_table_number_fkey FOREIGN KEY (tournament_id, table_number) REFERENCES crossplay.physical_tables(tournament_id, number);


--
-- Name: match_report_clocks match_report_clocks_tournament_id_match_id_report_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_report_clocks
    ADD CONSTRAINT match_report_clocks_tournament_id_match_id_report_id_fkey FOREIGN KEY (tournament_id, match_id, report_id) REFERENCES crossplay.match_reports(tournament_id, match_id, id);


--
-- Name: match_reports match_reports_tournament_id_match_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_reports
    ADD CONSTRAINT match_reports_tournament_id_match_id_fkey FOREIGN KEY (tournament_id, match_id) REFERENCES crossplay.matches(tournament_id, id);


--
-- Name: match_reports match_reports_tournament_id_submitted_by_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_reports
    ADD CONSTRAINT match_reports_tournament_id_submitted_by_fkey FOREIGN KEY (tournament_id, submitted_by) REFERENCES crossplay.entrants(tournament_id, id);


--
-- Name: match_sessions match_sessions_tournament_id_match_id_credential_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_sessions
    ADD CONSTRAINT match_sessions_tournament_id_match_id_credential_id_fkey FOREIGN KEY (tournament_id, match_id, credential_id) REFERENCES crossplay.match_credentials(tournament_id, match_id, id) ON DELETE CASCADE;


--
-- Name: match_sides match_sides_tournament_id_entrant_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_sides
    ADD CONSTRAINT match_sides_tournament_id_entrant_id_fkey FOREIGN KEY (tournament_id, entrant_id) REFERENCES crossplay.entrants(tournament_id, id);


--
-- Name: match_sides match_sides_tournament_id_round_id_match_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_sides
    ADD CONSTRAINT match_sides_tournament_id_round_id_match_id_fkey FOREIGN KEY (tournament_id, round_id, match_id) REFERENCES crossplay.matches(tournament_id, round_id, id) ON DELETE CASCADE;


--
-- Name: match_start_accounting match_start_accounting_tournament_id_entrant_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_start_accounting
    ADD CONSTRAINT match_start_accounting_tournament_id_entrant_id_fkey FOREIGN KEY (tournament_id, entrant_id) REFERENCES crossplay.entrants(tournament_id, id);


--
-- Name: match_start_accounting match_start_accounting_tournament_id_match_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_start_accounting
    ADD CONSTRAINT match_start_accounting_tournament_id_match_id_fkey FOREIGN KEY (tournament_id, match_id) REFERENCES crossplay.matches(tournament_id, id) ON DELETE CASCADE;


--
-- Name: match_starts match_starts_tournament_id_entrant_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_starts
    ADD CONSTRAINT match_starts_tournament_id_entrant_id_fkey FOREIGN KEY (tournament_id, entrant_id) REFERENCES crossplay.entrants(tournament_id, id);


--
-- Name: match_starts match_starts_tournament_id_match_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.match_starts
    ADD CONSTRAINT match_starts_tournament_id_match_id_fkey FOREIGN KEY (tournament_id, match_id) REFERENCES crossplay.matches(tournament_id, id) ON DELETE CASCADE;


--
-- Name: matches matches_tournament_id_round_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.matches
    ADD CONSTRAINT matches_tournament_id_round_id_fkey FOREIGN KEY (tournament_id, round_id) REFERENCES crossplay.rounds(tournament_id, id) ON DELETE CASCADE;


--
-- Name: organizers organizers_user_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.organizers
    ADD CONSTRAINT organizers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: physical_tables physical_tables_tournament_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.physical_tables
    ADD CONSTRAINT physical_tables_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES crossplay.table_settings(tournament_id) ON DELETE CASCADE;


--
-- Name: result_revisions result_revisions_tournament_id_match_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.result_revisions
    ADD CONSTRAINT result_revisions_tournament_id_match_id_fkey FOREIGN KEY (tournament_id, match_id) REFERENCES crossplay.matches(tournament_id, id);


--
-- Name: rounds rounds_tournament_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.rounds
    ADD CONSTRAINT rounds_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES crossplay.tournaments(id);


--
-- Name: table_devices table_devices_tournament_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.table_devices
    ADD CONSTRAINT table_devices_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES crossplay.table_settings(tournament_id) ON DELETE CASCADE;


--
-- Name: table_devices table_devices_tournament_id_table_number_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.table_devices
    ADD CONSTRAINT table_devices_tournament_id_table_number_fkey FOREIGN KEY (tournament_id, table_number) REFERENCES crossplay.physical_tables(tournament_id, number);


--
-- Name: table_settings table_settings_tournament_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.table_settings
    ADD CONSTRAINT table_settings_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES crossplay.tournaments(id) ON DELETE CASCADE;


--
-- Name: tournament_staff tournament_staff_tournament_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.tournament_staff
    ADD CONSTRAINT tournament_staff_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES crossplay.tournaments(id);


--
-- Name: tournament_staff tournament_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: crossplay; Owner: -
--

ALTER TABLE ONLY crossplay.tournament_staff
    ADD CONSTRAINT tournament_staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES crossplay.organizers(user_id);


--
-- Name: audit_events; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.audit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: entrant_credentials; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.entrant_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: entrant_sessions; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.entrant_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: entrants; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.entrants ENABLE ROW LEVEL SECURITY;

--
-- Name: match_clock_events; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.match_clock_events ENABLE ROW LEVEL SECURITY;

--
-- Name: match_clock_sessions; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.match_clock_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: match_credentials; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.match_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: match_locations; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.match_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: match_report_clocks; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.match_report_clocks ENABLE ROW LEVEL SECURITY;

--
-- Name: match_reports; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.match_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: match_sessions; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.match_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: match_sides; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.match_sides ENABLE ROW LEVEL SECURITY;

--
-- Name: match_start_accounting; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.match_start_accounting ENABLE ROW LEVEL SECURITY;

--
-- Name: match_starts; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.match_starts ENABLE ROW LEVEL SECURITY;

--
-- Name: matches; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.matches ENABLE ROW LEVEL SECURITY;

--
-- Name: mutation_requests; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.mutation_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: organizers; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.organizers ENABLE ROW LEVEL SECURITY;

--
-- Name: physical_tables; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.physical_tables ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limits; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: result_revisions; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.result_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: rounds; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.rounds ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_metadata; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.schema_metadata ENABLE ROW LEVEL SECURITY;

--
-- Name: table_devices; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.table_devices ENABLE ROW LEVEL SECURITY;

--
-- Name: table_settings; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.table_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_staff; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.tournament_staff ENABLE ROW LEVEL SECURITY;

--
-- Name: tournaments; Type: ROW SECURITY; Schema: crossplay; Owner: -
--

ALTER TABLE crossplay.tournaments ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA crossplay; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA crossplay TO crossplay_runtime;


--
-- Name: FUNCTION allocate_tables(p_tid uuid, p_round uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.allocate_tables(p_tid uuid, p_round uuid) FROM PUBLIC;


--
-- Name: FUNCTION calculate_result(p_kind text, p_input jsonb, p_rules jsonb, p_winner_side integer); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.calculate_result(p_kind text, p_input jsonb, p_rules jsonb, p_winner_side integer) FROM PUBLIC;


--
-- Name: FUNCTION clear_tournament_play(p_tid uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.clear_tournament_play(p_tid uuid) FROM PUBLIC;


--
-- Name: FUNCTION clock_execute(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_clock_version bigint); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.clock_execute(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_clock_version bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION crossplay.clock_execute(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_clock_version bigint) TO crossplay_runtime;


--
-- Name: FUNCTION clock_execute_before_lifecycle(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_clock_version bigint); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.clock_execute_before_lifecycle(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_clock_version bigint) FROM PUBLIC;


--
-- Name: FUNCTION clock_execute_before_tables(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_clock_version bigint); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.clock_execute_before_tables(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_clock_version bigint) FROM PUBLIC;


--
-- Name: FUNCTION clock_read(p_actor jsonb, p_match_id uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.clock_read(p_actor jsonb, p_match_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION crossplay.clock_read(p_actor jsonb, p_match_id uuid) TO crossplay_runtime;


--
-- Name: FUNCTION clock_read_before_lifecycle(p_actor jsonb, p_match_id uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.clock_read_before_lifecycle(p_actor jsonb, p_match_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION clock_read_before_tables(p_actor jsonb, p_match_id uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.clock_read_before_tables(p_actor jsonb, p_match_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION clock_read_before_turn_time(p_actor jsonb, p_match_id uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.clock_read_before_turn_time(p_actor jsonb, p_match_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION clock_version(); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.clock_version() FROM PUBLIC;
GRANT ALL ON FUNCTION crossplay.clock_version() TO crossplay_runtime;


--
-- Name: FUNCTION consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION crossplay.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer) TO crossplay_runtime;


--
-- Name: FUNCTION display_read(p_tournament text); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.display_read(p_tournament text) FROM PUBLIC;
GRANT ALL ON FUNCTION crossplay.display_read(p_tournament text) TO crossplay_runtime;


--
-- Name: FUNCTION display_version(); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.display_version() FROM PUBLIC;
GRANT ALL ON FUNCTION crossplay.display_version() TO crossplay_runtime;


--
-- Name: FUNCTION execute(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.execute(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION crossplay.execute(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint) TO crossplay_runtime;


--
-- Name: FUNCTION execute_base(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.execute_base(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint) FROM PUBLIC;


--
-- Name: FUNCTION execute_before_lifecycle(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.execute_before_lifecycle(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint) FROM PUBLIC;


--
-- Name: FUNCTION execute_before_tables(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.execute_before_tables(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint) FROM PUBLIC;


--
-- Name: FUNCTION finalize_match(p_tournament uuid, p_match uuid, p_kind text, p_input jsonb, p_actor jsonb, p_reason text); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.finalize_match(p_tournament uuid, p_match uuid, p_kind text, p_input jsonb, p_actor jsonb, p_reason text) FROM PUBLIC;


--
-- Name: FUNCTION finalize_match_base(p_tournament uuid, p_match uuid, p_kind text, p_input jsonb, p_actor jsonb, p_reason text); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.finalize_match_base(p_tournament uuid, p_match uuid, p_kind text, p_input jsonb, p_actor jsonb, p_reason text) FROM PUBLIC;


--
-- Name: FUNCTION is_organizer(p_actor jsonb); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.is_organizer(p_actor jsonb) FROM PUBLIC;


--
-- Name: FUNCTION is_staff(p_actor jsonb, p_tournament uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.is_staff(p_actor jsonb, p_tournament uuid) FROM PUBLIC;


--
-- Name: FUNCTION lifecycle_version(); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.lifecycle_version() FROM PUBLIC;
GRANT ALL ON FUNCTION crossplay.lifecycle_version() TO crossplay_runtime;


--
-- Name: FUNCTION match_session_valid(p_actor jsonb, p_tid uuid, p_mid uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.match_session_valid(p_actor jsonb, p_tid uuid, p_mid uuid) FROM PUBLIC;


--
-- Name: FUNCTION name_key(p_name text); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.name_key(p_name text) FROM PUBLIC;


--
-- Name: FUNCTION read_model(p_actor jsonb, p_tournament text, p_scope text); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.read_model(p_actor jsonb, p_tournament text, p_scope text) FROM PUBLIC;
GRANT ALL ON FUNCTION crossplay.read_model(p_actor jsonb, p_tournament text, p_scope text) TO crossplay_runtime;


--
-- Name: FUNCTION read_model_before_lifecycle(p_actor jsonb, p_tournament text, p_scope text); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.read_model_before_lifecycle(p_actor jsonb, p_tournament text, p_scope text) FROM PUBLIC;


--
-- Name: FUNCTION read_model_before_tables(p_actor jsonb, p_tournament text, p_scope text); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.read_model_before_tables(p_actor jsonb, p_tournament text, p_scope text) FROM PUBLIC;


--
-- Name: FUNCTION record_played_start(p_tid uuid, p_mid uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.record_played_start(p_tid uuid, p_mid uuid) FROM PUBLIC;


--
-- Name: FUNCTION resolve_match_start(p_tid uuid, p_mid uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.resolve_match_start(p_tid uuid, p_mid uuid) FROM PUBLIC;


--
-- Name: FUNCTION schema_version(); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.schema_version() FROM PUBLIC;
GRANT ALL ON FUNCTION crossplay.schema_version() TO crossplay_runtime;


--
-- Name: FUNCTION session_entrant(p_actor jsonb, p_tournament uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.session_entrant(p_actor jsonb, p_tournament uuid) FROM PUBLIC;


--
-- Name: FUNCTION table_device_busy(p_tid uuid, p_device uuid, p_except uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.table_device_busy(p_tid uuid, p_device uuid, p_except uuid) FROM PUBLIC;


--
-- Name: FUNCTION table_enter_match(p_actor jsonb, p_payload jsonb, p_request_id uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.table_enter_match(p_actor jsonb, p_payload jsonb, p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION crossplay.table_enter_match(p_actor jsonb, p_payload jsonb, p_request_id uuid) TO crossplay_runtime;


--
-- Name: FUNCTION table_execute(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.table_execute(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION crossplay.table_execute(p_actor jsonb, p_command text, p_payload jsonb, p_request_id uuid, p_expected_version bigint) TO crossplay_runtime;


--
-- Name: FUNCTION table_match_ready(p_tid uuid, p_mid uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.table_match_ready(p_tid uuid, p_mid uuid) FROM PUBLIC;


--
-- Name: FUNCTION tables_json(p_actor jsonb, p_tid uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.tables_json(p_actor jsonb, p_tid uuid) FROM PUBLIC;


--
-- Name: FUNCTION tables_version(); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.tables_version() FROM PUBLIC;
GRANT ALL ON FUNCTION crossplay.tables_version() TO crossplay_runtime;


--
-- Name: FUNCTION tournament_json(p_id uuid); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.tournament_json(p_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION validate_config(p_config jsonb); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.validate_config(p_config jsonb) FROM PUBLIC;


--
-- Name: FUNCTION validate_pairs(p_tournament uuid, p_pairs jsonb); Type: ACL; Schema: crossplay; Owner: -
--

REVOKE ALL ON FUNCTION crossplay.validate_pairs(p_tournament uuid, p_pairs jsonb) FROM PUBLIC;


--
-- PostgreSQL database dump complete
--


