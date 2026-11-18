-- Suiri Empresas V4.3. Execute depois de banco/01_ATUALIZACAO.sql.
begin;

-- Keep the same company ID type as the existing database.
do $$
declare tipo_empresa text;
begin
    select pg_catalog.format_type(atttypid, atttypmod) into strict tipo_empresa
      from pg_catalog.pg_attribute where attrelid='public.empresas'::regclass and attname='id';
    execute format('create table if not exists public.suiri_consumo_revisao (
        id uuid primary key,
        empresa_id %s not null references public.empresas(id) on delete cascade,
        perfil_id uuid not null references public.perfis(id) on delete cascade,
        nome_item text not null,
        valor_informado numeric(11,2) not null,
        quantidade_informada integer not null,
        data_compra date not null,
        criado_em timestamptz not null default now(),
        status text not null default ''pendente'' check (status in (''pendente'',''aprovado'',''recusado'')),
        valor_aprovado numeric(11,2),
        quantidade_aprovada integer,
        revisado_em timestamptz,
        revisado_por uuid references public.perfis(id) on delete set null
    )', tipo_empresa);
end $$;
create index if not exists suiri_consumo_revisao_empresa
    on public.suiri_consumo_revisao(empresa_id,status,criado_em);
create index if not exists suiri_consumo_revisao_perfil
    on public.suiri_consumo_revisao(perfil_id,criado_em);
alter table public.suiri_consumo_revisao enable row level security;
revoke all on public.suiri_consumo_revisao from public,anon,authenticated;

create or replace function suiri_private.pode_revisar_consumo()
returns boolean language sql stable security definer set search_path='' as $$
    select exists(select 1 from public.perfis
        where id=auth.uid() and empresa_id is not null and (is_admin or is_gerente or is_socio))
$$;

create or replace function suiri_private.chave_consumo(p_nome text)
returns text language sql immutable set search_path='' as $$
    select lower(btrim(regexp_replace(p_nome, '[[:space:]]+', ' ', 'g')))
$$;

-- Keep the original accounting columns and legacy management entry point.
create or replace function suiri_private.aprender_consumo()
returns trigger language plpgsql security definer set search_path='' as $$
declare
    n text := btrim(new.descricao_item);
    v numeric := new.valor_unitario;
begin
    if current_setting('suiri.consumo_revisado',true)='sim'
        or not suiri_private.permissao('financeiro') then return new; end if;
    if n is null or length(n) not between 1 and 180 or v is null or v<=0
        or n ~ '^[0-9]+x[[:space:]]' then return new; end if;
    perform pg_advisory_xact_lock(hashtext('suiri-catalogo-'||new.empresa_id::text));
    if not exists(select 1 from public.cardapio_consumo where empresa_id=new.empresa_id
        and suiri_private.chave_consumo(nome_item)=suiri_private.chave_consumo(n)) then
        insert into public.cardapio_consumo(empresa_id,nome_item,valor_padrao,ativo)
        values(new.empresa_id,n,round(v,2),true);
    end if;
    return new;
end $$;

-- Older app builds still insert catalog consumption directly. Require a real listed
-- price for staff using that path; unlisted items must pass through the review RPC.
create or replace function suiri_private.verificar_consumo_legado()
returns trigger language plpgsql security definer set search_path='' as $$
declare
    partes text[] := regexp_match(new.descricao_item,'^([1-9][0-9]{0,3})x (.+)$');
begin
    if auth.uid() is null or current_setting('suiri.consumo_revisado',true)='sim'
        or suiri_private.permissao('financeiro') then return new; end if;
    if new.valor_final is null or new.valor_final<>round(new.valor_unitario*0.70,2) or not exists(
        select 1 from public.cardapio_consumo c where c.empresa_id::text=new.empresa_id::text and c.ativo and (
            (suiri_private.chave_consumo(c.nome_item)=suiri_private.chave_consumo(new.descricao_item)
                and c.valor_padrao=round(new.valor_unitario,2)) or
            (suiri_private.chave_consumo(c.nome_item)=suiri_private.chave_consumo(partes[2])
                and c.valor_padrao*partes[1]::integer=round(new.valor_unitario,2))
        )
    ) then raise exception 'Use Meu consumo para enviar itens novos ou preços diferentes para aprovação.'; end if;
    return new;
end $$;
drop trigger if exists suiri_verificar_consumo_legado on public.itens_comprados;
create trigger suiri_verificar_consumo_legado before insert on public.itens_comprados
    for each row execute function suiri_private.verificar_consumo_legado();

