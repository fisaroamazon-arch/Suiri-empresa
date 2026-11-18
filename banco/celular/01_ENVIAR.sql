-- SUIRI V4: ENVIO 1 DE 6. Copie todo este bloco e execute no SQL Editor.
begin;
create schema if not exists suiri_celular_v4_20261117;
revoke all on schema suiri_celular_v4_20261117 from public,anon,authenticated;
create table if not exists suiri_celular_v4_20261117.partes(roteiro text not null,parte integer not null,conteudo text not null,primary key(roteiro,parte));
revoke all on suiri_celular_v4_20261117.partes from public,anon,authenticated;
insert into suiri_celular_v4_20261117.partes(roteiro,parte,conteudo)values('2379b85516f2958bf01bfb87382afcae',1,$SUIRI_ARQUIVO_01$-- Suiri Empresas V4. Execute no SQL Editor do MESMO projeto Supabase do aplicativo.
-- Faça antes um backup. Operação transacional: qualquer erro desfaz a migração inteira.
-- Requer as tabelas originais. Aceita empresas.id UUID ou inteiro; nunca adivinha vínculos ambíguos.
create schema if not exists suiri_private;
revoke all on schema suiri_private from public;
grant usage on schema suiri_private to authenticated;

do $$ declare t text; tipo text; col text; candidatos text[]; n integer; r record; begin
 foreach t in array array['empresas','perfis','tarefas','avisos','livro_ponto','vales','itens_comprados','pedidos_compra','contas_pagar','fechamento_caixa','cardapio_consumo'] loop
  if to_regclass('public.'||t) is null then raise exception 'Tabela original % ausente. Confira o projeto Supabase antes de continuar.',t; end if;
 end loop;
 select format_type(a.atttypid,a.atttypmod) into tipo from pg_attribute a where a.attrelid='public.empresas'::regclass and a.attname='id';
 if tipo not in ('uuid','bigint','integer') then raise exception 'Tipo de empresas.id não suportado: %',tipo; end if;
 alter table public.empresas add column if not exists nome_fantasia text;
 alter table public.empresas add column if not exists razao_social text;
 alter table public.empresas add column if not exists telefone text;
 alter table public.empresas add column if not exists endereco text;
 alter table public.empresas add column if not exists cnpj text;
 alter table public.perfis add column if not exists is_admin boolean default false;
 alter table public.perfis add column if not exists is_socio boolean default false;
 alter table public.perfis add column if not exists is_gerente boolean default false;
 alter table public.perfis add column if not exists pode_fechar_caixa boolean default false;
 alter table public.perfis add column if not exists permissoes_socio jsonb default '[]';
 alter table public.perfis add column if not exists permissoes_gerente jsonb default '[]';
 alter table public.perfis add column if not exists cargo text default 'staff';
 foreach t in array array['perfis','tarefas','avisos','livro_ponto','vales','itens_comprados','pedidos_compra','contas_pagar','fechamento_caixa','cardapio_consumo'] loop
  execute format('alter table public.%I add column if not exists empresa_id %s references public.empresas(id)',t,tipo);
  execute format('create index if not exists %I on public.%I(empresa_id)','suiri_empresa_'||t,t);
 end loop;
 -- Normalize legacy CNPJs, abort on duplicates rather than merge unrelated companies.
 update public.empresas set cnpj=regexp_replace(upper(cnpj),'[^A-Z0-9]','','g');
 if exists(select 1 from public.empresas group by cnpj having count(*)>1) then raise exception 'CNPJs duplicados em empresas. Resolva no diagnóstico antes de migrar.';end if;
 if exists(select 1 from public.empresas where cnpj is null or cnpj !~ '^[A-Z0-9]{12}[0-9]{2}$') then raise exception 'Empresa sem CNPJ válido. Corrija os dados existentes antes da migração.';end if;
 create unique index if not exists suiri_empresas_cnpj on public.empresas(cnpj);
 -- Backfill only when ownership can be inferred from the actual author/employee.
 foreach t in array array['tarefas','avisos','livro_ponto','vales','itens_comprados','pedidos_compra','contas_pagar','fechamento_caixa'] loop
  execute format($q$update public.%1$I t set empresa_id=(select p.empresa_id from public.perfis p where p.id::text=any(array[to_jsonb(t)->>'perfil_id',to_jsonb(t)->>'criado_por',to_jsonb(t)->>'registrado_por',to_jsonb(t)->>'responsavel_id',to_jsonb(t)->>'assumido_por']) and p.empresa_id is not null limit 1) where t.empresa_id is null and (select count(distinct p.empresa_id) from public.perfis p where p.id::text=any(array[to_jsonb(t)->>'perfil_id',to_jsonb(t)->>'criado_por',to_jsonb(t)->>'registrado_por',to_jsonb(t)->>'responsavel_id',to_jsonb(t)->>'assumido_por']) and p.empresa_id is not null)=1$q$,t);
 end loop;
 select count(*) into n from public.empresas;
 if n=1 then
  foreach t in array array['perfis','tarefas','avisos','livro_ponto','vales','itens_comprados','pedidos_compra','contas_pagar','fechamento_caixa','cardapio_consumo'] loop
   execute format('update public.%I set empresa_id=(select id from public.empresas limit 1) where empresa_id is null',t);
  end loop;
 end if;
 foreach t in array array['perfis','tarefas','avisos','livro_ponto','vales','itens_comprados','pedidos_compra','contas_pagar','fechamento_caixa','cardapio_consumo'] loop
  execute format('select count(*) from public.%I where empresa_id is null',t) into n;
  if n>0 then raise exception '% contém % registros sem empresa definida. Resolva os vínculos indicados por 00_DIAGNOSTICO.sql e execute novamente.',t,n;end if;
 end loop;
 foreach t in array array['livro_ponto','tarefas','itens_comprados','vales','fechamento_caixa'] loop
  execute format('alter table public.%I add column if not exists suiri_operacao_id uuid',t);
  execute format('create unique index if not exists %I on public.%I(suiri_operacao_id)','suiri_operacao_'||t,t);
 end loop;
 -- Use the company's real PK type for new tables too.
 execute format($q$create table if not exists public.suiri_contatos(
 id uuid primary key default gen_random_uuid(), empresa_id %s not null references public.empresas(id),
 tipo text not null check(tipo in ('cliente','fornecedor')), nome text not null check(length(btrim(nome)) between 1 and 180),
 documento text default '', telefone text default '', email text default '', endereco text default '', observacoes text default '',
 ativo boolean not null default true, criado_em timestamptz not null default now(), unique(empresa_id,id))$q$,tipo);
 execute format($q$create table if not exists public.suiri_vendas(
 id uuid primary key default gen_random_uuid(), empresa_id %s not null references public.empresas(id),
 contato_id uuid not null, itens jsonb not null check(jsonb_typeof(itens)='array'),
 total_centavos bigint not null check(total_centavos>0), data_venda date not null, vencimento date not null,
 observacao text default '', criado_por uuid, criado_em timestamptz not null default now(),
 operacao_id uuid not null unique, cancelada_em timestamptz, motivo_cancelamento text,
 unique(empresa_id,id),foreign key(empresa_id,contato_id) references public.suiri_contatos(empresa_id,id))$q$,tipo);
 execute format($q$create table if not exists public.suiri_recebimentos(
 id uuid primary key default gen_random_uuid(), empresa_id %s not null references public.empresas(id),
 venda_id uuid not null, valor_centavos bigint not null check(valor_centavos>0), data_recebimento date not null,
 forma text not null, observacao text default '', criado_por uuid, criado_em timestamptz not null default now(),
 operacao_id uuid not null unique, estornado_em timestamptz, estornado_por uuid, motivo_estorno text,
 foreign key(empresa_id,venda_id) references public.suiri_vendas(empresa_id,id))$q$,tipo);
 -- Preserve commercial documents when a member's Auth account is deleted.
 for r in select c.conname,cl.relname as tabela,a.attname as coluna from pg_constraint c
 join pg_class cl on cl.oid=c.conrelid join pg_namespace ns on ns.oid=cl.relnamespace
 join pg_attribute a on a.attrelid=cl.oid and a.attnum=c.conkey[1]
 where c.contype='f' and ns.nspname='public' and cardinality(c.conkey)=1
 and c.confrelid in ('auth.users'::regclass,'public.perfis'::regclass)
 and cl.relname=any(array['tarefas','avisos','pedidos_compra','contas_pagar','fechamento_caixa','cardapio_consumo','itens_comprados','vales'])
 and a.attname=any(array['criado_por','registrado_por','responsavel_id','assumido_por','destinado_a','comprado_por']) loop
  execute format('alter table public.%I alter column %I drop not null',r.tabela,r.coluna);
  execute format('alter table public.%I drop constraint %I',r.tabela,r.conname);
  execute format('alter table public.%I add constraint %I foreign key(%I) references auth.users(id) on delete set null',r.tabela,r.conname,r.coluna);
 end loop;
end $$;

create or replace function suiri_private.empresa() returns text language sql stable security definer set search_path='' as $$
 select empresa_id::text from public.perfis where id=auth.uid()
$$;
create or replace function suiri_private.permissao(p_chave text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select is_admin or (is_socio and coalesce(to_jsonb(permissoes_socio),'[]') ? p_chave) or (is_gerente and coalesce(to_jsonb(permissoes_gerente),'[]') ? p_chave) or (p_chave='fechar_caixa' and pode_fechar_caixa) from public.perfis where id=auth.uid() and empresa_id is not null),false)
$$;
create or replace function suiri_private.admin() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select is_admin from public.perfis where id=auth.uid() and empresa_id is not null),false)
$$;
create or replace function suiri_private.comercial() returns boolean language sql stable security definer set search_path='' as $$
 select suiri_private.permissao('gestao') or suiri_private.permissao('financeiro') or suiri_private.permissao('contas')
