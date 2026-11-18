-- SUIRI V4: ENVIO 4 DE 6. Copie todo este bloco e execute no SQL Editor.
begin;
create schema if not exists suiri_celular_v4_20261117;
revoke all on schema suiri_celular_v4_20261117 from public,anon,authenticated;
create table if not exists suiri_celular_v4_20261117.partes(roteiro text not null,parte integer not null,conteudo text not null,primary key(roteiro,parte));
revoke all on suiri_celular_v4_20261117.partes from public,anon,authenticated;
insert into suiri_celular_v4_20261117.partes(roteiro,parte,conteudo)values('2379b85516f2958bf01bfb87382afcae',4,$SUIRI_ARQUIVO_04$onb_array_elements(p_itens)loop
  n:=btrim(i->>'nome_item');v:=(i->>'valor_padrao')::numeric;
  if n is null or length(n) not between 1 and 180 or v is null or v<=0 or v>999999999.99 or v<>round(v,2)then raise exception 'Nome ou preço de item inválido.';end if;
  if exists(select 1 from public.cardapio_consumo where empresa_id::text=suiri_private.empresa() and lower(btrim(nome_item))=lower(n))then
   if p_atualizar then update public.cardapio_consumo set valor_padrao=v,ativo=true where empresa_id::text=suiri_private.empresa() and lower(btrim(nome_item))=lower(n);end if;
  else
   insert into public.cardapio_consumo(empresa_id,nome_item,valor_padrao,ativo)select p.empresa_id,n,v,true from jsonb_populate_record(null::public.cardapio_consumo,jsonb_build_object('empresa_id',suiri_private.empresa()))p;
  end if;contador:=contador+1;
 end loop;return contador;
end $$;
create or replace function public.suiri_importar_cardapio(p_itens jsonb,p_atualizar boolean default false) returns integer language sql security invoker set search_path='' as $$select suiri_private.importar(p_itens,p_atualizar)$$;

create or replace function suiri_private.venda(p_contato uuid,p_itens jsonb,p_data date,p_vencimento date,p_observacao text,p_operacao uuid)returns uuid language plpgsql security definer set search_path='' as $$
declare i jsonb;total numeric:=0;q numeric;v numeric;n text;vendaid uuid;cat jsonb:='[]';reg public.suiri_vendas;begin
 if not suiri_private.comercial()then raise exception 'Sem acesso ao comercial.';end if;
 if p_operacao is null then raise exception 'Identificador da operação obrigatório.';end if;
 perform pg_advisory_xact_lock(hashtext('suiri-op-'||p_operacao::text));
 select * into reg from public.suiri_vendas where operacao_id=p_operacao;
 if found then
  if reg.empresa_id::text<>suiri_private.empresa()then raise exception 'Operação de outra empresa.';end if;
  if reg.contato_id is distinct from p_contato or reg.itens is distinct from p_itens or reg.data_venda is distinct from p_data or reg.vencimento is distinct from p_vencimento or coalesce(reg.observacao,'')is distinct from coalesce(left(p_observacao,2000),'')then raise exception 'Esta operação já foi registrada com outros dados. Atualize o histórico antes de criar outra venda.';end if;return reg.id;
 end if;
 if p_data is null or p_vencimento is null then raise exception 'Datas obrigatórias.';end if;
 if p_data>(now()at time zone 'America/Sao_Paulo')::date or p_vencimento<p_data then raise exception 'Confira as datas: venda futura ou vencimento anterior à venda.';end if;
 if not exists(select 1 from public.suiri_contatos where id=p_contato and empresa_id::text=suiri_private.empresa() and tipo='cliente' and ativo)then raise exception 'Selecione um cliente ativo desta empresa.';end if;
 if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 200 then raise exception 'A venda precisa de 1 a 200 itens.';end if;
 for i in select value from jsonb_array_elements(p_itens)loop
  n:=btrim(i->>'descricao');q:=(i->>'quantidade')::numeric;v:=(i->>'valor_centavos')::numeric;
  if n is null or length(n) not between 1 and 180 or q is null or q<=0 or q>1000000 or q<>round(q,3) or v is null or v<=0 or v<>trunc(v)or v>99999999999 then raise exception 'Descrição, quantidade ou preço inválido.';end if;
  total:=total+round(q*v);cat:=cat||jsonb_build_array(jsonb_build_object('nome_item',n,'valor_padrao',v/100));
 end loop;
 if total<=0 or total>99999999999999 then raise exception 'Total da venda fora do limite.';end if;
 insert into public.suiri_vendas(empresa_id,contato_id,itens,total_centavos,data_venda,vencimento,observacao,criado_por,operacao_id)
 select p.empresa_id,p_contato,p_itens,total::bigint,p_data,p_vencimento,left(p_observacao,2000),auth.uid(),p_operacao from jsonb_populate_record(null::public.suiri_vendas,jsonb_build_object('empresa_id',suiri_private.empresa()))p returning id into vendaid;
 -- Learning does not require catalog-management permission but can only add validated items from an authorized sale.
 perform pg_advisory_xact_lock(hashtext('suiri-catalogo-'||suiri_private.empresa()));
 for i in select value from jsonb_array_elements(cat) loop
  if not exists(select 1 from public.cardapio_consumo where empresa_id::text=suiri_private.empresa() and lower(btrim(nome_item))=lower(i->>'nome_item'))then
   insert into public.cardapio_consumo(empresa_id,nome_item,valor_padrao,ativo)select p.empresa_id,i->>'nome_item',(i->>'valor_padrao')::numeric,true from jsonb_populate_record(null::public.cardapio_consumo,jsonb_build_object('empresa_id',suiri_private.empresa()))p;
  end if;
 end loop;return vendaid;
end $$;
create or replace function public.suiri_registrar_venda(p_contato uuid,p_itens jsonb,p_data date,p_vencimento date,p_observacao text,p_operacao uuid)returns uuid language sql security invoker set search_path='' as $$select suiri_private.venda(p_contato,p_itens,p_data,p_vencimento,p_observacao,p_operacao)$$;

create or replace function suiri_private.receber(p_venda uuid,p_valor bigint,p_data date,p_forma text,p_observacao text,p_operacao uuid)returns uuid language plpgsql security definer set search_path='' as $$
declare v public.suiri_vendas;r public.suiri_recebimentos;saldo bigint;rid uuid;begin
 if not suiri_private.comercial()then raise exception 'Sem acesso ao comercial.';end if;
 if p_operacao is null then raise exception 'Identificador da operação obrigatório.';end if;
 perform pg_advisory_xact_lock(hashtext('suiri-op-'||p_operacao::text));
 select * into r from public.suiri_recebimentos where operacao_id=p_operacao;
 if found then if r.empresa_id::text<>suiri_private.empresa()then raise exception 'Operação de outra empresa.';end if;
 if r.venda_id is distinct from p_venda or r.valor_centavos is distinct from p_valor or r.data_recebimento is distinct from p_data or r.forma is distinct from p_forma or coalesce(r.observacao,'')is distinct from coalesce(left(p_observacao,1000),'')then raise exception 'Esta operação já foi registrada com outros dados. Atualize o histórico antes de registrar outro recebimento.';end if;return r.id;end if;
 select * into v from public.suiri_vendas where id=p_venda and empresa_id::text=suiri_private.empresa()for update;
 if not found or v.cancelada_em is not null then raise exception 'Venda não encontrada ou cancelada.';end if;
 select v.total_centavos-coalesce(sum(valor_centavos)filter(where estornado_em is null),0)into saldo from public.suiri_recebimentos where venda_id=v.id;
 if p_valor is null or p_valor<=0 or p_valor>saldo then raise exception 'O recebimento deve ser positivo e não pode superar o saldo (% centavos).',saldo;end if;
 if p_data is null or p_data<v.data_venda or p_data>(now()at time zone 'America/Sao_Paulo')::date then raise exception 'Data de recebimento inválida.';end if;
 if p_forma is null or p_forma not in ('Pix','Dinheiro','Cartão','Transferência','Boleto','Outro')then raise exception 'Forma de recebimento inválida.';end if;
 insert into public.suiri_recebimentos(empresa_id,venda_id,valor_centavos,data_recebimento,forma,observacao,criado_por,operacao_id)values(v.empresa_id,v.id,p_valor,p_data,p_forma,left(p_observacao,1000),auth.uid(),p_operacao)returning id into rid;return rid;
end $$;
create or replace function public.suiri_receber_venda(p_venda uuid,p_valor bigint,p_data date,p_forma text,p_observacao text,p_operacao uuid)returns uuid language sql security invoker set search_path='' as $$select suiri_private.receber(p_venda,p_valor,p_data,p_forma,p_observacao,p_operacao)$$;

create or replace function suiri_private.estornar(p_id uuid,p_motivo text)returns void language plpgsql security definer set search_path='' as $$
declare r public.suiri_recebimentos;begin
 if not suiri_private.admin()then raise exception 'Apenas administradores podem estornar.';end if;
 if p_motivo is null or length(btrim(p_motivo))not between 1 and 1000 then raise exception 'Informe o motivo (até 1000 caracteres).';end if;
 select * into r from public.suiri_recebimentos where id=p_id and empresa_id::text=suiri_private.empresa();
 if not found then raise exception 'Recebimento não encontrado.';end if;
 perform 1 from public.suiri_vendas where id=r.venda_id for update;
 update public.suiri_recebimentos set estornado_em=now(),estornado_por=auth.uid(),motivo_estorno=p_motivo where id=p_id and estornado_em is null;
end $$;
create or replace function public.suiri_estornar_recebimento(p_id uuid,p_motivo text)returns void language sql security invoker set search_path='' as $$select suiri_private.estornar(p_id,p_motivo)$$;
create or replace function suiri_private.cancelar(p_id uuid,p_motivo text)returns void language plpgsql security definer set search_path='' as $$
declare v public.suiri_vendas;begin
 if not suiri_private.admin()then raise exception 'Apenas administradores podem cancelar.';end if;
 if p_motivo is null or length(btrim(p_motivo))not between 1 and 1000 then raise exception 'Informe o motivo.';end if;
 select * into v from public.suiri_vendas where id=p_id and empresa_id::text=suiri_private.empresa()for update;
 if not found then raise exception 'Venda não encontrada.';end if;
 if exists(select 1 from public.suiri_recebimentos where venda_id=p_id and estornado_em is null)then raise exception 'Estorne os recebimentos antes de cancelar.';end if;
 update public.suiri_vendas set cancelada_em=coalesce(cancelada_em,now()),motivo_cancelamento=p_motivo where id=p_id;
end $$;
create or replace function public.suiri_cancelar_venda(p_id uuid,p_motivo text)returns void language sql security invoker set search_path='' as $$select suiri_private.cancelar(p_id,p_motivo)$$;

-- Deletion is server-side and transactional. Remove Storage files through its API first.
create or replace function suiri_private.excluir_usuario(p_usuario uuid)returns void language plpgsql security definer set search_path='' as $$
declare emp text;col text;t text;begin
 select empresa_id::text into emp from public.perfis where id$SUIRI_ARQUIVO_04$)on conflict(roteiro,parte)do update set conteudo=excluded.conteudo;
commit;
select 'ENVIO 4 DE 6 RECEBIDO' as resultado;
-- FIM SUIRI ENVIO 4