create or replace function suiri_private.gravar_consumo(
    p_empresa text, p_perfil uuid, p_nome text, p_valor numeric, p_qtd integer, p_data date, p_operacao uuid)
returns void language plpgsql set search_path='' as $$
declare
    total numeric := p_valor*p_qtd;
    interno text := current_setting('suiri.interno',true);
    revisado text := current_setting('suiri.consumo_revisado',true);
begin
    if p_valor is null or p_valor<=0 or p_valor>999999999.99 or p_valor<>round(p_valor,2)
        or p_qtd is null or p_qtd not between 1 and 9999 or total>999999999.99 then
        raise exception 'Confira o preço por unidade, a quantidade e o total.';
    end if;
    perform set_config('suiri.interno','sim',true);
    perform set_config('suiri.consumo_revisado','sim',true);
    insert into public.itens_comprados(
        empresa_id,perfil_id,registrado_por,descricao_item,valor_unitario,porcentagem_desconto,
        valor_final,data_compra,suiri_operacao_id)
    select p.empresa_id,p_perfil,auth.uid(),
        case when p_qtd>1 then p_qtd||'x '||p_nome else p_nome end,
        total,30,round(total*0.70,2),p_data,p_operacao
    from jsonb_populate_record(null::public.itens_comprados,jsonb_build_object('empresa_id',p_empresa)) p;
    perform set_config('suiri.interno',coalesce(interno,'nao'),true);
    perform set_config('suiri.consumo_revisado',coalesce(revisado,'nao'),true);
end $$;

