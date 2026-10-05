-- Synthetic profile identities only. No production journals or synchronization records.
insert into public."PIU_TRAINER_CATALOG_HEAD"(id) values(true) on conflict do nothing;
with accounts as (
 insert into public."PIU_TRAINER_ACCOUNTS"(user_id,profile_id,settings)
 values
 ('10000000-0000-4000-8000-000000000001','hds','{}'),
 ('10000000-0000-4000-8000-000000000002','jonathan','{}'),
 ('10000000-0000-4000-8000-000000000003','waffle','{"workout":{"warmupStart":17,"pushSingle":22,"pushDouble":24,"pushPlays":2,"allowedSongTypes":["Arcade","ShortCut","Remix","FullSong"]}}')
 returning user_id,profile_id
) insert into public."PIU_TRAINER_PROFILES"(id,account_id) select profile_id,user_id from accounts;
insert into public."PIU_TRAINER_RECEIPTS"(user_id,request_id,fingerprint,result)
 values('10000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','preserve-session-options-fixture','{"revision":0}');
