alter table public.protein_preferences
  add column food_ai_consent_version text,
  add column food_ai_consented_at timestamptz,
  add constraint protein_preferences_food_ai_consent_pair
    check (
      (food_ai_consent_version is null and food_ai_consented_at is null)
      or (
        food_ai_consent_version is not null
        and food_ai_consented_at is not null
        and length(food_ai_consent_version) between 1 and 128
        and food_ai_consent_version = btrim(food_ai_consent_version)
      )
    );

grant insert (
  food_ai_consent_version,
  food_ai_consented_at
) on table public.protein_preferences to authenticated;

grant update (
  food_ai_consent_version,
  food_ai_consented_at
) on table public.protein_preferences to authenticated;
