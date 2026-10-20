-- Portal Futuro · função "Apagar minha conta"
-- Rode uma vez no painel do Supabase: SQL Editor → New query → cole → Run.
-- Ela só apaga a conta de quem está conectado (auth.uid()); perfil e dados vão junto.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from auth.users where id = v_uid;
end; $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
