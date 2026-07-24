alter table public.protein_preferences
  add column compact_progress boolean not null default true;

grant insert (compact_progress)
  on table public.protein_preferences to authenticated;

grant update (compact_progress)
  on table public.protein_preferences to authenticated;
