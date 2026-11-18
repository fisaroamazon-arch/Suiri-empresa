-- Somente leitura: mostra qual envio precisa ser repetido.
select e.parte as envio,case when p.conteudo is null then 'FALTA ENVIAR'
 when md5((select string_agg(btrim(linha,' '||chr(9)),chr(10) order by ordem) from regexp_split_to_table(replace(replace(p.conteudo,chr(13)||chr(10),chr(10)),chr(13),chr(10)),chr(10)) with ordinality as linhas(linha,ordem)))=e.esperado then 'OK'
 else 'REENVIAR ESTE BLOCO' end as situacao
from(values(1,'66f3740ad582c2861d872d783b621a89'),(2,'53155fdcd2aaa7f95fb314bf9cacd3a6'),(3,'31855b6953a764110bcba438d374a5c6'),(4,'41a4c00164d72e4523dd2794f3885b4d'),(5,'94959419f184d009dcf1480592c1b6af'),(6,'65cdfaf3bbfe9065248e943cc63246c4'))e(parte,esperado)
left join suiri_celular_v4_20261117.partes p on p.parte=e.parte and p.roteiro='2379b85516f2958bf01bfb87382afcae'
order by e.parte;
