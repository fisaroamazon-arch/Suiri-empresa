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
        ['vales','cartao-financeiro-gerencial',window.podeSuiri('financeiro')],
        ['caixa','suiri-bloco-caixa',window.podeSuiri('fechar_caixa') || window.podeSuiri('relatorios')]
    ];
    const disponiveis = secoes.filter(([, , permitido]) => permitido);
    suiriBlocoGestao = disponiveis.some(([chave]) => chave === escolha) ? escolha : disponiveis[0]?.[0];
    if (suiriBlocoGestao !== 'pagar') window.fecharLeitorCameraGestao?.();
    for (const [chave,id,permitido] of secoes) {
        const aberto = permitido && chave === suiriBlocoGestao;
        suiriEl(id).hidden = !aberto;
        const botao = document.querySelector('[data-atalho-suiri="'+chave+'"]');
        botao.hidden = !permitido;
        botao.setAttribute('aria-pressed', String(aberto));
        botao.setAttribute('aria-controls', id);
    }
}
function suiriAplicarPermissoes() {
    const marcar = (sel,permitido) => document.querySelectorAll(sel).forEach(el => el.classList.toggle('suiri-sem-acesso',!permitido));
    marcar('#comercial-suiri',suiriComercial());
    marcar('[data-suiri-admin]',!!perfilAtual?.is_admin);
    marcar('[data-suiri-catalogo]',suiriCatalogo());
    suiriEl('suiri-bloco-compras')?.classList.toggle('suiri-sem-acesso',!window.podeSuiri('compras') && !window.podeSuiri('gestao'));
    suiriEl('suiri-bloco-pagar')?.classList.toggle('suiri-sem-acesso',!window.podeSuiri('contas') && !window.podeSuiri('gestao'));
    suiriEl('suiri-bloco-caixa')?.classList.toggle('suiri-sem-acesso',!window.podeSuiri('fechar_caixa') && !window.podeSuiri('relatorios') && !perfilAtual?.pode_fechar_caixa);
    // Replace broad staff role visibility with explicit capability checks.
    const checks = {'cartao-financeiro-gerencial':'financeiro','form-delegar':'tarefas','form-novo-aviso':'avisos','btn-toggle-form-aviso':'avisos','btn-toggle-form-delegar':'tarefas'};
    for (const [id,perm] of Object.entries(checks)) suiriEl(id)?.classList.toggle('suiri-sem-acesso',!window.podeSuiri(perm));
}
const suiriIniciarOriginal = window.iniciarAppSeguro;
window.iniciarAppSeguro = async function() {
    await suiriIniciarOriginal();
    if (!perfilAtual?.empresa_id) return;
    suiriAplicarPermissoes(); suiriDesenharNav();
    window.atualizarConsumoSuiri?.();
    if (!suiriTelasPermitidas().some(t => t[0] === suiriTelaAtual)) window.alternarTelas('operacao');
    suiriAtualizarAjustes();
    if (localStorage.getItem('suiri_offline_queue')) suiriEl('fila-antiga-aviso')?.classList.remove('oculto');
};

