-- Portal Futuro · automações (v1.35)
-- 1) Datas oficiais: o servidor confere as páginas oficiais uma vez por dia. Quando uma página muda,
--    ele avisa o dono e (se houver chave do Gemini) sugere as datas encontradas. Nada aparece para os
--    alunos antes de o dono aprovar.
-- 2) Editais explicados: o dono manda o link do PDF oficial; a IA (Gemini) prepara um resumo em
--    linguagem simples, que só aparece depois de revisado.
-- Os alunos só leem o que foi aprovado. O dono (tabela portal_owners) revisa pelas funções owner_*.

create table if not exists public.official_sources (
  id int generated always as identity primary key,
  nome text not null check (char_length(nome) <= 80),
  url text not null unique check (url ~ '^https://' and char_length(url) <= 400),
  ativo boolean not null default true,
  last_hash text,
  last_checked timestamptz,
  last_changed timestamptz,
  last_status int
);

create table if not exists public.official_dates (
  id bigint generated always as identity primary key,
  source_id int references public.official_sources (id) on delete set null,
  titulo text not null check (char_length(titulo) between 3 and 120),
  data_ini date not null,
  data_fim date check (data_fim is null or data_fim >= data_ini),
  link text check (link is null or (link ~ '^https://' and char_length(link) <= 400)),
  status text not null default 'pendente' check (status in ('pendente', 'publicada', 'recusada')),
  origem text not null default 'ia' check (origem in ('ia', 'manual')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (titulo, data_ini)
);

create table if not exists public.source_alerts (
  id bigint generated always as identity primary key,
  source_id int not null references public.official_sources (id) on delete cascade,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.editais (
  id bigint generated always as identity primary key,
  titulo text not null check (char_length(titulo) between 3 and 120),
  pdf_url text not null check (pdf_url ~ '^https://' and char_length(pdf_url) <= 500),
  resumo jsonb,
  status text not null default 'gerando' check (status in ('gerando', 'pendente', 'publicado', 'recusado', 'erro')),
  erro text check (erro is null or char_length(erro) <= 300),
  modelo text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.official_sources enable row level security;
alter table public.official_dates enable row level security;
alter table public.source_alerts enable row level security;
alter table public.editais enable row level security;
revoke all on public.official_sources, public.official_dates, public.source_alerts, public.editais from anon, authenticated;

-- Alunos com login leem só o que foi aprovado
grant select (id, titulo, data_ini, data_fim, link, status, reviewed_at) on public.official_dates to authenticated;
create policy "datas: ler publicadas" on public.official_dates for select to authenticated using (status = 'publicada');
grant select (id, titulo, pdf_url, resumo, status, reviewed_at) on public.editais to authenticated;
create policy "editais: ler publicados" on public.editais for select to authenticated using (status = 'publicado');

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.portal_owners o where o.user_id = auth.uid());
$$;

-- Tudo o que espera revisão do dono
create or replace function public.owner_review()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner() then return null; end if;
  return jsonb_build_object(
    'datas', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'titulo', d.titulo, 'data_ini', d.data_ini, 'data_fim', d.data_fim, 'link', coalesce(d.link, s.url), 'fonte', s.nome) order by d.data_ini)
                        from public.official_dates d left join public.official_sources s on s.id = d.source_id where d.status = 'pendente'), '[]'::jsonb),
    'alertas', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'fonte', s.nome, 'url', s.url, 'quando', a.detected_at) order by a.detected_at desc)
                        from public.source_alerts a join public.official_sources s on s.id = a.source_id where a.resolved_at is null), '[]'::jsonb),
    'editais', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'titulo', e.titulo, 'pdf_url', e.pdf_url, 'resumo', e.resumo, 'status', e.status, 'erro', e.erro, 'criado', e.created_at) order by e.created_at desc)
                        from public.editais e where e.status in ('gerando', 'pendente', 'erro')), '[]'::jsonb),
    'fontes', coalesce((select jsonb_agg(jsonb_build_object('nome', s.nome, 'url', s.url, 'conferida', s.last_checked, 'status', s.last_status) order by s.id) from public.official_sources s where s.ativo), '[]'::jsonb)
  );
end $$;

create or replace function public.owner_set_date(p_id bigint, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  if p_status not in ('publicada', 'recusada') then raise exception 'bad status'; end if;
  update public.official_dates set status = p_status, reviewed_at = now() where id = p_id;
end $$;

create or replace function public.owner_resolve_alert(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  update public.source_alerts set resolved_at = now() where id = p_id;
end $$;

create or replace function public.owner_set_edital(p_id bigint, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  if p_status not in ('publicado', 'recusado') then raise exception 'bad status'; end if;
  update public.editais set status = p_status, reviewed_at = now() where id = p_id and status in ('pendente', 'erro', 'publicado');
end $$;

revoke all on function public.is_owner(), public.owner_review(), public.owner_set_date(bigint, text), public.owner_resolve_alert(bigint), public.owner_set_edital(bigint, text) from public, anon;
grant execute on function public.is_owner(), public.owner_review(), public.owner_set_date(bigint, text), public.owner_resolve_alert(bigint), public.owner_set_edital(bigint, text) to authenticated;

-- Conferência diária das páginas oficiais às 8h de Brasília (11h UTC)
-- select cron.schedule('portal-futuro-datas', '0 11 * * *', $$ select net.http_post(url := 'https://baubfjqwrdyeqarmjjio.supabase.co/functions/v1/datas', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from public.push_config where key='cron_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000); $$);
