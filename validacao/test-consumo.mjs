import assert from 'node:assert/strict';
import fs from 'node:fs';
import {criarBanco,como} from './test-db.mjs';

const migracao = fs.readFileSync('banco/02_CONSUMO_APROVACOES.sql','utf8');
for (const tipo of ['uuid','bigint']) {
    const db = await criarBanco(tipo);
    await db.exec(migracao);
    await db.exec(migracao);
    const ids = Array.from({length:6}, () => crypto.randomUUID());
    const [admin,staff,colega,gerente,socio,externo] = ids;
    for (const id of ids) {
        await db.query('insert into auth.users(id) values($1)', [id]);
        await como(db,id,'select suiri_vincular_empresa($1,$2,$3)',[
            id === externo ? '00000000000191' : '19131243000197',id.slice(0,8),'{"nome_fantasia":"Empresa"}'
        ]);
    }
    await como(db,admin,'update perfis set is_gerente=true where id=$1',[gerente]);
    await como(db,admin,'update perfis set is_socio=true where id=$1',[socio]);
    const data = "(now() at time zone 'America/Sao_Paulo')::date";
    const executar = async (id,sql,args) => (await como(db,id,`select ${sql} as resultado`,args)).rows[0].resultado;
    const enviar = (operacao,nome,valor,qtd) => executar(staff,`suiri_lancar_consumo($1,$2,$3,${data},$4)`,[nome,valor,qtd,operacao]);
    const listar = (usuario,gestao) => executar(usuario,'suiri_listar_consumos($1)',[gestao]);
    const revisar = (usuario,operacao,aprovar,valor,qtd) => executar(usuario,'suiri_revisar_consumo($1,$2,$3,$4)',[operacao,aprovar,valor,qtd]);

    const op = crypto.randomUUID();
    assert.equal(await enviar(op,'  Coca-Cola  Lata 350 ml ',6.49,2),'pendente');
    assert.equal(await enviar(op,'Coca-Cola Lata 350 ml',6.49,2),'pendente');
    await assert.rejects(enviar(op,'Coca-Cola Lata 350 ml',6.49,3));
    assert.equal((await listar(staff,false)).itens[0].valor_informado,6.49);
    assert.equal((await listar(colega,false)).pendentes,0);
    assert.equal((await listar(externo,true)).pendentes,0);
    await assert.rejects(listar(staff,true));
    await assert.rejects(revisar(externo,op,true,7.50,3));
    await assert.rejects(revisar(staff,op,true,7.50,3));
    await assert.rejects(como(db,staff,'select * from suiri_consumo_revisao'));
    await assert.rejects(como(db,staff,`insert into itens_comprados(empresa_id,perfil_id,registrado_por,descricao_item,valor_unitario,porcentagem_desconto,valor_final,data_compra)
        select empresa_id,id,id,'Item sem revisão',7.50,30,5.25,${data} from perfis where id=$1`,[staff]));
    assert.equal((await db.query('select * from itens_comprados')).rows.length,0);
    assert.equal((await db.query('select * from cardapio_consumo')).rows.length,0);
    assert.equal((await listar(socio,true)).pendentes,1);
    assert.equal((await listar(gerente,true)).pendentes,1);
    await assert.rejects(revisar(gerente,op,true,0,3));
    assert.equal(await revisar(gerente,op,true,7.50,3),'aprovado');
    assert.equal(await revisar(socio,op,false,null,null),'aprovado');
    assert.equal(await enviar(op,'Coca-Cola Lata 350 ml',6.49,2),'aprovado');
    const conta=(await db.query('select * from itens_comprados')).rows[0];
    assert.equal(conta.perfil_id,staff);
    assert.equal(conta.registrado_por,gerente);
    assert.equal(conta.descricao_item,'3x Coca-Cola Lata 350 ml');
    assert.equal(Number(conta.valor_final),15.75);
    assert.equal(Number((await db.query('select valor_padrao from cardapio_consumo')).rows[0].valor_padrao),7.5);

    const jaCatalogado=crypto.randomUUID();
    assert.equal(await enviar(jaCatalogado,'coca-cola  lata 350 ml',7.5,2),'lancado');
    assert.equal(await enviar(jaCatalogado,'Coca-Cola Lata 350 ml',7.5,2),'lancado');
    const proposta=crypto.randomUUID();
    assert.equal(await executar(staff,`suiri_lancar_consumo($1,$2,$3,${data}-2,$4)`,
        ['Coca-Cola Lata 350 ml',9.50,1,proposta]),'pendente');
    assert.equal(await revisar(socio,proposta,true,9.50,1),'aprovado');
    const datas=(await db.query(`select (c.data_compra=${data}) as financeiro,
        (p.data_compra=${data}-2) as compra from itens_comprados c
        join suiri_consumo_revisao p on c.suiri_operacao_id=p.id where p.id=$1`,[proposta])).rows[0];
    assert.deepEqual(datas,{financeiro:true,compra:true});
    assert.deepEqual((await db.query('select valor_padrao from cardapio_consumo')).rows.map(x=>Number(x.valor_padrao)),[7.5]);
    const recusado=crypto.randomUUID();
    assert.equal(await enviar(recusado,'Coca-Cola Garrafa 600 ml',10,1),'pendente');
    assert.equal(await revisar(socio,recusado,false,null,null),'recusado');
    assert.equal((await db.query('select * from itens_comprados')).rows.length,3);
    assert.equal((await listar(staff,false)).pendentes,0);
    await como(db,admin,'select suiri_excluir_membro($1)',[staff]);
    assert.equal((await db.query('select * from suiri_consumo_revisao')).rows.length,0);
    assert.equal((await db.query('select * from cardapio_consumo')).rows.length,1);
    await db.close();
    console.log(`Consumo (${tipo}): descontos, revisão, permissões, isolamento, histórico, reenvio e exclusão: PASS`);
}
