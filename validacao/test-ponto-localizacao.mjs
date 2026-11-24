import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {como, criarBanco} from './test-db.mjs';

const banco = await criarBanco();
try {
    const sql = await readFile(new URL('../banco/03_LOCALIZACAO_EMPRESA.sql', import.meta.url), 'utf8');
    await banco.exec(sql);
    await banco.exec(sql);

    const [admin, colaborador, adminOutraEmpresa] = Array.from({length: 3}, () => randomUUID());
    const empresa = '19131243000197';
    const outraEmpresa = '00000000000191';
    for (const [uid, cnpj] of [[admin, empresa], [colaborador, empresa], [adminOutraEmpresa, outraEmpresa]]) {
        await banco.query('insert into auth.users(id) values ($1)', [uid]);
        await como(banco, uid, 'select suiri_vincular_empresa($1, $2, $3)', [cnpj, 'Conta', JSON.stringify({nome_fantasia: 'Teste GPS'})]);
    }
    const {rows: [{id: empresaId}]} = await como(banco, admin, 'select id from empresas');
    const configurar = uid => como(banco, uid, 'update empresas set ponto_latitude = -27.5, ponto_longitude = -48.5, ponto_raio_m = 100 where id = $1 returning id', [empresaId]);
    assert.equal((await configurar(colaborador)).rows.length, 0);
    assert.equal((await configurar(adminOutraEmpresa)).rows.length, 0);
    assert.equal((await configurar(admin)).rows.length, 1);

    const prova = (latitude, precisao = 15) => JSON.stringify({latitude, longitude: -48.5, precisao});
    const entrada = (usuario, localizacao) => como(banco, usuario,
        `insert into livro_ponto(empresa_id, perfil_id, data_registro, status_turno, horario_entrada, ponto_geolocalizacao)
        values ($1, $2, current_date, 'presente', now(), $3) returning id, ponto_geolocalizacao`,
        [empresaId, colaborador, localizacao]);
    await assert.rejects(() => entrada(colaborador, null), /exige localização/);
    await assert.rejects(() => entrada(colaborador, prova(-27.49)), /fora da área/);
    await assert.rejects(() => entrada(colaborador, prova(-27.5, 101)), /imprecisa/);
    await assert.rejects(() => entrada(colaborador, prova(-27.5007, 30)), /imprecisa/);
    const {rows: [{id: registroId, ponto_geolocalizacao: entradaGravada}]} = await entrada(colaborador, prova(-27.5));
    assert.equal(entradaGravada, null);

    const saida = localizacao => como(banco, colaborador,
        "update livro_ponto set horario_saida = now(), ponto_geolocalizacao = $2 where id = $1 returning ponto_geolocalizacao",
        [registroId, localizacao]);
    await assert.rejects(() => saida(null), /exige localização/);
    await assert.rejects(() => saida(prova(-27.49)), /fora da área/);
    assert.equal((await saida(prova(-27.5))).rows[0].ponto_geolocalizacao, null);

    await como(banco, admin, "update livro_ponto set horario_saida = now() where id = $1", [registroId]);
    await como(banco, colaborador, "insert into livro_ponto(empresa_id, perfil_id, data_registro, status_turno) values ($1, $2, current_date + 1, 'folga')", [empresaId, colaborador]);
    await como(banco, admin, 'update empresas set ponto_latitude = null, ponto_longitude = null, ponto_raio_m = null where id = $1', [empresaId]);
    assert.equal((await entrada(colaborador, null)).rows.length, 1);
    console.log('Ponto por GPS: admin, isolamento de empresas, precisão, entrada/saída, limpeza, folga e ajuste manual passaram.');
} finally {
    await banco.close();
}
