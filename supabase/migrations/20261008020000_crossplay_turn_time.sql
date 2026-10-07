-- A display projection from accepted events; clock accounting and writes are unchanged.
alter function crossplay.clock_read(jsonb,uuid) rename to clock_read_before_turn_time;
create function crossplay.clock_read(p_actor jsonb,p_match_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
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
revoke all on function crossplay.clock_read_before_turn_time(jsonb,uuid),crossplay.clock_read(jsonb,uuid)
  from public,anon,authenticated,service_role,crossplay_runtime;
grant execute on function crossplay.clock_read(jsonb,uuid) to crossplay_runtime;
