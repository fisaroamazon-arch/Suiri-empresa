-- Apply after banco/01_ATUALIZACAO.sql. Existing executions only seed the duration estimate.
begin;

alter table public.tarefas
    add column if not exists suiri_execucao_pontos uuid,
    add column if not exists suiri_pontos_inicio timestamptz,
    add column if not exists suiri_pontos_fim timestamptz,
    add column if not exists suiri_tempo_previsto_min integer,
    add column if not exists suiri_prazo_execucao timestamptz;

create index if not exists suiri_historico_empresa_tarefa_data
    on public.suiri_historico_tarefas (empresa_id, tarefa_id, concluida_em desc);

-- Team size is the number of unique helpers, excluding the person responsible.
create or replace function suiri_private.tamanho_apoio_tarefa(p jsonb)
returns integer language sql immutable set search_path = '' as $$
    select count(distinct apoio)::integer
    from jsonb_array_elements_text(coalesce(nullif(p->'ajudantes', 'null'::jsonb), '[]'::jsonb)) as a(apoio)
    where apoio <> '' and apoio is distinct from p->>'assumido_por'
$$;

do $$
declare tipo text;
begin
    select format_type(atttypid, atttypmod) into tipo
    from pg_attribute where attrelid = 'public.empresas'::regclass and attname = 'id';

    execute format('create table if not exists suiri_private.pontos_execucao (
        empresa_id %s not null references public.empresas(id) on delete cascade,
        perfil_id uuid not null references public.perfis(id) on delete cascade,
        execucao uuid not null,
        fim timestamptz not null,
        pontos_centavos integer not null check (pontos_centavos > 0),
        primary key (execucao, perfil_id)
    )', tipo);
end $$;
alter table suiri_private.pontos_execucao enable row level security;
revoke all on suiri_private.pontos_execucao from public, anon, authenticated;

create index if not exists suiri_pontos_empresa_periodo
    on suiri_private.pontos_execucao (empresa_id, fim);

create or replace function suiri_private.pontuar_tarefa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    status_anterior text;
    instante timestamptz := clock_timestamp();
    minutos integer;
    prazo_manual time;
    total_centavos integer;
begin
    if tg_op = 'UPDATE' then
        status_anterior := old.status;
        new.suiri_execucao_pontos := old.suiri_execucao_pontos;
        new.suiri_pontos_inicio := old.suiri_pontos_inicio;
        new.suiri_pontos_fim := old.suiri_pontos_fim;
        new.suiri_tempo_previsto_min := old.suiri_tempo_previsto_min;
        new.suiri_prazo_execucao := old.suiri_prazo_execucao;
    else
        new.suiri_execucao_pontos := null;
        new.suiri_pontos_inicio := null;
        new.suiri_pontos_fim := null;
        new.suiri_tempo_previsto_min := null;
        new.suiri_prazo_execucao := null;
    end if;

    if new.status = 'pendente' then
        if status_anterior in ('concluida', 'aguardando_aprovacao')
            and coalesce(current_setting('suiri.interno', true), '') <> 'sim'
            and not suiri_private.permissao('tarefas') then
            raise exception 'A gestão precisa reabrir uma tarefa já finalizada.';
        end if;
        new.suiri_execucao_pontos := null;
        new.suiri_pontos_inicio := null;
        new.suiri_pontos_fim := null;
        new.suiri_tempo_previsto_min := null;
        new.suiri_prazo_execucao := null;
        return new;
    end if;

    if (status_anterior = 'concluida' and new.status is distinct from status_anterior)
        or (status_anterior = 'aguardando_aprovacao' and new.status not in (status_anterior, 'concluida')) then
        raise exception 'Reabra a tarefa pelo fluxo da gestão antes de iniciar outra execução.';
    end if;

    if new.status = 'em_andamento' and (status_anterior is null or status_anterior = 'pendente') then
        -- Scope to the same company and task. One sample per execution start.
        select case when count(*) >= 3 then round(avg(execucoes.duracao))::integer end into minutos
        from (
            select distinct on (inicio) inicio, duracao
            from (
                select h.inicio,
                    extract(epoch from h.fim - h.inicio) / 60 as duracao
                from (
                    select
                        (case when registro ? 'suiri_pontos_inicio' then registro->>'suiri_pontos_inicio'
                            else registro->>'hora_inicio' end)::timestamptz as inicio,
                        (case when registro ? 'suiri_pontos_fim' then registro->>'suiri_pontos_fim'
                            else registro->>'hora_fim' end)::timestamptz as fim
                    from public.suiri_historico_tarefas
                    where empresa_id = new.empresa_id and tarefa_id = new.id::text
                      and suiri_private.tamanho_apoio_tarefa(registro) = suiri_private.tamanho_apoio_tarefa(to_jsonb(new))
                ) h
            ) historico
            where duracao between 1 and 600
            order by inicio desc, duracao desc
            limit 10
        ) execucoes;

        new.suiri_execucao_pontos := gen_random_uuid();
        new.suiri_pontos_inicio := instante;
        new.suiri_tempo_previsto_min := minutos;
        if minutos is not null then
            new.suiri_prazo_execucao := instante + make_interval(mins => minutos);
            if (to_jsonb(new)->>'horario_limite_alerta') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then
                prazo_manual := (to_jsonb(new)->>'horario_limite_alerta')::time;
                new.suiri_prazo_execucao := least(new.suiri_prazo_execucao,
                    (((instante at time zone 'America/Sao_Paulo')::date + prazo_manual) at time zone 'America/Sao_Paulo'));
            end if;
        end if;
    end if;

    if tg_op = 'UPDATE' and status_anterior = 'aguardando_aprovacao' and new.status = 'concluida' then
        -- The manager's approval may happen later. Keep the finish supplied during submission.
        new.hora_fim := coalesce(old.hora_fim, new.hora_fim);
    end if;

    if new.suiri_execucao_pontos is null then return new; end if;

    if status_anterior = 'em_andamento' and new.status in ('aguardando_aprovacao', 'concluida') then
        if exists (
            select 1 from jsonb_array_elements(coalesce(to_jsonb(new.subitens), '[]'::jsonb)) s
            where s->>'concluido' is distinct from 'true'
        ) then
            raise exception 'Conclua o checklist antes de finalizar a tarefa.';
        end if;
        new.suiri_pontos_fim := instante;
    end if;

    if new.status <> 'concluida' or status_anterior not in ('em_andamento', 'aguardando_aprovacao')
        or new.suiri_pontos_fim is null or new.suiri_tempo_previsto_min is null then
        return new;
    end if;
    if old.autonoma is true and not suiri_private.permissao('tarefas') then
        raise exception 'Tarefa autônoma precisa de aprovação da gestão.';
    end if;

    total_centavos := greatest(0, new.suiri_tempo_previsto_min * 10 -
        50 * greatest(0, floor(extract(epoch from new.suiri_pontos_fim - new.suiri_prazo_execucao) / 600))::integer);
    if total_centavos = 0 then return new; end if;

    -- Split the same award among active profiles in this company. Never multiply it by headcount.
    with participantes as (
        select p.id, row_number() over (order by (p.id = new.assumido_por) desc, p.id) as posicao,
            count(*) over () as quantidade
        from public.perfis p
        where p.empresa_id = new.empresa_id and (
            p.id = new.assumido_por
            or coalesce(to_jsonb(new.ajudantes), '[]'::jsonb) ? p.id::text
        )
    ), reparticao as (
        select id, total_centavos / quantidade + (posicao <= total_centavos % quantidade)::integer as pontos
        from participantes
    )
    insert into suiri_private.pontos_execucao (empresa_id, perfil_id, execucao, fim, pontos_centavos)
    select new.empresa_id, id, new.suiri_execucao_pontos, new.suiri_pontos_fim, pontos::integer
    from reparticao where pontos > 0
    on conflict (execucao, perfil_id) do nothing;
    return new;