$$;
create or replace function suiri_private.cnpj_valido(p_cnpj text) returns boolean language plpgsql immutable set search_path='' as $$
declare c text:=regexp_replace(upper(p_cnpj),'[^A-Z0-9]','','g'); soma int; peso int; resto int; dv int; j int; i int;begin
 if c is null or c !~ '^[A-Z0-9]{12}[0-9]{2}$' or c=repeat(substr(c,1,1),14) then return false;end if;
 for j in 12..13 loop
  soma:=0;peso:=j-7;
  for i in 1..j loop soma:=soma+(ascii(substr(c,i,1))-48)*peso;peso:=peso-1;if peso<2 then peso:=9;end if;end loop;
  resto:=soma%11;dv:=case when resto<2 then 0 else 11-resto end;
  if substr(c,j+1,1)::int<>dv then return false;end if;
 end loop;return true;
end $$;

-- Guard profile mutations: staff cannot promote themselves through the REST API.
create or replace function suiri_private.proteger_perfil() returns trigger language plpgsql security definer set search_path='' as $$SUIRI_ARQUIVO_01$)on conflict(roteiro,parte)do update set conteudo=excluded.conteudo;
commit;
select 'ENVIO 1 DE 6 RECEBIDO' as resultado;
-- FIM SUIRI ENVIO 1
