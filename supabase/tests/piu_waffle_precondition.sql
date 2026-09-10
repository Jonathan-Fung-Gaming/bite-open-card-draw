-- Synthetic predecessor journals verify that the new migration preserves existing profiles.
with accounts as (
 insert into public."PIU_TRAINER_ACCOUNTS"(user_id,profile_id,revision,settings)
 values(gen_random_uuid(),'hds',7,'{"fixture":"hds"}'),(gen_random_uuid(),'jonathan',9,'{"fixture":"jonathan"}')
 returning user_id,profile_id
) insert into public."PIU_TRAINER_PROFILES"(id,account_id,enrolled_on) select profile_id,user_id,'2026-09-06' from accounts;
insert into public."PIU_TRAINER_RECEIPTS"(user_id,request_id,fingerprint,result)
 select user_id,'11111111-1111-4111-8111-111111111111','preserve-fixture','{"revision":7}' from public."PIU_TRAINER_ACCOUNTS" where profile_id='hds';
