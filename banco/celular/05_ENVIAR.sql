-- SUIRI V4: ENVIO 5 DE 6. Copie todo este bloco e execute no SQL Editor.
begin;
create schema if not exists suiri_celular_v4_20261117;
revoke all on schema suiri_celular_v4_20261117 from public,anon,authenticated;
create table if not exists suiri_celular_v4_20261117.partes(roteiro text not null,parte integer not null,conteudo text not null,primary key(roteiro,parte));
revoke all on suiri_celular_v4_20261117.partes from public,anon,authenticated;
insert into suiri_celular_v4_20261117.partes(roteiro,parte,conteudo)values('2379b85516f2958bf01bfb87382afcae',5,$SUIRI_ARQUIVO_05$=p_usuario for update;
 if not found then raise exception 'Membro não encontrado.';end if;
 if emp is distinct from suiri_private.empresa()then raise exception 'Membro de outra empresa.';end if;
 if p_usuario<>auth.uid() and not suiri_private.admin()then raise exception 'Apenas administradores podem excluir membros.';end if;
 perform pg_advisory_xact_lock(hashtext('suiri-admin-'||emp));
 if exists(select 1 from public.perfis where id=p_usuario and is_admin)and(select count(*)from public.perfis where empresa_id::text=emp and is_admin)<2 then raise exception 'Este é o último administrador. Transfira a administração ou exclua a empresa inteira.';end if;
 if exists(select 1 from storage.objects where bucket_id='sistema-imagens' and name like 'avatar_'||p_usuario::text||'_%')then raise exception 'Remova as fotos pelo aplicativo antes de excluir a conta.';end if;
 perform set_config('suiri.interno','sim',true);
 delete from public.suiri_historico_tarefas where empresa_id::text=emp and registro->>'criado_por'=p_usuario::text and coalesce((registro->>'autonoma')::boolean,false);
 update public.suiri_historico_tarefas set registro=registro||jsonb_build_object('criado_por',case when registro->>'criado_por'=p_usuario::text then null else registro->>'criado_por' end,'assumido_por',case when registro->>'assumido_por'=p_usuario::text then null else registro->>'assumido_por' end)where empresa_id::text=emp;
 delete from public.avisos where empresa_id::text=emp and (ponto_freelance_id in(select id from public.livro_ponto where perfil_id=p_usuario)or tarefa_autonoma_id in(select id from public.tarefas where criado_por=p_usuario and coalesce(autonoma,false)));
 update public.avisos a set lidos_por=(select p.lidos_por from jsonb_populate_record(null::public.avisos,jsonb_build_object('lidos_por',coalesce(to_jsonb(a.lidos_por),'[]')-p_usuario::text))p)where empresa_id::text=emp;
 update public.tarefas t set
 ajudantes=(select p.ajudantes from jsonb_populate_record(null::public.tarefas,jsonb_build_object('ajudantes',coalesce(to_jsonb(t.ajudantes),'[]')-p_usuario::text))p),
 subitens=coalesce((select jsonb_agg(case when x->>'feito_por'=p_usuario::text then x||jsonb_build_object('feito_por',null)else x end)from jsonb_array_elements(coalesce(t.subitens,'[]'))x),'[]'),
 status=case when assumido_por=p_usuario and status='em_andamento'then 'pendente'else status end,
 hora_inicio=case when assumido_por=p_usuario and status='em_andamento'then null else hora_inicio end
 where empresa_id::text=emp;
 delete from public.vales where perfil_id=p_usuario;
 delete from public.itens_comprados where perfil_id=p_usuario;
 delete from public.livro_ponto where perfil_id=p_usuario;
 -- Keep routines, business documents and their history. Only personal autonomous tasks are removed.
 delete from public.tarefas where criado_por=p_usuario and coalesce(autonoma,false);
 foreach t in array array['tarefas','avisos','pedidos_compra','contas_pagar','fechamento_caixa','itens_comprados','vales','cardapio_consumo','suiri_vendas','suiri_recebimentos']loop
  foreach col in array array['criado_por','registrado_por','responsavel_id','assumido_por','destinado_a','comprado_por','estornado_por']loop
   if exists(select 1 from information_schema.columns where table_schema='public'and table_name=t and column_name=col)then
    execute format('update public.%I set %I=null where %I::text=$1 and empresa_id::text=$2',t,col,col)using p_usuario::text,emp;
   end if;
  end loop;
 end loop;
 delete from public.perfis where id=p_usuario;
 delete from auth.users where id=p_usuario;
 perform set_config('suiri.interno','nao',true);
end $$;
create or replace function public.suiri_excluir_membro(p_usuario uuid)returns void language sql security invoker set search_path='' as $$select suiri_private.excluir_usuario(p_usuario)$$;
create or replace function public.suiri_excluir_minha_conta()returns void language sql security invoker set search_path='' as $$select suiri_private.excluir_usuario(auth.uid())$$;

create or replace function suiri_private.excluir_empresa(p_confirmacao text)returns void language plpgsql security definer set search_path='' as $$
declare emp text:=suiri_private.empresa();cnpj text;ids uuid[];t text;begin
 if not suiri_private.admin()or emp is null then raise exception 'Apenas administradores podem excluir a empresa.';end if;
 perform pg_advisory_xact_lock(hashtext('suiri-admin-'||emp));
 select e.cnpj into cnpj from public.empresas e where id::text=emp for update;
 if p_confirmacao is distinct from 'EXCLUIR '||cnpj then raise exception 'Confirmação de exclusão inválida.';end if;
 select array_agg(id)into ids from public.perfis where empresa_id::text=emp;
 if exists(select 1 from storage.objects o where o.bucket_id='sistema-imagens'and exists(select 1 from unnest(ids)u where o.name like 'avatar_'||u::text||'_%'))then raise exception 'Remova as fotos dos membros pelo aplicativo antes de excluir a empresa.';end if;
 perform set_config('suiri.interno','sim',true);
 foreach t in array array['suiri_historico_tarefas','suiri_recebimentos','suiri_vendas','suiri_contatos','avisos','tarefas','livro_ponto','vales','itens_comprados','pedidos_compra','contas_pagar','fechamento_caixa','cardapio_consumo']loop
  execute format('delete from public.%I where empresa_id::text=$1',t)using emp;
 end loop;
 delete from public.perfis where empresa_id::text=emp;
 delete from public.empresas where id::text=emp;
 delete from auth.users where id=any(ids);
 perform set_config('suiri.interno','nao',true);
end $$;
create or replace function public.suiri_excluir_empresa(p_confirmacao text)returns void language sql security invoker set search_path='' as $$select suiri_private.excluir_empresa(p_confirmacao)$$;

-- Only avatar files of self, or members administered in the same company.
create or replace function suiri_private.pode_arquivo(p_nome text)returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.perfis p where p.empresa_id::text=suiri_private.empresa()and(p.id=auth.uid()or suiri_private.admin())and p_nome like 'avatar_'||p.id::text||'_%')
$$;
create or replace function suiri_private.arquivos(p_usuario uuid,p_toda_empresa boolean)returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid()is null then raise exception 'Entre na conta.';end if;
 if p_toda_empresa and not suiri_private.admin()then raise exception 'Sem permissão.';end if;
 if not p_toda_empresa and p_usuario<>auth.uid()and not suiri_private.admin()then raise exception 'Sem permissão.';end if;
 if not p_toda_empresa then
  if not exists(select 1 from public.perfis where id=p_usuario and empresa_id::text=suiri_private.empresa())then raise exception 'Membro não encontrado.';end if;
  if exists(select 1 from public.perfis where id=p_usuario and is_admin)and(select count(*)from public.perfis where empresa_id::text=suiri_private.empresa()and is_admin)<2 then raise exception 'O último administrador precisa transferir a administração ou excluir a empresa.';end if;
 end if;
 return(select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'nome',o.name)),'[]')from storage.objects o where o.bucket_id='sistema-imagens'and exists(select 1 from public.perfis p where p.empresa_id::text=suiri_private.empresa()and(p_toda_empresa or p.id=p_usuario)and o.name like 'avatar_'||p.id::text||'_%'));
