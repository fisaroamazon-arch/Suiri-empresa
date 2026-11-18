-- SUIRI V4: ENVIO 3 DE 6. Copie todo este bloco e execute no SQL Editor.
begin;
create schema if not exists suiri_celular_v4_20261117;
revoke all on schema suiri_celular_v4_20261117 from public,anon,authenticated;
create table if not exists suiri_celular_v4_20261117.partes(roteiro text not null,parte integer not null,conteudo text not null,primary key(roteiro,parte));
revoke all on suiri_celular_v4_20261117.partes from public,anon,authenticated;
insert into suiri_celular_v4_20261117.partes(roteiro,parte,conteudo)values('2379b85516f2958bf01bfb87382afcae',3,$SUIRI_ARQUIVO_03$ distinct from auth.uid()::text then raise exception 'Só o responsável pode mudar o status.';end if;
   if j->>'ultimo_reinicio' is distinct from o->>'ultimo_reinicio' and (j->>'status'<>'concluida' or j->>'ultimo_reinicio' is distinct from ((now()at time zone 'America/Sao_Paulo')::date)::text)then raise exception 'Data de conclusão inválida.';end if;
   if (coalesce(j->'ajudantes','[]')-auth.uid()::text)is distinct from(coalesce(o->'ajudantes','[]')-auth.uid()::text)then raise exception 'Só pode alterar sua própria participação como ajudante.';end if;
   if (j-array['ajudantes','subitens'])is distinct from(o-array['ajudantes','subitens'])and(j->>'assumido_por')is distinct from auth.uid()::text then raise exception 'Só o responsável pode alterar a execução.';end if;
   if j->'subitens' is distinct from o->'subitens' then
    if (j->>'assumido_por')is distinct from auth.uid()::text and not coalesce(j->'ajudantes','[]')?auth.uid()::text then raise exception 'Entre na tarefa antes de marcar subitens.';end if;
    if jsonb_array_length(coalesce(j->'subitens','[]'))<>jsonb_array_length(coalesce(o->'subitens','[]'))then raise exception 'Não pode adicionar ou excluir subitens.';end if;
    if exists(select 1 from jsonb_array_elements(coalesce(j->'subitens','[]'))with ordinality as ns(item,pos)join jsonb_array_elements(coalesce(o->'subitens','[]'))with ordinality as os(item,pos)using(pos)where(ns.item-array['concluido','feito_por'])is distinct from(os.item-array['concluido','feito_por'])or(ns.item is distinct from os.item and coalesce(ns.item->>'feito_por',auth.uid()::text)<>auth.uid()::text))then raise exception 'Subitem ou responsável inválido.';end if;
   end if;
   if j->>'status'='concluida' and coalesce((j->>'autonoma')::boolean,false) then raise exception 'Tarefa autônoma precisa de aprovação da gestão.';end if;
  end if;
 elsif tg_table_name='avisos' and not suiri_private.permissao('avisos') then
  if tg_op='UPDATE' then raise exception 'Use a ação de confirmar leitura.';end if;
  if (j->>'criado_por')is distinct from auth.uid()::text then raise exception 'Autor do aviso inválido.';end if;
 end if;
 return new;
end $$;

-- Replace permissive legacy policies; tenant isolation must not be bypassed by an old OR policy.
do $$declare t text;r record;tipo text;ler text;escrever text;inserir text;apagar text;begin
 select format_type(atttypid,atttypmod) into tipo from pg_attribute where attrelid='public.empresas'::regclass and attname='id';
 foreach t in array array['empresas','perfis','tarefas','avisos','livro_ponto','vales','itens_comprados','pedidos_compra','contas_pagar','fechamento_caixa','cardapio_consumo','suiri_contatos','suiri_vendas','suiri_recebimentos'] loop
  for r in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',r.policyname,t);end loop;
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  if t='empresas' then
   create policy suiri_ler on public.empresas for select to authenticated using(id::text=suiri_private.empresa());
   create policy suiri_alterar on public.empresas for update to authenticated using(id::text=suiri_private.empresa() and suiri_private.admin()) with check(id::text=suiri_private.empresa() and suiri_private.admin());
   continue;
  end if;
  if t='perfis' then
   create policy suiri_ler on public.perfis for select to authenticated using(id=auth.uid() or (empresa_id::text=suiri_private.empresa() and (suiri_private.admin() or suiri_private.permissao('inspecao') or suiri_private.permissao('financeiro') or suiri_private.permissao('relatorios') or suiri_private.permissao('ponto'))));
   create policy suiri_alterar on public.perfis for update to authenticated using(empresa_id::text=suiri_private.empresa() and (id=auth.uid() or suiri_private.admin() or suiri_private.permissao('inspecao') or suiri_private.permissao('setores') or suiri_private.permissao('financeiro'))) with check(empresa_id::text=suiri_private.empresa());
   continue;
  end if;
  execute format('alter table public.%I alter column empresa_id set default (suiri_private.empresa())::%s',t,tipo);
  execute format('create index if not exists %I on public.%I(empresa_id)','suiri_empresa_'||t,t);
  ler:='true';escrever:='false';inserir:='false';apagar:='false';
  case t
   when 'suiri_contatos' then ler:='suiri_private.comercial()';escrever:=ler;inserir:=ler;
   when 'suiri_vendas','suiri_recebimentos' then ler:='suiri_private.comercial()';
   when 'contas_pagar' then ler:='suiri_private.permissao(''contas'') or suiri_private.permissao(''gestao'')';escrever:=ler;inserir:=ler;apagar:=ler;
   when 'fechamento_caixa' then ler:='suiri_private.permissao(''fechar_caixa'') or suiri_private.permissao(''relatorios'')';inserir:='suiri_private.permissao(''fechar_caixa'')';apagar:='suiri_private.admin()';
   when 'cardapio_consumo' then escrever:='suiri_private.permissao(''compras'') or suiri_private.permissao(''gestao'')';inserir:=escrever;apagar:=escrever;
   when 'pedidos_compra' then escrever:='suiri_private.permissao(''compras'') or suiri_private.permissao(''gestao'')';inserir:='criado_por=auth.uid()';apagar:=escrever;
   when 'vales' then ler:='perfil_id=auth.uid() or suiri_private.permissao(''financeiro'') or suiri_private.permissao(''relatorios'')';escrever:='suiri_private.permissao(''financeiro'')';inserir:=escrever;apagar:=escrever;
   when 'itens_comprados' then ler:='perfil_id=auth.uid() or suiri_private.permissao(''financeiro'') or suiri_private.permissao(''relatorios'')';escrever:='suiri_private.permissao(''financeiro'')';inserir:='perfil_id=auth.uid() or suiri_private.permissao(''financeiro'')';apagar:=escrever;
   when 'livro_ponto' then ler:='perfil_id=auth.uid() or suiri_private.permissao(''ponto'') or suiri_private.permissao(''inspecao'') or suiri_private.permissao(''financeiro'') or suiri_private.permissao(''relatorios'')';escrever:='perfil_id=auth.uid() or suiri_private.permissao(''ponto'')';inserir:=escrever;apagar:='suiri_private.permissao(''ponto'')';
   when 'tarefas' then escrever:='true';inserir:='true';apagar:='suiri_private.permissao(''tarefas'')';
   when 'avisos' then ler:='(destinado_a is null or destinado_a=auth.uid() or criado_por=auth.uid() or suiri_private.permissao(''avisos''))';inserir:='criado_por=auth.uid()';escrever:='suiri_private.permissao(''avisos'')';apagar:=escrever;
  end case;
  execute format('create policy suiri_ler on public.%I for select to authenticated using(empresa_id::text=suiri_private.empresa() and (%s))',t,ler);
  execute format('create policy suiri_inserir on public.%I for insert to authenticated with check(empresa_id::text=suiri_private.empresa() and (%s))',t,inserir);
  execute format('create policy suiri_alterar on public.%I for update to authenticated using(empresa_id::text=suiri_private.empresa() and (%s)) with check(empresa_id::text=suiri_private.empresa() and (%s))',t,escrever,escrever);
  execute format('create policy suiri_apagar on public.%I for delete to authenticated using(empresa_id::text=suiri_private.empresa() and (%s))',t,apagar);
  if t not like 'suiri_%' then
   execute format('drop trigger if exists suiri_proteger_registro on public.%I',t);
   execute format('create trigger suiri_proteger_registro before insert or update on public.%I for each row execute function suiri_private.proteger_registro()',t);
  end if;
 end loop;
end $$;

-- A limited team directory avoids exposing contracts/salaries to staff.
create or replace function suiri_private.equipe() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'setor',setor,'avatar_url',to_jsonb(p)->>'avatar_url','is_admin',is_admin,'is_socio',is_socio,'is_gerente',is_gerente)),'[]') from public.perfis p where empresa_id::text=suiri_private.empresa()
$$;
create or replace function public.suiri_equipe_basica() returns jsonb language sql security invoker set search_path='' as $$select suiri_private.equipe()$$;

