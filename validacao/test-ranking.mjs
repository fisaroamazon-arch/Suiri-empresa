import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {como, criarBanco} from './test-db.mjs';

const db = await criarBanco();
const migracao = readFileSync(new URL('../banco/06_PONTUACAO_TAREFAS.sql', import.meta.url), 'utf8');
await db.exec(migracao);
await db.exec(migracao);

const [admin, responsavel, ajudante, concorrente] = Array.from({length:4}, () => crypto.randomUUID());
for (const [i, id] of [admin, responsavel, ajudante, concorrente].entries()) {
    await db.query('insert into auth.users(id, email) values ($1, $2)', [id, `ranking-${i}@example.com`]);
    await como(db, id, 'select public.suiri_vincular_empresa($1, $2, $3)', [
        id === concorrente ? '00000000000191' : '19131243000197',
        `Pessoa ${i}`,
        JSON.stringify({nome_fantasia:'Empresa de teste'})
    ]);
}

const empresa = (await db.query('select empresa_id from perfis where id=$1', [admin])).rows[0].empresa_id;
async function criarTarefa(autonoma) {
    const {rows:[tarefa]} = await como(db, admin, `
        insert into tarefas(empresa_id, titulo, criado_por, status, autonoma)
        values($1, 'Tarefa de validação', $2, 'pendente', $3) returning id
    `, [empresa, admin, autonoma]);

    for (let i = 0; i < 3; i++) {
        const fim = new Date(Date.now() - (i + 1) * 86400000);
        const inicio = new Date(fim.getTime() - 65 * 60000);
        const registro = {status:'concluida', hora_inicio:inicio.toISOString(), hora_fim:fim.toISOString(),
            ajudantes:[], assumido_por:responsavel};
        await db.query(`
            insert into suiri_historico_tarefas(empresa_id, tarefa_id, concluida_em, registro)
            values($1, $2, $3, $4)
        `, [empresa, tarefa.id, fim.toISOString(), JSON.stringify(registro)]);
    }
    await como(db, responsavel, `
        update tarefas set status='em_andamento', assumido_por=$1, hora_inicio=now() where id=$2
    `, [responsavel, tarefa.id]);
    const {rows:[inicio]} = await db.query('select suiri_tempo_previsto_min from tarefas where id=$1', [tarefa.id]);
    assert.equal(inicio.suiri_tempo_previsto_min, 65);
    return tarefa.id;
}

async function ranking(id) {
    const {rows:[resultado]} = await como(db, id, 'select suiri_campeoes_mes() as ranking');
    return resultado.ranking.participantes;
}

const coletiva = await criarTarefa(false);
await como(db, ajudante, 'update tarefas set ajudantes=array[$1]::uuid[] where id=$2', [ajudante, coletiva]);
const concluir = (id, tarefa) => como(db, id, "update tarefas set status='concluida', hora_fim=now() where id=$1", [tarefa]);
await concluir(responsavel, coletiva);
await concluir(responsavel, coletiva);
assert.deepEqual((await ranking(responsavel)).map(p => p.pontos), [3.25, 3.25, 0]);
assert.equal((await ranking(responsavel)).find(p => p.voce).posicao, 1);
assert.deepEqual((await ranking(concorrente)).map(p => p.pontos), [0]);
await assert.rejects(() => como(db, responsavel, 'select * from suiri_private.pontos_execucao'));
await assert.rejects(() => como(db, responsavel, "update tarefas set status='em_andamento' where id=$1", [coletiva]));
await assert.rejects(() => como(db, responsavel, "update tarefas set status='pendente' where id=$1", [coletiva]));

const autonoma = await criarTarefa(true);
await como(db, admin, "select set_config('request.jwt.claim.sub',$1,false)", [admin]);
await db.exec('alter table tarefas disable trigger suiri_zz_pontuar_tarefa');
await db.query("update tarefas set suiri_prazo_execucao=now() - interval '21 min' where id=$1", [autonoma]);
await db.exec('alter table tarefas enable trigger suiri_zz_pontuar_tarefa');
await como(db, responsavel, "update tarefas set status='aguardando_aprovacao', hora_fim=now() where id=$1", [autonoma]);
const original = (await db.query('select hora_fim from tarefas where id=$1', [autonoma])).rows[0].hora_fim;
assert.deepEqual((await ranking(responsavel)).map(p => p.pontos), [3.25, 3.25, 0]);
await assert.rejects(() => concluir(responsavel, autonoma));
await concluir(admin, autonoma);
assert.deepEqual((await ranking(responsavel)).map(p => p.pontos), [8.75, 3.25, 0]);
assert.deepEqual((await db.query('select hora_fim from tarefas where id=$1', [autonoma])).rows[0].hora_fim, original);
await db.close();
console.log('Ranking: previsão congelada, rateio, conclusão repetida, atraso, aprovação, isolamento e permissões passaram.');
