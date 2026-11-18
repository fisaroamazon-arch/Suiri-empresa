import {PGlite}from'@electric-sql/pglite';import fs from'node:fs';import assert from'node:assert/strict';import {JSDOM}from'jsdom';
const m=JSON.parse(fs.readFileSync('validacao/mobile-manifest.json','utf8')),path='';
const reparo=fs.readFileSync(path+'banco/RECUPERAR_ETAPA_7.sql','utf8');const diag=fs.readFileSync(path+'banco/celular/08_DIAGNOSTICAR_ENVIOS.sql','utf8');
for(const alteracao of ['original','crlf','indentacao','crlf+indentacao','adulterado']){
 const db=new PGlite();await db.exec(fs.readFileSync('validacao/schema-fixture.sql','utf8'));for(const e of m.passos.slice(0,-1))await db.exec(e.sql);
 if(alteracao==='crlf')await db.query('update '+m.schema+'.partes set conteudo=replace(conteudo,chr(10),chr(13)||chr(10))');
 if(alteracao==='indentacao'||alteracao==='crlf+indentacao')await db.query("update "+m.schema+".partes set conteudo=replace(conteudo,chr(10),'  '||chr(10)||'        ')");
 if(alteracao==='crlf+indentacao')await db.query('update '+m.schema+'.partes set conteudo=replace(conteudo,chr(10),chr(13)||chr(10))');
 if(alteracao==='adulterado'){
  await db.query('update '+m.schema+'.partes set conteudo=conteudo||$1 where parte=2',['wrong']);
  await assert.rejects(()=>db.exec(reparo),/continua diferente/);await db.exec('rollback');assert.equal((await db.query("select to_regclass('public.suiri_vendas')r")).rows[0].r,null);
  const rows=(await db.query(diag)).rows;assert.equal(rows.filter(r=>r.situacao==='REENVIAR ESTE BLOCO').length,1);assert.equal(rows.find(r=>r.situacao==='REENVIAR ESTE BLOCO').envio,2);console.log('non-format content changes blocked; only bad part identified PASS');
 }else{
  if(alteracao==='crlf'){await db.exec('begin');await assert.rejects(()=>db.exec('select 1/0'));}
  if(alteracao==='crlf')await db.exec('rollback');
  const d=(await db.query(diag)).rows;assert.ok(d.every(r=>r.situacao==='OK'),JSON.stringify(d));if(alteracao==='crlf'){await db.exec('begin');await assert.rejects(()=>db.exec('select 1/0'));}await db.exec(reparo);assert.equal((await db.query('select suiri_versao()v')).rows[0].v,4);
  const ids=[crypto.randomUUID(),crypto.randomUUID()];for(const id of ids)await db.query('insert into auth.users(id,raw_user_meta_data)values($1,$2)',[id,JSON.stringify({nome:'Teste recuperacao',suiri_cnpj:'19131243000197',suiri_empresa:{nome_fantasia:'Teste'}})]);const ps=(await db.query('select id,is_admin from perfis')).rows;assert.equal(ps.find(p=>p.id===ids[0]).is_admin,true);assert.equal(ps.find(p=>p.id===ids[1]).is_admin,false);
  console.log('recovery from '+alteracao+' / Auth roles PASS');
 }
 await db.close();
}
const dom=new JSDOM(fs.readFileSync(path+'INSTALAR_SQL_NO_CELULAR.html','utf8'),{runScripts:'dangerously',url:'https://suiri.test',beforeParse(w){w.scrollTo=()=>{};}});dom.window.document.getElementById('recuperar').click();assert.equal(dom.window.document.getElementById('codigo').value,reparo);assert.equal(dom.window.document.getElementById('titulo').textContent,'Aplicar atualização (colagem corrigida)');assert.equal(dom.window.document.querySelectorAll('#recuperar').length,1);console.log('guide resumes directly at corrected step 7 PASS');dom.window.close();