// Existing dangerous actions now have server-checked counterparts and clear entry points.
window.excluirColaboradorModal = async function(id) {
    if (!perfilAtual?.is_admin) return suiriErro(new Error('Apenas administradores podem excluir membros.'));
    if(id === undefined) id = suiriEl('select-inspecionar-colab')?.value;
    if (!id) return suiriErro(new Error('Selecione o membro a excluir.'));
    if (String(id) === String(usuarioAtual.id)) return suiriErro(new Error('Para excluir seu próprio acesso, use Ajustes.'));
    const nome = mapaPerfis[id]?.nome || 'este membro';
    if (!confirm(`Excluir definitivamente o acesso de ${nome}? Os registros pessoais de ponto, tarefas autônomas pessoais, vales e consumo serão removidos. Vendas, contas e relatórios da empresa serão preservados.`)) return;
    try { await suiriLimparArquivos(id,false); } catch(e) { return suiriErro(e); }
    const {error} = await cliente.rpc('suiri_excluir_membro',{p_usuario:String(id)});
    if (error) return suiriErro(error);
    suiriEl('resultado-inspecao-colab')?.classList.add('oculto');
    window.mostrarToast('Membro excluído.'); await window.iniciarApp();
};
// A persistent confirmation makes mismatches and server failures visible on mobile.
let suiriExclusao = null;
function suiriDialogoExclusao() {
    let dialogo = suiriEl('confirmar-exclusao-suiri');
    if (dialogo) return dialogo;
    document.body.insertAdjacentHTML('beforeend', `<dialog id="confirmar-exclusao-suiri" aria-labelledby="exclusao-titulo" aria-describedby="exclusao-descricao">
        <form id="form-exclusao-suiri" class="suiri-form" novalidate>
            <div class="suiri-dialog-cabecalho"><h2 id="exclusao-titulo">Confirmar exclusão</h2><button type="button" id="exclusao-fechar" aria-label="Fechar confirmação">×</button></div>
            <p id="exclusao-descricao"></p>
            <div class="suiri-exclusao-aviso"><strong id="exclusao-alvo"></strong><p>Esta exclusão é definitiva e não pode ser desfeita.</p></div>
            <label for="exclusao-confirmacao" id="exclusao-instrucao"></label>
            <input id="exclusao-confirmacao" type="text" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" maxlength="80" aria-describedby="exclusao-exemplo exclusao-status">
            <small id="exclusao-exemplo"></small>
            <p id="exclusao-status" role="status" aria-live="polite" aria-atomic="true"></p>
            <div class="suiri-exclusao-acoes"><button type="button" id="exclusao-cancelar" class="btn-secundario">Cancelar</button><button type="submit" id="exclusao-executar" class="btn-erro">Excluir definitivamente</button></div>
        </form>
    </dialog>`);
    dialogo = suiriEl('confirmar-exclusao-suiri');
    const fechar = () => { if (!suiriExclusao?.ocupado) dialogo.close(); };
    suiriEl('exclusao-fechar').addEventListener('click', fechar);
    suiriEl('exclusao-cancelar').addEventListener('click', fechar);
    dialogo.addEventListener('cancel', e => { if (suiriExclusao?.ocupado) e.preventDefault(); });
    dialogo.addEventListener('close', () => { const foco=suiriExclusao?.foco; suiriExclusao=null; foco?.focus(); });
    suiriEl('exclusao-confirmacao').addEventListener('input', () => {
        if (suiriExclusao?.ocupado) return;
        suiriEl('exclusao-confirmacao').removeAttribute('aria-invalid');
        suiriExclusaoStatus('',false);
    });
    suiriEl('form-exclusao-suiri').addEventListener('submit', suiriConfirmarExclusao);
    return dialogo;
}
function suiriExclusaoStatus(texto,erro) {
    const status=suiriEl('exclusao-status');
    status.textContent=texto;
    status.classList.toggle('suiri-exclusao-erro',!!erro);
}
function suiriExclusaoOcupada(ocupado) {
    suiriExclusao.ocupado=ocupado;
    suiriEl('form-exclusao-suiri').setAttribute('aria-busy',String(ocupado));
    for(const id of ['exclusao-confirmacao','exclusao-executar','exclusao-fechar','exclusao-cancelar'])suiriEl(id).disabled=ocupado;
    suiriEl('exclusao-executar').textContent=ocupado?'Excluindo…':'Excluir definitivamente';
}
async function suiriConfirmarExclusao(evento) {
    evento.preventDefault();
    const pedido=suiriExclusao;
    if (!pedido || pedido.ocupado) return;
    const campo=suiriEl('exclusao-confirmacao');
    const texto=campo.value.trim().toUpperCase();
    const conferido=pedido.empresa?texto.replace(/^EXCLUIR\s+/,'').replace(/[.\/\-\s]/g,''):texto.replace(/\s+/g,' ');
    if (conferido !== pedido.confirmacao) {
        campo.setAttribute('aria-invalid','true');
        suiriExclusaoStatus(pedido.empresa?'O CNPJ não confere. Digite o CNPJ mostrado acima, com ou sem pontuação. Nenhuma exclusão foi iniciada.':'A confirmação não confere. Digite EXCLUIR MINHA CONTA. Nenhuma exclusão foi iniciada.',true);
        campo.focus();
        return;
    }
    if (!navigator.onLine) { suiriExclusaoStatus('Conecte-se à internet para excluir. Nenhuma exclusão foi iniciada.',true);return; }
    if (usuarioAtual?.id !== pedido.usuario || String(empresaAtualId) !== pedido.empresaId) {
        suiriExclusaoStatus('A sessão mudou. Cancele esta janela e entre novamente na conta antes de excluir.',true);return;
    }
    suiriExclusaoOcupada(true);
    let excluido=false;
    try {
        suiriExclusaoStatus('Verificando permissões e removendo as fotos vinculadas…',false);
        await suiriLimparArquivos(pedido.usuario,pedido.empresa);
        suiriExclusaoStatus(pedido.empresa?'Excluindo a empresa, os dados e os acessos…':'Excluindo sua conta e os registros pessoais…',false);
        const {error}=await cliente.rpc(pedido.empresa?'suiri_excluir_empresa':'suiri_excluir_minha_conta',pedido.empresa?{p_confirmacao:'EXCLUIR '+pedido.confirmacao}:{});
        if(error)throw error;
        excluido=true;
        const chave=suiriChaveFila();
        if(chave){try{localStorage.removeItem(chave);}catch{}}
        suiriExclusaoStatus('Exclusão concluída. Voltando à tela de entrada…',false);
        await window.fazerLogoff();
        suiriExclusaoOcupada(false);
        suiriEl('confirmar-exclusao-suiri').close();
        window.mostrarToast(pedido.empresa?'Empresa e acessos excluídos.':'Sua conta foi excluída.');
    } catch(e) {
        suiriExclusaoOcupada(false);
        if(excluido){
            suiriExclusaoStatus('A exclusão foi concluída, mas não foi possível voltar à entrada. Feche e abra o aplicativo novamente.',false);
            suiriEl('exclusao-confirmacao').disabled=true;
            suiriEl('exclusao-executar').disabled=true;
            suiriEl('exclusao-cancelar').textContent='Fechar';
        }else{
            const detalhe=e?.message || 'Não foi possível obter uma resposta do servidor.';
            const ausente=e?.code==='PGRST202'||e?.code==='42883';
            suiriExclusaoStatus((ausente?'A função necessária não foi encontrada no Supabase. ':'Não foi possível concluir a exclusão. ')+detalhe,true);
        }
    }
}
window.excluirContaSuiri = function(empresa) {
    if (!usuarioAtual?.id) return suiriErro(new Error('Entre na conta antes de excluir.'));
    if (empresa && !perfilAtual?.is_admin) return suiriErro(new Error('Apenas administradores podem excluir a empresa.'));
    const cnpj=window.normalizarCNPJ(dadosEmpresaAtual?.cnpj);
    if (empresa && !/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return suiriErro(new Error('Não foi possível identificar o CNPJ da empresa. Reabra sua sessão antes de excluir.'));
    const dialogo=suiriDialogoExclusao();
    if(dialogo.open)return;
    suiriExclusao={empresa:!!empresa,confirmacao:empresa?cnpj:'EXCLUIR MINHA CONTA',usuario:usuarioAtual.id,empresaId:String(empresaAtualId),ocupado:false,foco:document.activeElement};
    suiriEl('form-exclusao-suiri').reset();
    suiriEl('exclusao-confirmacao').removeAttribute('aria-invalid');
    suiriEl('exclusao-cancelar').textContent='Cancelar';
    suiriEl('exclusao-titulo').textContent=empresa?'Excluir empresa e todos os acessos':'Excluir minha conta';
    suiriEl('exclusao-descricao').textContent=empresa?'Serão excluídos os dados do aplicativo desta empresa e as contas de todos os membros vinculados.':'Serão excluídos seu login e seus registros pessoais de ponto, tarefas autônomas, vales e consumo. A empresa e os registros comerciais serão preservados. Se você for o último administrador, transfira a administração antes.';
    suiriEl('exclusao-alvo').textContent=empresa?(dadosEmpresaAtual?.nome_fantasia||'Sua empresa')+' • CNPJ '+cnpj:(perfilAtual?.nome||'Sua conta');
    suiriEl('exclusao-instrucao').textContent=empresa?'Digite o CNPJ desta empresa para confirmar:':'Digite EXCLUIR MINHA CONTA para confirmar:';
    suiriEl('exclusao-exemplo').textContent=empresa?'CNPJ: '+cnpj+' — pode usar a pontuação habitual.':'A frase pode ser digitada em letras maiúsculas ou minúsculas.';
    suiriExclusaoStatus('',false);
    suiriExclusaoOcupada(false);
    dialogo.showModal();
    suiriEl('exclusao-confirmacao').focus();
};

window.retomarVinculo = async function() {
    const cnpj = prompt('Informe o CNPJ da empresa para vincular sua conta:');
    if (!cnpj) return;
    if (!window.validarCNPJ(cnpj)) return suiriErro(new Error('CNPJ inválido.'));
    try {
        const info = await consultarDadosCNPJReceita(window.normalizarCNPJ(cnpj));
        if (!info) throw new Error('Não foi possível consultar o CNPJ. Tente novamente.');
        if (!confirm(`Vincular sua conta a ${info.nome_fantasia || info.razao_social}?`)) return;
        await suiriDB(cliente.rpc('suiri_vincular_empresa',{p_cnpj:window.normalizarCNPJ(cnpj),p_nome:usuarioAtual?.user_metadata?.nome || suiriEl('nome-cadastro').value || 'Colaborador',p_empresa:{nome_fantasia:info.nome_fantasia || info.razao_social,razao_social:info.razao_social || ''}}));
        await window.iniciarApp();
    } catch(e) { suiriErro(e); }
};
window.abrirRecuperacaoSuiri = function() {
    suiriEl('modal-recuperacao-suiri')?.classList.remove('oculto');
};
function suiriAtualizarAjustes() {
    suiriEl('ajustes-empresa-nome').textContent = dadosEmpresaAtual?.nome_fantasia || 'Sua empresa';
    suiriEl('ajustes-empresa-cnpj').textContent = dadosEmpresaAtual?.cnpj || '';
    suiriEl('suiri-tema').value = localStorage.getItem('suiri_tema') || 'sistema';
    suiriEl('suiri-gestos').checked = localStorage.getItem('suiri_gestos') !== 'nao';
    suiriAplicarPermissoes();
}
window.aplicarTemaSuiri = function(tema) {
    if (!['sistema','claro','escuro'].includes(tema)) tema = 'sistema';
    localStorage.setItem('suiri_tema',tema);
    const escuro = tema === 'escuro' || (tema === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
    document.querySelector('meta[name="theme-color"]').content = escuro ? '#101e26' : '#f0f5f3';
};
window.aplicarTemaSuiri(localStorage.getItem('suiri_tema') || 'sistema');
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',() => window.aplicarTemaSuiri(localStorage.getItem('suiri_tema') || 'sistema'));

window.carregarComercialSuiri = async function() {
    if (!suiriComercial()) return;
    const loading = suiriEl('comercial-status'); loading.textContent = 'Atualizando dados…';
    try {
        const [contatos,vendas,recebimentos] = await Promise.all([
            suiriDB(window.todosRegistrosSuiri(cliente.from('suiri_contatos').select('*').order('nome').order('id'))),
            suiriDB(window.todosRegistrosSuiri(cliente.from('suiri_vendas').select('*').order('data_venda',{ascending:false}).order('id'))),
            suiriDB(window.todosRegistrosSuiri(cliente.from('suiri_recebimentos').select('*').order('data_recebimento',{ascending:false}).order('id')))
        ]);
        suiriEstado.contatos=contatos||[]; suiriEstado.vendas=vendas||[]; suiriEstado.recebimentos=recebimentos||[];
        loading.textContent=''; suiriRenderComercial();
    } catch(e) { loading.textContent='Não foi possível carregar o comercial. ' + e.message + ' Confira a atualização SQL do pacote.'; }
};
function suiriSaldo(venda) {
    return Number(venda.total_centavos) - suiriEstado.recebimentos.filter(r => String(r.venda_id) === String(venda.id) && !r.estornado_em).reduce((s,r)=>s+Number(r.valor_centavos),0);
}
function suiriStatusVenda(venda) {
    if (venda.cancelada_em) return 'cancelada';
    if (suiriSaldo(venda) <= 0) return 'paga';
    return venda.vencimento < window.dataLocal() ? 'atrasada' : 'aberta';
}
function suiriVendasFiltradas() {
    return suiriEstado.vendas.filter(v => {
        const s = suiriStatusVenda(v); const contato = suiriEstado.contatos.find(c=>String(c.id)===String(v.contato_id));
        return (!suiriEstado.pessoa || String(v.contato_id) === suiriEstado.pessoa) &&
            (!suiriEstado.inicio || v.data_venda >= suiriEstado.inicio) && (!suiriEstado.fim || v.data_venda <= suiriEstado.fim) &&
            (suiriEstado.filtro === 'todas' || (suiriEstado.filtro === 'aberto' ? ['aberta','atrasada'].includes(s) : s === suiriEstado.filtro)) &&
            (!suiriEstado.busca || `${contato?.nome || ''} ${v.observacao || ''} ${JSON.stringify(v.itens)}`.toLowerCase().includes(suiriEstado.busca.toLowerCase()));
    });
}
function suiriRenderComercial() {
    const clientes = suiriEstado.contatos.filter(c=>c.tipo==='cliente' && c.ativo);
    const listaOptions = '<option value="">Selecione um cliente…</option>' + clientes.map(c=>`<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
    const sel=suiriEl('venda-cliente'); const prev=sel.value; sel.innerHTML=listaOptions; sel.value=prev;
    suiriEl('filtro-comercial-pessoa').innerHTML='<option value="">Todos os clientes</option>'+suiriEstado.contatos.filter(c=>c.tipo==='cliente').map(c=>`<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
    suiriEl('filtro-comercial-pessoa').value=suiriEstado.pessoa;
    suiriEl('sugestoes-fornecedores').innerHTML=suiriEstado.contatos.filter(c=>c.tipo==='fornecedor' && c.ativo).map(c=>`<option value="${esc(c.nome)}"></option>`).join('');
    const abertas=suiriEstado.vendas.filter(v=>['aberta','atrasada'].includes(suiriStatusVenda(v)));
    suiriEl('suiri-total-receber').textContent=suiriMoeda(abertas.reduce((s,v)=>s+suiriSaldo(v),0));
    suiriEl('suiri-total-atrasado').textContent=suiriMoeda(abertas.filter(v=>suiriStatusVenda(v)==='atrasada').reduce((s,v)=>s+suiriSaldo(v),0));
    suiriEl('suiri-total-clientes').textContent=clientes.length;
    const vendas=suiriVendasFiltradas();
    suiriEl('suiri-vendas-lista').innerHTML = vendas.length ? vendas.map(v=> {
        const cliente=suiriEstado.contatos.find(c=>String(c.id)===String(v.contato_id)); const status=suiriStatusVenda(v), saldo=suiriSaldo(v);
        const recs=suiriEstado.recebimentos.filter(r=>String(r.venda_id)===String(v.id));
        return `<article class="comercial-card"><div class="comercial-card-top"><div><strong>${esc(cliente?.nome || 'Cliente arquivado')}</strong><p>Venda em ${suiriData(v.data_venda)} · vence ${suiriData(v.vencimento)}</p></div><span class="situacao situacao-${status}">${{paga:'Recebida',aberta:'Em aberto',atrasada:'Em atraso',cancelada:'Cancelada'}[status]}</span></div><div class="comercial-valores"><span>Total <b>${suiriMoeda(v.total_centavos)}</b></span><span>Saldo <b>${suiriMoeda(v.cancelada_em?0:saldo)}</b></span></div><p>${esc(v.observacao || '')}</p><details><summary>Itens e histórico de pagamentos</summary><ul>${(v.itens || []).map(i=>`<li>${esc(i.quantidade)} × ${esc(i.descricao)} — ${suiriMoeda(i.valor_centavos)} por unidade</li>`).join('')}</ul>${recs.length?recs.map(r=>`<div class="historico-recebimento">${suiriData(r.data_recebimento)} · ${suiriMoeda(r.valor_centavos)} · ${esc(r.forma)} ${r.estornado_em?'<b>Estornado</b>':perfilAtual?.is_admin?`<button type="button" class="btn-texto" data-suiri-acao="estornar" data-id="${esc(r.id)}">Estornar</button>`:''}<p>${esc(r.observacao || '')}</p></div>`).join(''):'<p>Nenhum recebimento registrado.</p>'}${!v.cancelada_em && !recs.some(r=>!r.estornado_em) && perfilAtual?.is_admin?`<button type="button" class="btn-texto perigo" data-suiri-acao="cancelar-venda" data-id="${esc(v.id)}">Cancelar venda</button>`:''}</details>${!v.cancelada_em && saldo>0?`<button type="button" class="btn-principal" data-suiri-acao="receber" data-id="${esc(v.id)}">Registrar recebimento</button>`:''}</article>`;
    }).join('') : '<div class="suiri-vazio"><span>↗</span><strong>Nenhuma venda neste filtro</strong><p>Cadastre um cliente e registre sua primeira venda.</p></div>';
    suiriRenderContatos();
}
function suiriRenderContatos() {
    const busca=(suiriEl('contato-busca')?.value||'').toLowerCase(); const tipo=suiriEl('contato-filtro')?.value || 'cliente';
    const contatos=suiriEstado.contatos.filter(c=>c.tipo===tipo && `${c.nome} ${c.documento||''} ${c.telefone||''}`.toLowerCase().includes(busca));
    suiriEl('suiri-contatos-lista').innerHTML=contatos.length?contatos.map(c=>{
        const saldo=suiriEstado.vendas.filter(v=>String(v.contato_id)===String(c.id)&&!v.cancelada_em).reduce((s,v)=>s+suiriSaldo(v),0);
        return `<article class="contato-card"><div class="contato-avatar" aria-hidden="true">${esc(c.nome[0].toUpperCase())}</div><div><strong>${esc(c.nome)}</strong><p>${esc(c.documento || '')} ${esc(c.telefone || '')}</p><small>${c.tipo==='cliente'?'A receber: '+suiriMoeda(saldo):esc(window.suiriCategorias?.nome(c.categoria_fornecedor, 'fornecedor')||'Fornecedor')} ${c.ativo?'':' · Arquivado'}</small></div><div class="contato-acoes"><button type="button" class="btn-secundario" data-suiri-acao="editar-contato" data-id="${esc(c.id)}">Editar</button>${c.tipo==='cliente'?`<button type="button" class="btn-secundario" data-suiri-acao="historico" data-id="${esc(c.id)}">Histórico</button>`:''}<button type="button" class="btn-texto perigo" data-suiri-acao="arquivar-contato" data-id="${esc(c.id)}">${c.ativo?'Arquivar':'Reativar'}</button></div></article>`;
    }).join(''):'<div class="suiri-vazio"><span>♧</span><strong>Nenhum cadastro encontrado</strong><p>Adicione seus clientes e fornecedores aqui.</p></div>';
}
function suiriTab(tab) {
    suiriEstado.tab=tab;
    document.querySelectorAll('[data-comercial-painel]').forEach(p=>p.classList.toggle('oculto',p.dataset.comercialPainel!==tab));
    document.querySelectorAll('[data-comercial-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.comercialTab===tab)));
}
window.adicionarLinhaVendaSuiri = function(item={}) {
    const linha=document.createElement('div'); linha.className='venda-item-linha';
    linha.innerHTML=`<label>Produto ou serviço<input name="descricao" list="suiri-produtos" placeholder="Descrição do item" maxlength="180" required value="${esc(item.descricao||'')}"></label><label>Qtd.<input name="quantidade" inputmode="decimal" type="number" min="0.001" step="0.001" required value="${esc(item.quantidade||1)}"></label><label>Preço unitário<input name="valor" inputmode="decimal" placeholder="0,00" required value="${item.valor_centavos!=null?esc((item.valor_centavos/100).toFixed(2).replace('.',',')):''}"></label><button type="button" class="btn-secundario" data-suiri-acao="remover-linha" aria-label="Remover item">×</button>`;
    suiriEl('venda-itens').appendChild(linha);
};
function suiriObterItens() {
    return [...suiriEl('venda-itens').children].map(l=>{
        const descricao=l.querySelector('[name="descricao"]').value.trim();
        const quantidade=Number(l.querySelector('[name="quantidade"]').value);
        const valor_centavos=window.centavosSuiri(l.querySelector('[name="valor"]').value);
        if (!descricao || !Number.isFinite(quantidade) || quantidade<=0 || quantidade>1000000 || valor_centavos<=0) throw new Error('Confira descrição, quantidade e preço dos itens.');
        return {descricao,quantidade,valor_centavos};
    });
}
function suiriRecalcularVenda() { try { suiriEl('venda-total').textContent=suiriMoeda(suiriObterItens().reduce((s,i)=>s+Math.round(i.quantidade*i.valor_centavos),0)); } catch { suiriEl('venda-total').textContent='Preencha os itens'; } }
function suiriAbrirContato(id) {
    const c=suiriEstado.contatos.find(c=>String(c.id)===String(id)) || {tipo:suiriEl('contato-filtro').value};
    const f=suiriEl('form-contato-suiri'); f.reset();
    for(const nome of ['id','nome','tipo','documento','telefone','email','endereco','observacoes']) if(f.elements[nome]) f.elements[nome].value=c[nome]||'';
    window.suiriCategorias?.atualizarCampos();
    if (f.elements.categoria_fornecedor) f.elements.categoria_fornecedor.value = c.categoria_fornecedor || '';
    suiriEl('modal-contato-suiri').classList.remove('oculto'); f.elements.nome.focus();
}
async function suiriExportarCSV() {
    const linhas=[['Cliente','Data da venda','Vencimento','Total R$','Recebido R$','Saldo R$','Situação','Itens','Observação']];
    for(const v of suiriVendasFiltradas()) {
        const saldo=suiriSaldo(v); linhas.push([suiriEstado.contatos.find(c=>String(c.id)===String(v.contato_id))?.nome||'',v.data_venda,v.vencimento,(v.total_centavos/100).toFixed(2),((v.total_centavos-saldo)/100).toFixed(2),((v.cancelada_em?0:saldo)/100).toFixed(2),suiriStatusVenda(v),(v.itens||[]).map(i=>`${i.quantidade}x ${i.descricao}`).join(' / '),v.observacao||'']);
    }
    const campo=v=>{let texto=String(v);if(/^\s*[=+@-]/.test(texto))texto="'"+texto;return '"'+texto.replace(/"/g,'""')+'"';};
    const blob=new Blob(['\uFEFF'+linhas.map(l=>l.map(campo).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const nome = 'suiri-contas-a-receber-' + window.dataLocal() + '.csv';
    if (window.suiriAndroid?.salvarArquivo) {
        if (!await window.suiriAndroid.salvarArquivo(blob, nome, 'text/csv')) throw new Error('O Android não conseguiu salvar o CSV.');
        window.mostrarToast('CSV salvo.');
        return;
    }
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=nome;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
window.parseCardapioSuiri = function(texto) {
    const linhas=String(texto).split(/\r?\n/).filter(x=>x.trim()); const itens=[], erros=[], mapa=new Map();
    linhas.forEach((linha,i)=>{
        // Decimal comma; decimal dot; R$; semicolon, tab or dash separator.
        const m=linha.trim().match(/^(.+?)\s*(?:;|\t|\s[-–—]\s|\s+R\$\s*|\s+)\s*(?:R\$\s*)?(\d[\d.]*,\d{2}|\d+(?:\.\d{1,2})?)\s*$/);
        if(!m) { erros.push(i+1); return; }
        let nome=m[1].trim().replace(/\s*[-–—;]\s*$/,'');
        try { const valor=window.centavosSuiri(m[2]); if(!nome || valor<=0 || nome.length>180) throw new Error(); mapa.set(nome.toLocaleLowerCase('pt-BR'),{nome_item:nome,valor_padrao:valor/100,ativo:true}); } catch { erros.push(i+1); }
    });
    itens.push(...mapa.values());return {itens,erros};
};
let suiriImportacao=[];
function suiriPreviewImportacao() {
    const r=window.parseCardapioSuiri(suiriEl('cardapio-texto').value);suiriImportacao=r.itens;
    suiriEl('cardapio-preview').textContent=`${r.itens.length} itens válidos. ${r.erros.length?'Revise as linhas: '+r.erros.join(', '):'Pronto para importar.'}`;
    suiriEl('btn-importar-cardapio').disabled=!r.itens.length || !!r.erros.length;
}
window.salvarNovoItemCardapio = async function() {
    if (!suiriCatalogo()) return suiriErro(new Error('Você não tem permissão para editar o catálogo.'));
    try {
        const nome=suiriEl('input-novo-item-cardapio-nome').value.trim(); const valor=window.centavosSuiri(suiriEl('input-novo-item-cardapio-valor').value);
        if(!nome || !valor) throw new Error('Informe nome e preço.');
        await suiriDB(cliente.rpc('suiri_importar_cardapio',{p_itens:[{nome_item:nome,valor_padrao:valor/100}],p_atualizar:true}));
        await window.inicializarCardapioConsumo(); window.renderizarListaCardapioGerenciar();suiriProdutosDatalist();
        suiriEl('input-novo-item-cardapio-nome').value='';suiriEl('input-novo-item-cardapio-valor').value='';
        window.mostrarToast('Item salvo no catálogo.');
    }catch(e){suiriErro(e);}
};
function suiriProdutosDatalist() { suiriEl('suiri-produtos').innerHTML=cacheCardapioConsumo.map(i=>`<option value="${esc(i.nome_item)}"></option>`).join(''); }
const suiriInicializarCardapio = window.inicializarCardapioConsumo;
window.inicializarCardapioConsumo = async function() {await suiriInicializarCardapio(); suiriProdutosDatalist(); window.atualizarPrecoConsumoSuiri?.();};
window.abrirModalGerenciarCardapio = function() {
    if(!suiriCatalogo())return suiriErro(new Error('Você não tem permissão para editar o catálogo.'));
    window.renderizarListaCardapioGerenciar();suiriEl('modal-gerenciar-cardapio').classList.remove('oculto');
};
window.marcarAvisoLido = async function(id) {
    try {
        if (!navigator.onLine) {window.adicionarFilaOffline('aviso_leitura',{id});window.mostrarToast('Leitura salva para sincronizar.');return;}
        await suiriDB(cliente.rpc('suiri_ler_aviso',{p_id:String(id)}));await window.carregarAvisos();
    }catch(e){suiriErro(e);}
};

// UI additions use the existing layout and all original modules.
function suiriMontarUI() {
    document.body.insertAdjacentHTML('beforeend',`<nav id="suiri-nav" aria-label="Navegação principal"></nav><datalist id="suiri-produtos"></datalist><datalist id="sugestoes-fornecedores"></datalist>
    <div id="modal-contato-suiri" class="modal-overlay oculto" role="dialog" aria-modal="true" aria-labelledby="contato-titulo"><div class="modal-conteudo"><div class="modal-header"><h3 id="contato-titulo">Cadastro comercial</h3><button type="button" class="btn-secundario" data-fechar-suiri="modal-contato-suiri" aria-label="Fechar">×</button></div><form id="form-contato-suiri" class="suiri-form"><input type="hidden" name="id"><label>Tipo<select name="tipo"><option value="cliente">Cliente</option><option value="fornecedor">Fornecedor</option></select></label><label>Nome / razão social<input name="nome" required maxlength="180" autocomplete="organization"></label><div class="suiri-grid"><label>CPF / CNPJ (opcional)<input name="documento" maxlength="24"></label><label>Telefone<input name="telefone" type="tel" maxlength="30" autocomplete="tel"></label></div><label>E-mail<input name="email" type="email" maxlength="200" autocomplete="email"></label><label>Endereço<input name="endereco" maxlength="500"></label><label>Observações<textarea name="observacoes" maxlength="2000" rows="2"></textarea></label><button class="btn-principal" type="submit">Salvar cadastro</button></form></div></div>
    <div id="modal-venda-suiri" class="modal-overlay oculto" role="dialog" aria-modal="true" aria-labelledby="venda-titulo"><div class="modal-conteudo modal-grande"><div class="modal-header"><h3 id="venda-titulo">Nova venda / conta a receber</h3><button type="button" class="btn-secundario" data-fechar-suiri="modal-venda-suiri" aria-label="Fechar">×</button></div><form id="form-venda-suiri" class="suiri-form"><label>Cliente<select id="venda-cliente" required></select></label><div class="suiri-grid"><label>Data da venda<input type="date" id="venda-data" required></label><label>Vencimento<input type="date" id="venda-vencimento" required></label></div><div id="venda-itens"></div><button type="button" class="btn-secundario" data-suiri-acao="adicionar-linha">+ Adicionar item</button><label>Observação<textarea id="venda-observacao" rows="2" maxlength="2000"></textarea></label><div class="venda-total">Total da venda <strong id="venda-total">R$ 0,00</strong></div><small>Ao registrar, os novos produtos entram automaticamente no catálogo. O pagamento é lançado separadamente.</small><button class="btn-principal" type="submit">Registrar venda</button></form></div></div>
    <div id="modal-receber-suiri" class="modal-overlay oculto" role="dialog" aria-modal="true" aria-labelledby="receber-titulo"><div class="modal-conteudo"><div class="modal-header"><h3 id="receber-titulo">Registrar recebimento</h3><button type="button" class="btn-secundario" data-fechar-suiri="modal-receber-suiri" aria-label="Fechar">×</button></div><p id="receber-resumo"></p><form id="form-receber-suiri" class="suiri-form"><input type="hidden" id="receber-venda"><label>Valor recebido<input id="receber-valor" inputmode="decimal" required></label><label>Data<input id="receber-data" type="date" required></label><label>Forma<select id="receber-forma"><option>Pix</option><option>Dinheiro</option><option>Cartão</option><option>Transferência</option><option>Boleto</option><option>Outro</option></select></label><label>Observação<textarea id="receber-obs" maxlength="1000" rows="2"></textarea></label><small>Permite pagamentos parciais. O saldo será recalculado.</small><button type="submit" class="btn-principal">Confirmar recebimento</button></form></div></div>
    <div id="modal-recuperacao-suiri" class="modal-overlay oculto" role="dialog" aria-modal="true" aria-label="Criar nova senha"><div class="modal-conteudo"><h3>Escolha sua nova senha</h3><form id="form-recuperacao-suiri" class="suiri-form"><label>Nova senha<input id="recuperacao-nova-senha" type="password" minlength="8" autocomplete="new-password" required></label><label>Repita a senha<input id="recuperacao-confirmar" type="password" minlength="8" autocomplete="new-password" required></label><button type="submit" class="btn-principal">Salvar nova senha</button></form></div></div>`);
    suiriEl('tela-app').insertAdjacentHTML('beforeend',`<main id="conteudo-configuracoes" class="oculto"><section class="cartao-geral"><button type="button" class="btn-secundario" onclick="window.alternarTelas('perfil')">Voltar ao perfil</button><h2>Configurações</h2><div class="suiri-ajuste suiri-baixar-apk"><div><strong>Aplicativo Android</strong><p>Suíri Empresa 4.4.2 · APK de teste</p></div><a class="btn-secundario" href="downloads/Suiri-Empresa.apk" download>Baixar APK para Android</a></div><div class="suiri-ajuste"><div><strong>Aparência</strong><p>Escolha o tema que combina com seu dia.</p></div><select id="suiri-tema" aria-label="Tema"><option value="sistema">Como o aparelho</option><option value="claro">Claro</option><option value="escuro">Escuro</option></select></div><label class="suiri-ajuste"><div><strong>Deslizar entre as telas</strong><p>Arraste para a esquerda ou direita fora de campos e listas.</p></div><input type="checkbox" id="suiri-gestos"></label><div class="suiri-ajuste"><div><strong id="ajustes-empresa-nome">Sua empresa</strong><p id="ajustes-empresa-cnpj"></p></div><button type="button" class="btn-secundario" data-suiri-admin onclick="window.abrirModalPerfilEmpresa()">Editar empresa</button></div><button type="button" class="btn-secundario" onclick="fazerLogoff()">Sair da conta</button><div class="suiri-zona-exclusao"><h3>Exclusões definitivas</h3><p>Leia a confirmação com atenção. O último administrador precisa transferir a administração antes de excluir somente sua conta.</p><button type="button" class="btn-erro" data-suiri-acao="excluir-conta">Excluir minha conta</button><div data-suiri-admin><p>Excluir a empresa remove os dados do aplicativo e as contas de todos os membros vinculados.</p><button type="button" class="btn-erro" data-suiri-acao="excluir-empresa">Excluir empresa e todos os acessos</button></div></div><p id="fila-antiga-aviso" class="oculto">Há dados de uma fila offline antiga neste aparelho. Eles foram preservados e não serão enviados automaticamente, pois não registravam o dono da conta.</p></section></main>`);
    suiriEl('conteudo-gestao-compras-contas').insertAdjacentHTML('afterbegin',`<section id="comercial-suiri" class="painel-unificado-bloco"><div class="comercial-cabecalho"><div><h2>Vendas e recebimentos</h2></div><button type="button" class="btn-principal" data-suiri-acao="nova-venda">+ Nova venda</button></div><div class="suiri-kpis"><div><span>A receber</span><strong id="suiri-total-receber">—</strong></div><div><span>Em atraso</span><strong id="suiri-total-atrasado">—</strong></div><div><span>Clientes ativos</span><strong id="suiri-total-clientes">—</strong></div></div><div class="suiri-tabs" role="tablist" aria-label="Gestão comercial"><button type="button" role="tab" data-comercial-tab="receber" aria-selected="true">↗ Contas a receber</button><button type="button" role="tab" data-comercial-tab="contatos" aria-selected="false">♧ Clientes e fornecedores</button></div><p id="comercial-status" role="status"></p><div data-comercial-painel="receber"><div class="suiri-filtros"><label class="sr-only" for="comercial-busca">Buscar vendas</label><input id="comercial-busca" placeholder="Buscar cliente ou produto…"><select id="comercial-situacao" aria-label="Situação"><option value="aberto">Em aberto</option><option value="atrasada">Em atraso</option><option value="paga">Recebidas</option><option value="cancelada">Canceladas</option><option value="todas">Todas</option></select><select id="filtro-comercial-pessoa" aria-label="Cliente"></select></div><details class="suiri-detalhes"><summary>Período e exportação</summary><div class="suiri-filtros"><label>Vendas de<input type="date" id="comercial-inicio"></label><label>Até<input type="date" id="comercial-fim"></label><button type="button" class="btn-secundario" data-suiri-acao="csv">↓ Planilha CSV</button><button type="button" class="btn-secundario" data-suiri-acao="pdf-comercial">▥ Relatório PDF</button></div></details><div id="suiri-vendas-lista"></div></div><div data-comercial-painel="contatos" class="oculto"><div class="suiri-filtros"><select id="contato-filtro" aria-label="Tipo de cadastro"><option value="cliente">Clientes</option><option value="fornecedor">Fornecedores</option></select><input id="contato-busca" placeholder="Buscar nome, documento ou telefone…" aria-label="Buscar contato"><button type="button" class="btn-principal" data-suiri-acao="novo-contato">+ Cadastrar</button></div><div id="suiri-contatos-lista"></div></div></section><div class="suiri-atalhos" aria-label="Seções de Gestão"><button type="button" data-atalho-suiri="comercial">Vendas e recebimentos</button><button type="button" data-atalho-suiri="pagar">Contas a pagar</button><button type="button" data-atalho-suiri="compras">Compras</button><button type="button" data-atalho-suiri="vales" hidden>Vales</button><button type="button" data-atalho-suiri="caixa">Caixa</button><button type="button" data-suiri-catalogo onclick="window.abrirModalGerenciarCardapio()">Cardápio</button></div>`);
    suiriEl('form-lancar-vale')?.addEventListener('submit', event => {
        event.preventDefault();
        window.lancarVale();
    });
    const blocos=suiriEl('conteudo-gestao-compras-contas').querySelectorAll(':scope > .painel-unificado-bloco');
    if(blocos[1])blocos[1].id='suiri-bloco-compras';if(blocos[2])blocos[2].id='suiri-bloco-pagar';
    const atalhos=suiriEl('conteudo-gestao-compras-contas').querySelector('.suiri-atalhos');
    atalhos.before(Object.assign(document.createElement('h2'),{textContent:'Gestão',className:'suiri-gestao-titulo'}));
    atalhos.after(suiriEl('comercial-suiri'));
    suiriEl('input-conta-fornecedor-gestao').setAttribute('list','sugestoes-fornecedores');
    suiriEl('modal-gerenciar-cardapio').querySelector('.modal-conteudo').insertAdjacentHTML('beforeend',`<details class="suiri-importar"><summary>Importar cardápio por texto ou arquivo</summary><p>Uma linha por produto: <b>Suco de uva; 12,50</b>. Você revisa antes de salvar. Máximo: 500 itens por envio.</p><label>Arquivo de texto (.txt ou .csv)<input type="file" id="cardapio-arquivo" accept=".txt,.csv,text/plain,text/csv"></label><label>Texto do cardápio<textarea id="cardapio-texto" rows="6" placeholder="Suco de uva; 12,50&#10;Água mineral; 5,00"></textarea></label><button type="button" class="btn-secundario" data-suiri-acao="preview-cardapio">Revisar texto</button><button type="button" class="btn-secundario" data-suiri-acao="cardapio-original">Carregar cardápio original do Sabor da Costa</button><p id="cardapio-preview" aria-live="polite"></p><label><input id="cardapio-atualizar" type="checkbox"> Atualizar preço dos itens já cadastrados</label><button type="button" class="btn-principal" data-suiri-acao="importar-cardapio" id="btn-importar-cardapio" disabled>Importar itens revisados</button></details>`);
    suiriEl('form-venda-suiri').addEventListener('submit',e=>{e.preventDefault();suiriExecutar(e.submitter,async()=>{
        const itens=suiriObterItens();if(!itens.length)throw new Error('Adicione pelo menos um item.');
        const form=e.currentTarget;form.dataset.operacao ||= suiriUID();
        const contato=suiriEl('venda-cliente').value;if(!contato)throw new Error('Selecione um cliente.');
        await suiriDB(cliente.rpc('suiri_registrar_venda',{p_contato:contato,p_itens:itens,p_data:suiriEl('venda-data').value,p_vencimento:suiriEl('venda-vencimento').value,p_observacao:suiriEl('venda-observacao').value.trim(),p_operacao:form.dataset.operacao}));
        delete form.dataset.operacao;suiriEl('modal-venda-suiri').classList.add('oculto');window.mostrarToast('Venda registrada. O saldo está em contas a receber.');await window.carregarComercialSuiri();await window.inicializarCardapioConsumo();
    });});
    suiriEl('form-contato-suiri').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;suiriExecutar(e.submitter,async()=>{
        const fd=new FormData(form);const dados=Object.fromEntries(fd);const id=dados.id;delete dados.id;dados.nome=dados.nome.trim();
        if (window.suiriCategorias?.disponivel()) {
            dados.categoria_fornecedor = dados.tipo === 'fornecedor' ? dados.categoria_fornecedor || null : null;
        } else delete dados.categoria_fornecedor;
        if(!dados.nome)throw new Error('Informe o nome.');
        if(id) await suiriDB(cliente.from('suiri_contatos').update(dados).eq('id',id));
        else {form.dataset.id ||= suiriUID();await suiriDB(cliente.from('suiri_contatos').upsert([{...dados,id:form.dataset.id}],{onConflict:'id'}));}
        delete form.dataset.id;suiriEl('modal-contato-suiri').classList.add('oculto');await window.carregarComercialSuiri();window.mostrarToast('Cadastro salvo.');
    });});
    suiriEl('form-receber-suiri').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;suiriExecutar(e.submitter,async()=>{
        form.dataset.operacao ||= suiriUID();
        await suiriDB(cliente.rpc('suiri_receber_venda',{p_venda:suiriEl('receber-venda').value,p_valor:window.centavosSuiri(suiriEl('receber-valor').value),p_data:suiriEl('receber-data').value,p_forma:suiriEl('receber-forma').value,p_observacao:suiriEl('receber-obs').value,p_operacao:form.dataset.operacao}));
        delete form.dataset.operacao;suiriEl('modal-receber-suiri').classList.add('oculto');await window.carregarComercialSuiri();window.mostrarToast('Recebimento registrado.');
    });});
    suiriEl('form-recuperacao-suiri').addEventListener('submit',e=>{e.preventDefault();suiriExecutar(e.submitter,async()=>{
        const senha=suiriEl('recuperacao-nova-senha').value;if(senha!==suiriEl('recuperacao-confirmar').value)throw new Error('As senhas não são iguais.');
        const {error}=await cliente.auth.updateUser({password:senha});if(error)throw error;
        suiriEl('modal-recuperacao-suiri').classList.add('oculto');window.mostrarToast('Nova senha salva. Entre com ela no próximo acesso.');
    });});
    suiriEl('suiri-tema').addEventListener('change',e=>window.aplicarTemaSuiri(e.target.value));
    suiriEl('suiri-gestos').addEventListener('change',e=>localStorage.setItem('suiri_gestos',e.target.checked?'sim':'nao'));
    suiriEl('cardapio-arquivo').addEventListener('change',async e=>{
        const f=e.target.files[0];if(!f)return;if(f.size>1024*1024)return suiriErro(new Error('O arquivo deve ter até 1 MB.'));
        suiriEl('cardapio-texto').value=await f.text();suiriPreviewImportacao();
    });
    suiriEl('cardapio-texto').addEventListener('input',()=>{suiriImportacao=[];suiriEl('btn-importar-cardapio').disabled=true;suiriEl('cardapio-preview').textContent='Texto alterado. Revise novamente antes de importar.';});
    for(const id of ['contato-busca','contato-filtro'])suiriEl(id).addEventListener('input',suiriRenderContatos);
    const filtros={'comercial-busca':'busca','comercial-situacao':'filtro','filtro-comercial-pessoa':'pessoa','comercial-inicio':'inicio','comercial-fim':'fim'};
    for(const [id,chave]of Object.entries(filtros))suiriEl(id).addEventListener('input',e=>{suiriEstado[chave]=e.target.value;suiriRenderComercial();});
    suiriEl('venda-itens').addEventListener('input',suiriRecalcularVenda);
    suiriEl('venda-itens').addEventListener('change',e=>{
        if(e.target.name!=='descricao')return;const item=cacheCardapioConsumo.find(i=>i.nome_item.toLowerCase()===e.target.value.trim().toLowerCase());
        if(item)e.target.closest('.venda-item-linha').querySelector('[name="valor"]').value=Number(item.valor_padrao).toFixed(2).replace('.',',');suiriRecalcularVenda();
    });
    // Show own consent dialogs with Escape, restore keyboard focus and contain Tab.
    let focoAnterior=null;
    const observer=new MutationObserver(records=>{for(const rec of records){const el=rec.target;if(!el.id?.startsWith('modal-'))continue;if(!el.classList.contains('oculto') && rec.oldValue?.includes('oculto')){focoAnterior=document.activeElement;el.querySelector('input:not([type="hidden"]),select,button,textarea')?.focus();}}});
    document.querySelectorAll('.modal-overlay').forEach(m=>observer.observe(m,{attributes:true,attributeFilter:['class'],attributeOldValue:true}));
    document.addEventListener('keydown',e=>{
        const modal=[...document.querySelectorAll('.modal-overlay:not(.oculto)')].at(-1);if(!modal)return;
        if(e.key==='Escape' && modal.id!=='modal-recuperacao-suiri'){modal.classList.add('oculto');focoAnterior?.focus();}
        if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button,input,select,textarea,summary,[tabindex="0"]')].filter(n=>!n.disabled && n.offsetParent!==null);const i=nodes.indexOf(document.activeElement);if((e.shiftKey&&i<=0)||(!e.shiftKey&&i===nodes.length-1)){e.preventDefault();nodes[e.shiftKey?nodes.length-1:0]?.focus();}}
    });
    let inicio=null;
    const ignora='input,textarea,select,button,a,summary,canvas,video,dialog,.modal-overlay,.autocomplete-container,#suiri-nav,.suiri-tabs,[draggable="true"]';
    document.addEventListener('touchstart',e=>{
        if(e.touches.length!==1 || e.target.closest(ignora) || localStorage.getItem('suiri_gestos')==='nao' || !perfilAtual || document.querySelector('.modal-overlay:not(.oculto)')){inicio=null;return;}
        let el=e.target;while(el&&el!==document.body){if(el.scrollWidth>el.clientWidth+4 && getComputedStyle(el).overflowX!=='visible'){inicio=null;return;}el=el.parentElement;}
        inicio={x:e.touches[0].clientX,y:e.touches[0].clientY,t:Date.now()};
    },{passive:true});
    document.addEventListener('touchend',e=>{
        if(!inicio||!e.changedTouches.length)return;
        const dx=e.changedTouches[0].clientX-inicio.x,dy=e.changedTouches[0].clientY-inicio.y,dt=Date.now()-inicio.t;inicio=null;
        if(Math.abs(dx)<85||Math.abs(dx)<Math.abs(dy)*1.8||dt>850)return;
        if (suiriTelaAtual === 'configuracoes') return;
        const telas=suiriTelasNoMenu(),i=telas.findIndex(t=>t[0]===suiriTelaAtual),destino=telas[i+(dx<0?1:-1)];
        if(destino)window.alternarTelas(destino[0]);
    },{passive:true});
    document.addEventListener('touchcancel',()=>inicio=null,{passive:true});
}
suiriMontarUI();

document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-tela-suiri]');if(nav)return window.alternarTelas(nav.dataset.telaSuiri);
    const close=e.target.closest('[data-fechar-suiri]');if(close){suiriEl(close.dataset.fecharSuiri).classList.add('oculto');return;}
    const tab=e.target.closest('[data-comercial-tab]');if(tab)return suiriTab(tab.dataset.comercialTab);
    const atalho=e.target.closest('[data-atalho-suiri]');if(atalho)return suiriMostrarBlocoGestao(atalho.dataset.atalhoSuiri);
    const btn=e.target.closest('[data-suiri-acao]');if(!btn)return;
    suiriExecutar(btn,async()=>{
        const acao=btn.dataset.suiriAcao,id=btn.dataset.id;
        if(acao==='nova-venda'){
            if(!suiriEstado.contatos.some(c=>c.tipo==='cliente'&&c.ativo)){suiriTab('contatos');suiriAbrirContato();window.mostrarToast('Cadastre um cliente para registrar a venda.','info');return;}
            suiriEl('form-venda-suiri').reset();delete suiriEl('form-venda-suiri').dataset.operacao;suiriEl('venda-data').value=suiriEl('venda-vencimento').value=window.dataLocal();suiriEl('venda-itens').innerHTML='';window.adicionarLinhaVendaSuiri();suiriRecalcularVenda();suiriEl('modal-venda-suiri').classList.remove('oculto');
        }else if(acao==='novo-contato')suiriAbrirContato();
        else if(acao==='editar-contato')suiriAbrirContato(id);
        else if(acao==='arquivar-contato'){
            const c=suiriEstado.contatos.find(c=>String(c.id)===String(id));if(!confirm(`${c.ativo?'Arquivar':'Reativar'} ${c.nome}? Seu histórico será preservado.`))return;
            await suiriDB(cliente.from('suiri_contatos').update({ativo:!c.ativo}).eq('id',id));await window.carregarComercialSuiri();
        }else if(acao==='historico'){
            suiriEstado.pessoa=id;suiriEstado.filtro='todas';suiriEstado.busca='';suiriEstado.inicio='';suiriEstado.fim='';
            suiriEl('comercial-situacao').value='todas';for(const campo of ['comercial-inicio','comercial-fim','comercial-busca'])suiriEl(campo).value='';suiriTab('receber');suiriRenderComercial();
        }else if(acao==='adicionar-linha')window.adicionarLinhaVendaSuiri();
        else if(acao==='remover-linha'){btn.closest('.venda-item-linha').remove();suiriRecalcularVenda();}
        else if(acao==='receber'){
            const v=suiriEstado.vendas.find(v=>String(v.id)===String(id));const f=suiriEl('form-receber-suiri');f.reset();delete f.dataset.operacao;
            suiriEl('receber-venda').value=id;suiriEl('receber-valor').value=(suiriSaldo(v)/100).toFixed(2).replace('.',',');suiriEl('receber-data').value=window.dataLocal();suiriEl('receber-resumo').textContent='Saldo desta venda: '+suiriMoeda(suiriSaldo(v));suiriEl('modal-receber-suiri').classList.remove('oculto');
        }else if(acao==='estornar'||acao==='cancelar-venda'){
            const motivo=prompt(acao==='estornar'?'Motivo do estorno (preserva o histórico):':'Motivo do cancelamento da venda:');if(!motivo?.trim())return;
            await suiriDB(cliente.rpc(acao==='estornar'?'suiri_estornar_recebimento':'suiri_cancelar_venda',{p_id:id,p_motivo:motivo.trim()}));await window.carregarComercialSuiri();
        }else if(acao==='csv')await suiriExportarCSV();
        else if(acao==='pdf-comercial')await suiriPDFComercial();
        else if(acao==='excluir-conta')await window.excluirContaSuiri(false);
        else if(acao==='excluir-empresa')await window.excluirContaSuiri(true);
        else if(acao==='preview-cardapio')suiriPreviewImportacao();
        else if(acao==='cardapio-original'){
            suiriEl('cardapio-texto').value=(window.cardapioOriginalSaborDaCosta||[]).map(i=>`${i.nome_item}; ${Number(i.valor_padrao).toFixed(2).replace('.',',')}`).join('\n');suiriPreviewImportacao();
        }else if(acao==='importar-cardapio'){
            if(!suiriImportacao.length || suiriImportacao.length>500)throw new Error('Revise o texto e envie entre 1 e 500 itens.');
            await suiriDB(cliente.rpc('suiri_importar_cardapio',{p_itens:suiriImportacao,p_atualizar:suiriEl('cardapio-atualizar').checked}));
            await window.inicializarCardapioConsumo();window.renderizarListaCardapioGerenciar();window.mostrarToast('Cardápio importado.');suiriImportacao=[];suiriEl('btn-importar-cardapio').disabled=true;
        }
    });
});
async function suiriPDFComercial() {
    if(typeof html2pdf==='undefined')throw new Error('O gerador de PDF não carregou. Confira sua conexão.');
    const vendas=suiriVendasFiltradas();
    const el=document.createElement('div');el.className='suiri-pdf';
    el.innerHTML=`<h1>${esc(dadosEmpresaAtual?.nome_fantasia || 'Suiri')}</h1><p>CNPJ: ${esc(dadosEmpresaAtual?.cnpj || '')}</p><h2>Contas a receber</h2><p>Emissão: ${suiriData(window.dataLocal())}. Filtros: ${esc(suiriEstado.filtro)} · vendas de ${suiriData(suiriEstado.inicio)} até ${suiriData(suiriEstado.fim)}.</p>${vendas.length?vendas.map(v=>`<section><h3>${esc(suiriEstado.contatos.find(c=>String(c.id)===String(v.contato_id))?.nome || 'Cliente')}</h3><p>Venda: ${suiriData(v.data_venda)} | Vencimento: ${suiriData(v.vencimento)} | ${esc(suiriStatusVenda(v))}</p><p>Total: ${suiriMoeda(v.total_centavos)} | Saldo: ${suiriMoeda(v.cancelada_em?0:suiriSaldo(v))}</p><p>${(v.itens||[]).map(i=>`${esc(i.quantidade)} × ${esc(i.descricao)} (${suiriMoeda(i.valor_centavos)})`).join(' · ')}</p><p>${esc(v.observacao || '')}</p></section>`).join(''):'<p>Nenhuma venda corresponde aos filtros.</p>'}`;
    const nome = 'suiri-receber-' + window.dataLocal() + '.pdf';
    const pdf = html2pdf().set({margin:12,filename:nome,html2canvas:{scale:2},jsPDF:{unit:'mm',format:'a4'},pagebreak:{mode:['css','legacy']}}).from(el);
    if (window.suiriAndroid?.salvarArquivo) {
        if (!await window.suiriAndroid.salvarArquivo(await pdf.outputPdf('blob'), nome, 'application/pdf')) {
            throw new Error('O Android não conseguiu salvar o PDF.');
        }
        window.mostrarToast('PDF salvo.');
    } else {
        await pdf.save();
    }
}

async function suiriLimparArquivos(usuario,todaEmpresa) {
    const arquivos=await suiriDB(cliente.rpc('suiri_arquivos_exclusao',{p_usuario:usuario,p_toda_empresa:todaEmpresa}));
    for(let i=0;i<(arquivos||[]).length;i+=50){
        const lote=arquivos.slice(i,i+50); const {error}=await cliente.storage.from('sistema-imagens').remove(lote.map(f=>f.nome));
        if(error)throw new Error('Não foi possível remover as fotos: '+error.message+'. A conta ainda não foi excluída.');
    }
}

let suiriInstalacao=null;
window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();suiriInstalacao=e;
    if(sessionStorage.getItem('suiri_instalar_depois')!=='sim')suiriEl('pwa-install-card')?.classList.remove('oculto');
});
window.addEventListener('appinstalled',()=>{suiriInstalacao=null;suiriEl('pwa-install-card')?.classList.add('oculto');});
suiriEl('btn-pwa-cancelar')?.addEventListener('click',()=>{sessionStorage.setItem('suiri_instalar_depois','sim');suiriEl('pwa-install-card').classList.add('oculto');});
suiriEl('btn-pwa-instalar')?.addEventListener('click',e=>suiriExecutar(e.currentTarget,async()=>{
    if(!suiriInstalacao)return;await suiriInstalacao.prompt();await suiriInstalacao.userChoice;suiriInstalacao=null;suiriEl('pwa-install-card').classList.add('oculto');
}));
