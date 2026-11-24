begin;

-- O diretório da equipe já mostra o avatar do perfil da mesma empresa.
-- A autorização de leitura vale só para o arquivo atualmente associado ao perfil.
create or replace function suiri_private.pode_ler_avatar_equipe(p_nome text)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select auth.uid() is not null and exists (
        select 1 from public.perfis p
        where p.id::text = split_part(p_nome, '_', 2)
          and p.empresa_id::text = suiri_private.empresa()
          and p_nome ~ '^avatar_[0-9a-f-]{36}_[0-9]+[.](webp|png)$'
          and (
              p.avatar_url = 'sistema-imagens:' || p_nome
              or right(p.avatar_url, length('/sistema-imagens/' || p_nome)) = '/sistema-imagens/' || p_nome
          )
    )
$$;

revoke all on function suiri_private.pode_ler_avatar_equipe(text) from public, anon;
grant execute on function suiri_private.pode_ler_avatar_equipe(text) to authenticated;

drop policy if exists suiri_ler_avatar_equipe on storage.objects;
create policy suiri_ler_avatar_equipe on storage.objects
for select to authenticated
using (bucket_id = 'sistema-imagens' and suiri_private.pode_ler_avatar_equipe(name));

commit;
