import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const codigo = fs.readFileSync('app-empresa.js', 'utf8');
const inicio = codigo.indexOf('const suiriChaveFila =');
const fim = codigo.indexOf('window.enviarSaidaPonto =', inicio);
assert.ok(inicio !== -1 && fim !== -1);

const armazenamento = new Map();
let leiturasServidor = 0;
let atualizacoes = 0;
const contexto = {
    usuarioAtual: {id:'ana'},
    empresaAtualId: 'a',
    navigator: {onLine:true},
    cliente: {from:() => { leiturasServidor++; throw new Error('Consulta em sessão diferente'); }},
    localStorage: {
        getItem: chave => armazenamento.get(chave) ?? null,
        setItem: (chave, valor) => armazenamento.set(chave, valor)
    },
    CHAVE_STORAGE_OFFLINE:'fila',
    suiriUID: () => crypto.randomUUID(),
    window: {atualizarIndicadorOffline:() => { atualizacoes++; }}
};
vm.runInNewContext(codigo.slice(inicio, fim), contexto);
const {window} = contexto;

let concluir;
const pendencia = window.executarOuOffline('vale_insert', {valor:12}, () =>
    new Promise(resolve => { concluir = resolve; })
);
contexto.usuarioAtual = {id:'beatriz'};
contexto.empresaAtualId = 'b';
concluir({error:{message:'Failed to fetch'}});
assert.equal((await pendencia).offline, true);
assert.equal(window.obterFilaOffline().length, 0);
assert.equal(atualizacoes, 0);

contexto.usuarioAtual = {id:'ana'};
contexto.empresaAtualId = 'a';
const filaDaAna = window.obterFilaOffline();
assert.equal(filaDaAna.length, 1);
assert.equal(filaDaAna[0].user, 'ana');
assert.equal(filaDaAna[0].empresa, 'a');
assert.equal(filaDaAna[0].payload.valor, 12);

const duplicata = window.executarOuOffline('vale_insert', {valor:14}, () =>
    new Promise(resolve => { concluir = resolve; })
);
contexto.usuarioAtual = {id:'beatriz'};
contexto.empresaAtualId = 'b';
concluir({error:{code:'23505'}});
assert.equal((await duplicata).error.code, '23505');
assert.equal(leiturasServidor, 0);
assert.equal(window.obterFilaOffline().length, 0);

contexto.navigator.onLine = false;
assert.equal((await window.executarOuOffline('vale_insert', {valor:25}, () => {})).offline, true);
assert.equal(window.obterFilaOffline()[0].payload.valor, 25);
assert.equal(atualizacoes, 1);
console.log('Fila offline: sessão original, troca de usuário, duplicata e sessão ativa passaram.');
