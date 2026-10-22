-- Portal Futuro · notificações do aplicativo instalado (v1.21)
-- Lembrete de finanças (dia 5), datas importantes (7 dias e 1 dia antes) e novidades do portal.
-- Só contas com login. Cada aparelho guarda uma "inscrição" do navegador (endpoint + chaves públicas).
-- Ninguém lê essas tabelas pelo site: o aluno só usa as funções push_* abaixo, e o envio
-- é feito pela função "push" (Edge Function) com a chave de serviço, uma vez por dia (pg_cron).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Inscrições (uma por aparelho)
create table if not exists public.push_subs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 800 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.wns\.windows\.com)/'),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  prefs jsonb not null default '{"fin":true,"datas":true,"novidades":true}'::jsonb check (jsonb_typeof(prefs) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_ok timestamptz
);
create index if not exists push_subs_user on public.push_subs (user_id);

-- O que já foi enviado (evita mandar o mesmo aviso duas vezes)
create table if not exists public.push_log (
  sub_id bigint not null references public.push_subs (id) on delete cascade,
  key text not null check (char_length(key) <= 120),
  sent_at timestamptz not null default now(),
  primary key (sub_id, key)
);

-- Novidades do portal (só o dono cria, e só depois de aprovar o texto)
create table if not exists public.push_news (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 3 and 60),
  body text not null check (char_length(body) between 3 and 160),
  url text not null default '/' check (url ~ '^/[A-Za-z0-9#/_-]*$'),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Configuração do envio (chaves VAPID e segredo do agendamento). Só o servidor lê.
create table if not exists public.push_config (
  key text primary key,
  value text not null
);

alter table public.push_subs enable row level security;
alter table public.push_log enable row level security;
alter table public.push_news enable row level security;
alter table public.push_config enable row level security;
revoke all on public.push_subs, public.push_log, public.push_news, public.push_config from anon, authenticated;

-- Segredo que o agendamento envia para a função (gerado aqui, nunca sai do servidor)
insert into public.push_config (key, value)
values ('cron_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

-- Ativar ou atualizar a inscrição deste aparelho para a conta conectada
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_prefs jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select count(*) into n from public.push_subs where user_id = uid and active and endpoint <> p_endpoint;
  if n >= 5 then raise exception 'too many devices'; end if;
  insert into public.push_subs (user_id, endpoint, p256dh, auth, prefs, active)
  values (uid, p_endpoint, p_p256dh, p_auth,
          jsonb_build_object('fin', coalesce((p_prefs->>'fin')::boolean, true), 'datas', coalesce((p_prefs->>'datas')::boolean, true), 'novidades', coalesce((p_prefs->>'novidades')::boolean, true)),
          true)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, prefs = excluded.prefs, active = true;
end $$;

-- Trocar quais avisos este aparelho recebe
create or replace function public.push_set_prefs(p_endpoint text, p_prefs jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.push_subs
     set prefs = jsonb_build_object('fin', coalesce((p_prefs->>'fin')::boolean, true), 'datas', coalesce((p_prefs->>'datas')::boolean, true), 'novidades', coalesce((p_prefs->>'novidades')::boolean, true))
   where endpoint = p_endpoint and user_id = auth.uid();
end $$;

-- Desligar as notificações deste aparelho (também usado ao sair da conta)
create or replace function public.push_unsubscribe(p_endpoint text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.push_subs set active = false where endpoint = p_endpoint and user_id = auth.uid();
end $$;

-- Como este aparelho está configurado (para mostrar os botões certos no perfil)
create or replace function public.push_status(p_endpoint text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('active', active, 'prefs', prefs) from public.push_subs where endpoint = p_endpoint and user_id = auth.uid()), '{"active":false}'::jsonb);
$$;

revoke all on function public.push_subscribe(text, text, text, jsonb), public.push_set_prefs(text, jsonb), public.push_unsubscribe(text), public.push_status(text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, jsonb), public.push_set_prefs(text, jsonb), public.push_unsubscribe(text), public.push_status(text) to authenticated;

-- Todo dia às 9h de Brasília (12h UTC) a função confere o que precisa ser avisado
select cron.schedule('portal-futuro-avisos', '0 12 * * *', $$
  select net.http_post(
    url := 'https://baubfjqwrdyeqarmjjio.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.push_config where key = 'cron_secret')),
    body := '{"mode":"daily"}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);
