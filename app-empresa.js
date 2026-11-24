/* Suiri Empresas V4 — cadastro seguro, navegação e relacionamento comercial. */
'use strict';
window.normalizarCNPJ = valor => String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
window.validarCNPJ = function(valor) {
    const c = window.normalizarCNPJ(valor);
    if (!/^[A-Z\d]{12}\d{2}$/.test(c) || /^(.)\1+$/.test(c)) return false;
    const digito = base => {
        let peso = base.length - 7, soma = 0;
        for (const ch of base) { soma += (ch.charCodeAt(0) - 48) * peso; if (--peso < 2) peso = 9; }
        const resto = soma % 11; return resto < 2 ? 0 : 11 - resto;
    };
    return Number(c[12]) === digito(c.slice(0,12)) && Number(c[13]) === digito(c.slice(0,13));
};
window.permissoesSuiri = () => perfilAtual?.is_admin ? ['*'] :
    [...(perfilAtual?.is_socio && Array.isArray(perfilAtual.permissoes_socio) ? perfilAtual.permissoes_socio : []), ...(perfilAtual?.is_gerente && Array.isArray(perfilAtual.permissoes_gerente) ? perfilAtual.permissoes_gerente : [])];
window.podeSuiri = chave => !!perfilAtual && (perfilAtual.is_admin || window.permissoesSuiri().includes(chave) || (chave === 'fechar_caixa' && !!perfilAtual.pode_fechar_caixa));
const suiriComercial = () => window.podeSuiri('contas') || window.podeSuiri('financeiro') || window.podeSuiri('gestao');
const suiriCatalogo = () => window.podeSuiri('compras') || window.podeSuiri('gestao');
const suiriMoeda = centavos => (Number(centavos || 0) / 100).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
window.centavosSuiri = function(valor) {
    let s = String(valor ?? '').trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
    if (s.includes(',')) s = s.replace(/\./g,'').replace(',','.');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Use um valor como 125,50, sem números negativos.');
    const n = Math.round(Number(s) * 100);
    if (!Number.isSafeInteger(n) || n > 99999999999) throw new Error('Valor acima do limite.');
    return n;
};
const suiriUID = () => crypto.randomUUID();
const suiriEl = id => document.getElementById(id);
const suiriData = valor => valor ? String(valor).split('-').reverse().join('/') : '—';
const suiriEstado = {contatos:[], vendas:[], recebimentos:[], tab:'receber', filtro:'aberto', pessoa:'', busca:'', inicio:'', fim:''};
const suiriErro = e => window.mostrarToast(e.message || 'Não foi possível concluir a operação.', 'erro');
window.todosRegistrosSuiri = async function(consulta) {
    const todos=[];
    for(let inicio=0;;inicio+=500){
        const r=await consulta.range(inicio,inicio+499);if(r.error)return {data:null,error:r.error};
        todos.push(...(r.data||[]));if((r.data||[]).length<500)return {data:todos,error:null};
    }
};
async function suiriDB(consulta) { const r = await consulta; if (r.error) throw r.error; return r.data; }
async function suiriExecutar(btn, fn) {
    if (btn?.disabled) return;
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy','true'); }
    try { return await fn(); } catch(e) { suiriErro(e); }
    finally { if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); } }
}

// Every legacy business query is explicitly scoped. RLS in the SQL is the authority.
if (cliente) {
    const fromOriginal = cliente.from.bind(cliente);
    const tabelas = new Set(['tarefas','avisos','livro_ponto','vales','itens_comprados','pedidos_compra','contas_pagar','fechamento_caixa','cardapio_consumo','suiri_contatos','suiri_vendas','suiri_recebimentos','suiri_historico_tarefas']);
    cliente.from = function(nome) {
        const query = fromOriginal(nome);
        if (!tabelas.has(nome)) return query;
        const empresa = empresaAtualId;
        for (const metodo of ['select','update','delete','insert','upsert']) {
            const original = query[metodo].bind(query);
            query[metodo] = function(...args) {
                if (!empresa) throw new Error('Entre em uma empresa antes de consultar ou alterar seus dados.');
                if (metodo === 'insert' || metodo === 'upsert') {
                    const incluir = row => {
                        if (row.empresa_id && String(row.empresa_id) !== String(empresa)) throw new Error('A empresa do registro é diferente da sessão.');
                        return {...row,empresa_id:empresa};
                    };
                    args[0] = Array.isArray(args[0]) ? args[0].map(incluir) : incluir(args[0]);
                    return original(...args);
                }
                return original(...args).eq('empresa_id', empresa);
            };
        }
        return query;
    };
}