end $$;
create or replace function public.suiri_arquivos_exclusao(p_usuario uuid default null,p_toda_empresa boolean default false)returns jsonb language sql security invoker set search_path='' as $$select suiri_private.arquivos(coalesce(p_usuario,auth.uid()),p_toda_empresa)$$;
drop policy if exists suiri_limite_avatar on storage.objects;
create policy suiri_limite_avatar on storage.objects as restrictive for delete to authenticated using(bucket_id<>'sistema-imagens' or suiri_private.pode_arquivo(name));
drop policy if exists suiri_remover_avatar on storage.objects;
create policy suiri_remover_avatar on storage.objects for delete to authenticated using(bucket_id='sistema-imagens' and suiri_private.pode_arquivo(name));
drop policy if exists suiri_ler_avatar on storage.objects;
create policy suiri_ler_avatar on storage.objects for select to authenticated using(bucket_id='sistema-imagens'and suiri_private.pode_arquivo(name));
-- Upload only own avatar. RLS checks apply to both insert and overwrite.
drop policy if exists suiri_limite_upload on storage.objects;
create policy suiri_limite_upload on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'sistema-imagens' or name like 'avatar_'||auth.uid()::text||'_%');
drop policy if exists suiri_upload_avatar on storage.objects;
create policy suiri_upload_avatar on storage.objects for insert to authenticated with check(bucket_id='sistema-imagens'and name like 'avatar_'||auth.uid()::text||'_%');
drop policy if exists suiri_limite_update on storage.objects;
create policy suiri_limite_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'sistema-imagens' or name like 'avatar_'||auth.uid()::text||'_%')with check(bucket_id<>'sistema-imagens' or name like 'avatar_'||auth.uid()::text||'_%');

-- Company identity cannot change through the normal editor.
create or replace function suiri_private.proteger_empresa()returns trigger language plpgsql set search_path='' as $$begin
 if new.id is distinct from old.id or new.cnpj is distinct from old.cnpj then raise exception 'O CNPJ e a identidade da empresa não podem ser trocados.';end if;return new;end $$;
drop trigger if exists suiri_proteger_empresa on public.empresas;
create trigger suiri_proteger_empresa before update on public.empresas for each row execute function suiri_private.proteger_empresa();

-- Preserve completed executions before routines restart, so reports/learning retain history.
do $$declare tipo text;begin
 select format_type(atttypid,atttypmod)into tipo from pg_attribute where attrelid='public.empresas'::r$SUIRI_ARQUIVO_05$)on conflict(roteiro,parte)do update set conteudo=excluded.conteudo;
commit;
select 'ENVIO 5 DE 6 RECEBIDO' as resultado;
-- FIM SUIRI ENVIO 5
