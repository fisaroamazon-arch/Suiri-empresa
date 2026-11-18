-- Somente leitura. Execute no SQL Editor ANTES da atualização.
select table_name,column_name,data_type from information_schema.columns where table_schema='public'and table_name in('empresas','perfis','tarefas','avisos','livro_ponto','vales','itens_comprados','pedidos_compra','contas_pagar','fechamento_caixa','cardapio_consumo')order by table_name,ordinal_position;
select id,cnpj,nome_fantasia from public.empresas;
select id,nome,empresa_id,is_admin,is_socio,is_gerente from public.perfis order by empresa_id,nome;
-- O código antigo tornava todo novo cadastro administrador. Revise quem deve manter esse acesso.
select empresa_id,count(*)filter(where is_admin)as administradores,count(*)as membros from public.perfis group by empresa_id;
select tablename,policyname,cmd,qual,with_check from pg_policies where schemaname in('public','storage');
select n.nspname,p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.prosecdef;
-- Triggers de Auth anteriores podem interferir no cadastro; não são removidos silenciosamente.
select t.tgname,pg_get_triggerdef(t.oid)from pg_trigger t where t.tgrelid='auth.users'::regclass and not t.tgisinternal;