// Persistent queue partitioned by user AND company; server errors are never called offline successes.
const suiriChaveFila = () => usuarioAtual && empresaAtualId ? `${CHAVE_STORAGE_OFFLINE}:${usuarioAtual.id}:${empresaAtualId}` : null;
window.obterFilaOffline = function() { try { return JSON.parse(localStorage.getItem(suiriChaveFila()) || '[]'); } catch { return []; } };
window.salvarFilaOffline = function(fila) {
    const chave = suiriChaveFila(); if (!chave) throw new Error('Entre na empresa para salvar alterações offline.');
    localStorage.setItem(chave, JSON.stringify(fila)); window.atualizarIndicadorOffline();
};
function suiriContextoFila() {
    const chave = suiriChaveFila();
    return chave ? {chave, user:usuarioAtual.id, empresa:empresaAtualId} : null;
}
function suiriEnfileirar(tipo, payload, contexto) {
    if (!contexto) throw new Error('Entre na empresa para salvar alterações offline.');
    const {chave,user,empresa} = contexto;
    const fila = JSON.parse(localStorage.getItem(chave) || '[]');
    fila.push({idLocal:suiriUID(),tipo,payload,user,empresa,timestamp:new Date().toISOString()});
    localStorage.setItem(chave, JSON.stringify(fila));
    if (chave === suiriChaveFila()) window.atualizarIndicadorOffline();
}
window.adicionarFilaOffline = function(tipo,payload) {
    suiriEnfileirar(tipo, payload, suiriContextoFila());
};
window.executarOuOffline = async function(tipo,payload,fn) {
    const contexto = suiriContextoFila();
    const enfileirar = () => suiriEnfileirar(tipo, payload, contexto);
    if (tipo.endsWith('_insert') || tipo === 'ponto') payload.suiri_operacao_id ||= suiriUID();
    try {
        if (!navigator.onLine) { enfileirar(); return {offline:true}; }
        const r = await fn();
        if (r?.error) {
            if (r.error.code === '23505' && payload.suiri_operacao_id && contexto?.chave === suiriChaveFila()) {
                const tabela = {ponto:'livro_ponto',tarefa_insert:'tarefas',consumo_insert:'itens_comprados',vale_insert:'vales',fechamento_caixa_insert:'fechamento_caixa'}[tipo];
                if (tabela) {
                    const existe = await cliente.from(tabela).select('suiri_operacao_id').eq('suiri_operacao_id',payload.suiri_operacao_id).maybeSingle();
                    if (existe.data) return {success:true};
                }
            }
            if (!r.error.code && /fetch|network|failed to fetch/i.test(r.error.message || '')) { enfileirar(); return {offline:true}; }
            return r;
        }
        return r || {success:true};
    } catch(e) {
        if (e instanceof TypeError && /fetch|network/i.test(e.message)) {
            try { enfileirar(); return {offline:true}; } catch(armazenamento) { return {error:armazenamento}; }
        }
        return {error:e};
    }
};
window.enviarSaidaPonto = async function(payload) {
    const chave = payload.id ? 'id' : 'suiri_operacao_id';
    const valor = payload.id || payload.entrada_operacao;
    const dados = {horario_saida: payload.horario_saida, status_turno: payload.status_turno};
    if (payload.ponto_geolocalizacao) dados.ponto_geolocalizacao = payload.ponto_geolocalizacao;
    const res = await cliente.from('livro_ponto').update(dados).eq(chave, valor).is('horario_saida', null).select('id').maybeSingle();
    if (res.error || res.data) return res;
    const existente = await cliente.from('livro_ponto').select('horario_saida').eq(chave, valor).maybeSingle();
    if (existente.error) return existente;
    if (Date.parse(existente.data?.horario_saida) === Date.parse(payload.horario_saida)) return {success: true};
    return {error: {message: 'Registro da entrada indisponível ou turno já encerrado.'}};
};
let suiriSincronizando = false;
window.processarFilaOffline = async function() {
    if (suiriSincronizando || !navigator.onLine || !usuarioAtual || !empresaAtualId) return;
    suiriSincronizando = true;
    const chave = suiriChaveFila(), user = usuarioAtual.id, empresa = empresaAtualId;
    try {
        for (const item of window.obterFilaOffline()) {
            if (suiriChaveFila() !== chave || item.user !== user || String(item.empresa) !== String(empresa)) break;
            const p = item.payload; let query;
            const inserts = {ponto:'livro_ponto',tarefa_insert:'tarefas',consumo_insert:'itens_comprados',vale_insert:'vales',fechamento_caixa_insert:'fechamento_caixa'};
            if (inserts[item.tipo]) query = cliente.from(inserts[item.tipo]).insert([p]);
            else if (item.tipo === 'consumo_rpc') query = cliente.rpc('suiri_lancar_consumo',p);
            else if (item.tipo === 'ponto_update') query = window.enviarSaidaPonto(p);
            else if (item.tipo === 'tarefa_update') query = cliente.from('tarefas').update(p.dados).eq('id',p.id);
            else if (item.tipo === 'aviso_leitura') query = cliente.rpc('suiri_ler_aviso',{p_id:String(p.id)});
            else { window.mostrarToast('Há uma ação offline desconhecida. Ela foi preservada para revisão.', 'erro'); break; }
            const r = await query;
            if (r.error) {
                let repetida = false;
                if (r.error.code === '23505' && p.suiri_operacao_id && inserts[item.tipo]) {
                    const v = await cliente.from(inserts[item.tipo]).select('suiri_operacao_id').eq('suiri_operacao_id',p.suiri_operacao_id).maybeSingle(); repetida = !!v.data;
                }
                if (!repetida) { window.mostrarToast('Ação offline preservada: ' + r.error.message, 'erro'); break; }
            }
            // Re-read before removal so a concurrently added action is preserved.
            const atual = JSON.parse(localStorage.getItem(chave) || '[]').filter(i => i.idLocal !== item.idLocal);
            localStorage.setItem(chave,JSON.stringify(atual));
        }
    } catch(e) { suiriErro(e); }
    finally { suiriSincronizando = false; window.atualizarIndicadorOffline(); }
    window.atualizarConsumoSuiri?.();
    if (!window.obterFilaOffline().length) { window.carregarStatusPonto?.(); window.carregarTarefas?.(); }
};

