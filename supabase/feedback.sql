-- Portal Futuro · sugestões e problemas enviados pelo botão "Dar opinião"
-- Qualquer visitante pode ENVIAR; ninguém lê pelo site (só o dono, no painel do Supabase: Table Editor → feedback).
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  kind text not null check (kind in ('sugestao','problema','elogio')),
  message text not null check (char_length(message) between 5 and 1000),
  page text check (page is null or page ~ '^[a-z-]{1,30}$'),
  contact text check (contact is null or (char_length(contact) <= 120 and contact ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant insert (kind, message, page, contact) on public.feedback to anon, authenticated;
create policy "feedback: qualquer visitante envia" on public.feedback for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
