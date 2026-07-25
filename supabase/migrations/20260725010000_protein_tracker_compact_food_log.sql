alter table public.protein_preferences
  add column compact_food_log boolean not null default false;

grant insert (compact_food_log)
  on table public.protein_preferences to authenticated;

grant update (compact_food_log)
  on table public.protein_preferences to authenticated;