const suiriTelas = [
    ['operacao','conteudo-operacional','☀','Missão'],
    ['painel','conteudo-painel-ao-vivo','♙','Ao vivo'],
    ['gestao','conteudo-gestao-compras-contas','▦','Gestão'],
    ['relatorios','conteudo-relatorios','▥','Relatórios'],
    ['admin','conteudo-admin','⚙','Admin'],
    ['perfil','conteudo-perfil','◉','Perfil'],
    ['configuracoes','conteudo-configuracoes','☷','Ajustes']
];
let suiriTelaAtual = 'operacao';
function suiriTelasPermitidas() {
    return suiriTelas.filter(([id]) => ['operacao','perfil','configuracoes'].includes(id) ||
        (id === 'admin' ? window.podeSuiri('relatorios') : id === 'painel' ? window.podeSuiri('inspecao') :
        id === 'relatorios' ? window.podeSuiri('relatorios') : ['gestao','compras','contas','financeiro','fechar_caixa'].some(window.podeSuiri)));
}
const suiriAbrirPerfilAntigo = window.abrirPainelPerfil;
const suiriAbrirEquipeAntigo = window.abrirPainelAoVivo;
const suiriAlternarAntigo = window.alternarTelas;
window.alternarTelas = function(tela, secaoGestao) {
    if (!suiriTelasPermitidas().some(t => t[0] === tela)) { window.mostrarToast('Seu acesso não permite abrir esta tela.', 'erro'); return; }
    suiriTelas.forEach(([,id]) => suiriEl(id)?.classList.add('oculto'));
    if (tela === 'perfil') suiriAbrirPerfilAntigo();
    else if (tela === 'painel') suiriAbrirEquipeAntigo();
    else if (tela !== 'configuracoes') suiriAlternarAntigo(tela);
    suiriEl(suiriTelas.find(t => t[0] === tela)[1])?.classList.remove('oculto');
    suiriEl('cabecalho-topo-usuario')?.classList.toggle('oculto',tela !== 'operacao');
    suiriTelaAtual = tela;
    suiriDesenharNav(); suiriAplicarPermissoes();
    if (tela !== 'gestao') window.fecharLeitorCameraGestao?.();
    if (tela === 'operacao') window.atualizarConsumoSuiri?.(true);
    if (tela === 'gestao') {
        suiriMostrarBlocoGestao(secaoGestao);
        if (suiriComercial()) window.carregarComercialSuiri();
    }
    if (tela === 'configuracoes') suiriAtualizarAjustes();
    window.scrollTo({top:0,behavior:'instant'});
};
window.abrirPainelPerfil = () => window.alternarTelas('perfil');
window.abrirPainelAoVivo = () => window.alternarTelas('painel');
window.fecharPainelPerfil = window.fecharPainelAoVivo = () => window.alternarTelas('operacao');
function suiriTelasNoMenu() {
    return suiriTelasPermitidas().filter(([id]) => id !== 'configuracoes');
}
function suiriDesenharNav() {
    const nav = suiriEl('suiri-nav'); if (!nav) return;
    nav.innerHTML = suiriTelasNoMenu().map(([id,,icone,nome]) => `<button type="button" data-tela-suiri="${id}" ${(id === suiriTelaAtual || (id === 'perfil' && suiriTelaAtual === 'configuracoes')) ? 'aria-current="page"' : ''}><span aria-hidden="true">${icone}</span><span>${nome}</span></button>`).join('');
    nav.querySelector('[aria-current]')?.scrollIntoView({block:'nearest',inline:'nearest'});
}
let suiriBlocoGestao = '';
function suiriMostrarBlocoGestao(escolha = suiriBlocoGestao) {
    const secoes = [
        ['comercial','comercial-suiri',suiriComercial()],
        ['pagar','suiri-bloco-pagar',window.podeSuiri('contas') || window.podeSuiri('gestao')],
        ['compras','suiri-bloco-compras',window.podeSuiri('compras') || window.podeSuiri('gestao')],
        ['vales','cartao-financeiro-gerencial',window