-- SUIRI V4: ENVIO 2 DE 6. Copie todo este bloco e execute no SQL Editor.
begin;
create schema if not exists suiri_celular_v4_20261117;
revoke all on schema suiri_celular_v4_20261117 from public,anon,authenticated;
create table if not exists suiri_celular_v4_20261117.partes(roteiro text not null,parte integer not null,conteudo text not null,primary key(roteiro,parte));
revoke all on suiri_celular_v4_20261117.partes from public,anon,authenticated;
insert into suiri_celular_v4_20261117.partes(roteiro,parte,conteudo)values('2379b85516f2958bf01bfb87382afcae',2,$SUIRI_ARQUIVO_02$$
declare permitidas text[]:=array['nome','telefone_whatsapp','avatar_url']; begin
 if current_setting('suiri.interno',true)='sim' then return new;end if;
 if tg_op='INSERT' then
  new.is_admin:=false;new.is_socio:=false;new.is_gerente:=false;new.pode_fechar_caixa:=false;
  new.permissoes_socio:=(select p.permissoes_socio from jsonb_populate_record(null::public.perfis,'{"permissoes_socio":[]}')p);new.permissoes_gerente:=(select p.permissoes_gerente from jsonb_populate_record(null::public.perfis,'{"permissoes_gerente":[]}')p);new.cargo:='staff';
  return new;
 end if;
 if new.id<>old.id or new.empresa_id is distinct from old.empresa_id then raise exception 'Não é permitido transferir a identidade ou a empresa do perfil.';end if;
 if old.is_admin and not coalesce(new.is_admin,false) then
  perform pg_advisory_xact_lock(hashtext('suiri-admin-'||old.empresa_id::text));
  if (select count(*) from public.perfis where empresa_id=old.empresa_id and is_admin)<2 then raise exception 'A empresa precisa manter pelo menos um administrador.';end if;
 end if;
 if suiri_private.admin() then return new;end if;
 if new.id<>auth.uid() then
  if suiri_private.permissao('setores') then permitidas:=permitidas||array['setor'];end if;
  if suiri_private.permissao('financeiro') then permitidas:=permitidas||array['tipo_contrato','data_admissao','salario_base','valor_diaria','dias_folga_semana'];end if;
  if not (suiri_private.permissao('inspecao') or suiri_private.permissao('setores') or suiri_private.permissao('financeiro')) then raise exception 'Sem permissão para editar este perfil.';end if;
 end if;
 if (to_jsonb(new)-permitidas) is distinct from (to_jsonb(old)-permitidas) then raise exception 'Alteração de cargo, permissões ou contrato não autorizada.';end if;
 return new;
end $$;
drop trigger if exists suiri_proteger_perfil on public.perfis;
create trigger suiri_proteger_perfil before insert or update on public.perfis for each row execute function suiri_private.proteger_perfil();

-- Atomic onboarding. The client supplies identity data, NEVER the new role.
create or replace function suiri_private.vincular_usuario(p_usuario uuid,p_cnpj text,p_nome text,p_empresa jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=regexp_replace(upper(p_cnpj),'[^A-Z0-9]','','g');eid text;primeiro boolean;reg public.perfis;begin
 if p_usuario is null or not exists(select 1 from auth.users where id=p_usuario)then raise exception 'Usuário inválido.';end if;
 if not suiri_private.cnpj_valido(c) then raise exception 'CNPJ inválido.';end if;
 if length(btrim(p_nome)) not between 1 and 180 then raise exception 'Nome obrigatório (até 180 caracteres).';end if;
 perform pg_advisory_xact_lock(hashtext('suiri-cnpj-'||c));
 -- Lock the same user too: two tabs cannot enroll it into different companies.
 perform pg_advisory_xact_lock(hashtext('suiri-user-'||p_usuario::text));
 select * into reg from public.perfis where id=p_usuario for update;
 if reg.empresa_id is not null then return jsonb_build_object('empresa_id',reg.empresa_id,'is_admin',reg.is_admin);end if;
 select id::text into eid from public.empresas where cnpj=c for update;
 if eid is null then
  if length(btrim(coalesce(p_empresa->>'nome_fantasia',''))) not between 1 and 180 then raise exception 'Nome da empresa obrigatório. Consulte o CNPJ novamente.';end if;
  insert into public.empresas(cnpj,nome_fantasia,razao_social,telefone,endereco) values(c,left(btrim(p_empresa->>'nome_fantasia'),180),left(p_empresa->>'razao_social',250),left(p_empresa->>'telefone',40),left(p_empresa->>'endereco',500)) returning id::text into eid;
 end if;
 primeiro:=not exists(select 1 from public.perfis where empresa_id::text=eid);
 perform set_config('suiri.interno','sim',true);
 if reg.id is null then
  insert into public.perfis(id,nome,setor,empresa_id,is_admin,is_socio,is_gerente,pode_fechar_caixa,cargo)
  select p_usuario,btrim(p_nome),'frente',p.empresa_id,primeiro,false,false,primeiro,case when primeiro then 'adm' else 'staff' end
  from jsonb_populate_record(null::public.perfis,jsonb_build_object('empresa_id',eid))p;
 else
  update public.perfis set nome=btrim(p_nome),empresa_id=(select p.empresa_id from jsonb_populate_record(null::public.perfis,jsonb_build_object('empresa_id',eid))p),is_admin=primeiro,is_socio=false,is_gerente=false,pode_fechar_caixa=primeiro,cargo=case when primeiro then 'adm' else 'staff' end,permissoes_socio=default,permissoes_gerente=default where id=p_usuario;
 end if;
 perform set_config('suiri.interno','nao',true);
 return jsonb_build_object('empresa_id',eid,'is_admin',primeiro);
end $$;
create or replace function suiri_private.vincular(p_cnpj text,p_nome text,p_empresa jsonb)returns jsonb language plpgsql security definer set search_path=''as $$begin
 if auth.uid()is null then raise exception 'Entre na conta e confirme o e-mail antes de vincular a empresa.';end if;
 return suiri_private.vincular_usuario(auth.uid(),p_cnpj,p_nome,p_empresa);
end $$;
-- Reserve the first account's administrator role at actual Auth signup, even when email confirmation is pending.
create or replace function suiri_private.cadastro_auth()returns trigger language plpgsql security definer set search_path=''as $$begin
 if new.raw_user_meta_data->>'suiri_cnpj' is not null then
  perform suiri_private.vincular_usuario(new.id,new.raw_user_meta_data->>'suiri_cnpj',coalesce(new.raw_user_meta_data->>'nome','Colaborador'),coalesce(new.raw_user_meta_data->'suiri_empresa','{}'));
 end if;return new;
end $$;
drop trigger if exists zz_suiri_cadastro_auth on auth.users;
create trigger zz_suiri_cadastro_auth after insert on auth.users for each row execute function suiri_private.cadastro_auth();
create or replace function public.suiri_vincular_empresa(p_cnpj text,p_nome text,p_empresa jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select suiri_private.vincular(p_cnpj,p_nome,p_empresa)$$;

-- Reference integrity in original tables even if their legacy foreign keys are absent.
create or replace function suiri_private.proteger_registro() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new);o jsonb; col text; ref text; p jsonb; permitidas text[];begin
 if current_setting('suiri.interno',true)='sim' then return new;end if;
 if j->>'empresa_id' is null or j->>'empresa_id' is distinct from suiri_private.empresa() then raise exception 'Registro fora da empresa da sessão.';end if;
 if tg_op='UPDATE' and (j->>'empresa_id' is distinct from to_jsonb(old)->>'empresa_id' or j->>'id' is distinct from to_jsonb(old)->>'id') then raise exception 'A identidade e a empresa do registro não podem mudar.';end if;
 foreach col in array array['perfil_id','criado_por','registrado_por','responsavel_id','assumido_por','destinado_a','destinatario_id'] loop
  ref:=j->>col;
  if ref is not null and ref<>'' and not exists(select 1 from public.perfis where id::text=ref and empresa_id::text=j->>'empresa_id') then raise exception 'O membro de % não pertence à empresa.',col;end if;
 end loop;
 if jsonb_typeof(j->'ajudantes')='array' and exists(select 1 from jsonb_array_elements_text(j->'ajudantes')x where not exists(select 1 from public.perfis p where p.id::text=x and p.empresa_id::text=j->>'empresa_id')) then raise exception 'Ajudante de outra empresa.';end if;
 if suiri_private.admin() then return new;end if;
 if tg_table_name='livro_ponto' and not suiri_private.permissao('ponto') then
  if (j->>'perfil_id')is distinct from auth.uid()::text then raise exception 'Só pode registrar o próprio ponto.';end if;
  if tg_op='INSERT' and coalesce(j->>'status_turno','presente') not in ('presente','folga') then raise exception 'Status de ponto não permitido.';end if;
  if tg_op='UPDATE' then
   o:=to_jsonb(old);if (j-array['horario_saida','status_turno']) is distinct from(o-array['horario_saida','status_turno']) or o->>'horario_saida' is not null or j->>'status_turno' not in ('presente','aguardando_aprovacao_diaria') then raise exception 'Somente o encerramento do seu turno é permitido.';end if;
  end if;
 elsif tg_table_name='itens_comprados' and not suiri_private.permissao('financeiro') then
  if tg_op<>'INSERT' or (j->>'perfil_id')is distinct from auth.uid()::text or (j->>'registrado_por')is distinct from auth.uid()::text then raise exception 'Consumo permitido apenas no próprio perfil.';end if;
  if coalesce((j->>'porcentagem_desconto')::numeric,-1)<>30 or coalesce((j->>'valor_unitario')::numeric,0)<=0 or abs((j->>'valor_final')::numeric-round((j->>'valor_unitario')::numeric*0.70,2))>0.01 then raise exception 'Desconto ou valor de consumo inválido.';end if;
 elsif tg_table_name='tarefas' and not suiri_private.permissao('tarefas') then
  if tg_op='INSERT' then
   if not coalesce((j->>'autonoma')::boolean,false) or (j->>'criado_por')is distinct from auth.uid()::text or (j->>'assumido_por')is distinct from auth.uid()::text or coalesce((j->>'recorrente')::boolean,false) then raise exception 'Só pode criar sua própria tarefa autônoma.';end if;
  else
   o:=to_jsonb(old);permitidas:=array['status','hora_inicio','hora_fim','assumido_por','ajudantes','subitens','aguardando_aprovacao','ultimo_reinicio'];
   if (j-permitidas) is distinct from (o-permitidas) then raise exception 'Não pode editar a definição desta tarefa.';end if;
   if coalesce(j->>'status','') not in ('pendente','em_andamento','concluida','aguardando_aprovacao') then raise exception 'Status da tarefa inválido.';end if;
   if o->>'assumido_por' is not null and o->>'assumido_por'<>auth.uid()::text and j->>'assumido_por' is distinct from o->>'assumido_por' then raise exception 'Não pode assumir a tarefa de outra pessoa.';end if;
   if j->>'assumido_por' is distinct from o->>'assumido_por' and (j->>'assumido_por')is distinct from auth.uid()::text then raise exception 'Não pode transferir a execução.';end if;
   if j->>'status' is distinct from o->>'status' and (j->>'assumido_por')is$SUIRI_ARQUIVO_02$)on conflict(roteiro,parte)do update set conteudo=excluded.conteudo;
commit;
select 'ENVIO 2 DE 6 RECEBIDO' as resultado;
-- FIM SUIRI ENVIO 2
