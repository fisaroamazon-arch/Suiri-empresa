begin;

create extension if not exists pg_cron;

-- O job pertence ao papel que aplica a migração. A RPC interativa continua
-- filtrada pela empresa da sessão, enquanto o job pode processar todas.
create or replace function suiri_private.reiniciar_rotinas_agendadas()
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
    local_agora timestamp := now() at time zone 'America/Sao_Paulo';
    anterior text := current_setting('suiri.interno', true);
    alteradas integer;
begin
    perform set_config('suiri.interno', 'sim', true);

    update public.tarefas t
    set status = 'pendente', assumido_por = null, ajudantes = '{}',
        hora_inicio = null, hora_fim = null, ultimo_reinicio = local_agora::date,
        subitens = coalesce((
            select jsonb_agg(item || jsonb_build_object('concluido', false, 'feito_por', null) order by posicao)
            from jsonb_array_elements(coalesce(t.subitens, '[]'::jsonb)) with ordinality as s(item, posicao)
        ), '[]'::jsonb)
    where t.empresa_id is not null
      and t.recorrente
      and t.status = 'concluida'
      and (t.hora_fim at time zone 'America/Sao_Paulo')::date < local_agora::date
      and t.ultimo_reinicio is distinct from local_agora::date
      and to_char(local_agora, 'HH24:MI') >= coalesce(t.horario_reinicio::text, '01:00');

    get diagnostics alteradas = row_count;
    perform set_config('suiri.interno', coalesce(anterior, 'nao'), true);
    return alteradas;
end $$;

revoke all on function suiri_private.reiniciar_rotinas_agendadas() from public, anon, authenticated;
select cron.schedule('suiri-reiniciar-rotinas', '* * * * *', 'select suiri_private.reiniciar_rotinas_agendadas()');

commit;
