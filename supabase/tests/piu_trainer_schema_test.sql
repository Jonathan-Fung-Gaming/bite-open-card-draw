\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
do $$ declare t record; n integer; result jsonb; state jsonb; actor uuid := '10000000-0000-4000-8000-000000000001'; other uuid := '10000000-0000-4000-8000-000000000002'; request uuid := '20000000-0000-4000-8000-000000000001'; begin
 select count(*) into n from pg_tables where schemaname='public' and left(tablename,12)='PIU_TRAINER_';
 if n<>17 then raise exception 'Expected 17 PIU tables; found %',n; end if;
 for t in select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relkind='r' and left(c.relname,12)='PIU_TRAINER_' loop
  if not t.relrowsecurity or has_table_privilege('anon',t.oid,'SELECT') or has_table_privilege('authenticated',t.oid,'SELECT') then raise exception 'Browser access on %',t.relname; end if;
 end loop;
 for t in select p.oid,p.proname from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and left(p.proname,12)='PIU_TRAINER_' loop
  if has_function_privilege('authenticated',t.oid,'EXECUTE') or has_function_privilege('anon',t.oid,'EXECUTE') then raise exception 'Browser RPC access on %',t.proname; end if;
 end loop;
 perform public."PIU_TRAINER_READ"(actor);
 perform public."PIU_TRAINER_READ"(other);
 state := public."PIU_TRAINER_STATE"(actor);
 state := jsonb_set(state,'{settings}','{"onboarded":true}');
 result := public."PIU_TRAINER_COMMIT"(actor,request,'fingerprint',0,state,'null',false,'seed');
 if result->>'revision'<>'1' then raise exception 'Revision did not advance'; end if;
 if public."PIU_TRAINER_COMMIT"(actor,request,'fingerprint',0,state,'null',false,'seed')<>result then raise exception 'Lost-response retry changed result'; end if;
 if public."PIU_TRAINER_RECEIPT"(other,request,'fingerprint') is not null then raise exception 'Cross-user receipt leak'; end if;
 if (public."PIU_TRAINER_STATE"(other)->'settings')<>'{}'::jsonb then raise exception 'Other user changed'; end if;
 begin
  perform public."PIU_TRAINER_COMMIT"(actor,request,'different',0,state,'null',false,'seed');
  raise exception 'Expected request reuse rejection';
 exception when raise_exception then if sqlerrm<>'REQUEST_REUSED' then raise; end if; end;
 begin
  perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'new',0,state,'null',false,'seed');
  raise exception 'Expected stale revision rejection';
 exception when raise_exception then if sqlerrm<>'CONFLICT' then raise; end if; end;
 begin
  perform public."PIU_TRAINER_READ"(actor,0,0);
  raise exception 'Expected stale page rejection';
 exception when raise_exception then if sqlerrm<>'CONFLICT' then raise; end if; end;
 perform public."PIU_TRAINER_COMMIT"(actor,gen_random_uuid(),'reset',1,state,'null',true,'seed');
 if public."PIU_TRAINER_RECEIPT"(actor,request,'fingerprint')<>result then raise exception 'Reset erased replay receipt'; end if;
 if not exists(select 1 from public."PIU_TRAINER_ARCHIVES" where user_id=actor and revision=1) then raise exception 'Missing safety archive'; end if;
 perform public."PIU_TRAINER_IMPORT"(actor,request,'create',2,3,'digest');
 perform public."PIU_TRAINER_IMPORT"(actor,request,'put',part=>0,payload=>'abc');
 if public."PIU_TRAINER_IMPORT"(actor,request,'get',part=>0)->>'payload'<>'abc' then raise exception 'Import chunk lost'; end if;
 begin
  perform public."PIU_TRAINER_IMPORT"(other,request,'get',part=>0);
  raise exception 'Expected import ownership rejection';
 exception when raise_exception then if sqlerrm<>'IMPORT_EXPIRED' then raise; end if; end;
 begin
  perform public."PIU_TRAINER_IMPORT"(actor,request,'put',part=>1,payload=>'extra');
  raise exception 'Expected import size rejection';
 exception when raise_exception then if sqlerrm<>'IMPORT_TOO_LARGE' then raise; end if; end;
 if not public."PIU_TRAINER_LIMIT"('piu-test',1,60) or public."PIU_TRAINER_LIMIT"('piu-test',1,60) then raise exception 'Rate limit failed'; end if;
end $$;
rollback;
\echo PIU schema ownership, ACL, revision, retry, archive and import checks passed.
