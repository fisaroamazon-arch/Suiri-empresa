-- SUIRI V4: ENVIO 6 DE 6. Copie todo este bloco e execute no SQL Editor.
begin;
create schema if not exists suiri_celular_v4_20261117;
revoke all on schema suiri_celular_v4_20261117 from public,anon,authenticated;
create table if not exists suiri_celular_v4_20261117.partes(roteiro text not null,parte integer not null,conteudo text not null,primary key(roteiro,parte));
revoke all on suiri_celular_v4_20261117.partes from public,anon,authenticated;
insert into suiri_celular_v4_20261117.partes(roteiro,parte,conteudo)values('2379b85516f2958bf01bfb87382afcae',6,$SUIRI_ARQUIVO_06$egclass and attname='id';
 execute format('create table if not exists public.suiri_historico_tarefas(id uuid primary key default gen_random_uuid(),empresa_id %s not null references public.empresas(id),tarefa_id text not null,concluida_em timestamptz not null,registro jsonb not null,unique(tarefa_id,concluida_em))',tipo);
end $$;
alter table public.suiri_historico_tarefas enable row level security;
revoke all on public.suiri_historico_tarefas from anon,authenticated;
grant select on public.suiri_historico_tarefas to authenticated;
drop policy if exists suiri_ler on public.suiri_historico_tarefas;
create policy suiri_ler on public.suiri_historico_tarefas for select to authenticated using(empresa_id::text=suiri_private.empresa());
create index if not exists suiri_historico_empresa_data on public.suiri_historico_tarefas(empresa_id,concluida_em);
create or replace function suiri_private.arquivar_execucao()returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='concluida'and new.hora_fim is not null then
  insert into public.suiri_historico_tarefas(empresa_id,tarefa_id,concluida_em,registro)values(new.empresa_id,new.id::text,new.hora_fim,to_jsonb(new))on conflict(tarefa_id,concluida_em)do nothing;
 end if;return new;
end $$;
drop trigger if exists suiri_arquivar_execucao on public.tarefas;
create trigger suiri_arquivar_execucao after insert or update on public.tarefas for each row execute function suiri_private.arquivar_execucao();
insert into public.suiri_historico_tarefas(empresa_id,tarefa_id,concluida_em,registro)select empresa_id,id::text,hora_fim,to_jsonb(t)from public.tarefas t where status='concluida'and hora_fim is not null on conflict(tarefa_id,concluida_em)do nothing;
create or replace function suiri_private.reiniciar()returns integer language plpgsql security definer set search_path='' as $$
declare hoje date:=(now()at time zone 'America/Sao_Paulo')::date;hora text:=to_char(now()at time zone 'America/Sao_Paulo','HH24:MI');n int;begin
 if suiri_private.empresa()is null then raise exception 'Empresa não vinculada.';end if;
 perform set_config('suiri.interno','sim',true);
 update public.tarefas t set status='pendente',assumido_por=null,ajudantes='{}',hora_inicio=null,hora_fim=null,
 subitens=coalesce((select jsonb_agg(s||jsonb_build_object('concluido',false,'feito_por',null))from jsonb_array_elements(coalesce(t.subitens,'[]'))s),'[]'),ultimo_reinicio=hoje
 where empresa_id::text=suiri_private.empresa()and recorrente=true and status='concluida'
 and (hora_fim at time zone 'America/Sao_Paulo')::date<hoje and ultimo_reinicio is distinct from hoje
 and hora>=coalesce(horario_reinicio,'01:00');
 get diagnostics n=row_count;perform set_config('suiri.interno','nao',true);return n;
end $$;
create or replace function public.suiri_reiniciar_rotinas()returns integer language sql security invoker set search_path='' as $$select suiri_private.reiniciar()$$;

-- Generate freelance approval after synchronization as well as during online use.
create or replace function suiri_private.aviso_diaria()returns trigger language plpgsql security definer set search_path='' as $$
declare anterior text:=current_setting('suiri.interno',true);n text;begin
 if new.status_turno='aguardando_aprovacao_diaria'and old.status_turno is distinct from new.status_turno then
  select nome into n from public.perfis where id=new.perfil_id;
  if not exists(select 1 from public.avisos where ponto_freelance_id=new.id)then
   perform set_config('suiri.interno','sim',true);
   insert into public.avisos(empresa_id,titulo,mensagem,setor_destino,criado_por,lidos_por,ponto_freelance_id)
   values(new.empresa_id,'Aprovação de diária: '||coalesce(n,'Colaborador'),'Expediente concluído. Confira o ponto registrado e aprove a diária.','todos',new.perfil_id,'{}',new.id);
   perform set_config('suiri.interno',coalesce(anterior,'nao'),true);
  end if;
 end if;return new;
end $$;
drop trigger if exists suiri_aviso_diaria on public.livro_ponto;
create trigger suiri_aviso_diaria after update on public.livro_ponto for each row execute function suiri_private.aviso_diaria();

-- Learn names/prices from authorized management consumption entries, without changing existing prices.
create or replace function suiri_private.aprender_consumo()returns trigger language plpgsql security definer set search_path='' as $$
declare n text:=btrim(new.descricao_item);v numeric:=new.valor_unitario;begin
 if not suiri_private.permissao('financeiro')then return new;end if;
 if n is null or length(n)not between 1 and 180 or v is null or v<=0 then return new;end if;
 perform pg_advisory_xact_lock(hashtext('suiri-catalogo-'||new.empresa_id::text));
 if not exists(select 1 from public.cardapio_consumo where empresa_id=new.empresa_id and lower(btrim(nome_item))=lower(n))then
  insert into public.cardapio_consumo(empresa_id,nome_item,valor_padrao,ativo)values(new.empresa_id,n,round(v,2),true);
 end if;return new;
end $$;
drop trigger if exists suiri_aprender_consumo on public.itens_comprados;
create trigger suiri_aprender_consumo after insert on public.itens_comprados for each row execute function suiri_private.aprender_consumo();

create or replace function public.suiri_versao()returns integer language sql immutable security invoker set search_path=''as $$select 4$$;

-- Revoke the legacy destructive RPCs, including inherited PUBLIC grants.
do $$declare r record;begin
 for r in select p.oid::regprocedure as fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname in('apagar_usuario_completo','reset_user_password_admin')loop
  execute format('revoke all on function %s from public,anon,authenticated',r.fn);
 end loop;
end $$;
revoke all on all functions in schema suiri_private from public,anon;
-- Grant only fixed routines, whose arguments are validated inside the function.
grant execute on all functions in schema suiri_private to authenticated;
revoke execute on function suiri_private.vincular_usuario(uuid,text,text,jsonb)from authenticated;
-- Internal trigger functions are not callable as ordinary RPCs; destructive helpers still enforce all authorization.
do $$declare r record;begin
 for r in select p.oid::regprocedure fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname like 'suiri_%'loop
  execute format('revoke all on function %s from public,anon',r.fn);
  execute format('grant execute on function %s to authenticated',r.fn);
 end loop;
end $$;
grant execute on function public.suiri_versao()to anon;
notify pgrst,'reload schema';
$SUIRI_ARQUIVO_06$)on conflict(roteiro,parte)do update set conteudo=excluded.conteudo;
commit;
select 'ENVIO 6 DE 6 RECEBIDO' as resultado;
-- FIM SUIRI ENVIO 6
