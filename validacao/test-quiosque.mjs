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
let recargas = 0;
let trocasFalham = true;
let eventoAuth;
let inicializacoes = 0;
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
            onAuthStateChange: fn => { eventoAuth = fn; },
            getSession: async () => ({data:{session:{user:atual}}, error:null}),
            setSession: async () => {
                trocas++;
                assert.equal(win.document.body.classList.contains('suiri-sessao-transicao'), true);
                assert.equal(win.suiriConfirmandoTroca, true);
                if (trocasFalham) return {error:{message:'Falha ao persistir sessão'}};
                eventoAuth('SIGNED_IN', {user:nova});
                return {data:{user:nova},error:null};
            }
        }
    },
    SUPABASE_URL: 'https://suiri.test',
    SUPABASE_KEY: 'mock',
    iniciarAppSeguro: async () => {},
    iniciarApp: async () => { inicializacoes++; },
    recarregarTeste: () => { recargas++; },
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
    const core = fs.readFileSync(new URL('../app-core.js', import.meta.url), 'utf8');
    // Carrega o tratamento real das sessões e substitui apenas a navegação do navegador.
    const trechoSessao = core.slice(core.indexOf('let sessaoSuiriRecarregando'), core.indexOf('// ------------------ EVENTOS DE INICIALIZAÇÃO'));
    win.eval(trechoSessao.replace('window.location.reload();', 'window.recarregarTeste();'));
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
    assert.equal(recargas, 0);
    assert.equal(win.usuarioAtual, atual);
    assert.equal(win.suiriConfirmandoTroca, false);
    assert.equal(win.document.body.classList.contains('suiri-sessao-transicao'), false);

    el('suiri-quiosque-senha').value = 'correta';
    trocasFalham = false;
    await submit();
    assert.equal(trocas, 2);
    assert.equal(inicializacoes, 0);
    assert.equal(recargas, 1);
    assert.equal(win.usuarioAtual, null);
    assert.equal(win.empresaAtualId, null);
    assert.equal(dialogo().open, false);
    assert.equal(win.document.body.classList.contains('suiri-sessao-transicao'), true);
    assert.deepEqual(JSON.parse(win.localStorage.getItem('suiri-quiosque:empresa')), [lembrada,nova]);

    // Refaz a inicialização para verificar a lista na conta que entrou após o recarregamento.
    win.usuarioAtual = nova;
    win.perfilAtual = {nome:'Carla'};
    win.empresaAtualId = 'empresa';
    win.document.body.classList.remove('suiri-sessao-transicao');
    verificarEquipe = async () => ({data:[equipe[2]],error:null});
    await el('suiri-trocar-usuario').onclick();
    assert.equal(lista().length, 1);
    assert.deepEqual(JSON.parse(win.localStorage.getItem('suiri-quiosque:empresa')), [nova]);
    dialogo().close();
    Object.defineProperty(win.navigator, 'onLine', {value:false});
    await el('suiri-trocar-usuario').onclick();
    assert.equal(lista().length, 0);
    assert.match(el('suiri-quiosque-status').textContent, /internet/);
    console.log('Quiosque: equipe, senha, falha de troca preservada e recarga sem reutilizar a interface: OK');
} finally {
    win.close();
}

for (const [evento, sessao] of [['SIGNED_IN', {user:nova}], ['SIGNED_OUT', null]]) {
    const outraAba = new JSDOM('<main id="tela-app">Dados da conta anterior</main>', {
        url:'https://suiri.test/', runScripts:'outside-only'
    }).window;
    let notificar;
    let recarregou = false;
    try {
        Object.assign(outraAba, {
            usuarioAtual:atual,
            perfilAtual:{is_admin:true},
            empresaAtualId:'empresa',
            cliente:{auth:{onAuthStateChange: fn => { notificar = fn; }}},
            recarregarTeste:() => { recarregou = true; }
        });
        const core = fs.readFileSync(new URL('../app-core.js', import.meta.url), 'utf8');
        const trecho = core.slice(core.indexOf('let sessaoSuiriRecarregando'),
            core.indexOf('// ------------------ EVENTOS DE INICIALIZAÇÃO'));
        outraAba.eval(trecho.replace('window.location.reload();', 'window.recarregarTeste();'));
        notificar(evento, sessao);
        assert.equal(recarregou, true);
        assert.equal(outraAba.usuarioAtual, null);
        assert.equal(outraAba.document.body.classList.contains('suiri-sessao-transicao'), true);
    } finally {
        outraAba.close();
    }
}
console.log('Sessão em outra aba: mudança de conta e saída cobrem a interface antes da recarga: OK');
