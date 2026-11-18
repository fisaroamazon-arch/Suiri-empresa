import{criarBanco,como}from'./test-db.mjs';import assert from'node:assert/strict';import fs from'node:fs';
const db=await criarBanco();const [adm,staff,other]=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];for(const id of[adm,staff,other])await db.query('insert into auth.users(id)values($1)',[id]);
for(const[id,cnpj]of[[adm,'19131243000197'],[staff,'19131243000197'],[other,'00000000000191']])await como(db,id,'select suiri_vincular_empresa($1,$2,$3)',[cnpj,'Teste',JSON.stringify({nome_fantasia:'Teste'})]);
const empresa=(await db.query('select empresa_id from perfis where id=$1',[adm])).rows[0].empresa_id;
const ponto=crypto.randomUUID();await como(db,staff,"insert into livro_ponto(id,empresa_id,perfil_id,data_registro,status_turno,horario_entrada)values($1,$2,$3,current_date,'presente',now())",[ponto,empresa,staff]);
await assert.rejects(()=>como(db,staff,"update livro_ponto set status_turno='diaria_aprovada'where id=$1",[ponto]));
await como(db,adm,"update perfis set tipo_contrato='freelance'where id=$1",[staff]);await como(db,staff,"update livro_ponto set status_turno='aguardando_aprovacao_diaria',horario_saida=now()where id=$1",[ponto]);assert.equal((await db.query('select * from avisos where ponto_freelance_id=$1',[ponto])).rows.length,1);console.log('attendance approval denied to staff, automatic freelance alert: PASS');
const t=crypto.randomUUID();await como(db,adm,"insert into tarefas(id,empresa_id,titulo,criado_por,status,recorrente)values($1,$2,'Rotina',$3,'pendente',true)",[t,empresa,adm]);
await como(db,staff,"update tarefas set status='em_andamento',assumido_por=$1,hora_inicio=now()where id=$2",[staff,t]);
await assert.rejects(()=>como(db,staff,"update tarefas set titulo='Título adulterado'where id=$1",[t]));
await assert.rejects(()=>como(db,staff,"update tarefas set assumido_por=$1 where id=$2",[adm,t]));
await como(db,staff,"update tarefas set status='concluida',hora_fim=now(),ultimo_reinicio=current_date where id=$1",[t]);assert.equal((await db.query('select * from suiri_historico_tarefas')).rows.length,1);
await como(db,adm,"update tarefas set status='pendente',hora_fim=null where id=$1",[t]);assert.equal((await db.query('select * from suiri_historico_tarefas')).rows.length,1);console.log('task ownership / definition guard / immutable execution history: PASS');
const aviso=crypto.randomUUID();await como(db,adm,"insert into avisos(id,empresa_id,titulo,criado_por,destinado_a)values($1,$2,'Direta',$3,$3)",[aviso,empresa,adm]);assert.equal((await como(db,staff,'select * from avisos where id=$1',[aviso])).rows.length,0);await assert.rejects(()=>como(db,staff,'select suiri_ler_aviso($1)',[aviso]));console.log('private messages cannot be read or acknowledged by another member: PASS');
// Preserve documents authored by a member when deleting its Auth login.
await como(db,adm,'update perfis set is_admin=true where id=$1',[staff]);
await como(db,staff,"insert into contas_pagar(empresa_id,fornecedor_descricao,criado_por,valor,data_vencimento)values($1,'Preservar',$2,90,current_date)",[empresa,staff]);
const vendaCont=crypto.randomUUID();await como(db,staff,"insert into suiri_contatos(id,empresa_id,tipo,nome)values($1,$2,'cliente','Preservar')",[vendaCont,empresa]);
const vid=(await como(db,staff,"select suiri_registrar_venda($1,$2,current_date,current_date,'',$3)id",[vendaCont,JSON.stringify([{descricao:'Item',quantidade:1,valor_centavos:1000}]),crypto.randomUUID()])).rows[0].id;
await como(db,staff,"select suiri_receber_venda($1,500,current_date,'Pix','',$2)",[vid,crypto.randomUUID()]);
await como(db,adm,'select suiri_excluir_membro($1)',[staff]);assert.equal((await db.query('select * from contas_pagar')).rows.length,1);assert.equal((await db.query('select * from suiri_vendas')).rows.length,1);assert.equal((await db.query('select * from suiri_recebimentos')).rows.length,1);console.log('member deletion preserves company payables, sales and receipts: PASS');
await assert.rejects(()=>como(db,adm,'select suiri_arquivos_exclusao($1,false)',[adm]));console.log('last admin fails preflight before deleting avatar: PASS');
await db.close();
// Migration aborts rather than guessing orphan ownership when there are multiple companies.
const {PGlite}=await import('@electric-sql/pglite');const legacy=new PGlite();await legacy.exec(fs.readFileSync('validacao/schema-fixture.sql','utf8'));await legacy.query("insert into empresas(cnpj,nome_fantasia)values('19131243000197','A'),('00000000000191','B')");await legacy.query("insert into cardapio_consumo(nome_item,valor_padrao)values('Órfão',10)");await assert.rejects(()=>legacy.exec(fs.readFileSync('banco/01_ATUALIZACAO.sql','utf8')));await legacy.exec('rollback');assert.equal((await legacy.query('select * from cardapio_consumo')).rows.length,1);console.log('ambiguous legacy data aborts migration without data loss: PASS');await legacy.close();
