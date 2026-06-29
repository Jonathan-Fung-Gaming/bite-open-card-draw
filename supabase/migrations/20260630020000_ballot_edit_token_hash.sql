alter table public.ballots
  add column if not exists edit_token_hash text;

comment on column public.ballots.edit_token_hash is
  'Server-side hash of the device-scoped public ballot edit token. Never expose to browser clients.';
