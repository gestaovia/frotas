-- =====================================================================
-- Vialink Frota · 4/4 · Endurecimento
-- =====================================================================
-- função do gatilho de eventos do Supabase (liga RLS em tabelas novas):
-- só é executada pelo próprio banco, ninguém precisa chamá-la pela API
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- funções novas no schema public não ficam executáveis por visitantes sem login
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