create or replace function public.suiri_lancar_consumo(
    p_nome text,p_valor numeric,p_qtd integer,p_data date,p_operacao uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
    emp text := suiri_private.empresa();
    membro uuid := auth.uid();
    nome text := btrim(regexp_replace(p_nome,'[[:space:]]+',' ','g'));
    item public.cardapio_consumo;
    pedido public.suiri_consumo_revisao;
    lancamento public.itens_comprados;
begin
    if emp is null or membro is null then raise exception 'Entre em uma empresa para lançar consumo.'; end if;
    if p_operacao is null or nome is null or length(nome) not between 1 and 180
        or p_data is null or p_data>(now() at time zone 'America/Sao_Paulo')::date
        or p_valor is null or p_valor<=0 or p_valor>999999999.99 or p_valor<>round(p_valor,2)
        or p_qtd is null or p_qtd not between 1 and 9999 or p_valor*p_qtd>999999999.99 then
        raise exception 'Confira o nome, o preço por unidade e a quantidade.';
    end if;
    perform pg_advisory_xact_lock(hashtext('suiri-consumo-'||p_operacao::text));
    select * into pedido from public.suiri_consumo_revisao where id=p_operacao;
    if found then
        if pedido.empresa_id::text<>emp or pedido.perfil_id<>membro or pedido.nome_item<>nome
            or pedido.valor_informado<>p_valor or pedido.quantidade_informada<>p_qtd or pedido.data_compra<>p_data then
            raise exception 'Esta operação já está vinculada a outro lançamento.';
        end if;
        return pedido.status;
    end if;
    select * into lancamento from public.itens_comprados where suiri_operacao_id=p_operacao;
    if found then
        if lancamento.empresa_id::text<>emp or lancamento.perfil_id<>membro
            or lancamento.data_compra<>p_data or lancamento.valor_unitario<>p_valor*p_qtd
            or suiri_private.chave_consumo(lancamento.descricao_item) is distinct from
               suiri_private.chave_consumo(case when p_qtd>1 then p_qtd||'x '||nome else nome end) then
            raise exception 'Esta operação já está vinculada a outro lançamento.';
        end if;
        return 'lancado';
    end if;

    perform pg_advisory_xact_lock(hashtext('suiri-catalogo-'||emp));
    select * into item from public.cardapio_consumo
    where empresa_id::text=emp and ativo and suiri_private.chave_consumo(nome_item)=suiri_private.chave_consumo(nome)
    order by id limit 1;
    if found and item.valor_padrao=p_valor then
        perform suiri_private.gravar_consumo(emp,membro,item.nome_item,p_valor,p_qtd,p_data,p_operacao);
        return 'lancado';
    end if;

    insert into public.suiri_consumo_revisao(
        id,empresa_id,perfil_id,nome_item,valor_informado,quantidade_informada,data_compra)
    select p_operacao,p.empresa_id,membro,nome,p_valor,p_qtd,p_data
    from jsonb_populate_record(null::public.suiri_consumo_revisao,jsonb_build_object('empresa_id',emp)) p;
    return 'pendente';
end $$;

create or replace function public.suiri_listar_consumos(p_gestao boolean,p_limite integer default 30,p_pular integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare emp text := suiri_private.empresa();
begin
    if emp is null or p_gestao is null or (p_gestao and not suiri_private.pode_revisar_consumo()) then
        raise exception 'Sem acesso a estas solicitações.';
    end if;
    return jsonb_build_object(
        'total', (select count(*) from public.suiri_consumo_revisao r where r.empresa_id::text=emp
            and (case when p_gestao then r.status='pendente' else r.perfil_id=auth.uid() end)),
        'pendentes', (select count(*) from public.suiri_consumo_revisao r
            where r.empresa_id::text=emp and r.status='pendente' and (p_gestao or r.perfil_id=auth.uid())),
        'itens', coalesce((select jsonb_agg(to_jsonb(consulta) order by consulta.criado_em desc, consulta.id)
            from (select r.id,r.nome_item,r.valor_informado,r.quantidade_informada,r.data_compra,r.criado_em,
                r.status,r.valor_aprovado,r.quantidade_aprovada,p.nome as colaborador
                from public.suiri_consumo_revisao r join public.perfis p on p.id=r.perfil_id
                where r.empresa_id::text=emp and
                    (case when p_gestao then r.status='pendente' else r.perfil_id=auth.uid() end)
                order by r.criado_em desc,r.id
                limit greatest(0,least(coalesce(p_limite,30),50))
                offset greatest(0,coalesce(p_pular,0))) consulta), '[]'::jsonb)
    );
end $$;

create or replace function public.suiri_revisar_consumo(p_id uuid,p_aprovar boolean,p_valor numeric,p_qtd integer)
returns text language plpgsql security definer set search_path='' as $$
declare
    emp text := suiri_private.empresa();
    pedido public.suiri_consumo_revisao;
begin
    if not suiri_private.pode_revisar_consumo() then raise exception 'Sem permissão para revisar consumo.'; end if;
    if p_aprovar is null then raise exception 'Informe a decisão.'; end if;
    select * into pedido from public.suiri_consumo_revisao where id=p_id and empresa_id::text=emp for update;
    if not found then raise exception 'Solicitação não encontrada.'; end if;
    if pedido.status<>'pendente' then return pedido.status; end if;

    if p_aprovar then
        perform pg_advisory_xact_lock(hashtext('suiri-catalogo-'||emp));
        -- Charge in the approval period, keeping the declared purchase date in the request.
        perform suiri_private.gravar_consumo(emp,pedido.perfil_id,pedido.nome_item,p_valor,p_qtd,
            (now() at time zone 'America/Sao_Paulo')::date,pedido.id);
        if not exists(select 1 from public.cardapio_consumo where empresa_id::text=emp and
            suiri_private.chave_consumo(nome_item)=suiri_private.chave_consumo(pedido.nome_item)) then
            insert into public.cardapio_consumo(empresa_id,nome_item,valor_padrao,ativo)
            values(pedido.empresa_id,pedido.nome_item,p_valor,true);
        end if;
    end if;
    update public.suiri_consumo_revisao
    set status=case when p_aprovar then 'aprovado' else 'recusado' end,
        valor_aprovado=case when p_aprovar then p_valor end,
        quantidade_aprovada=case when p_aprovar then p_qtd end,
        revisado_por=auth.uid(),revisado_em=now()
    where id=p_id returning * into pedido;
    return pedido.status;
end $$;

revoke all on function suiri_private.gravar_consumo(text,uuid,text,numeric,integer,date,uuid) from public,anon,authenticated;
revoke all on function suiri_private.pode_revisar_consumo(), suiri_private.chave_consumo(text), suiri_private.verificar_consumo_legado() from public,anon,authenticated;
revoke all on function public.suiri_lancar_consumo(text,numeric,integer,date,uuid),
    public.suiri_listar_consumos(boolean,integer,integer),public.suiri_revisar_consumo(uuid,boolean,numeric,integer) from public,anon;
grant execute on function public.suiri_lancar_consumo(text,numeric,integer,date,uuid),
    public.suiri_listar_consumos(boolean,integer,integer),public.suiri_revisar_consumo(uuid,boolean,numeric,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
