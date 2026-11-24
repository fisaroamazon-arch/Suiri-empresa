import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const dom = new JSDOM('<main id="tela-app"><button id="suiri-trocar-usuario"><span id="suiri-foto-usuario"></span></button></main>', {
    url: 'https://suiri.test/',
    runScripts: 'outside-only'
});
const win = dom.window;
const el = id => win.document.getElementById(id);
const dialogo = () => el('suiri-quiosque');
const lista = () => [...el('suiri-contas-aparelho').children];
const submit = () => el('suiri-quiosque-form').onsubmit({preventDefault(){}, submitter:el('suiri-quiosque-form').querySelector('button')});
const atual = {id:'atual', email:'atual@example.test'};
const lembrada = {id:'lembrada', email:'lembrada@example.test'};
const nova = {id:'nova', email:'nova@example.test'};
const equipe = [
    {id:'atual', nome:'Ana'},
    {id:'lembrada', nome:'Bruno'},
    {id:'nova', nome:'Carla'}
];
let trocas = 0;
let empresaVerificada = 'empresa';
let verificarEquipe = async () => ({data:equipe, error:null});
let tentativas = [];

win.HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
win.HTMLDialogElement.prototype.close = function() {
    this.removeAttribute('open');
    this.dispatchEvent(new win.Event('close'));
};
Object.assign(win, {
    usuarioAtual: atual,
    perfilAtual: {nome:'Ana'},
    empresaAtualId: 'empresa',
    inicializacaoSuiri: null,
    cliente: {
        rpc: name => {
            assert.equal(name, 'suiri_equipe_basica');
            return verificarEquipe();
        },
        auth: {
            setSession: async () => {
                trocas++;
                return {data:{user:nova},error:null};
            }
        }
    },
    SUPABASE_URL: 'https://suiri.test',
    SUPABASE_KEY: 'mock',
    iniciarAppSeguro: async () => {},
    iniciarApp: async () => {
        win.perfilAtual = {nome:'Carla'};
        win.empresaAtualId = 'empresa';
        el('tela-app').classList.remove('oculto');
        await win.iniciarAppSeguro();
    },
    suiriExecutar: async (_, fn) => fn(),
    supabase: {
        createClient: (_, __, options) => {
            assert.equal(options.auth.persistSession, false);
            return {
                auth: {
                    signInWithPassword: async ({email, password}) => {
                        tentativas.push(email);
                        if (password !== 'correta') return {error:{message:'Credenciais inválidas'}};
                        const user = email === nova.email ? nova : lembrada;
                        return {data:{user,session:{access_token:'a',refresh_token:'b'}},error:null};
                    }
                },
                from: tabela => {
                    assert.equal(tabela, 'perfis');
                    return {
                        select: () => ({eq: () => ({maybeSingle:async () => ({data:{empresa_id:empresaVerificada},error:null})})})
                    };
                }
            };
        }
    }
});
win.localStorage.setItem('suiri-quiosque:empresa', JSON.stringify([
    lembrada, {id:'excluida', email:'excluida@example.test', nome:'Demitida'}
]));
win.localStorage.setItem('suiri-quiosque:outra', JSON.stringify([{id:'externa', email:'fora@example.test'}]));

try {
    win.eval(fs.readFileSync(new URL('../app-interface.js', import.meta.url), 'utf8'));
    await el('suiri-trocar-usuario').onclick();
    assert.deepEqual(lista().map(botao => botao.querySelector('span:last-child').firstChild.textContent), ['Ana','Bruno','Carla']);
    assert.equal(lista()[0].disabled, true);
    assert.doesNotMatch(dialogo().textContent, /excluida|Demitida|example\.test/);
    assert.deepEqual(JSON.parse(win.localStorage.getItem('suiri-quiosque:empresa')), [lembrada]);

    lista()[1].click();
    assert.equal(el('suiri-quiosque-email-grupo').hidden, true);
    assert.equal(win.document.activeElement, el('suiri-quiosque-senha'));
    el('suiri-quiosque-senha').value = 'errada';
    await submit();
    assert.equal(tentativas.at(-1), lembrada.email);
    assert.equal(win.usuarioAtual, atual);
    assert.equal(trocas, 0);
    assert.equal(el('tela-app').classList.contains('oculto'), false);

    lista()[2].click();
    assert.equal(el('suiri-quiosque-email-grupo').hidden, false);
    assert.equal(win.document.activeElement, el('suiri-quiosque-email'));
    el('suiri-quiosque-email').value = lembrada.email;
    el('suiri-quiosque-senha').value = 'correta';
    await submit();
    assert.equal(trocas, 0);
    assert.equal(win.usuarioAtual, atual);

    el('suiri-quiosque-email').value = nova.email;
    el('suiri-quiosque-senha').value = 'correta';
    empresaVerificada = 'outra';
    await submit();
    assert.equal(trocas, 0);

    el('suiri-quiosque-senha').value = 'correta';
    empresaVerificada = 'empresa';
    await submit();
    assert.equal(trocas, 1);
    assert.equal(win.usuarioAtual, nova);
    assert.equal(dialogo().open, false);
    assert.deepEqual(JSON.parse(win.localStorage.getItem('suiri-quiosque:empresa')), [lembrada,nova]);

    verificarEquipe = async () => ({data:[equipe[2]],error:null});
    await el('suiri-trocar-usuario').onclick();
    assert.equal(lista().length, 1);
    assert.deepEqual(JSON.parse(win.localStorage.getItem('suiri-quiosque:empresa')), [nova]);
    dialogo().close();
    Object.defineProperty(win.navigator, 'onLine', {value:false});
    await el('suiri-trocar-usuario').onclick();
    assert.equal(lista().length, 0);
    assert.match(el('suiri-quiosque-status').textContent, /internet/);
    console.log('Quiosque: equipe completa, primeiro acesso, senha, isolamento por empresa e falhas de autenticação: OK');
} finally {
    win.close();
}
