# Pumbility shared-schema compensating rollback

Migration: `20260813010000_pumbility_schema.sql`

This is a pre-dependency compensating procedure, not an automatic down migration. Use it only on a
disposable local reset or before any Pumbility application deployment, backfill, user data, or
Storage artifact exists. After a consumer depends on the schema, disable its feature flags, restore
Vercel persistence as authority, and ship an additive correction instead.

## Preconditions

1. Confirm the database URL is loopback and the target is the canonical disposable local Supabase
   stack.
2. Confirm the consuming application's Supabase flags are off.
3. Confirm no Pumbility backfill, application data, or Storage object exists.
4. Capture sibling catalog fingerprints before the rehearsal.
5. Run with stop-on-error. Keep the final `rollback` for every rehearsal.
6. Never run this procedure on the hosted shared project after application dependency or data.

## Guarded dependency-ordered rehearsal

```sql
begin;

do $$
declare
  v_table text;
  v_has_rows boolean;
begin
  if exists (select 1 from storage.objects where bucket_id = 'pumbility-artifacts') then
    raise exception 'Pumbility rollback refused: Storage artifacts exist';
  end if;
  for v_table in
    select c.relname
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'pumbility'
      and c.relkind in ('r', 'p')
      and c.relname not in ('schema_metadata', 'data_sources', 'mixes')
  loop
    execute pg_catalog.format('select exists (select 1 from pumbility.%I)', v_table)
      into v_has_rows;
    if v_has_rows then
      raise exception 'Pumbility rollback refused: %.% contains data', 'pumbility', v_table;
    end if;
  end loop;
  if (select count(*) from pumbility.data_sources) <> 1
     or (select count(*) from pumbility.mixes) <> 2
     or exists (
       select 1 from pumbility.data_sources where source_key <> 'piu-scores'
     ) or exists (
       select 1 from pumbility.mixes where mix_key not in ('phoenix1', 'phoenix2')
     ) then
    raise exception 'Pumbility rollback refused: seed tables contain non-seed data';
  end if;
end;
$$;

drop policy "Pumbility service can delete artifacts" on storage.objects;
drop policy "Pumbility service can update artifacts" on storage.objects;
drop policy "Pumbility service can insert artifacts" on storage.objects;
drop policy "Pumbility service can read artifacts" on storage.objects;
set local storage.allow_delete_query = 'true';
delete from storage.buckets where id = 'pumbility-artifacts';

revoke all on schema pumbility from pumbility_reader, pumbility_worker, service_role;

drop view pumbility.current_player_recommendations;
drop view pumbility.public_tier_list;
drop view pumbility.current_analysis;
drop view pumbility.public_players;
drop view pumbility.current_best_scores;
drop view pumbility.current_catalog;

drop function pumbility.publish_player_recommendation(uuid, uuid, uuid, uuid, text);
drop function pumbility.publish_generation(text, uuid, text, uuid, uuid, uuid);
drop function pumbility.cancel_job(uuid, text);
drop function pumbility.complete_job(uuid, text, boolean, text, jsonb, timestamptz);
drop function pumbility.heartbeat_job(uuid, text, text, jsonb, integer);
drop function pumbility.claim_job(text, text, text, text, jsonb, text, integer);

drop table pumbility.publications;
drop table pumbility.player_recommendation_heads;
drop table pumbility.recommendation_candidates;
drop table pumbility.recommendation_mode_results;
drop table pumbility.recommendation_refreshes;
drop table pumbility.model_player_features;
drop table pumbility.model_generations;
drop table pumbility.artifacts;
drop table pumbility.analysis_folder_results;
drop table pumbility.chart_results;
drop table pumbility.chart_contributions;
drop table pumbility.player_mode_features;
drop table pumbility.analysis_mode_results;
drop table pumbility.analysis_run_inputs;
drop table pumbility.score_overrides;
drop table pumbility.analysis_runs;
drop table pumbility.methodologies;
drop table pumbility.chart_rerates;
drop table pumbility.chart_videos;
drop table pumbility.song_aliases;
drop table pumbility.reconciliation_runs;
drop table pumbility.outbox_events;
drop table pumbility.score_revisions;
drop table pumbility.chart_revisions;
drop table pumbility.sync_run_players;
drop table pumbility.player_mix_state;
drop table pumbility.player_consents;
drop table pumbility.sync_runs;
drop table pumbility.job_heads;
drop table pumbility.job_events;
drop table pumbility.jobs;
drop table pumbility.charts;
drop table pumbility.songs;
drop table pumbility.consent_scopes;
drop table pumbility.players;
drop table pumbility.mixes;
drop table pumbility.data_sources;
drop table pumbility.schema_metadata;

drop schema pumbility;
drop role pumbility_reader;
drop role pumbility_worker;

do $$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'pumbility')
     or exists (select 1 from storage.buckets where id = 'pumbility-artifacts')
     or exists (select 1 from pg_catalog.pg_roles
                where rolname in ('pumbility_reader', 'pumbility_worker')) then
    raise exception 'Pumbility rollback left owned objects behind';
  end if;
  if not exists (select 1 from pg_catalog.pg_class where oid = 'public.rounds'::regclass)
     or not exists (select 1 from pg_catalog.pg_class where oid = 'public.protein_profiles'::regclass)
     or not exists (select 1 from pg_catalog.pg_class where oid = 'public.karaoke_rooms'::regclass) then
    raise exception 'Pumbility rollback damaged a representative sibling relation';
  end if;
end;
$$;

rollback;
```

The first executable rehearsal must additionally compare full pre/post sibling catalog fingerprints,
run a complete forward reset, rerun the Pumbility SQL harness and database lint, and record evidence
in the acceptance checklist. PostgreSQL logical restore and Storage restore remain separate gates.
