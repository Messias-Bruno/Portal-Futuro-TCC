-- Números do portal (v1.15): totais para o TCC, sem dados pessoais.
-- Só contas listadas em portal_owners conseguem chamar a função.
create table if not exists public.portal_owners (user_id uuid primary key references auth.users(id) on update cascade on delete cascade, added_at timestamptz not null default now());
alter table public.portal_owners enable row level security;
revoke all on public.portal_owners from anon, authenticated;

create or replace function public.portal_stats()
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare r jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.portal_owners o where o.user_id = auth.uid()) then
    return null; -- outras contas recebem vazio (a seção não aparece)
  end if;
  select jsonb_build_object(
    'contas', (select count(*) from auth.users),
    'confirmadas', (select count(*) from auth.users where email_confirmed_at is not null),
    'google', (select count(*) from auth.users where raw_app_meta_data->>'provider' = 'google'),
    'novas7', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'novas30', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'ativas7', (select count(*) from public.user_data where updated_at > now() - interval '7 days'),
    'comDados', (select count(*) from public.user_data),
    'sugestoes', (select count(*) from public.feedback),
    'semanas', (select coalesce(jsonb_agg(jsonb_build_object('semana', to_char(w, 'DD/MM'), 'contas', n) order by w), '[]'::jsonb)
                from (select gs as w, (select count(*) from auth.users u where u.created_at >= gs and u.created_at < gs + interval '7 days') as n
                      from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') gs) s),
    'geradoEm', now()) into r;
  return r;
end $$;
revoke all on function public.portal_stats() from public, anon;
grant execute on function public.portal_stats() to authenticated;

-- Para liberar a sua conta (troque o e-mail pelo que você usa para entrar no site):
-- insert into public.portal_owners (user_id) select id from auth.users where email = 'SEU-EMAIL@gmail.com';
