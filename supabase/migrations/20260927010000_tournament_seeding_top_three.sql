-- Versioned top-three predictions. Historical sources and legacy writes remain valid.
alter table tournament_seeding.submissions
  add column formula_version text not null default 'phoenix2-52.176654x-966.384379-v1',
  add column top_three_sum numeric;
alter table tournament_seeding.submissions drop constraint submissions_check;
alter table tournament_seeding.submissions add constraint submissions_versioned_prediction_check check (
  case formula_version
    when 'phoenix2-top3-51.56698263x-994.93243689-v2' then (
      (top_three_sum is null and predicted_rating is null) or
      (top_three_sum is not null and top_three_sum >= 0
       and top_three_sum not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
       and predicted_rating is not null
       and predicted_rating = top_three_sum * 17.18899421::numeric - 994.93243689::numeric)
    ) is true
    when 'phoenix2-52.176654x-966.384379-v1' then
      ((ninth_contribution is null and predicted_rating is null) or predicted_rating = 52.176654::numeric * ninth_contribution - 966.384379::numeric)
    else false
  end
);

create or replace function public.tournament_seeding_commit(p_slug text,p_expected_revision bigint,p_state jsonb,p_key text,p_fingerprint text,p_response jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare current_event tournament_seeding.events%rowtype; item jsonb; v_snapshot jsonb; score jsonb; old_source jsonb; immutable_source jsonb; result jsonb; replay jsonb; added bigint; score_count integer; position integer; previous_score numeric; value numeric; top_sum numeric; prediction_version text;
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
    prediction_version := coalesce(item->>'formulaVersion','phoenix2-52.176654x-966.384379-v1');
    top_sum := null;
    if prediction_version = 'phoenix2-top3-51.56698263x-994.93243689-v2' then
      if item->>'source' not in ('piugame','admin_manual') or item->>'source' is null
        or (item->>'source'='admin_manual' and item->>'scoreInputMode' is distinct from 'top_three') then raise exception 'INVALID_TOP_THREE_SOURCE'; end if;
      if score_count is null or score_count > 9 then raise exception 'INVALID_SCORE_COUNT'; end if;
      if coalesce((item->>'verifiedShortfall')::boolean,false) then
        if score_count >= 3 or coalesce(length(btrim(item->>'shortfallNote')),0)=0 then raise exception 'INVALID_SHORTFALL'; end if;
      elsif score_count < 3 then raise exception 'INVALID_SCORE_COUNT'; end if;
      if score_count >= 3 then
        top_sum := (item#>>'{contributions,0}')::numeric + (item#>>'{contributions,1}')::numeric + (item#>>'{contributions,2}')::numeric;
        if top_sum is null or top_sum < 0 or top_sum in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
          or (item->>'predictedRating')::numeric is distinct from top_sum*17.18899421::numeric-994.93243689::numeric then raise exception 'INVALID_TOP_THREE_PREDICTION'; end if;
      elsif item->>'predictedRating' is not null then raise exception 'INVALID_SHORTFALL'; end if;
      if score_count=9 then
        if (item->>'ninthContribution')::numeric is distinct from (item#>>'{contributions,8}')::numeric then raise exception 'INVALID_NINTH'; end if;
      elsif item->>'ninthContribution' is not null then raise exception 'INVALID_NINTH'; end if;
      if (item->>'actualRating')::numeric in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then raise exception 'INVALID_ACTUAL'; end if;
    elsif prediction_version <> 'phoenix2-52.176654x-966.384379-v1' then raise exception 'INVALID_FORMULA_VERSION';
    elsif item->>'scoreInputMode' = 'ninth_only' then
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
    insert into tournament_seeding.submissions(event_slug,id,entrant_id,receipt_sequence,actual_rating,ninth_contribution,predicted_rating,status,source_data,formula_version,top_three_sum)
    values(p_slug,(item->>'id')::uuid,(item->>'entrantId')::uuid,(item->>'sequence')::bigint,(item->>'actualRating')::numeric,(item->>'ninthContribution')::numeric,(item->>'predictedRating')::numeric,item->>'status',immutable_source,prediction_version,top_sum)
    on conflict(event_slug,id) do update set status=excluded.status;
    if item->>'scoreInputMode' = 'ninth_only' and item->>'ninthContribution' is not null then
      insert into tournament_seeding.submission_scores(event_slug,submission_id,position,contribution)
      values(p_slug,(item->>'id')::uuid,9,(item->>'ninthContribution')::numeric) on conflict do nothing;
    end if;
    previous_score := null; position := 0;
    for score in select * from jsonb_array_elements(item->'contributions') loop
      position := position+1; value := (score#>>'{}')::numeric;
      if prediction_version='phoenix2-top3-51.56698263x-994.93243689-v2' and (value is null or value < 0 or value in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)) then raise exception 'INVALID_SCORE'; end if;
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
insert into tournament_seeding.schema_metadata(version) values ('20260927010000') on conflict do nothing;
