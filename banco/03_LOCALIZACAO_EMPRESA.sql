-- Requer banco/01_ATUALIZACAO.sql. As regras de public.empresas do V4
-- já permitem leitura da própria empresa e alterações apenas a administradores.
begin;

alter table public.empresas
    add column if not exists ponto_latitude double precision,
    add column if not exists ponto_longitude double precision,
    add column if not exists ponto_raio_m integer;

alter table public.empresas drop constraint if exists empresas_localizacao_ponto_valida;
alter table public.empresas add constraint empresas_localizacao_ponto_valida check (
    (
        ponto_latitude is null and ponto_longitude is null and ponto_raio_m is null
    ) or (
        ponto_latitude is not null and ponto_latitude between -90 and 90
        and ponto_longitude is not null and ponto_longitude between -180 and 180
        and ponto_raio_m is not null and ponto_raio_m > 0
    )
);

-- Campo de passagem: a localização é validada e retirada antes de gravar.
-- Ao bater ponto offline a leitura fica na fila do aparelho até ser sincronizada.
alter table public.livro_ponto add column if not exists ponto_geolocalizacao jsonb;

create or replace function suiri_private.geolocalizar_ponto()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
    localizacao jsonb := new.ponto_geolocalizacao;
    area_latitude double precision;
    area_longitude double precision;
    raio integer;
    latitude double precision;
    longitude double precision;
    precisao double precision;
    haversine double precision;
    distancia double precision;
begin
    new.ponto_geolocalizacao := null;

    -- Preserva correções administrativas e operações internas do sistema.
    if auth.uid() is null or suiri_private.permissao('ponto') then
        return new;
    end if;

    -- Uma folga automática sem horário não é uma marcação de ponto.
    if tg_op = 'INSERT' then
        if new.horario_entrada is null and new.horario_saida is null then
            return new;
        end if;
    elsif new.horario_entrada is not distinct from old.horario_entrada
        and new.horario_saida is not distinct from old.horario_saida then
        return new;
    end if;

    select e.ponto_latitude, e.ponto_longitude, e.ponto_raio_m
      into area_latitude, area_longitude, raio
      from public.empresas e
     where e.id = new.empresa_id;

    if raio is null then
        return new;
    end if;

    if jsonb_typeof(localizacao -> 'latitude') is distinct from 'number'
        or jsonb_typeof(localizacao -> 'longitude') is distinct from 'number'
        or jsonb_typeof(localizacao -> 'precisao') is distinct from 'number' then
        raise exception 'Esta empresa exige localização precisa para bater ponto. Atualize o app e permita a localização.' using errcode = 'P0001';
    end if;

    latitude := (localizacao ->> 'latitude')::double precision;
    longitude := (localizacao ->> 'longitude')::double precision;
    precisao := (localizacao ->> 'precisao')::double precision;
    if latitude not between -90 and 90 or longitude not between -180 and 180
        or precisao not between 0 and raio then
        raise exception 'Localização imprecisa ou inválida para esta área.' using errcode = 'P0001';
    end if;

    haversine := sin(radians(latitude - area_latitude) / 2)^2
        + cos(radians(area_latitude)) * cos(radians(latitude))
          * sin(radians(longitude - area_longitude) / 2)^2;
    distancia := 12742000 * asin(sqrt(greatest(0, least(1, haversine))));
    if distancia > raio then
        raise exception 'Você está fora da área definida pela empresa.' using errcode = 'P0001';
    end if;
    if distancia + precisao > raio then
        raise exception 'A localização está imprecisa para esta área.' using errcode = 'P0001';
    end if;
    return new;
end;
$$;

revoke execute on function suiri_private.geolocalizar_ponto() from public, anon, authenticated;
-- A ordem alfabética executa esta verificação antes de suiri_proteger_registro.
drop trigger if exists suiri_geolocalizar_ponto on public.livro_ponto;
create trigger suiri_geolocalizar_ponto
    before insert or update on public.livro_ponto
    for each row execute function suiri_private.geolocalizar_ponto();

commit;
