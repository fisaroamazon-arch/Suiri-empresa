-- SUIRI V4: use este bloco no lugar da etapa 7 que falhou.
-- Aproveita os 6 envios existentes. Confere o arquivo antes de aplicar.
rollback;
begin;
do $SUIRI_RECUPERAR$
declare codigo text;quantidade integer;partes integer[];
begin
 select count(*),array_agg(parte order by parte),string_agg(conteudo,'' order by parte)
 into quantidade,partes,codigo from suiri_celular_v4_20261117.partes
 where roteiro='2379b85516f2958bf01bfb87382afcae';
 if quantidade<>6 or partes is distinct from array[1,2,3,4,5,6] then
  raise exception 'Faltam envios. Encontrados: %. Envie os blocos ausentes antes de aplicar.',partes;
 end if;
 if md5(codigo)<>'2379b85516f2958bf01bfb87382afcae' then
  codigo:=(select string_agg(btrim(linha,' '||chr(9)),chr(10) order by ordem) from regexp_split_to_table(replace(replace(codigo,chr(13)||chr(10),chr(10)),chr(13),chr(10)),chr(10)) with ordinality as linhas(linha,ordem));
  if md5(codigo)<>'74302fdea4491e544bef74d20bd18866' then
   raise exception 'O conteudo continua diferente apos conferir a formatacao. Nao foi aplicado. Execute 08_DIAGNOSTICAR_ENVIOS.sql para localizar o envio diferente.';
  end if;
 end if;
 execute codigo;
 if public.suiri_versao()<>4 then raise exception 'A versao final nao foi confirmada.';end if;
end;
$SUIRI_RECUPERAR$;
drop schema suiri_celular_v4_20261117 cascade;
commit;
select 'SUIRI V4 INSTALADA' as resultado;