-- Atomic read acknowledgments avoid concurrent readers overwriting one another.
create or replace function suiri_private.ler_aviso(p_id text) returns void language plpgsql security definer set search_path='' as $$
declare r public.avisos;j jsonb;begin
 select * into r from public.avisos where id::text=p_id and empresa_id::text=suiri_private.empresa() and (destinado_a is null or destinado_a=auth.uid() or criado_por=auth.uid() or suiri_private.permissao('avisos')) for update;
 if not found then raise exception 'Aviso não encontrado.';end if;
 j:=coalesce(to_jsonb(r.lidos_por),'[]');
 if not j ? auth.uid()::text then
  j:=j||jsonb_build_array(auth.uid()::text);perform set_config('suiri.interno','sim',true);
  update public.avisos set lidos_por=(select p.lidos_por from jsonb_populate_record(null::public.avisos,jsonb_build_object('lidos_por',j))p)where id=r.id;
  perform set_config('suiri.interno','nao',true);
 end if;
end $$;
create or replace function public.suiri_ler_aviso(p_id text) returns void language sql security invoker set search_path='' as $$select suiri_private.ler_aviso(p_id)$$;

-- Catalog: explicit bulk price updates, automatic learning only adds new names.
create or replace function suiri_private.importar(p_itens jsonb,p_atualizar boolean) returns integer language plpgsql security definer set search_path='' as $$
declare i jsonb;n text;v numeric;contador int:=0;begin
 if not(suiri_private.permissao('compras') or suiri_private.permissao('gestao'))then raise exception 'Sem permissão para gerir o catálogo.';end if;
 if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 500 then raise exception 'Envie de 1 a 500 itens.';end if;
 perform pg_advisory_xact_lock(hashtext('suiri-catalogo-'||suiri_private.empresa()));
 for i in select value from js$SUIRI_ARQUIVO_03$)on conflict(roteiro,parte)do update set conteudo=excluded.conteudo;
commit;
select 'ENVIO 3 DE 6 RECEBIDO' as resultado;
-- FIM SUIRI ENVIO 3
