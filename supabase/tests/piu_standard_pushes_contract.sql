-- Shared synthetic constructor for this migration's focused checks only.
create function pg_temp.standard_pushes_run(modes text, algorithm text default 'standard', profile text default 'hds', policy text default '3.1.0') returns jsonb
language plpgsql as $$
declare slots jsonb:='[]'; steps jsonb:='[]'; groups jsonb:='[]'; settings jsonb; snapshot jsonb;
 phase text; mode text; idx integer; n integer; rep integer; pos integer:=0; slot text; rid uuid:=gen_random_uuid();
 bucket text; range_min integer; range_max integer;
begin
 settings:=jsonb_build_object('modes',modes,'algorithm',algorithm,'ranges',jsonb_build_object(
  'warmupSingle',jsonb_build_object('min',10,'max',18),'warmupDouble',jsonb_build_object('min',11,'max',19),
  'pushSingle',jsonb_build_object('min',20,'max',23),'pushDouble',jsonb_build_object('min',21,'max',24)));
 foreach phase in array array['warmup','push'] loop
  foreach mode in array array['Single','Double'] loop
   if modes='singles' and mode='Double' or modes='doubles' and mode='Single' then continue; end if;
   n:=case when phase='warmup' then case when modes='both' then 4 else 8 end else case when modes='both' then 6 else 12 end end;
   range_min:=(settings->'ranges'->(phase||mode)->>'min')::integer;
   range_max:=(settings->'ranges'->(phase||mode)->>'max')::integer;
   for idx in 1..n loop
    slot:=rid::text||':'||phase||':'||lower(mode)||':'||idx;
    slots:=slots||jsonb_build_array(jsonb_build_object('id',slot,'phase',phase,'mode',mode,'minLevel',range_min,'maxLevel',range_max,'level',range_min,'targetLevel',range_min)
     ||case when phase='push' then jsonb_build_object('lane',case when policy='3.1.0' then 'standard' when idx<=n/2 then 'random' else 'improvement' end)
      ||case when algorithm='standard' then jsonb_build_object('bpmBucket','190-199') else '{}'::jsonb end else '{}'::jsonb end);
    for rep in 1..case when phase='push' then 2 else 1 end loop
     pos:=pos+1;
     steps:=steps||jsonb_build_array(jsonb_build_object('id',slot||':play:'||rep,'slotId',slot,'phase',phase,'repetition',rep,'included',true,'position',pos));
    end loop;
   end loop;
  end loop;
 end loop;
 snapshot:=jsonb_build_object('version',1,'profileId',profile,'selectionVersion',policy,'orderVersion','3.0.0','settings',settings,'slots',slots,'steps',steps);
 if algorithm='standard' then
  foreach mode in array array['Single','Double'] loop
   if modes='singles' and mode='Double' or modes='doubles' and mode='Single' then continue; end if;
   foreach bucket in array array['<150','150-159','160-169','170-179','180-189','190-199','200-209','210-219','220+','Unclassified'] loop
    groups:=groups||jsonb_build_array(jsonb_build_object('mode',mode,'bpmBucket',bucket,'normalizedSkill',19,'scoreCount',5,'confidence',1,'weakness',1));
   end loop;
  end loop;
  snapshot:=snapshot||jsonb_build_object('standardGeneration',jsonb_build_object('version',1,'progressionRevision','synthetic-fixture','groups',groups));
 end if;
 return jsonb_build_object('id',rid,'kind','daily','status','generated','plays','[]'::jsonb,'stepStates','[]'::jsonb,'workout',snapshot);
end $$;
