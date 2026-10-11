-- Spectator telemetry only: never an input to official time, reports, or pairing.
create table crossplay.display_clock_samples (
  tournament_id uuid not null, match_id uuid not null,
  generation bigint not null, epoch bigint not null, version bigint not null, sequence bigint not null,
  sampled_at_ms bigint not null, received_at_ms bigint not null,
  uncertainty_ms integer not null check (uncertainty_ms between 0 and 1000),
  used_ms1 bigint not null check (used_ms1>=0), used_ms2 bigint not null check (used_ms2>=0),
  primary key (tournament_id,match_id),
  foreign key (tournament_id,match_id) references crossplay.matches(tournament_id,id) on delete cascade
);
alter table crossplay.display_clock_samples enable row level security;
revoke all on crossplay.display_clock_samples from public,anon,authenticated,service_role,crossplay_runtime;

create function crossplay.display_clock_checkpoint(p_actor jsonb,p_match_id uuid,p_sample jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tid uuid; t crossplay.tournaments%rowtype; m crossplay.matches%rowtype; c crossplay.match_clock_sessions%rowtype;
  stamp bigint; captured bigint; uncertainty integer; elapsed bigint; actor_key text;
begin
  select tournament_id into tid from crossplay.matches where id=p_match_id;
  if tid is null then raise exception 'NOT_FOUND'; end if;
  select * into t from crossplay.tournaments where id=tid for update;
  select * into m from crossplay.matches where tournament_id=tid and id=p_match_id for update;
  if t.id is null or m.id is null then raise exception 'NOT_FOUND'; end if;
  select * into c from crossplay.match_clock_sessions where tournament_id=tid and match_id=p_match_id for update;
  actor_key:=coalesce(p_actor->>'userId',p_actor->>'matchSessionHash');
  if not (crossplay.is_staff(p_actor,tid) or crossplay.match_session_valid(p_actor,tid,p_match_id))
    or c.match_id is null or c.controller_actor is distinct from actor_key
    or c.controller_id is distinct from (p_sample->>'controllerId')::uuid then raise exception 'FORBIDDEN'; end if;
  if t.status<>'active' or m.status in ('final','disputed') or c.review_required or c.report_submitted
    or t.run_generation is distinct from (p_sample->>'generation')::bigint
    or c.epoch is distinct from (p_sample->>'epoch')::bigint
    or c.version is distinct from (p_sample->>'version')::bigint
    or c.sequence is distinct from (p_sample->>'sequence')::bigint then raise exception 'STALE_CLOCK_VERSION'; end if;
  if not exists(select 1 from crossplay.rounds where tournament_id=tid and id=m.round_id and status='published')
    or not crossplay.table_match_ready(tid,m.id) then raise exception 'INVALID_MATCH'; end if;
  stamp:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  captured:=(p_sample->>'sampledAtMs')::bigint;
  uncertainty:=(p_sample->>'uncertaintyMs')::integer;
  elapsed:=(p_sample->>'elapsedMs')::bigint;
  if captured is null or uncertainty is null or elapsed is null or uncertainty not between 0 and 1000
    or elapsed not between 0 and 172800000 or captured>stamp+uncertainty or stamp-captured>2000
    or (c.status<>'running' and elapsed<>0) then raise exception 'INVALID_PAYLOAD'; end if;
  insert into crossplay.display_clock_samples values(tid,m.id,t.run_generation,c.epoch,c.version,c.sequence,
    captured,stamp,uncertainty,c.used_ms1+case when c.status='running' and c.active_side=1 then elapsed else 0 end,
    c.used_ms2+case when c.status='running' and c.active_side=2 then elapsed else 0 end)
  on conflict(tournament_id,match_id) do update set generation=excluded.generation,epoch=excluded.epoch,
    version=excluded.version,sequence=excluded.sequence,sampled_at_ms=excluded.sampled_at_ms,
    received_at_ms=excluded.received_at_ms,uncertainty_ms=excluded.uncertainty_ms,used_ms1=excluded.used_ms1,used_ms2=excluded.used_ms2
  where excluded.sampled_at_ms>crossplay.display_clock_samples.sampled_at_ms;
  return jsonb_build_object('serverNowMs',floor(extract(epoch from clock_timestamp())*1000)::bigint);
end $$;

alter function crossplay.display_read(text) rename to display_read_before_live_clocks;
create function crossplay.display_read(p_tournament text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare source jsonb; tid uuid; extra jsonb; item record; t crossplay.tournaments%rowtype;
begin
  source:=crossplay.display_read_before_live_clocks(p_tournament);
  tid:=(source#>>'{snapshot,tournament,id}')::uuid;
  select * into strict t from crossplay.tournaments where id=tid;
  for item in select m.*,c.status as clock_status,c.active_side,c.used_ms1,c.used_ms2,c.epoch,c.version as clock_version,
    c.sequence,c.rules,c.review_required,c.report_submitted,r.revision as report_revision,
    r.raw1,r.raw2,r.overtime1,r.overtime2,
    s.sampled_at_ms,s.uncertainty_ms,s.used_ms1 as sample_used1,s.used_ms2 as sample_used2
    from crossplay.matches m join crossplay.rounds rd on rd.tournament_id=m.tournament_id and rd.id=m.round_id
    left join crossplay.match_clock_sessions c on c.tournament_id=tid and c.match_id=m.id
    left join crossplay.match_reports r on r.tournament_id=tid and r.match_id=m.id and r.id=m.current_report_id
    left join crossplay.display_clock_samples s on s.tournament_id=tid and s.match_id=m.id
      and s.generation=t.run_generation and s.epoch=c.epoch and s.version=c.version and s.sequence=c.sequence
    where m.tournament_id=tid and rd.status<>'draft'
  loop
    extra:='{}'::jsonb;
    if t.status='active' and source#>>array['matches',item.id::text,'status']='awaiting_confirmation' and item.report_revision is not null then
      extra:=jsonb_build_object('provisional',jsonb_build_object('revision',item.report_revision,
        'adjusted1',item.raw1-(item.overtime1/(t.frozen_config->>'penaltyIntervalSeconds')::integer)*(t.frozen_config->>'penaltyPoints')::integer,
        'adjusted2',item.raw2-(item.overtime2/(t.frozen_config->>'penaltyIntervalSeconds')::integer)*(t.frozen_config->>'penaltyPoints')::integer));
    end if;
    if t.status='active' and source#>>array['matches',item.id::text,'status'] in ('ready','playing','paused','reporting')
      and item.clock_status is not null and not item.review_required and not item.report_submitted then
      extra:=extra||jsonb_build_object('clock',jsonb_build_object('status',item.clock_status,'activeSide',item.active_side,
        'usedMs',jsonb_build_array(item.used_ms1,item.used_ms2),'epoch',item.epoch,'version',item.clock_version,'sequence',item.sequence,
        'rules',jsonb_build_object('timeLimitSeconds',item.rules->'timeLimitSeconds','penaltyIntervalSeconds',item.rules->'penaltyIntervalSeconds','penaltyPoints',item.rules->'penaltyPoints'),
        'sample',case when item.sampled_at_ms is not null then jsonb_build_object('usedMs',jsonb_build_array(item.sample_used1,item.sample_used2),
          'sampledAtMs',item.sampled_at_ms,'uncertaintyMs',item.uncertainty_ms) else null end));
    end if;
    source:=jsonb_set(source,array['matches',item.id::text],(source#>array['matches',item.id::text])||extra);
  end loop;
  return source;
end $$;
create or replace function crossplay.display_version() returns text
language sql stable security definer set search_path='' as $$ select '20261011010000'::text $$;
revoke all on function crossplay.display_clock_checkpoint(jsonb,uuid,jsonb),crossplay.display_read_before_live_clocks(text),crossplay.display_read(text),crossplay.display_version()
  from public,anon,authenticated,service_role,crossplay_runtime;
grant execute on function crossplay.display_clock_checkpoint(jsonb,uuid,jsonb),crossplay.display_read(text),crossplay.display_version() to crossplay_runtime;
