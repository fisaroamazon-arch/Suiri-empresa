-- Apply after the Suiri V4 schema. Purchase keys remain readable by earlier apps.
begin;

do $$
declare tipo_empresa text;
begin
  select format_type(atttypid, atttypmod) into tipo_empresa
  from pg_attribute
  where attrelid = 'public.empresas'::regclass and attname = 'id';

  if tipo_empresa not in ('uuid', 'bigint', 'integer') then
    raise exception 'Tipo de empresas.id não suportado: %', tipo_empresa;
  end if;

  execute format($ddl$
    create table if not exists public.suiri_categorias (
      empresa_id %s not null references public.empresas(id) on delete cascade,
      tipo text not null check (tipo in ('produto', 'fornecedor')),
      chave text not null check (char_length(chave) between 1 and 180),
      nome text not null check (nome = btrim(nome) and char_length(nome) between 1 and 80),
      primary key (empresa_id, tipo, chave)
    )
  $ddl$, tipo_empresa);
end
$$;

create unique index if not exists suiri_categorias_nome_empresa
  on public.suiri_categorias (empresa_id, tipo, lower(nome));

insert into public.suiri_categorias (empresa_id, tipo, chave, nome)
select distinct on (empresa_id, lower(btrim(categoria)))
  empresa_id, 'produto', categoria, btrim(categoria)
from public.pedidos_compra
where empresa_id is not null and char_length(btrim(categoria)) between 1 and 80
  and char_length(categoria) <= 180 and categoria <> 'todos'
order by empresa_id, lower(btrim(categoria)), categoria
on conflict do nothing;

alter table public.suiri_categorias enable row level security;
revoke all on public.suiri_categorias from anon, authenticated;
grant select, insert on public.suiri_categorias to authenticated;
grant update (nome) on public.suiri_categorias to authenticated;

drop policy if exists suiri_categorias_ler on public.suiri_categorias;
create policy suiri_categorias_ler on public.suiri_categorias for select to authenticated
  using (empresa_id::text = (select suiri_private.empresa())
    and (tipo = 'produto' or (select suiri_private.comercial())));

drop policy if exists suiri_categorias_criar on public.suiri_categorias;
create policy suiri_categorias_criar on public.suiri_categorias for insert to authenticated
  with check (empresa_id::text = (select suiri_private.empresa())
    and (tipo = 'produto' or (select suiri_private.comercial())));

drop policy if exists suiri_categorias_renomear on public.suiri_categorias;
create policy suiri_categorias_renomear on public.suiri_categorias for update to authenticated
  using (empresa_id::text = (select suiri_private.empresa())
    and (tipo = 'produto' or (select suiri_private.comercial())))
  with check (empresa_id::text = (select suiri_private.empresa())
    and (tipo = 'produto' or (select suiri_private.comercial())));

alter table public.suiri_contatos
  add column if not exists categoria_fornecedor text,
  add column if not exists categoria_fornecedor_tipo text
    generated always as (case when categoria_fornecedor is not null then 'fornecedor'::text end) stored;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.suiri_contatos'::regclass and conname = 'suiri_contatos_categoria_fornecedor_fk'
  ) then
    alter table public.suiri_contatos
      add constraint suiri_contatos_categoria_tipo_ck check (categoria_fornecedor is null or tipo = 'fornecedor'),
      add constraint suiri_contatos_categoria_fornecedor_fk
        foreign key (empresa_id, categoria_fornecedor_tipo, categoria_fornecedor)
        references public.suiri_categorias (empresa_id, tipo, chave);
  end if;
end
$$;

create index if not exists suiri_contatos_categoria_empresa
  on public.suiri_contatos (empresa_id, categoria_fornecedor_tipo, categoria_fornecedor)
  where categoria_fornecedor is not null;

commit;