end $$;

-- Run after the existing same-company and role checks on the original update.
drop trigger if exists suiri_zz_pontuar_tarefa on public.tarefas;
create trigger suiri_zz_pontuar_tarefa
before insert or update on public.tarefas for each row execute function suiri_private.pontuar_tarefa();

create or replace function suiri_private.campeoes_mes()
returns jsonb language sql stable security definer set search_path = '' as $$
    with periodo as (
        select e.id as empresa_id,
            date_trunc('month', now() at time zone 'America/Sao_Paulo') as inicio
        from public.empresas e
        where auth.uid() is not null and e.id::text = suiri_private.empresa()
    ), pontos as (
        select pe.perfil_id, sum(pe.pontos_centavos) as total
        from suiri_private.pontos_execucao pe
        join periodo p on pe.empresa_id = p.empresa_id
        where pe.fim >= (p.inicio at time zone 'America/Sao_Paulo')
          and pe.fim < ((p.inicio + interval '1 month') at time zone 'America/Sao_Paulo')
        group by pe.perfil_id
    ), ranking as (
        select p.id, p.nome, coalesce(pt.total, 0) as total,
            case when pt.total > 0 then dense_rank() over (order by pt.total desc nulls last) end as posicao
        from public.perfis p
        join periodo d using (empresa_id)
        left join pontos pt on pt.perfil_id = p.id
    )
    select jsonb_build_object(
        'mes', (select to_char(inicio, 'YYYY-MM') from periodo),
        'participantes', coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'pontos', total / 100.0,
            'posicao', posicao, 'voce', id = auth.uid()) order by total desc, lower(nome), id), '[]'::jsonb)
    )
    from ranking
$$;

create or replace function public.suiri_campeoes_mes()
returns jsonb language sql stable security invoker set search_path = '' as $$
    select suiri_private.campeoes_mes()
$$;

revoke all on function suiri_private.tamanho_apoio_tarefa(jsonb), suiri_private.pontuar_tarefa(),
    suiri_private.campeoes_mes(), public.suiri_campeoes_mes() from public, anon, authenticated;
grant execute on function suiri_private.campeoes_mes(), public.suiri_campeoes_mes() to authenticated;

notify pgrst, 'reload schema';
commit;
