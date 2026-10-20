-- Portal Futuro · estrutura do banco (Supabase)
-- Para aplicar à mão: painel do Supabase → SQL Editor → New query → cole tudo → Run.

-- Perfis dos alunos (1 linha por conta)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 60),
  inst text check (inst is null or char_length(inst) <= 60),
  city text check (city is null or char_length(city) <= 40),
  course text check (course is null or char_length(course) <= 60),
  areas text[] not null default '{}' check (cardinality(areas) <= 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dados das ferramentas (provas, gastos, agenda, documentos, favoritos), 1 linha por conta
create table public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 524288),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_data enable row level security;

-- Cada aluno só vê e altera a própria linha
create policy "perfil: ler o próprio" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "perfil: alterar o próprio" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "dados: ler os próprios" on public.user_data for select to authenticated using ((select auth.uid()) = user_id);
create policy "dados: criar os próprios" on public.user_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dados: alterar os próprios" on public.user_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Visitantes sem login não acessam nada
revoke all on public.profiles, public.user_data from anon;
-- Usuários logados: só as operações necessárias (o perfil é criado pelo servidor; apagar é pela função abaixo)
revoke all on public.profiles, public.user_data from authenticated;
grant select, update (name, inst, city, course, areas) on public.profiles to authenticated;
grant select, insert, update (user_id, data) on public.user_data to authenticated; -- user_id: exigido pelo "upsert"; a regra RLS impede trocar o dono

-- Atualiza updated_at
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger user_data_touch before update on public.user_data for each row execute function public.touch_updated_at();

-- Cria o perfil quando a conta é criada (e-mail ou Google)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), ''), '[<>]', '', 'g'), 60);
  v_inst text := nullif(left(coalesce(new.raw_user_meta_data ->> 'inst', ''), 60), '');
begin
  insert into public.profiles (id, name, inst) values (new.id, trim(v_name), v_inst)
  on conflict (id) do nothing;
  return new;
end; $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Aluno apaga a própria conta (e, em cascata, perfil e dados)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from auth.users where id = v_uid;
end; $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
