// ==========================================
// SUPAY / SUIRI - APP-CORE.JS (Lógica Base & Suiri 2.0)
// ==========================================

// CREDENCIAIS SUPABASE
const SUPABASE_URL = 'https://xmtgkqecouemctfzstvg.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_0onO7SyfD4FyVlvatG4WOA_8AtNGw-m'; 

// Cria o cliente diretamente no escopo global com persistência ativa
var cliente = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
}) : null;

// Função utilitária de escape contra XSS
var esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

window.dataLocal = function(d = new Date()) {
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
};
window.dataInstanteLocal = function(valor) { return valor ? window.dataLocal(new Date(valor)) : ''; };
window.atributoJS = value => esc(JSON.stringify(String(value ?? '')));

// ÁUDIO NATIVO (Sons de clique, conclusão e alertas via Web Audio API)
const audioCtx = (window.AudioContext || window.webkitAudioContext) ? new (window.AudioContext || window.webkitAudioContext)() : null;

window.somIniciarTarefa = function() {
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.08);
    } catch(e) {}
};

window.somConcluirTarefa = function() {
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const notas = [523.25, 659.25, 783.99, 1046.50];
        notas.forEach((freq, i) => {
            const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
            const inicio = audioCtx.currentTime + (i * 0.07);
            osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, inicio);
            gain.gain.setValueAtTime(0.25, inicio); gain.gain.exponentialRampToValueAtTime(0.001, inicio + 0.35);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(inicio); osc.stop(inicio + 0.35);
        });
    } catch(e) {}
};

window.somErro = function() {
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.25);
    } catch(e) {}
};

window.somPop = function() {
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.05);
    } catch(e) {}
};

// VARIÁVEIS GLOBAIS DE DADOS
let usuarioAtual = null;
let perfilAtual = null;
let registroPontoAtual = null;
let dadosEmpresaAtual = null;
let empresaAtualId = null;
let mapaNomes = {}; 
let mapaPerfis = {};
let cacheTarefas = []; 
let cacheAvisos = []; 
let modoCadastro = false;
let dadosPreCadastroTemporario = null;

// Variáveis para a ferramenta de corte de imagem (Crop 150x150)
let imagemCropObj = null;
let cropZoom = 1.0;

// =========================================================================
// FILA DE SINCRONIZAÇÃO OFFLINE
// =========================================================================
const CHAVE_STORAGE_OFFLINE = 'suiri_offline_queue_v2';

window.obterFilaOffline = function() {
    try {
        const raw = localStorage.getItem(CHAVE_STORAGE_OFFLINE);
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
};

window.salvarFilaOffline = function(fila) {
    try {
        localStorage.setItem(CHAVE_STORAGE_OFFLINE, JSON.stringify(fila));
        window.atualizarIndicadorOffline();
    } catch (e) {}
};

window.adicionarFilaOffline = function(tipo, payload) {
    const fila = window.obterFilaOffline();
    fila.push({
        idLocal: 'off_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        tipo: tipo,
        payload: payload,
        timestamp: new Date().toISOString()
    });
    window.salvarFilaOffline(fila);
    window.mostrarToast("Sem conexão. Ação salva no celular e enviada ao reconectar!", "info");
};

window.atualizarIndicadorOffline = function() {
    const banner = document.getElementById('banner-offline-status');
    const texto = document.getElementById('texto-offline-status');
    const fila = window.obterFilaOffline();
    const online = navigator.onLine;

    if (!banner) return;
    if (!online || fila.length > 0) {
        banner.classList.remove('oculto');
        if (!online) {
            if (texto) texto.textContent = fila.length > 0 
                ? `Offline: ${fila.length} ação(ões) pendente(s) de envio` 
                : 'Sem conexão com a internet';
        } else {
            if (texto) texto.textContent = `Sincronizando ${fila.length} alteração(ões) pendente(s)...`;
        }
    } else {
        banner.classList.add('oculto');
    }
};

window.processarFilaOffline = async function() {
    if (!navigator.onLine || !cliente) return;
    const fila = window.obterFilaOffline();
    if (fila.length === 0) return;

    const filaRestante = [];
    let enviadasComSucesso = 0;

    for (const item of fila) {
        try {
            let error = null;
            if (item.tipo === 'ponto') ({ error } = await cliente.from('livro_ponto').upsert([item.payload]));
            else if (item.tipo === 'tarefa_update') ({ error } = await cliente.from('tarefas').update(item.payload.dados).eq('id', item.payload.id));
            else if (item.tipo === 'tarefa_insert') ({ error } = await cliente.from('tarefas').insert([item.payload]));
            else if (item.tipo === 'consumo_insert') ({ error } = await cliente.from('itens_comprados').insert([item.payload]));
            else if (item.tipo === 'vale_insert') ({ error } = await cliente.from('vales').insert([item.payload]));
            else if (item.tipo === 'aviso_leitura') ({ error } = await cliente.from('avisos').update({ lidos_por: item.payload.lidos_por }).eq('id', item.payload.id));
            else if (item.tipo === 'fechamento_caixa_insert') ({ error } = await cliente.from('fechamento_caixa').insert([item.payload]));

            if (error) filaRestante.push(item);
            else enviadasComSucesso++;
        } catch (err) {
            filaRestante.push(item);
        }
    }

    window.salvarFilaOffline(filaRestante);
    if (enviadasComSucesso > 0) {
        window.mostrarToast(`Sincronização concluída! (${enviadasComSucesso} ações enviadas)`);
        if (typeof window.carregarTarefas === 'function') window.carregarTarefas();
        if (typeof window.carregarStatusPonto === 'function') window.carregarStatusPonto();
        if (typeof window.carregarPainelAoVivo === 'function') window.carregarPainelAoVivo();
        if (typeof window.carregarFechamentoCaixaAtual === 'function') window.carregarFechamentoCaixaAtual();
    }
};

window.executarOuOffline = async function(tipo, payload, funcaoOnline) {
    if (!navigator.onLine) {
        window.adicionarFilaOffline(tipo, payload);
        return { offline: true };
    }
    try {
        const res = await funcaoOnline();
        if (res && res.error) {
            window.adicionarFilaOffline(tipo, payload);
            return { offline: true, error: res.error };
        }
        return res || { success: true };
    } catch (e) {
        window.adicionarFilaOffline(tipo, payload);
        return { offline: true };
    }
};

window.addEventListener('online', () => { window.atualizarIndicadorOffline(); window.processarFilaOffline(); });
window.addEventListener('offline', () => { window.atualizarIndicadorOffline(); });

// =========================================================================
// ATUALIZAÇÃO GERAL E NOTIFICAÇÕES (TOAST)
// =========================================================================
window.atualizarDadosGeral = async function() {
    if (typeof window.somPop === 'function') window.somPop();
    window.mostrarToast("Atualizando dados do sistema...", "info");

    const promessas = [];
    if (window.atualizarConsumoSuiri) promessas.push(window.atualizarConsumoSuiri(true));
    if (typeof window.carregarDadosEmpresa === 'function') promessas.push(window.carregarDadosEmpresa());
    if (typeof window.carregarTarefas === 'function') promessas.push(window.carregarTarefas());
    if (typeof window.carregarAvisos === 'function') promessas.push(window.carregarAvisos());
    if (typeof window.carregarStatusPonto === 'function') promessas.push(window.carregarStatusPonto());
    if (typeof window.carregarPedidosCompra === 'function') promessas.push(window.carregarPedidosCompra());
    if (typeof window.carregarItensComprasModal === 'function') promessas.push(window.carregarItensComprasModal());
    if (typeof window.carregarContasPagar === 'function') promessas.push(window.carregarContasPagar());
    if (typeof window.carregarFechamentoCaixaAtual === 'function') promessas.push(window.carregarFechamentoCaixaAtual());
    if (typeof window.carregarPainelAoVivo === 'function') promessas.push(window.carregarPainelAoVivo());
    if (typeof window.renderizarPainelPerfilCompleto === 'function') promessas.push(window.renderizarPainelPerfilCompleto());

    try {
        await Promise.all(promessas);
        window.processarFilaOffline();
        window.mostrarToast("Dados sincronizados com sucesso!");
    } catch (e) {
        window.mostrarToast("Atualização concluída com avisos.", "info");
    }
};

window.mostrarToast = function(mensagem, tipo = 'sucesso') {
    if (tipo === 'erro') window.somErro();
    else if (tipo === 'info') window.somPop();

    let container = document.getElementById('toast-container');
    if(!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-msg toast-${tipo}`;
    toast.innerHTML = `<span>${esc(mensagem)}</span><span style="cursor:pointer; margin-left:10px; opacity:0.8;" onclick="this.parentElement.remove()">✕</span>`;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 3500);
};

window.toggleBloco = function(id) {
    window.somPop();
    const el = document.getElementById(id);
    if (el) el.classList.toggle('oculto');
};

window.toggleFormDelegar = function() {
    window.somPop();
    const form = document.getElementById('form-nova-tarefa');
    const btn = document.getElementById('btn-toggle-form-tarefa');
    if (!form || !btn) return;
    form.classList.toggle('oculto');
    const aberto = !form.classList.contains('oculto');
    btn.textContent = aberto ? '✕ Fechar' : '+ Delegar';
    btn.classList.toggle('btn-toggle-aberto', aberto);
};

window.toggleFormAviso = function() {
    window.somPop();
    const form = document.getElementById('form-novo-aviso');
    const btn = document.getElementById('btn-toggle-form-aviso');
    if (!form || !btn) return;
    form.classList.toggle('oculto');
    const aberto = !form.classList.contains('oculto');
    btn.textContent = aberto ? '✕ Fechar' : '+ Publicar';
    btn.classList.toggle('btn-toggle-aberto', aberto);
};

window.toggleSanfonaPerfil = function(idCorpo, btnEl) {
    window.somPop();
    const corpo = document.getElementById(idCorpo);
    if (corpo) {
        corpo.classList.toggle('oculto');
        const seta = btnEl.querySelector('span.icone-expandir') || btnEl.querySelector('span:last-child');
        if (seta) seta.textContent = corpo.classList.contains('oculto') ? '+' : '−';
    }
};

window.toggleCategoriaTarefas = function(idLista, cabecalhoEl) {
    window.somPop();
    const lista = document.getElementById(idLista);
    if (lista) {
        lista.classList.toggle('oculto');
        const btnExp = cabecalhoEl.querySelector('.btn-expandir-cat');
        if (btnExp) btnExp.textContent = lista.classList.contains('oculto') ? '+' : '−';
    }
};

// ------------------ FINANÇAS E VALES ------------------
window.calcularValorFinalItem = function() {
    const unit = parseFloat(document.getElementById('input-val-unit')?.value) || 0;
    const desc = parseFloat(document.getElementById('input-desc-pct')?.value) || 0;
    const final = unit - (unit * (desc / 100));
    const finalEl = document.getElementById('input-val-final');
    if (finalEl) finalEl.value = final.toFixed(2);
};

window.ehSocioOuAdmin = function(id) {
    return !!(mapaPerfis[id] && (mapaPerfis[id].is_socio || mapaPerfis[id].is_admin));
};

window.ajustarTextoValePorSocio = function(funcId) {
    const btn = document.getElementById('btn-submit-vale');
    if (btn) btn.textContent = window.ehSocioOuAdmin(funcId)
        ? 'Registrar adiantamento de pró-labore'
        : 'Registrar vale';
};

window.abrirLancamentoValeColaborador = function(funcId) {
    if (!window.podeSuiri?.('financeiro')) return;
    window.alternarTelas('gestao', 'vales');
    const selecao = document.getElementById('select-func-vale');
    if (!selecao) return;
    if (funcId) {
        selecao.value = funcId;
        window.ajustarTextoValePorSocio(selecao.value);
    }
    document.getElementById(selecao.value ? 'input-valor-vale' : 'select-func-vale')?.focus();
};

window.lancarVale = async function() {
    if (!usuarioAtual || !empresaAtualId || !window.podeSuiri?.('financeiro')) {
        return window.mostrarToast('Sua conta não tem permissão para registrar vales.', 'erro');
    }
    const status = document.getElementById('vale-status');
    const form = document.getElementById('form-lancar-vale');
    const btn = document.getElementById('btn-submit-vale');
    const funcId = document.getElementById('select-func-vale').value;
    const campoValor = document.getElementById('input-valor-vale');
    const campoData = document.getElementById('input-data-vale');
    if (btn.disabled) return;
    status.textContent = '';

    if (!Object.hasOwn(mapaPerfis, funcId)) {
        status.textContent = 'Selecione um funcionário da empresa.';
        document.getElementById('select-func-vale').focus();
        return;
    }

    let centavos;
    try {
        centavos = window.centavosSuiri(campoValor.value);
        if (centavos <= 0) throw new Error('Informe um valor maior que zero.');
    } catch (error) {
        status.textContent = error.message;
        campoValor.focus();
        return;
    }

    const dataVale = campoData.value || window.dataLocal();
    const obs = document.getElementById('input-obs-vale').value.trim();
    const empresa = empresaAtualId;
    const autor = usuarioAtual.id;
    const nome = mapaPerfis[funcId].nome || 'funcionário selecionado';
    const payload = {
        perfil_id: funcId, empresa_id: empresa, valor: centavos / 100,
        data_vale: dataVale, observacao: obs || null, criado_por: autor, pago: false
    };

    btn.disabled = true;
    form.setAttribute('aria-busy', 'true');
    try {
        const res = await window.executarOuOffline('vale_insert', payload, () => cliente.from('vales').insert([payload]));
        if (usuarioAtual?.id !== autor || empresaAtualId !== empresa) return;
        if (res?.error) {
            status.textContent = 'Não foi possível registrar o vale: ' + res.error.message;
            return;
        }

        status.textContent = res?.offline
            ? 'Vale salvo neste aparelho. Será lançado na conta quando sincronizar.'
            : 'Vale registrado na conta de ' + nome + '.';
        form.reset();
        campoData.value = window.dataLocal();
        window.ajustarTextoValePorSocio('');

        if (res?.offline) return;
        if (funcId === autor) window.renderizarPainelPerfilCompleto?.();
        const selInspecao = document.getElementById('select-inspecionar-colab');
        if (selInspecao?.value === funcId) window.inspecionarColaborador(funcId);
    } catch (error) {
        if (usuarioAtual?.id === autor && empresaAtualId === empresa) {
            status.textContent = 'Não foi possível registrar o vale: ' + error.message;
        }
    } finally {
        btn.disabled = false;
        form.removeAttribute('aria-busy');
    }
};

window.lancarItemComprado = async function() {
    const funcId = document.getElementById('select-func-compra')?.value || usuarioAtual.id;
    const descItem = document.getElementById('input-desc-item')?.value.trim();
    const unit = parseFloat(document.getElementById('input-val-unit')?.value);
    const desc = parseFloat(document.getElementById('input-desc-pct')?.value) || 0;
    const final = parseFloat(document.getElementById('input-val-final')?.value);
    const dataCompra = document.getElementById('input-data-compra')?.value || window.dataLocal();

    if(!descItem || isNaN(unit)) return window.mostrarToast("Preencha a descrição e o valor do item.", "erro");

    const payload = {
        perfil_id: funcId, empresa_id: empresaAtualId, descricao_item: descItem, valor_unitario: unit, porcentagem_desconto: desc, valor_final: final, data_compra: dataCompra, registrado_por: usuarioAtual.id
    };

    const res = await window.executarOuOffline('consumo_insert', payload, () => cliente.from('itens_comprados').insert([payload]));

    if (res && res.error) {
        window.mostrarToast("Erro ao registrar: " + res.error.message, "erro");
    } else {
        window.mostrarToast(res.offline ? "Item salvo offline!" : "Item registrado!");
        document.getElementById('input-desc-item').value = '';
        document.getElementById('input-val-unit').value = '';
        document.getElementById('input-val-final').value = '';
        document.getElementById('select-func-compra').value = '';
        if (typeof window.renderizarPainelPerfilCompleto === 'function') window.renderizarPainelPerfilCompleto();
        const selInspecao = document.getElementById('select-inspecionar-colab');
        if (selInspecao && selInspecao.value === funcId) {
            window.inspecionarColaborador(funcId);
        }
    }
};

window.quitarValesColaborador = async function(colabId) {
    if(!confirm("Confirmar quitação de folha? Todos os vales em aberto deste colaborador serão encerrados.")) return;
    const dataFechamento = new Date().toISOString();
    const { error } = await cliente.from('vales').update({ pago: true, data_pagamento: dataFechamento }).eq('perfil_id', colabId).or('pago.is.null,pago.eq.false');
    if (error) window.mostrarToast("Erro ao quitar: " + error.message, "erro");
    else { 
        window.mostrarToast("Folha quitada com sucesso!"); 
        if (typeof window.renderizarPainelPerfilCompleto === 'function') window.renderizarPainelPerfilCompleto();
        if (typeof window.inspecionarColaborador === 'function') window.inspecionarColaborador(colabId);
    }
};

// ------------------ MODAL DE TAREFA AUTÔNOMA ------------------
window.abrirModalTarefaAutonoma = function() {
    if (typeof window.somPop === 'function') window.somPop();
    const inTitulo = document.getElementById('input-autonoma-titulo');
    const inObs = document.getElementById('input-autonoma-obs');
    const contSub = document.getElementById('container-campos-subitens-autonoma');
    
    if (inTitulo) inTitulo.value = '';
    if (inObs) inObs.value = '';
    if (contSub) contSub.innerHTML = '';

    document.getElementById('modal-tarefa-autonoma')?.classList.remove('oculto');
};

window.fecharModalTarefaAutonoma = function() {
    document.getElementById('modal-tarefa-autonoma')?.classList.add('oculto');
};

// =========================================================================
// GESTÃO DE PÁGINA INICIAL PERMANENTE (HOME CADEADO)
// =========================================================================
window.obterTelaHomeTravada = function() {
    if (!usuarioAtual) return 'operacao';
    try {
        return localStorage.getItem(`suiri_home_page_${usuarioAtual.id}`) || 'operacao';
    } catch (e) { return 'operacao'; }
};

window.atualizarVisualCadeadosHome = function(telaAtiva) {
    const podeTravar = perfilAtual?.is_admin || perfilAtual?.is_socio || perfilAtual?.is_gerente;
    const telaHomeAtual = window.obterTelaHomeTravada();

    document.querySelectorAll('.btn-travar-home').forEach(btn => {
        if (!podeTravar) {
            btn.classList.add('oculto');
            return;
        }

        btn.classList.remove('oculto');
        const telaDoBtn = btn.dataset.tela;

        if (telaDoBtn === telaHomeAtual) {
            btn.classList.add('travado');
            btn.classList.remove('destravado');
            btn.textContent = '🔒';
            btn.title = 'Esta é sua Página Inicial permanente (Toque para destravar)';
        } else {
            btn.classList.remove('travado');
            btn.classList.add('destravado');
            btn.textContent = '🔓';
            btn.title = 'Definir como sua Página Inicial permanente';
        }
    });
};

window.alternarTravamentoHome = function(nomeTela) {
    if (typeof window.somPop === 'function') window.somPop();
    if (!usuarioAtual) return;

    const telaHomeAtual = window.obterTelaHomeTravada();
    let novaHome = nomeTela;

    if (telaHomeAtual === nomeTela) {
        novaHome = 'operacao';
        window.mostrarToast("Página inicial destravada! Padrão: Operação.");
    } else {
        window.mostrarToast(`Página inicial travada em: ${nomeTela.toUpperCase()}!`);
    }

    try {
        localStorage.setItem(`suiri_home_page_${usuarioAtual.id}`, novaHome);
    } catch (e) {}

    window.atualizarVisualCadeadosHome(nomeTela);
};

// ------------------ CONTROLE DE TELAS (BLINDADO) ------------------
window.abrirPainelPerfil = function() {
    window.somPop();
    const cabecalho = document.getElementById('cabecalho-topo-usuario');
    const cOp = document.getElementById('conteudo-operacional');
    const cRel = document.getElementById('conteudo-relatorios');
    const cAoVivo = document.getElementById('conteudo-painel-ao-vivo');
    const cAdmin = document.getElementById('conteudo-admin');
    const cPerfil = document.getElementById('conteudo-perfil');
    const cGestao = document.getElementById('conteudo-gestao-compras-contas');
    
    cabecalho?.classList.add('oculto');
    cOp?.classList.add('oculto');
    cRel?.classList.add('oculto');
    cAoVivo?.classList.add('oculto');
    cAdmin?.classList.add('oculto');
    cGestao?.classList.add('oculto');
    cPerfil?.classList.remove('oculto');
    
    document.getElementById('btn-tela-operacao')?.classList.remove('oculto');
    document.getElementById('btn-tela-gestao')?.classList.add('oculto');
    document.getElementById('btn-tela-relatorios')?.classList.add('oculto');
    document.getElementById('btn-tela-admin')?.classList.add('oculto');
    document.getElementById('btn-tela-painel')?.classList.add('oculto');
    document.getElementById('btn-tela-perfil')?.classList.add('oculto');
    document.getElementById('btn-tarefa-autonoma')?.classList.add('oculto');

    const nomeEl = document.getElementById('perfil-pagina-nome');
    if (nomeEl) nomeEl.textContent = perfilAtual?.nome || 'Funcionário';
    
    const inMeuWhats = document.getElementById('input-meu-whatsapp');
    if (inMeuWhats) inMeuWhats.value = perfilAtual?.telefone_whatsapp || '';

    window.atualizarVisualCadeadosHome('perfil');
    if (typeof window.renderizarPainelPerfilCompleto === 'function') {
        window.renderizarPainelPerfilCompleto();
    }
};

window.abrirPainelAoVivo = function() {
    window.somPop();
    const cabecalho = document.getElementById('cabecalho-topo-usuario');
    const cOp = document.getElementById('conteudo-operacional');
    const cRel = document.getElementById('conteudo-relatorios');
    const cPerfil = document.getElementById('conteudo-perfil');
    const cAdmin = document.getElementById('conteudo-admin');
    const cAoVivo = document.getElementById('conteudo-painel-ao-vivo');
    const cGestao = document.getElementById('conteudo-gestao-compras-contas');

    cabecalho?.classList.add('oculto');
    cOp?.classList.add('oculto');
    cRel?.classList.add('oculto');
    cPerfil?.classList.add('oculto');
    cAdmin?.classList.add('oculto');
    cGestao?.classList.add('oculto');
    cAoVivo?.classList.remove('oculto');
    
    document.getElementById('btn-tela-operacao')?.classList.remove('oculto');
    document.getElementById('btn-tela-gestao')?.classList.add('oculto');
    document.getElementById('btn-tela-relatorios')?.classList.add('oculto');
    document.getElementById('btn-tela-admin')?.classList.add('oculto');
    document.getElementById('btn-tela-painel')?.classList.add('oculto');
    document.getElementById('btn-tela-perfil')?.classList.remove('oculto');
    document.getElementById('btn-tarefa-autonoma')?.classList.add('oculto');

    window.atualizarVisualCadeadosHome('painel');
    if(typeof window.carregarPainelAoVivo === 'function') window.carregarPainelAoVivo();
};

window.fecharPainelPerfil = function() {
    window.somPop();
    const cPerfil = document.getElementById('conteudo-perfil');
    const cAoVivo = document.getElementById('conteudo-painel-ao-vivo');
    const cRel = document.getElementById('conteudo-relatorios');
    const cAdmin = document.getElementById('conteudo-admin');
    const cGestao = document.getElementById('conteudo-gestao-compras-contas');
    const cabecalho = document.getElementById('cabecalho-topo-usuario');
    const cOp = document.getElementById('conteudo-operacional');

    cPerfil?.classList.add('oculto');
    cAoVivo?.classList.add('oculto');
    cRel?.classList.add('oculto');
    cAdmin?.classList.add('oculto');
    cGestao?.classList.add('oculto');
    cabecalho?.classList.remove('oculto');
    cOp?.classList.remove('oculto');

    document.getElementById('btn-tela-operacao')?.classList.add('oculto');
    document.getElementById('btn-tela-perfil')?.classList.remove('oculto');

    const isAdmin = !!perfilAtual?.is_admin;
    const isSocio = !!perfilAtual?.is_socio;
    const isGerente = !!perfilAtual?.is_gerente;

    const permissoes = isAdmin 
        ? ['tarefas', 'avisos', 'compras', 'relatorios', 'ponto', 'financeiro', 'inspecao', 'setores', 'contas', 'fechar_caixa', 'gestao'] 
        : (isSocio ? (perfilAtual?.permissoes_socio || []) 
        : (isGerente ? (perfilAtual?.permissoes_gerente || []) : []));

    const podeVerGestao = isAdmin || permissoes.includes('gestao') || permissoes.includes('compras') || permissoes.includes('contas') || permissoes.includes('financeiro') || permissoes.includes('fechar_caixa') || !!perfilAtual?.pode_fechar_caixa;
    const podeVerRelatorios = isAdmin || permissoes.includes('relatorios');
    const podeVerPainel = isAdmin || isSocio || permissoes.includes('inspecao');

    if (podeVerGestao) document.getElementById('btn-tela-gestao')?.classList.remove('oculto');
    else document.getElementById('btn-tela-gestao')?.classList.add('oculto');

    if (podeVerRelatorios) document.getElementById('btn-tela-relatorios')?.classList.remove('oculto');
    else document.getElementById('btn-tela-relatorios')?.classList.add('oculto');

    if (podeVerPainel) document.getElementById('btn-tela-painel')?.classList.remove('oculto');
    else document.getElementById('btn-tela-painel')?.classList.add('oculto');

    const ehStaffSimples = !isAdmin && !isSocio && !isGerente && !podeVerGestao && !podeVerRelatorios;
    document.getElementById('btn-tarefa-autonoma')?.classList.toggle('oculto', !ehStaffSimples);
    
    if (isAdmin || isSocio) {
        document.getElementById('btn-tela-admin')?.classList.remove('oculto');
    }

    window.atualizarVisualCadeadosHome('operacao');
};

window.fecharPainelAoVivo = function() { 
    window.fecharPainelPerfil(); 
};

window.alternarTelas = function(tela) {
    if (typeof window.somPop === 'function') window.somPop();

    const op = document.getElementById('conteudo-operacional');
    const rel = document.getElementById('conteudo-relatorios');
    const perfil = document.getElementById('conteudo-perfil');
    const aoVivo = document.getElementById('conteudo-painel-ao-vivo');
    const admin = document.getElementById('conteudo-admin');
    const gestao = document.getElementById('conteudo-gestao-compras-contas');
    const cabecalho = document.getElementById('cabecalho-topo-usuario');
    
    const btnOp = document.getElementById('btn-tela-operacao');
    const btnGestao = document.getElementById('btn-tela-gestao');
    const btnRel = document.getElementById('btn-tela-relatorios');
    const btnPainel = document.getElementById('btn-tela-painel');
    const btnAdmin = document.getElementById('btn-tela-admin');
    const btnPerfil = document.getElementById('btn-tela-perfil');
    const btnAutonoma = document.getElementById('btn-tarefa-autonoma');

    op?.classList.add('oculto');
    rel?.classList.add('oculto');
    perfil?.classList.add('oculto');
    aoVivo?.classList.add('oculto');
    admin?.classList.add('oculto');
    gestao?.classList.add('oculto');

    const isAdmin = !!perfilAtual?.is_admin;
    const isSocio = !!perfilAtual?.is_socio;
    const isGerente = !!perfilAtual?.is_gerente;

    const permissoes = isAdmin 
        ? ['tarefas', 'avisos', 'compras', 'relatorios', 'ponto', 'financeiro', 'inspecao', 'setores', 'contas', 'fechar_caixa', 'gestao'] 
        : (isSocio ? (perfilAtual?.permissoes_socio || []) 
        : (isGerente ? (perfilAtual?.permissoes_gerente || []) : []));

    const podeVerGestao = isAdmin || permissoes.includes('gestao') || permissoes.includes('compras') || permissoes.includes('contas') || permissoes.includes('financeiro') || permissoes.includes('fechar_caixa') || !!perfilAtual?.pode_fechar_caixa;
    const podeVerRelatorios = isAdmin || permissoes.includes('relatorios');
    const podeVerPainel = isAdmin || isSocio || permissoes.includes('inspecao');

    if (tela === 'gestao') {
        if (!podeVerGestao) {
            window.mostrarToast("Você não possui permissão para acessar o quadro de Gestão.", "erro");
            return window.alternarTelas('operacao');
        }

        cabecalho?.classList.add('oculto');
        gestao?.classList.remove('oculto');

        btnOp?.classList.remove('oculto');
        btnGestao?.classList.add('oculto');
        btnRel?.classList.add('oculto');
        btnPainel?.classList.add('oculto');
        btnAdmin?.classList.add('oculto');
        btnPerfil?.classList.remove('oculto');
        btnAutonoma?.classList.add('oculto');

        if (typeof window.carregarItensComprasModal === 'function') window.carregarItensComprasModal();
        if (typeof window.carregarContasPagar === 'function') window.carregarContasPagar();
        if (typeof window.carregarFechamentoCaixaAtual === 'function') window.carregarFechamentoCaixaAtual();
    } else if (tela === 'relatorios') {
        if (!podeVerRelatorios) {
            window.mostrarToast("Você não possui permissão para acessar Relatórios.", "erro");
            return window.alternarTelas('operacao');
        }

        cabecalho?.classList.add('oculto');
        rel?.classList.remove('oculto');

        btnOp?.classList.remove('oculto');
        btnGestao?.classList.add('oculto');
        btnRel?.classList.add('oculto');
        btnPainel?.classList.add('oculto');
        btnAdmin?.classList.add('oculto');
        btnPerfil?.classList.remove('oculto');
        btnAutonoma?.classList.add('oculto');

    } else if (tela === 'admin') {
        cabecalho?.classList.add('oculto');
        admin?.classList.remove('oculto');

        btnOp?.classList.remove('oculto');
        btnGestao?.classList.add('oculto');
        btnRel?.classList.add('oculto');
        btnPainel?.classList.add('oculto');
        btnAdmin?.classList.add('oculto');
        btnPerfil?.classList.remove('oculto');
        btnAutonoma?.classList.add('oculto');
        
        window.prepararTelaAdministracao();
    } else {
        cabecalho?.classList.remove('oculto');
        op?.classList.remove('oculto');

        btnOp?.classList.add('oculto');
        btnPerfil?.classList.remove('oculto');
        
        if (podeVerGestao) btnGestao?.classList.remove('oculto');
        else btnGestao?.classList.add('oculto');

        if (podeVerRelatorios) btnRel?.classList.remove('oculto');
        else btnRel?.classList.add('oculto');

        if (podeVerPainel) btnPainel?.classList.remove('oculto');
        else btnPainel?.classList.add('oculto');

        const ehStaffSimples = !isAdmin && !isSocio && !isGerente && !podeVerGestao && !podeVerRelatorios;
        btnAutonoma?.classList.toggle('oculto', !ehStaffSimples);
        
        if (isAdmin || isSocio) {
            btnAdmin?.classList.remove('oculto');
        }
    }

    window.atualizarVisualCadeadosHome(tela);
};

// ------------------ RECUPERAÇÃO DE SENHA ------------------
window.abrirModalEsqueciSenha = function() {
    window.somPop();
    const inputEmail = document.getElementById('input-email-recuperacao');
    const emailLogin = document.getElementById('email')?.value.trim();
    if (inputEmail && emailLogin) inputEmail.value = emailLogin;
    document.getElementById('modal-esqueci-senha')?.classList.remove('oculto');
};

window.fecharModalEsqueciSenha = function() {
    document.getElementById('modal-esqueci-senha')?.classList.add('oculto');
};

window.solicitarRedefinicaoSenhaEmail = async function() {
    const email = document.getElementById('input-email-recuperacao')?.value.toLowerCase().trim();
    if (!email) return window.mostrarToast("Introduza o seu e-mail cadastrado.", "erro");

    const { error } = await cliente.auth.resetPasswordForEmail(email,{redirectTo:window.suiriAndroid?.site || location.href.split('#')[0].split('?')[0]});
    if (error) {
        window.mostrarToast("Erro ao enviar: " + error.message, "erro");
    } else {
        window.mostrarToast("Instruções enviadas! Verifique o seu e-mail (incluindo o spam).");
        window.fecharModalEsqueciSenha();
    }
};

// ------------------ SALVAR PRÓPRIO WHATSAPP ------------------
window.salvarMeuWhatsApp = async function() {
    const inWhats = document.getElementById('input-meu-whatsapp');
    const num = inWhats?.value.trim() || '';

    const { error } = await cliente.from('perfis').update({ telefone_whatsapp: num }).eq('id', usuarioAtual.id);
    if (error) {
        window.mostrarToast("Erro ao salvar WhatsApp: " + error.message, "erro");
    } else {
        window.mostrarToast("WhatsApp atualizado com sucesso!");
        if (perfilAtual) perfilAtual.telefone_whatsapp = num;
        if (mapaPerfis[usuarioAtual.id]) mapaPerfis[usuarioAtual.id].telefone_whatsapp = num;
    }
};

// ------------------ GESTÃO ADMINISTRATIVA E CARGAS DE PERMISSÕES ------------------
window.prepararTelaAdministracao = function() {
    const selColab = document.getElementById('select-inspecionar-colab');
    if (!selColab) return;
    const anterior = selColab.value;
    selColab.innerHTML = '<option value="">Selecione o funcionário...</option>';

    Object.values(mapaPerfis).forEach(p => {
        let papel = 'Funcionário';
        if (p.is_admin) papel = 'Admin';
        else if (p.is_socio) papel = 'Sócio';
        else if (p.is_gerente) papel = 'Gerente';

        const permCaixaStr = p.pode_fechar_caixa ? ' • 💵 Caixa' : '';
        selColab.innerHTML += `<option value="${p.id}">${esc(p.nome)} (${papel} - ${esc(p.setor || 'Sem setor')}${permCaixaStr})</option>`;

    });

    selColab.value = mapaPerfis[anterior] ? anterior : '';
    window.selecionarFuncionarioAdmin(selColab.value);
};

window.selecionarFuncionarioAdmin = function(id) {
    if (perfilAtual?.is_admin) {
        window.carregarDetalhesCargos(id);
        const setor = document.getElementById('admin-select-novo-setor');
        if (setor) setor.value = mapaPerfis[id]?.setor || '';
    }
    return window.inspecionarColaborador(id);
};

window.carregarDetalhesCargos = function(id) {
    const box = document.getElementById('admin-box-permissoes');
    if (!id || !mapaPerfis[id]) {
        box?.classList.add('oculto');
        return;
    }

    const perfil = mapaPerfis[id];
    const checkAdmin = document.getElementById('check-is-admin');
    const checkSocio = document.getElementById('check-is-socio');
    const checkGerente = document.getElementById('check-is-gerente');

    if (checkAdmin) {
        checkAdmin.checked = !!perfil.is_admin;
        checkAdmin.disabled = !perfilAtual?.is_admin;
    }
    if (checkSocio) {
        checkSocio.checked = !!perfil.is_socio;
        checkSocio.disabled = !perfilAtual?.is_admin;
    }
    if (checkGerente) {
        checkGerente.checked = !!perfil.is_gerente;
    }

    window.toggleBoxPermissoes(true);

    const permissoes = Array.isArray(perfil.permissoes_socio) && perfil.permissoes_socio.length > 0 
        ? perfil.permissoes_socio 
        : (Array.isArray(perfil.permissoes_gerente) ? perfil.permissoes_gerente : []);

    document.querySelectorAll('.perm-socio-check').forEach(chk => {
        if (chk.value === 'fechar_caixa') {
            chk.checked = !!perfil.pode_fechar_caixa || permissoes.includes('fechar_caixa');
        } else {
            chk.checked = permissoes.includes(chk.value);
        }
    });

    const checkFecharCaixa = document.getElementById('check-perm-fechar-caixa');
    if (checkFecharCaixa) {
        checkFecharCaixa.checked = !!perfil.pode_fechar_caixa || permissoes.includes('fechar_caixa');
    }

    box?.classList.remove('oculto');
};

window.toggleBoxPermissoes = function(ativo) {
    const boxLista = document.getElementById('admin-permissoes-socio-lista');
    if (boxLista) {
        if (ativo) boxLista.classList.remove('oculto');
        else boxLista.classList.add('oculto');
    }
};

window.salvarConfiguracaoCargo = async function() {
    const selColab = document.getElementById('select-inspecionar-colab');
    const id = selColab?.value;
    if (!id) return window.mostrarToast("Selecione um funcionário.", "erro");

    const isAdmin = document.getElementById('check-is-admin')?.checked || false;
    const isSocio = document.getElementById('check-is-socio')?.checked || false;
    const isGerente = document.getElementById('check-is-gerente')?.checked || false;
    const checkFecharCaixa = document.getElementById('check-perm-fechar-caixa');
    const podeFecharCaixa = checkFecharCaixa ? checkFecharCaixa.checked : false;

    const permissoes = [];
    document.querySelectorAll('.perm-socio-check:checked').forEach(chk => {
        permissoes.push(chk.value);
    });

    const payload = {
        is_gerente: isGerente,
        pode_fechar_caixa: podeFecharCaixa,
        permissoes_gerente: isGerente ? permissoes : []
    };

    if (perfilAtual?.is_admin) {
        payload.is_admin = isAdmin;
        payload.is_socio = isSocio;
        payload.permissoes_socio = isSocio ? permissoes : [];
    }

    const { error } = await cliente.from('perfis').update(payload).eq('id', id);

    if (error) {
        window.mostrarToast("Erro ao atualizar cargo: " + error.message, "erro");
    } else {
        window.mostrarToast("Configurações e permissões salvas com sucesso!");
        if (mapaPerfis[id]) Object.assign(mapaPerfis[id], payload);
        if (usuarioAtual?.id === id && perfilAtual) Object.assign(perfilAtual, payload);
        window.prepararTelaAdministracao();
        window.iniciarApp();
    }
};

window.revogarTodosCargosModal = async function() {
    const selColab = document.getElementById('select-inspecionar-colab');
    const id = selColab?.value;
    if (!id) return window.mostrarToast("Selecione um funcionário.", "erro");

    if (!confirm("Revogar todos os cargos e permissões deste colaborador (retornar a funcionário sem permissões administrativas)?")) return;

    const payload = {
        is_gerente: false,
        pode_fechar_caixa: false,
        permissoes_gerente: []
    };

    if (perfilAtual?.is_admin) {
        payload.is_admin = false;
        payload.is_socio = false;
        payload.permissoes_socio = [];
    }

    const { error } = await cliente.from('perfis').update(payload).eq('id', id);
    if (error) {
        window.mostrarToast("Erro ao revogar: " + error.message, "erro");
    } else {
        window.mostrarToast("Cargos e permissões revogados com sucesso!");
        if (mapaPerfis[id]) Object.assign(mapaPerfis[id], payload);
        if (usuarioAtual?.id === id && perfilAtual) Object.assign(perfilAtual, payload);
        window.carregarDetalhesCargos(id);
        window.iniciarApp();
    }
};

window.transferirSetorColaborador = async function() {
    const id = document.getElementById('select-inspecionar-colab')?.value;
    const novoSetor = document.getElementById('admin-select-novo-setor')?.value;

    if (!id || !novoSetor) return window.mostrarToast("Selecione o colaborador e o novo setor.", "erro");

    const { error } = await cliente.from('perfis').update({ setor: novoSetor }).eq('id', id);

    if (error) {
        window.mostrarToast("Erro ao mudar setor: " + error.message, "erro");
    } else {
        window.mostrarToast("Setor transferido com sucesso!");
        if (mapaPerfis[id]) mapaPerfis[id].setor = novoSetor;
        window.prepararTelaAdministracao();
        window.iniciarApp();
    }
};

// ------------------ INSPEÇÃO DE EQUIPE NO TOPO DE RELATÓRIOS ------------------
window.alternarCamposContratoInspecao = function(tipo) {
    const boxSalario = document.getElementById('box-campo-salario-fixo');
    const boxFolgasSemana = document.getElementById('box-dias-folga-semana');
    const boxDiaria = document.getElementById('box-campo-valor-diaria');

    if (tipo === 'freelance') {
        boxSalario?.classList.add('oculto');
        boxFolgasSemana?.classList.add('oculto');
        boxDiaria?.classList.remove('oculto');
    } else {
        boxSalario?.classList.remove('oculto');
        boxFolgasSemana?.classList.remove('oculto');
        boxDiaria?.classList.add('oculto');
    }
};

window.alternarCamposPresencaInspecao = function(status) {
    const boxFolga = document.getElementById('bloco-dias-folga-inspecao');
    const boxAtestado = document.getElementById('bloco-dias-atestado-inspecao');

    if (boxFolga) boxFolga.style.display = (status === 'folga') ? 'block' : 'none';
    if (boxAtestado) boxAtestado.style.display = (status === 'atestado') ? 'block' : 'none';
};

let consultaFuncionarioAdmin = 0;
window.inspecionarColaborador = async function(colabId) {
    const consulta = ++consultaFuncionarioAdmin;
    const usuario = usuarioAtual?.id;
    const consultaAtual = () => consulta === consultaFuncionarioAdmin && usuario === usuarioAtual?.id;
    const card = document.getElementById('resultado-inspecao-colab');
    const dadosFinEl = document.getElementById('inspecao-dados-financeiros');
    const ultimasAcoesEl = document.getElementById('inspecao-ultimas-acoes');
    const containerBotoesQuitar = document.getElementById('inspecao-botoes-quitar');
    const blocoModificarNome = document.getElementById('bloco-modificar-nome-inspecao');
    const inputNovoNome = document.getElementById('input-novo-nome-inspecao');
    const inputNovoWhats = document.getElementById('input-novo-whatsapp-inspecao');
    const listaConsumoFechamento = document.getElementById('inspecao-lista-consumo-fechamento');
    
    card?.classList.add('oculto');
    if (!colabId) return;

    const colabData = mapaPerfis[colabId] || {};

    if (blocoModificarNome) {
        if (perfilAtual?.is_admin || perfilAtual?.is_socio) {
            blocoModificarNome.classList.remove('oculto');
            if (inputNovoNome) inputNovoNome.value = colabData.nome || mapaNomes[colabId] || '';
            if (inputNovoWhats) inputNovoWhats.value = colabData.telefone_whatsapp || '';
        } else {
            blocoModificarNome.classList.add('oculto');
        }
    }

    const selTipoContrato = document.getElementById('select-inspecao-tipo-contrato');
    const inDataAdm = document.getElementById('input-inspecao-data-admissao');
    const inSalario = document.getElementById('input-inspecao-salario-base');
    const inDiaria = document.getElementById('input-inspecao-valor-diaria');

    const tipoAtual = colabData.tipo_contrato || 'fixo';
    if (selTipoContrato) selTipoContrato.value = tipoAtual;
    if (inDataAdm) inDataAdm.value = colabData.data_admissao || '';
    if (inSalario) inSalario.value = colabData.salario_base || '';
    if (inDiaria) inDiaria.value = colabData.valor_diaria || '';

    const folgasArray = Array.isArray(colabData.dias_folga_semana) ? colabData.dias_folga_semana : [];
    document.querySelectorAll('.chk-folga-semana').forEach(chk => {
        chk.checked = folgasArray.includes(chk.value);
    });

    window.alternarCamposContratoInspecao(tipoAtual);

    const { data: valesPendentes } = await cliente.from('vales')
        .select('*')
        .eq('perfil_id', colabId)
        .or('pago.is.null,pago.eq.false')
        .order('data_vale', { ascending: false });

    const { data: ultimoFechamento } = await cliente.from('vales')
        .select('data_pagamento')
        .eq('perfil_id', colabId)
        .eq('pago', true)
        .order('data_pagamento', { ascending: false })
        .limit(1);

    let queryCompras = cliente.from('itens_comprados')
        .select('*')
        .eq('perfil_id', colabId)
        .order('data_compra', { ascending: false });

    if (ultimoFechamento && ultimoFechamento.length > 0 && ultimoFechamento[0].data_pagamento) {
        const dataCorte = ultimoFechamento[0].data_pagamento.split('T')[0];
        queryCompras = queryCompras.gte('data_compra', dataCorte);
    }

    const { data: comprasPendentes } = await queryCompras;
    if (!consultaAtual()) return;

    const totalVales = valesPendentes?.reduce((acc, v) => acc + Number(v.valor), 0) || 0;
    const totalCompras = comprasPendentes?.reduce((acc, c) => acc + Number(c.valor_final), 0) || 0;

    if (dadosFinEl) {
        dadosFinEl.innerHTML = `
            <strong>Vales Pendentes:</strong> <span style="color:var(--cor-erro); font-weight:bold;">R$ ${totalVales.toFixed(2)}</span> | 
            <strong>Consumo em Aberto:</strong> <span style="color:var(--cor-primaria); font-weight:bold;">R$ ${totalCompras.toFixed(2)}</span> | 
            <strong>Total a Descontar:</strong> <span style="color:var(--cor-erro); font-weight:bold;">R$ ${(totalVales + totalCompras).toFixed(2)}</span>
        `;
    }

    if (listaConsumoFechamento) {
        listaConsumoFechamento.innerHTML = '';
        let itensCombinados = [];

        if (valesPendentes && valesPendentes.length > 0) {
            valesPendentes.forEach(v => {
                itensCombinados.push({
                    id: v.id,
                    tipo: 'vale',
                    descricao: v.observacao ? `Vale: ${v.observacao}` : 'Vale / Adiantamento',
                    data: v.data_vale || v.criado_em?.split('T')[0] || '',
                    valor_unitario: Number(v.valor) || 0,
                    desconto_pct: 0,
                    valor_final: Number(v.valor) || 0
                });
            });
        }

        if (comprasPendentes && comprasPendentes.length > 0) {
            comprasPendentes.forEach(c => {
                itensCombinados.push({
                    id: c.id,
                    tipo: 'compra',
                    descricao: c.descricao_item || 'Consumo',
                    data: c.data_compra || '',
                    valor_unitario: Number(c.valor_unitario) || Number(c.valor_final) || 0,
                    desconto_pct: Number(c.porcentagem_desconto) || 0,
                    valor_final: Number(c.valor_final) || 0
                });
            });
        }

        itensCombinados.sort((a, b) => (b.data || '').localeCompare(a.data || ''));

        if (itensCombinados.length > 0) {
            itensCombinados.forEach(item => {
                const linha = document.createElement('div');
                linha.className = 'consumo-item-linha';
                const tagTipo = item.tipo === 'vale' 
                    ? '<span style="color:var(--cor-erro); font-weight:700;">[VALE]</span>' 
                    : '<span style="color:var(--cor-primaria); font-weight:700;">[CONSUMO]</span>';
                
                linha.innerHTML = `
                    <div style="flex:1;">
                        <div>${tagTipo} <strong>${esc(item.descricao)}</strong></div>
                        <div style="font-size:10px; color:var(--texto-suave);">Data: ${item.data || 'Hoje'} | Inicial: R$ ${item.valor_unitario.toFixed(2)} (${item.desconto_pct}% OFF)</div>
                    </div>
                    <div style="text-align:right;">
                        <strong style="color:${item.tipo === 'vale' ? 'var(--cor-erro)' : 'var(--cor-primaria)'}; display:block; font-size:12px;">R$ ${item.valor_final.toFixed(2)}</strong>
                        <button class="btn-editar-consumo" onclick="window.abrirModalEditarItem('${item.id}', ${window.atributoJS(item.descricao)}, ${item.valor_unitario}, ${item.desconto_pct}, '${item.tipo}', '${item.data}')">✏️ Editar</button>
                    </div>
                `;
                listaConsumoFechamento.appendChild(linha);
            });
        } else {
            listaConsumoFechamento.innerHTML = '<p class="status-texto" style="font-size:11px; text-align:center;">Nenhum consumo ou vale em aberto registrado para este colaborador.</p>';
        }
    }

    if (containerBotoesQuitar) {
        containerBotoesQuitar.innerHTML = totalVales > 0 
            ? `<button class="btn-socio-verde" style="padding:8px; font-size:11px; width:100%; margin-bottom:6px;" onclick="quitarValesColaborador('${colabId}')">✓ Quitar Folha de Vales</button>`
            : `<div style="font-size:11px; color:var(--cor-sucesso); font-weight:700; text-align:center; margin-bottom:6px;">Nenhum vale em aberto para quitar.</div>`;
    }

    if (ultimasAcoesEl) {
        ultimasAcoesEl.innerHTML = '<li>Carregando ações...</li>';
        const { data: ultimasTarefas } = await cliente.from('tarefas')
            .select('titulo, status, hora_fim, criado_em')
            .or(`assumido_por.eq.${colabId},criado_por.eq.${colabId}`)
            .order('criado_em', { ascending: false })
            .limit(3);

        if (!consultaAtual()) return;
        ultimasAcoesEl.innerHTML = '';
        if (ultimasTarefas && ultimasTarefas.length > 0) {
            ultimasTarefas.forEach(a => {
                const li = document.createElement('li');
                const st = a.status === 'concluida' ? 'Concluiu' : 'Em andamento';
                li.innerHTML = `<strong>${st}:</strong> ${esc(a.titulo)}`;
                ultimasAcoesEl.appendChild(li);
            });
        } else {
            ultimasAcoesEl.innerHTML = '<li style="color:var(--texto-suave);">Nenhuma ação recente registrada.</li>';
        }
    }

    const dataInput = document.getElementById('input-ajuste-ponto-data');
    const hoje = window.dataLocal();
    if (dataInput) {
        dataInput.value = hoje;
        window.carregarPontoDataInspecao(hoje);
    }

    if (card) card.classList.remove('oculto');
};

// Salvar Dados Contratuais
window.salvarDadosContratoInspecao = async function() {
    const colabId = document.getElementById('select-inspecionar-colab')?.value;
    if (!colabId) return window.mostrarToast("Selecione um funcionário.", "erro");

    const temPermissao = perfilAtual?.is_admin || perfilAtual?.is_socio || perfilAtual?.is_gerente;
    if (!temPermissao) return window.mostrarToast("Você não possui permissão para gerir contratos.", "erro");

    const tipoContrato = document.getElementById('select-inspecao-tipo-contrato')?.value || 'fixo';
    const dataAdmissao = document.getElementById('input-inspecao-data-admissao')?.value || null;
    const salarioBase = parseFloat(document.getElementById('input-inspecao-salario-base')?.value) || 0;
    const valorDiaria = parseFloat(document.getElementById('input-inspecao-valor-diaria')?.value) || 0;

    const folgasSemana = [];
    if (tipoContrato === 'fixo') {
        document.querySelectorAll('.chk-folga-semana:checked').forEach(chk => {
            folgasSemana.push(chk.value);
        });
    }

    const payload = {
        tipo_contrato: tipoContrato,
        data_admissao: dataAdmissao,
        salario_base: salarioBase,
        valor_diaria: valorDiaria,
        dias_folga_semana: folgasSemana
    };

    const { error } = await cliente.from('perfis').update(payload).eq('id', colabId);

    if (error) {
        window.mostrarToast("Erro ao salvar dados de contrato: " + error.message, "erro");
    } else {
        window.mostrarToast("Dados contratuais salvos com sucesso!");
        if (mapaPerfis[colabId]) Object.assign(mapaPerfis[colabId], payload);
        if (usuarioAtual?.id === colabId && perfilAtual) Object.assign(perfilAtual, payload);
        if (typeof window.renderizarPainelPerfilCompleto === 'function') window.renderizarPainelPerfilCompleto();
        if (typeof window.carregarPainelAoVivo === 'function') window.carregarPainelAoVivo();
    }
};

// Alteração de Nome e WhatsApp pela Administração
window.salvarNovoNomeEWhatsappInspecao = async function() {
    if (!perfilAtual?.is_admin && !perfilAtual?.is_socio) {
        return window.mostrarToast("Apenas administradores e sócios podem modificar o nome e contato.", "erro");
    }

    const colabId = document.getElementById('select-inspecionar-colab')?.value;
    const novoNome = document.getElementById('input-novo-nome-inspecao')?.value.trim();
    const novoWhats = document.getElementById('input-novo-whatsapp-inspecao')?.value.trim() || '';

    if (!colabId) return window.mostrarToast("Selecione um funcionário.", "erro");
    if (!novoNome) return window.mostrarToast("O nome não pode ficar em branco.", "erro");

    const { error } = await cliente.from('perfis').update({ 
        nome: novoNome,
        telefone_whatsapp: novoWhats
    }).eq('id', colabId);

    if (error) {
        window.mostrarToast("Erro ao atualizar: " + error.message, "erro");
    } else {
        window.mostrarToast("Dados atualizados com sucesso!");
        mapaNomes[colabId] = novoNome;
        if (mapaPerfis[colabId]) {
            mapaPerfis[colabId].nome = novoNome;
            mapaPerfis[colabId].telefone_whatsapp = novoWhats;
        }

        const selInspecao = document.getElementById('select-inspecionar-colab');
        if (selInspecao) {
            const opt = selInspecao.querySelector(`option[value="${colabId}"]`);
            if (opt) opt.textContent = novoNome;
        }

        if (colabId === usuarioAtual?.id) {
            const nomeUsr = document.getElementById('nome-usuario');
            if (nomeUsr) nomeUsr.textContent = novoNome;
            if (perfilAtual) {
                perfilAtual.nome = novoNome;
                perfilAtual.telefone_whatsapp = novoWhats;
            }
        }

        if (typeof window.carregarPainelAoVivo === 'function') window.carregarPainelAoVivo();
    }
};

// Carrega os horários de ponto da data selecionada
window.carregarPontoDataInspecao = async function(dataEscolhida) {
    const colabId = document.getElementById('select-inspecionar-colab')?.value;
    if (!colabId || !dataEscolhida) return;

    const inEntrada = document.getElementById('input-ajuste-ponto-entrada');
    const inSaida = document.getElementById('input-ajuste-ponto-saida');
    const selStatus = document.getElementById('select-ajuste-ponto-status');

    if (inEntrada) inEntrada.value = '';
    if (inSaida) inSaida.value = '';
    if (selStatus) selStatus.value = 'presente';

    const { data } = await cliente.from('livro_ponto')
        .select('*')
        .eq('perfil_id', colabId)
        .eq('data_registro', dataEscolhida)
        .order('id', { ascending: false })
        .limit(1);

    if (data && data.length > 0) {
        const reg = data[0];
        if (selStatus && reg.status_turno) selStatus.value = reg.status_turno;
        
        if (inEntrada && reg.horario_entrada) {
            const dEnt = new Date(reg.horario_entrada);
            inEntrada.value = dEnt.toTimeString().slice(0, 5);
        }
        if (inSaida && reg.horario_saida) {
            const dSai = new Date(reg.horario_saida);
            inSaida.value = dSai.toTimeString().slice(0, 5);
        }
    }
};

// Salva o ajuste manual de ponto
window.salvarAjustePontoInspecao = async function() {
    const colabId = document.getElementById('select-inspecionar-colab')?.value;
    if (!colabId) return window.mostrarToast("Selecione um funcionário.", "erro");

    const isAdmin = !!perfilAtual?.is_admin;
    const isSocio = !!perfilAtual?.is_socio;
    const isGerente = !!perfilAtual?.is_gerente;
    const permissoes = isAdmin ? ['ponto'] 
        : (isSocio ? (perfilAtual?.permissoes_socio || []) 
        : (isGerente ? (perfilAtual?.permissoes_gerente || []) : []));

    if (!isAdmin && !permissoes.includes('ponto')) {
        return window.mostrarToast("Você não possui permissão para ajustar o ponto.", "erro");
    }

    const dataReg = document.getElementById('input-ajuste-ponto-data')?.value;
    const statusTurno = document.getElementById('select-ajuste-ponto-status')?.value || 'presente';
    const horaEntrada = document.getElementById('input-ajuste-ponto-entrada')?.value;
    const horaSaida = document.getElementById('input-ajuste-ponto-saida')?.value;

    if (!dataReg) return window.mostrarToast("Informe a data do registro.", "erro");

    let isoEntrada = null;
    let isoSaida = null;

    if (horaEntrada) {
        isoEntrada = new Date(`${dataReg}T${horaEntrada}:00`).toISOString();
    }
    if (horaSaida) {
        isoSaida = new Date(`${dataReg}T${horaSaida}:00`).toISOString();
    }

    const payload = {
        perfil_id: colabId,
        empresa_id: empresaAtualId,
        data_registro: dataReg,
        status_turno: statusTurno,
        horario_entrada: isoEntrada,
        horario_saida: isoSaida
    };

    const { data: existente } = await cliente.from('livro_ponto')
        .select('id')
        .eq('perfil_id', colabId)
        .eq('data_registro', dataReg)
        .order('id', { ascending: false });

    let error = null;
    if (existente && existente.length > 0) {
        const idAlvo = existente[0].id;
        const res = await cliente.from('livro_ponto').update(payload).eq('id', idAlvo);
        error = res.error;

        if (existente.length > 1) {
            const idsExtras = existente.slice(1).map(r => r.id);
            await cliente.from('livro_ponto').delete().in('id', idsExtras);
        }
    } else {
        const res = await cliente.from('livro_ponto').insert([payload]);
        error = res.error;
    }

    if (error) {
        window.mostrarToast("Erro ao salvar ponto: " + error.message, "erro");
    } else {
        window.mostrarToast("Ponto ajustado com sucesso!");
        if (typeof window.carregarStatusPonto === 'function') window.carregarStatusPonto();
        if (typeof window.carregarPainelAoVivo === 'function') window.carregarPainelAoVivo();
    }
};

// Reset de senha simples
window.resetarSenhaColaboradorModal = function() {
    window.mostrarToast('Peça ao colaborador para usar “Esqueci minha senha” na tela de entrada. A redefinição é enviada ao e-mail dele.', 'info');
};

// Remover foto de perfil
window.removerFotoColaboradorModal = async function() {
    const colabId = document.getElementById('select-inspecionar-colab')?.value;
    if (!colabId) return window.mostrarToast("Selecione um colaborador.", "erro");

    if (!confirm("Remover a foto deste funcionário? (Permitirá que ele envie uma nova foto)")) return;

    const { error } = await cliente.from('perfis').update({ avatar_url: null }).eq('id', colabId);
    if (error) {
        window.mostrarToast("Erro ao remover foto: " + error.message, "erro");
    } else {
        window.mostrarToast("Foto removida!");
        if (mapaPerfis[colabId]) mapaPerfis[colabId].avatar_url = null;
        window.iniciarApp();
    }
};

// Exclusão de funcionário
window.excluirColaboradorModal = async function() {
    const colabId = document.getElementById('select-inspecionar-colab')?.value;
    if (!colabId) return window.mostrarToast("Selecione um colaborador.", "erro");

    const nome = mapaNomes[colabId] || 'este colaborador';
    if (!confirm(`TEM CERTEZA ABSOLUTA que deseja excluir ${nome}? Todos os registros e o acesso serão removidos!`)) return;

    const { error } = await cliente.rpc('apagar_usuario_completo', { usuario_id: colabId });

    if (error) {
        window.mostrarToast("Erro ao excluir: " + error.message, "erro");
    } else {
        window.mostrarToast("Funcionário excluído com sucesso!");
        const cardInspecao = document.getElementById('resultado-inspecao-colab');
        if (cardInspecao) cardInspecao.classList.add('oculto');
        const selInspecao = document.getElementById('select-inspecionar-colab');
        if (selInspecao) selInspecao.value = '';
        await window.iniciarApp();
    }
};

window.emitirRelatorioPagamento = function(colabId) {
    window.irParaRelatorioFuncionario(colabId);
    setTimeout(() => { 
        const tRel = document.getElementById('tipo-relatorio');
        if(tRel) tRel.value = 'financeiro'; 
        if(typeof window.gerarRelatorio === 'function') window.gerarRelatorio(); 
    }, 400);
};

window.irParaRelatorioFuncionario = function(colabId) {
    window.fecharPainelPerfil();
    window.alternarTelas('relatorios');
    const fRel = document.getElementById('filtro-func-relatorio');
    if (fRel) fRel.value = colabId;
    if(typeof window.gerarRelatorio === 'function') window.gerarRelatorio(); 
};

// ------------------ ATUALIZAR PRÓPRIA SENHA & FOTO CROP ------------------
window.atualizarPropriaSenha = async function() {
    const p1 = document.getElementById('input-nova-senha-perfil')?.value;
    const p2 = document.getElementById('input-confirma-senha-perfil')?.value;

    if (!p1 || p1.length < 8) return window.mostrarToast("A senha deve ter no mínimo 8 caracteres.", "erro");
    if (p1 !== p2) return window.mostrarToast("As senhas não coincidem.", "erro");

    const { error } = await cliente.auth.updateUser({ password: p1 });
    if (error) {
        window.mostrarToast("Erro ao atualizar senha: " + error.message, "erro");
    } else {
        window.mostrarToast("Sua senha foi atualizada com sucesso!");
        document.getElementById('input-nova-senha-perfil').value = '';
        document.getElementById('input-confirma-senha-perfil').value = '';
    }
};

window.carregarImagemParaCrop = function(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;

    const leitor = new FileReader();
    leitor.onload = function(evt) {
        imagemCropObj = new Image();
        imagemCropObj.onload = function() {
            cropZoom = 1.0;
            window.desenharCropCanvas();
            document.getElementById('modal-crop-foto')?.classList.remove('oculto');
        };
        imagemCropObj.src = evt.target.result;
    };
    leitor.readAsDataURL(arquivo);
};

window.desenharCropCanvas = function() {
    const canvas = document.getElementById('crop-canvas');
    if (!canvas || !imagemCropObj) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const aspect = imagemCropObj.width / imagemCropObj.height;
    let dw = canvas.width * cropZoom;
    let dh = (canvas.width / aspect) * cropZoom;

    if (aspect < 1) {
        dh = canvas.height * cropZoom;
        dw = (canvas.height * aspect) * cropZoom;
    }

    const dx = (canvas.width - dw) / 2;
    const dy = (canvas.height - dh) / 2;

    ctx.drawImage(imagemCropObj, dx, dy, dw, dh);
};

window.ajustarZoomCrop = function(delta) {
    cropZoom = Math.max(0.5, Math.min(3.0, cropZoom + delta));
    window.desenharCropCanvas();
};

window.fecharModalCrop = function() {
    document.getElementById('modal-crop-foto')?.classList.add('oculto');
    const inputArquivo = document.getElementById('input-arquivo-foto-perfil');
    if (inputArquivo) inputArquivo.value = '';
};

window.salvarFotoRecortada = async function() {
    const canvas = document.getElementById('crop-canvas');
    if (!canvas || !usuarioAtual) return;
    const perfilId = usuarioAtual.id;

    const exportarBlob = (formato, qualidade) => {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), formato, qualidade);
        });
    };

    let blob = await exportarBlob('image/webp', 0.8);
    let extensao = 'webp';

    if (!blob) {
        blob = await exportarBlob('image/png', 0.9);
        extensao = 'png';
    }

    if (!blob) return window.mostrarToast("Falha ao processar a imagem recortada.", "erro");

    if (usuarioAtual?.id !== perfilId) return;
    const nomeArquivo = `avatar_${perfilId}_${Date.now()}.${extensao}`;

    const { error: uploadError } = await cliente.storage.from('sistema-imagens').upload(nomeArquivo, blob, { 
        upsert: false,
        contentType: extensao === 'webp' ? 'image/webp' : 'image/png'
    });

    if (uploadError) {
        return window.mostrarToast("Erro no upload da foto: " + uploadError.message, "erro");
    }

    if (usuarioAtual?.id !== perfilId) return;
    const fotoUrl = 'sistema-imagens:' + nomeArquivo;
    const {data: perfilSalvo, error: erroPerfil} = await cliente.from('perfis')
        .update({avatar_url:fotoUrl}).eq('id', perfilId).select('id').maybeSingle();
    if (usuarioAtual?.id !== perfilId) return;
    if (erroPerfil || !perfilSalvo) {
        return window.mostrarToast('A foto foi enviada, mas não foi possível vinculá-la ao perfil. Tente novamente.', 'erro');
    }
    if (perfilAtual) perfilAtual.avatar_url = fotoUrl;

    window.mostrarToast("Foto de perfil salva com sucesso!");
    window.fecharModalCrop();
    window.iniciarApp();
};

// ------------------ PERFIL DA EMPRESA ------------------
function lerLocalizacaoEmpresa(entrada) {
    let coordenadas = entrada.trim();
    if (coordenadas.startsWith('https://')) {
        const url = new URL(coordenadas);
        if (!['google.com', 'www.google.com', 'maps.google.com'].includes(url.hostname)) return null;
        const query = url.searchParams.get('query') || url.searchParams.get('q');
        const marcador = url.pathname.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
        const centro = url.pathname.match(/@(-?[\d.]+),(-?[\d.]+)(?:,|$)/);
        coordenadas = marcador ? marcador.slice(1).join(',') : query || (centro ? centro.slice(1).join(',') : '');
    }
    const valores = coordenadas.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!valores) return null;
    const latitude = Number(valores[1]), longitude = Number(valores[2]);
    return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? {latitude, longitude} : null;
}

window.suiriObterLocalizacao = async function() {
    if (!navigator.geolocation || window.isSecureContext === false) {
        throw new Error('Localização indisponível. Abra o Suíri em HTTPS ou atualize o aplicativo.');
    }
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(({coords}) => {
        const {latitude, longitude, accuracy: precisao} = coords;
        if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
            || !Number.isFinite(longitude) || Math.abs(longitude) > 180
            || !Number.isFinite(precisao) || precisao < 0) {
            reject(new Error('O aparelho não forneceu uma localização válida.'));
            return;
        }
        resolve({latitude, longitude, precisao});
    }, erro => {
        const mensagem = erro.code === 1
            ? 'Autorize o acesso à localização para continuar.'
            : 'Não foi possível localizar. Ative a localização e tente novamente.';
        reject(new Error(mensagem));
    }, {enableHighAccuracy: true, timeout: 15000, maximumAge: 0}));
};

let capturaLocalizacaoEmpresa = 0;
document.getElementById('empresa-usar-localizacao')?.addEventListener('click', async evento => {
    if (!perfilAtual?.is_admin) return;
    const botao = evento.currentTarget;
    const status = document.getElementById('empresa-localizacao-status');
    const captura = ++capturaLocalizacaoEmpresa;
    const admin = usuarioAtual?.id, empresa = empresaAtualId;
    const capturaAtual = () => captura === capturaLocalizacaoEmpresa
        && admin === usuarioAtual?.id && empresa === empresaAtualId;
    status.textContent = 'Buscando a localização…';
    botao.disabled = true;
    try {
        const {latitude, longitude, precisao} = await window.suiriObterLocalizacao();
        if (!capturaAtual()) return;
        document.getElementById('empresa-localizacao').value =
            `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        status.textContent = `Precisão estimada de ${Math.ceil(precisao)} m. Confira antes de salvar.`;
    } catch (erro) {
        if (capturaAtual()) status.textContent = `${erro.message} Você também pode informar as coordenadas.`;
    } finally {
        botao.disabled = false;
    }
});

window.abrirModalPerfilEmpresa = function() {
    if (!perfilAtual?.is_admin) return window.mostrarToast('Apenas administradores podem editar a empresa.', 'erro');
    window.somPop();
    const d = dadosEmpresaAtual || {};
    const inNome = document.getElementById('empresa-input-nome');
    const inCnpj = document.getElementById('empresa-input-cnpj');
    const inTel = document.getElementById('empresa-input-telefone');
    const inEnd = document.getElementById('empresa-input-endereco');

    if (inNome) inNome.value = d.nome_empresa || d.nome_fantasia || 'Suiri';
    if (inCnpj) inCnpj.value = d.cnpj || '';
    if (inTel) inTel.value = d.telefone || '';
    if (inEnd) inEnd.value = d.endereco || '';
    document.getElementById('empresa-localizacao').value = d.ponto_latitude == null
        ? '' : `${d.ponto_latitude}, ${d.ponto_longitude}`;
    document.getElementById('empresa-ponto-raio').value = d.ponto_raio_m ?? '';
    document.getElementById('empresa-localizacao-status').textContent = '';

    document.getElementById('modal-perfil-empresa')?.classList.remove('oculto');
};

window.fecharModalPerfilEmpresa = function() {
    capturaLocalizacaoEmpresa++;
    document.getElementById('modal-perfil-empresa')?.classList.add('oculto');
};

window.salvarDadosEmpresa = async function() {
    const nome = document.getElementById('empresa-input-nome')?.value.trim();
    const cnpj = document.getElementById('empresa-input-cnpj')?.value.trim();
    const telefone = document.getElementById('empresa-input-telefone')?.value.trim();
    const endereco = document.getElementById('empresa-input-endereco')?.value.trim();

    if (!nome) return window.mostrarToast("O nome da empresa é obrigatório.", "erro");

    if (!perfilAtual?.is_admin) return window.mostrarToast('Apenas administradores podem editar a empresa.', 'erro');
    const payload = { nome_fantasia: nome, telefone, endereco };
    const entrada = document.getElementById('empresa-localizacao').value.trim();
    const raio = document.getElementById('empresa-ponto-raio').value.trim();
    if (entrada || raio) {
        let local;
        try { local = lerLocalizacaoEmpresa(entrada); } catch { local = null; }
        if (!local) return window.mostrarToast('Informe as coordenadas ou abra o link do Maps e copie as coordenadas do marcador.', 'erro');
        if (!/^\d+$/.test(raio) || Number(raio) < 1 || Number(raio) > 2147483647) {
            return window.mostrarToast('Informe o raio em metros como número inteiro positivo.', 'erro');
        }
        Object.assign(payload, {
            ponto_latitude: local.latitude,
            ponto_longitude: local.longitude,
            ponto_raio_m: Number(raio)
        });
    } else if (dadosEmpresaAtual?.ponto_latitude != null) {
        Object.assign(payload, {ponto_latitude: null, ponto_longitude: null, ponto_raio_m: null});
    }

    if (window.normalizarCNPJ(cnpj) !== window.normalizarCNPJ(dadosEmpresaAtual?.cnpj)) return window.mostrarToast('O CNPJ é a identidade da empresa e não pode ser trocado aqui.', 'erro');

    let resError = null;
    const empresa = empresaAtualId;
    const uid = usuarioAtual?.id;
    if (empresa) {
        const { data, error } = await cliente.from('empresas').update(payload).eq('id', empresa).select('id').maybeSingle();
        if (empresaAtualId !== empresa || usuarioAtual?.id !== uid) return;
        resError = error || (!data && {message: 'Seu acesso não permite alterar esta empresa.'});
    } else {
        resError = {message: 'Empresa não vinculada.'};
    }

    if (resError) {
        window.mostrarToast("Erro ao salvar dados: " + resError.message, "erro");
    } else {
        window.mostrarToast("Dados da empresa salvos com sucesso!");
        dadosEmpresaAtual = { ...(dadosEmpresaAtual || {}), ...payload };
        window.aplicarDadosEmpresaNaTela();
        window.atualizarIndicacaoLocalizacaoPonto?.();
        window.fecharModalPerfilEmpresa();
    }
};

window.carregarDadosEmpresa = async function() {
    const empresa = empresaAtualId;
    const uid = usuarioAtual?.id;
    if (!empresa) return;
    const { data } = await cliente.from('empresas').select('*').eq('id', empresa).maybeSingle();
    if (empresaAtualId !== empresa || usuarioAtual?.id !== uid) return;
    if (data || String(dadosEmpresaAtual?.id) !== String(empresa)) dadosEmpresaAtual = data;
    window.aplicarDadosEmpresaNaTela();
    window.atualizarIndicacaoLocalizacaoPonto?.();
};

window.aplicarDadosEmpresaNaTela = function() {
    const nome = dadosEmpresaAtual?.nome_fantasia || dadosEmpresaAtual?.nome_empresa || 'Suiri';
    const logoTitulo = document.getElementById('login-logo-titulo');
    if (logoTitulo) logoTitulo.textContent = nome;
    document.title = `${nome} - Operacional`;
};

// =========================================================================
// DOSSIÊ DO COLABORADOR
// =========================================================================
window.renderizarPainelPerfilCompleto = async function() {
    const contAbertas = document.getElementById('lista-perfil-tarefas-abertas');
    const contConcluidas = document.getElementById('lista-perfil-tarefas-concluidas');
    if (!contAbertas || !contConcluidas || !usuarioAtual) return;

    contAbertas.innerHTML = '';
    contConcluidas.innerHTML = '';
    let numAbertas = 0, numConcluidas = 0;

    cacheTarefas.forEach(t => {
        const souDono = t.assumido_por === usuarioAtual.id;
        const souAjudante = Array.isArray(t.ajudantes) && t.ajudantes.includes(usuarioAtual.id);
        const atribuidaAMim = t.destinado_a === usuarioAtual.id || (!t.destinado_a && (!t.setor_destinado || t.setor_destinado === perfilAtual?.setor));

        if (t.status === 'concluida' && (souDono || souAjudante)) {
            numConcluidas++;
            const item = document.createElement('div');
            item.style.cssText = "background:var(--vidro-bg); padding:8px; border-radius:6px; font-size:12px; margin-bottom:4px; border:var(--vidro-borda);";
            item.innerHTML = `<strong>${esc(t.titulo)}</strong> - <span style="color:var(--cor-sucesso); font-weight:700;">Concluída</span>`;
            contConcluidas.appendChild(item);
        } else if ((t.status === 'pendente' || t.status === 'em_andamento') && (souDono || souAjudante || atribuidaAMim)) {
            numAbertas++;
            const item = document.createElement('div');
            item.style.cssText = "background:var(--vidro-bg); padding:8px; border-radius:6px; font-size:12px; margin-bottom:4px; border:var(--vidro-borda);";
            item.innerHTML = `<strong>${esc(t.titulo)}</strong> - <span style="color:var(--cor-alerta); font-weight:700;">Em Andamento/Pendente</span>`;
            contAbertas.appendChild(item);
        }
    });

    const totalTarefas = numAbertas + numConcluidas;
    const porcentagem = totalTarefas > 0 ? Math.round((numConcluidas / totalTarefas) * 100) : 0;

    const elPct = document.getElementById('perfil-texto-porcentagem');
    const elQtd = document.getElementById('perfil-qtd-tarefas');
    const elBarra = document.getElementById('perfil-barra-progresso');
    const elStatusMeta = document.getElementById('perfil-status-meta');

    if (elPct) elPct.textContent = `${porcentagem}%`;
    if (elQtd) elQtd.textContent = `${numConcluidas}/${totalTarefas}`;
    if (elBarra) {
        elBarra.style.width = `${porcentagem}%`;
        elBarra.style.background = porcentagem >= 60 ? 'var(--cor-sucesso)' : 'var(--cor-alerta)';
    }
    if (elStatusMeta) {
        if (porcentagem >= 60) {
            elStatusMeta.innerHTML = `<strong style="color:var(--cor-sucesso);">🎉 Meta de 60% atingida com sucesso!</strong>`;
        } else {
            elStatusMeta.textContent = `Faltam ${Math.max(0, Math.ceil(totalTarefas * 0.6) - numConcluidas)} tarefa(s) para atingir a meta mínima.`;
        }
    }

    const cAbertaPerfil = document.getElementById('contador-abertas-perfil');
    const cConclPerfil = document.getElementById('contador-concluidas-perfil');
    if (cAbertaPerfil) cAbertaPerfil.textContent = numAbertas;
    if (cConclPerfil) cConclPerfil.textContent = numConcluidas;

    const { data: vales } = await cliente.from('vales').select('valor').eq('perfil_id', usuarioAtual.id).or('pago.is.null,pago.eq.false');
    const totalVales = vales?.reduce((acc, v) => acc + Number(v.valor), 0) || 0;
    const elResumoVales = document.getElementById('perfil-resumo-vales');
    if (elResumoVales) elResumoVales.textContent = totalVales.toLocaleString('pt-BR', {style:'currency',currency:'BRL'});

    const { data: compras } = await cliente.from('itens_comprados').select('valor_final').eq('perfil_id', usuarioAtual.id);
    const totalCompras = compras?.reduce((acc, c) => acc + Number(c.valor_final), 0) || 0;
    const elResumoCompras = document.getElementById('perfil-resumo-compras');
    if (elResumoCompras) elResumoCompras.textContent = totalCompras.toLocaleString('pt-BR', {style:'currency',currency:'BRL'});

    const totalDescontos = totalVales + totalCompras;
    const elResumoDescontos = document.getElementById('perfil-resumo-descontos');
    if (elResumoDescontos) elResumoDescontos.textContent = `R$ ${totalDescontos.toFixed(2)}`;

    const tipoContrato = perfilAtual?.tipo_contrato || 'fixo';
    const elTagContrato = document.getElementById('perfil-tag-contrato');
    const elLabelRemuneracao = document.getElementById('perfil-label-remuneracao');
    const elResumoRemuneracao = document.getElementById('perfil-resumo-remuneracao');
    const elResumoLiquido = document.getElementById('perfil-resumo-liquido');

    let totalGanhos = 0;

    if (tipoContrato === 'freelance') {
        if (elTagContrato) elTagContrato.textContent = 'Freelancer';
        if (elLabelRemuneracao) elLabelRemuneracao.textContent = 'Diárias Acumuladas (Mês)';

        const inicioMesStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        
        const { data: pontosMes } = await cliente.from('livro_ponto')
            .select('*')
            .eq('perfil_id', usuarioAtual.id)
            .gte('data_registro', inicioMesStr)
            .or('status_turno.eq.presente,status_turno.eq.diaria_aprovada');

        const diasValidados = pontosMes?.filter(p => p.horario_saida || p.status_turno === 'diaria_aprovada')?.length || 0;
        const valorDiaria = Number(perfilAtual?.valor_diaria) || 0;
        totalGanhos = diasValidados * valorDiaria;

        if (elResumoRemuneracao) elResumoRemuneracao.textContent = `R$ ${totalGanhos.toFixed(2)} (${diasValidados} d)`;
    } else {
        if (elTagContrato) elTagContrato.textContent = 'Fixo';
        if (elLabelRemuneracao) elLabelRemuneracao.textContent = 'Salário Base';
        totalGanhos = Number(perfilAtual?.salario_base) || 0;
        if (elResumoRemuneracao) elResumoRemuneracao.textContent = `R$ ${totalGanhos.toFixed(2)}`;
    }

    const liquidoReceber = Math.max(0, totalGanhos - totalDescontos);
    if (elResumoLiquido) elResumoLiquido.textContent = `R$ ${liquidoReceber.toFixed(2)}`;

    const boxEnvioFoto = document.getElementById('box-envio-foto-perfil');
    if (boxEnvioFoto) {
        boxEnvioFoto.classList.toggle('oculto', !!perfilAtual?.avatar_url);
    }

    window.carregarFinanceiroSeparado();
};

window.carregarFinanceiroSeparado = async function() {
    const contFin = document.getElementById('lista-perfil-financeiro');
    if (!contFin || !usuarioAtual || !empresaAtualId) return;

    const usuario = usuarioAtual.id;
    const empresa = empresaAtualId;
    const [{ data: vales, error: erroVales }, { data: compras, error: erroCompras }] = await Promise.all([
        cliente.from('vales').select('*').eq('perfil_id', usuario).order('data_vale', { ascending: false }),
        cliente.from('itens_comprados').select('*').eq('perfil_id', usuario).order('data_compra', { ascending: false })
    ]);
    if (usuarioAtual?.id !== usuario || empresaAtualId !== empresa) return;
    if (erroVales || erroCompras) {
        contFin.textContent = 'Não foi possível carregar o extrato. Atualize a página e tente novamente.';
        return;
    }

    let listaUnificada = [];

    (vales || []).forEach(v => {
        listaUnificada.push({
            id: v.id,
            tipo: 'vale',
            descricao: v.observacao ? `Vale: ${v.observacao}` : 'Vale / Adiantamento',
            valor: Number(v.valor) || 0,
            data: v.data_vale || v.criado_em?.split('T')[0] || '',
            pago: !!v.pago
        });
    });

    (compras || []).forEach(c => {
        listaUnificada.push({
            id: c.id,
            tipo: 'compra',
            descricao: c.descricao_item || 'Consumo Próprio',
            valor: Number(c.valor_final) || 0,
            data: c.data_compra || '',
            pago: false
        });
    });

    listaUnificada.sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    if (listaUnificada.length === 0) {
        contFin.innerHTML = '<div style="font-size:11px; color:var(--texto-suave); padding:8px 0; text-align:center;">Nenhum vale ou consumo registrado.</div>';
        return;
    }

    let html = '';
    listaUnificada.forEach(item => {
        const ehVale = item.tipo === 'vale';
        const tag = ehVale 
            ? `<span style="color:var(--cor-erro); font-weight:700;">[VALE]</span>` 
            : `<span style="color:var(--cor-primaria); font-weight:700;">[CONSUMO]</span>`;

        const dataFormatada = item.data ? item.data.split('-').reverse().join('/') : '-';
        const corValor = ehVale ? 'var(--cor-erro)' : 'var(--cor-primaria)';

        html += `
            <div class="perfil-item-financeiro-linha">
                <div style="flex:1;">
                    <div>${tag} <strong>${esc(item.descricao)}</strong></div>
                    <div style="font-size:10px; color:var(--texto-suave);">Data: ${dataFormatada} ${ehVale ? (item.pago ? '• <span style="color:var(--cor-sucesso); font-weight:700;">Quitado</span>' : '• Em aberto') : ''}</div>
                </div>
                <div style="text-align:right;">
                    <strong style="color:${corValor}; font-size:12px; display:block; margin-bottom:2px;">R$ ${item.valor.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong>
                    ${window.podeSuiri?.('financeiro') ? `<button class="btn-editar-consumo" onclick="window.abrirModalEditarItem('${item.id}', ${window.atributoJS(item.descricao)}, ${item.valor}, 0, '${item.tipo}', '${item.data}')">Editar</button>` : ''}
                </div>
            </div>
        `;
    });

    contFin.innerHTML = html;
};

window.abrirModalEditarItem = function(id, desc, valor, pct_desc, tipo = 'compra', dataReg = '') {
    window.somPop();
    const elId = document.getElementById('edit-item-id');
    const elTipo = document.getElementById('edit-item-tipo');
    const elData = document.getElementById('edit-item-data');
    const elDesc = document.getElementById('edit-item-desc');
    const elVal = document.getElementById('edit-item-valor');
    const elPct = document.getElementById('edit-item-desc-pct');
    const boxPct = document.getElementById('box-edit-desconto-pct');
    const tituloModal = document.getElementById('titulo-modal-editar-item');

    if (elId) elId.value = id;
    if (elTipo) elTipo.value = tipo;
    if (elData) elData.value = dataReg || window.dataLocal();
    if (elDesc) elDesc.value = desc;
    if (elVal) elVal.value = valor;
    if (elPct) elPct.value = pct_desc || 0;

    if (tituloModal) {
        tituloModal.textContent = tipo === 'vale' ? 'Editar Vale / Adiantamento' : 'Editar Item Consumido';
    }

    if (boxPct) {
        boxPct.style.display = (tipo === 'vale') ? 'none' : 'block';
    }

    window.calcularEditFinal();
    document.getElementById('modal-editar-item')?.classList.remove('oculto');
};

window.fecharModalEditarItem = function() {
    document.getElementById('modal-editar-item')?.classList.add('oculto');
};

window.calcularEditFinal = function() {
    const tipo = document.getElementById('edit-item-tipo')?.value || 'compra';
    const v = parseFloat(document.getElementById('edit-item-valor')?.value) || 0;
    const d = tipo === 'vale' ? 0 : (parseFloat(document.getElementById('edit-item-desc-pct')?.value) || 0);
    const elFin = document.getElementById('edit-item-final');
    if (elFin) elFin.value = (v - (v * (d / 100))).toFixed(2);
};

window.salvarEdicaoItem = async function() {
    const id = document.getElementById('edit-item-id')?.value;
    const tipo = document.getElementById('edit-item-tipo')?.value || 'compra';
    const dataReg = document.getElementById('edit-item-data')?.value || window.dataLocal();
    const desc = document.getElementById('edit-item-desc')?.value.trim();
    const v = parseFloat(document.getElementById('edit-item-valor')?.value) || 0;
    const d = tipo === 'vale' ? 0 : (parseFloat(document.getElementById('edit-item-desc-pct')?.value) || 0);
    const f = parseFloat(document.getElementById('edit-item-final')?.value) || 0;

    if (!id || isNaN(v) || v <= 0) return window.mostrarToast("Informe um valor válido.", "erro");

    let resError = null;

    if (tipo === 'vale') {
        const { error } = await cliente.from('vales').update({
            valor: v,
            data_vale: dataReg,
            observacao: desc || null
        }).eq('id', id);
        resError = error;
    } else {
        const { error } = await cliente.from('itens_comprados').update({
            descricao_item: desc,
            data_compra: dataReg,
            valor_unitario: v,
            porcentagem_desconto: d,
            valor_final: f
        }).eq('id', id);
        resError = error;
    }

    if (resError) {
        window.mostrarToast("Erro ao atualizar: " + resError.message, "erro");
    } else {
        window.mostrarToast(tipo === 'vale' ? "Vale atualizado com sucesso!" : "Item atualizado com sucesso!");
        window.fecharModalEditarItem();
        if (typeof window.renderizarPainelPerfilCompleto === 'function') window.renderizarPainelPerfilCompleto();

        const selInspecao = document.getElementById('select-inspecionar-colab');
        if (selInspecao && selInspecao.value) {
            window.inspecionarColaborador(selInspecao.value);
        }
    }
};

window.excluirItemCompradoModal = async function() {
    const id = document.getElementById('edit-item-id')?.value;
    const tipo = document.getElementById('edit-item-tipo')?.value || 'compra';
    if (!id) return;

    if (!confirm(tipo === 'vale' ? "Deseja excluir este vale permanentemente?" : "Deseja excluir este item consumido permanentemente?")) return;

    let resError = null;
    if (tipo === 'vale') {
        const { error } = await cliente.from('vales').delete().eq('id', id);
        resError = error;
    } else {
        const { error } = await cliente.from('itens_comprados').delete().eq('id', id);
        resError = error;
    }

    if (resError) {
        window.mostrarToast("Erro ao excluir: " + resError.message, "erro");
    } else {
        window.mostrarToast(tipo === 'vale' ? "Vale excluído com sucesso!" : "Item excluído com sucesso!");
        window.fecharModalEditarItem();
        if (typeof window.renderizarPainelPerfilCompleto === 'function') window.renderizarPainelPerfilCompleto();

        const selInspecao = document.getElementById('select-inspecionar-colab');
        if (selInspecao && selInspecao.value) {
            window.inspecionarColaborador(selInspecao.value);
        }
    }
};

// =========================================================================
// FLUXO DE VALIDAÇÃO DE CNPJ ANTES DE CRIAR A CONTA (ONBOARDING)
// =========================================================================
function garantirModalValidacaoCNPJ() {
    let modal = document.getElementById('modal-onboarding-cnpj');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'modal-onboarding-cnpj';
    modal.className = 'modal-overlay oculto';
    modal.style.zIndex = '999999';
    modal.innerHTML = `
        <div class="modal-conteudo" style="max-width: 420px; text-align: left;">
            <div class="modal-header" style="margin-bottom: 12px;">
                <h3 style="margin: 0; color: var(--cor-primaria);">Identificação da Empresa</h3>
                <button type="button" class="btn-secundario" id="btn-cancelar-onboarding-cnpj" style="padding: 4px 8px;">✕</button>
            </div>
            <p style="font-size: 12px; color: var(--texto-suave); margin-bottom: 12px;">
                Informe o CNPJ da sua empresa para vincular os acessos de forma privada.
            </p>
            <div class="input-group" style="margin-bottom: 10px;">
                <label for="input-onboarding-cnpj" style="font-size: 11px; font-weight: 700;">CNPJ da Empresa</label>
                <input type="text" id="input-onboarding-cnpj" placeholder="00.000.000/0000-00" maxlength="18" autocapitalize="characters">
            </div>
            <p id="onboarding-empresa-encontrada" class="empresa-encontrada oculto" aria-live="polite"></p><p id="msg-erro-onboarding-cnpj" class="mensagem-erro oculto" style="margin-bottom: 10px;"></p>
            <div style="display: flex; gap: 8px;">
                <button type="button" class="btn-secundario" id="btn-voltar-onboarding-cnpj" style="flex: 1;">Voltar</button>
                <button type="button" class="btn-principal" id="btn-confirmar-onboarding-cnpj" style="flex: 2; margin-top: 0;">Buscar empresa</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-cancelar-onboarding-cnpj').onclick = fecharModalValidacaoCNPJ;
    document.getElementById('btn-voltar-onboarding-cnpj').onclick = fecharModalValidacaoCNPJ;
    document.getElementById('btn-confirmar-onboarding-cnpj').onclick = confirmarValidacaoCNPJeCriarConta;
    return modal;
}

function abrirModalValidacaoCNPJ() {
    const modal = garantirModalValidacaoCNPJ();
    const inCnpj = document.getElementById('input-onboarding-cnpj');
    const msgErro = document.getElementById('msg-erro-onboarding-cnpj');
    if (inCnpj) inCnpj.value = ''; window.cnpjConfirmado = null; document.getElementById('onboarding-empresa-encontrada')?.classList.add('oculto');
    if (msgErro) msgErro.classList.add('oculto');
    modal.classList.remove('oculto');
}

function fecharModalValidacaoCNPJ() {
    const modal = document.getElementById('modal-onboarding-cnpj');
    if (modal) modal.classList.add('oculto');
    dadosPreCadastroTemporario = null;
    const btnEntrar = document.getElementById('btn-entrar');
    if (btnEntrar) {
        btnEntrar.textContent = 'Criar Minha Conta';
        btnEntrar.disabled = false;
    }
}

async function consultarDadosCNPJReceita(cnpjLimpo) {
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
    try {
        const resp=await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`,{signal:controller.signal});
        if(!resp.ok)return null;return await resp.json();
    } catch {return null;} finally {clearTimeout(timeout);}
}

async function confirmarValidacaoCNPJeCriarConta() {
    const btn = document.getElementById('btn-confirmar-onboarding-cnpj');
    const erro = document.getElementById('msg-erro-onboarding-cnpj');
    const cnpj = window.normalizarCNPJ(document.getElementById('input-onboarding-cnpj')?.value);
    erro.classList.add('oculto');
    if (!window.validarCNPJ(cnpj)) {
        erro.textContent = 'Confira o CNPJ: ele deve ter 14 caracteres e dígitos verificadores válidos.';
        erro.classList.remove('oculto'); return;
    }
    if (!dadosPreCadastroTemporario) return fecharModalValidacaoCNPJ();
    btn.disabled = true;
    try {
        btn.textContent = 'Buscando dados da empresa…';
        const dados = window.cnpjConfirmado===cnpj ? window.cnpjDadosConfirmados : await consultarDadosCNPJReceita(cnpj);
        if (!dados) throw new Error('Não foi possível consultar esse CNPJ. Confira o número ou tente novamente em instantes. Nenhuma empresa foi criada.');
        const nomeEmpresa = (dados.nome_fantasia || dados.razao_social || '').trim();
        if (!nomeEmpresa) throw new Error('A consulta não retornou o nome da empresa. Tente novamente.');
        const info = document.getElementById('onboarding-empresa-encontrada');
        if (!window.cnpjConfirmado || window.cnpjConfirmado !== cnpj) {
            info.textContent = nomeEmpresa + ' • ' + (dados.municipio || '') + '/' + (dados.uf || '');
            info.classList.remove('oculto'); window.cnpjConfirmado = cnpj; window.cnpjDadosConfirmados=dados;
            btn.textContent = 'Confirmar empresa e criar conta'; return;
        }
        const {email, senha, nome} = dadosPreCadastroTemporario;
        const {data:versaoBanco,error:erroVersao}=await cliente.rpc('suiri_versao');
        if(erroVersao || versaoBanco!==4)throw new Error('Instale primeiro a atualização do banco V4 incluída no ZIP.');
        btn.textContent = 'Criando conta…'; window.cadastroEmAndamento = true;
        const {data, error} = await cliente.auth.signUp({email, password: senha, options: {
            emailRedirectTo: window.suiriAndroid?.site || location.href.split('#')[0].split('?')[0],
            data: {nome, suiri_cnpj: cnpj, suiri_empresa: {
                nome_fantasia: nomeEmpresa, razao_social: dados.razao_social || nomeEmpresa,
                telefone: dados.ddd_telefone_1 || '',
                endereco: [dados.logradouro, dados.numero, dados.bairro, dados.municipio, dados.uf].filter(Boolean).join(', ')
            }}
        }});
        if (error) throw error;
        if (!data?.user || data.user.identities?.length === 0) throw new Error('Esse e-mail já pode estar cadastrado. Entre na sua conta ou recupere a senha.');
        fecharModalValidacaoCNPJ();
        if (!data.session) {
            modoCadastro = true; window.alternarModoCadastro();
            window.mostrarToast('Confirme o e-mail recebido e depois entre. A empresa e o cargo da sua conta já foram reservados.', 'info');
            document.getElementById('senha').value = ''; return;
        }
        usuarioAtual = data.user;
        await window.iniciarApp();
    } catch(e) {
        erro.textContent = e.message || 'Falha ao criar conta. Tente novamente.';
        erro.classList.remove('oculto');
    } finally {
        window.cadastroEmAndamento = false;
        btn.disabled = false;
        if (!window.cnpjConfirmado) btn.textContent = 'Buscar empresa';
        else btn.textContent = 'Confirmar empresa e criar conta';
    }
}

// EXPORTAÇÃO GLOBAL EXPLÍCITA DA FUNÇÃO PARA O HTML
window.alternarModoCadastro = function() {
    modoCadastro = !modoCadastro;
    const gNome = document.getElementById('grupo-nome');
    const gSetor = document.getElementById('grupo-setor');
    const btnEntrar = document.getElementById('btn-entrar');
    const linkAlt = document.getElementById('link-alternar-modo');

    if (gNome) gNome.classList.toggle('oculto', !modoCadastro);
    if (gSetor) gSetor.classList.add('oculto');
    document.getElementById('nome-cadastro').required = modoCadastro;
    document.getElementById('senha').minLength = modoCadastro ? 8 : 1;
    if (btnEntrar) btnEntrar.textContent = modoCadastro ? 'Criar Minha Conta' : 'Entrar no Sistema';
    if (linkAlt) linkAlt.textContent = modoCadastro ? 'Já tem conta? Entrar' : 'Não tem conta? Cadastre-se';
};
var alternarModoCadastro = window.alternarModoCadastro;

// =========================================================================
// INICIALIZAÇÃO DA SESSÃO
// =========================================================================
window.iniciarApp = async function() {
    if (window.inicializacaoSuiri) return window.inicializacaoSuiri;
    window.inicializacaoSuiri = window.iniciarAppSeguro();
    try { return await window.inicializacaoSuiri; }
    finally { window.inicializacaoSuiri = null; }
};
window.iniciarAppSeguro = async function() {
    if (!usuarioAtual || !cliente) return;
    const telaLogin = document.getElementById('tela-login');
    const telaApp = document.getElementById('tela-app');
    try {
        if (!navigator.onLine) throw new Error('Conecte-se à internet para abrir sua sessão.');
        const {data:versaoBanco,error:erroVersao}=await cliente.rpc('suiri_versao');
        if (erroVersao) throw erroVersao;
        if (versaoBanco !== 4) throw new Error('A atualização do banco V4 precisa ser instalada. Siga o GUIA_NO_CELULAR incluído no ZIP.');
        let resultado = await cliente.from('perfis').select('*').eq('id', usuarioAtual.id).maybeSingle();
        if (resultado.error) throw resultado.error;
        if (!resultado.data?.empresa_id) {
            const meta = usuarioAtual.user_metadata || {};
            if (!meta.suiri_cnpj) throw new Error('Sua conta ainda não está vinculada a uma empresa. Use “Vincular minha conta” abaixo para informar o CNPJ.');
            const vinculo = await cliente.rpc('suiri_vincular_empresa', {p_cnpj: meta.suiri_cnpj, p_nome: meta.nome || 'Colaborador', p_empresa: meta.suiri_empresa || {}});
            if (vinculo.error) throw vinculo.error;
            resultado = await cliente.from('perfis').select('*').eq('id', usuarioAtual.id).single();
            if (resultado.error) throw resultado.error;
        }
        perfilAtual = resultado.data;
        if (!perfilAtual?.empresa_id) throw new Error('Vínculo da empresa não encontrado. Atualize o banco com o SQL do pacote.');
        empresaAtualId = perfilAtual.empresa_id;
    } catch(e) {
        telaApp?.classList.add('oculto'); telaLogin?.classList.remove('oculto');
        const erro = document.getElementById('msg-erro');
        const falhaDeRede = !navigator.onLine || /failed to fetch|networkerror|load failed/i.test(e.message || '');
        erro.textContent = falhaDeRede
            ? 'Conecte-se à internet para abrir sua sessão. Os registros na fila serão enviados após reconectar.'
            : 'Não foi possível abrir a empresa: ' + e.message;
        erro.classList.remove('oculto');
        document.getElementById('vinculo-pendente')?.classList.toggle('oculto', falhaDeRede);
        return;
    }
    document.getElementById('abertura-suiri')?.classList.add('oculto');
    telaLogin?.classList.add('oculto'); telaApp?.classList.remove('oculto');
    document.getElementById('msg-erro')?.classList.add('oculto');
    document.getElementById('vinculo-pendente')?.classList.add('oculto');

    await window.carregarDadosEmpresa();

    // FILTRO MULTI-EMPRESA PRIVADO
    let queryPerfis = cliente.from('perfis').select('*').order('nome');
    if (empresaAtualId) {
        queryPerfis = queryPerfis.eq('empresa_id', empresaAtualId);
    }
    const { data: perfisCompletos, error: erroEquipe } = await queryPerfis;
    const {data: equipeBasica, error: erroDiretorio} = await cliente.rpc('suiri_equipe_basica');
    if (erroEquipe || erroDiretorio) window.mostrarToast('Não foi possível atualizar toda a equipe. Confira a conexão e a atualização do banco.', 'erro');
    const funcs = (equipeBasica || []).map(p => ({...p,...(perfisCompletos || []).find(f => f.id === p.id)}));
    if(funcs) {
        mapaNomes = {};
        mapaPerfis = {};
        funcs.forEach(f => { mapaNomes[f.id] = f.nome; mapaPerfis[f.id] = f; });
    }
    
    const nomeUsr = document.getElementById('nome-usuario');
    if(perfilAtual?.nome && nomeUsr) nomeUsr.textContent = perfilAtual.nome;

    const tagSetor = document.getElementById('tag-meu-setor');
    if (tagSetor && perfilAtual?.setor) tagSetor.textContent = perfilAtual.setor;

    await window.prepararAvataresSuiri?.([perfilAtual, ...funcs]);
    const fotoPerfil = window.urlAvatarSuiri ? window.urlAvatarSuiri(perfilAtual?.avatar_url) : perfilAtual?.avatar_url;
    const avatarImg = document.getElementById('avatar-img');
    const avatarPlaceholder = document.getElementById('avatar-placeholder');
    if (fotoPerfil && avatarImg && avatarPlaceholder) {
        avatarImg.src = fotoPerfil;
        avatarImg.classList.remove('oculto');
        avatarPlaceholder.classList.add('oculto');
    } else if (avatarPlaceholder && avatarImg) {
        avatarImg.classList.add('oculto');
        avatarPlaceholder.classList.remove('oculto');
        avatarPlaceholder.textContent = perfilAtual?.nome ? perfilAtual.nome.charAt(0).toUpperCase() : '?';
    }

    const isAdmin = !!perfilAtual?.is_admin;
    const isSocio = !!perfilAtual?.is_socio;
    const isGerente = !!perfilAtual?.is_gerente;

    const permissoes = isAdmin 
        ? ['tarefas', 'avisos', 'compras', 'relatorios', 'ponto', 'financeiro', 'inspecao', 'setores', 'contas', 'fechar_caixa', 'gestao'] 
        : (isSocio ? (perfilAtual?.permissoes_socio || []) 
        : (isGerente ? (perfilAtual?.permissoes_gerente || []) : []));

    const podeFecharCaixa = isAdmin || !!perfilAtual?.pode_fechar_caixa || permissoes.includes('fechar_caixa');
    const btnNovoCaixa = document.getElementById('btn-toggle-form-caixa');
    if (btnNovoCaixa) {
        btnNovoCaixa.classList.toggle('oculto', !podeFecharCaixa);
    }

    const podeVerGestao = isAdmin || permissoes.includes('gestao') || permissoes.includes('compras') || permissoes.includes('contas') || permissoes.includes('financeiro') || permissoes.includes('fechar_caixa') || !!perfilAtual?.pode_fechar_caixa;
    const podeVerRelatorios = isAdmin || permissoes.includes('relatorios');
    const podeVerPainel = isAdmin || isSocio || permissoes.includes('inspecao');

    const btnPainelTopo = document.getElementById('btn-tela-painel');
    const btnRelatoriosTopo = document.getElementById('btn-tela-relatorios');
    const btnGestaoTopo = document.getElementById('btn-tela-gestao');
    const btnPerfilTopo = document.getElementById('btn-tela-perfil');
    const btnAutonoma = document.getElementById('btn-tarefa-autonoma');

    if (btnPerfilTopo) btnPerfilTopo.classList.remove('oculto');
    if (btnPainelTopo) btnPainelTopo.classList.toggle('oculto', !podeVerPainel);
    if (btnRelatoriosTopo) btnRelatoriosTopo.classList.toggle('oculto', !podeVerRelatorios);
    if (btnGestaoTopo) btnGestaoTopo.classList.toggle('oculto', !podeVerGestao);

    const ehStaffSimples = !isAdmin && !isSocio && !isGerente && !podeVerGestao && !podeVerRelatorios;
    if (btnAutonoma) {
        btnAutonoma.classList.toggle('oculto', !ehStaffSimples);
    }

    const btnAdminTopo = document.getElementById('btn-tela-admin');
    if (btnAdminTopo) {
        if (isAdmin || isSocio) btnAdminTopo.classList.remove('oculto');
        else btnAdminTopo.classList.add('oculto');
    }

    document.querySelectorAll('.btn-admin-only').forEach(el => {
        if (isAdmin || isSocio || isGerente) el.classList.remove('oculto'); 
        else el.classList.add('oculto');
    });

    const podeVerFin = !!window.podeSuiri?.('financeiro');
    for (const id of ['atalho-vale-missao', 'atalho-vale-inspecao']) {
        document.getElementById(id)?.classList.toggle('oculto', !podeVerFin);
    }
    const formVale = document.getElementById('form-lancar-vale');
    if (formVale) {
        const sessaoVale = empresaAtualId + ':' + usuarioAtual.id;
        const mesmaSessao = formVale.dataset.sessao === sessaoVale;
        if (!mesmaSessao || !podeVerFin) {
            formVale.reset();
            formVale.dataset.sessao = sessaoVale;
            document.getElementById('vale-status').textContent = '';
            document.getElementById('input-data-vale').value = window.dataLocal();
        }
        const selVale = document.getElementById('select-func-vale');
        const selCompra = document.getElementById('select-func-compra');
        const selecionados = [selVale, selCompra].map(el => mesmaSessao ? el.value : '');
        selVale.replaceChildren(new Option('Selecione um funcionário', ''));
        selCompra.replaceChildren(new Option('Quem comprou?', ''));
        if (podeVerFin) {
            for (const f of funcs || []) {
                selVale.add(new Option(f.nome, f.id));
                selCompra.add(new Option(f.nome, f.id));
            }
            [selVale, selCompra].forEach((el, i) => {
                if (mapaPerfis[selecionados[i]]) el.value = selecionados[i];
            });
        }
        window.ajustarTextoValePorSocio(selVale.value);
    }

    const selFuncTarefa = document.getElementById('select-funcionario');
    if (selFuncTarefa) {
        selFuncTarefa.innerHTML = '<option value="">Qualquer Pessoa</option>';
        funcs?.forEach(f => selFuncTarefa.innerHTML += `<option value="${f.id}">${esc(f.nome)}</option>`);
    }

    const selFuncRelatorio = document.getElementById('filtro-func-relatorio');
    if (selFuncRelatorio) {
        selFuncRelatorio.innerHTML = '<option value="todos">Toda a Equipe</option>';
        funcs?.forEach(f => selFuncRelatorio.innerHTML += `<option value="${f.id}">${esc(f.nome)}</option>`);
    }

    document.getElementById('select-inspecionar-colab').value = '';
    window.prepararTelaAdministracao();

    if(typeof window.carregarTarefas === 'function') window.carregarTarefas();
    if(typeof window.carregarAvisos === 'function') window.carregarAvisos();
    if(typeof window.carregarStatusPonto === 'function') window.carregarStatusPonto();
    if(typeof window.carregarPedidosCompra === 'function') window.carregarPedidosCompra();
    if(typeof window.inicializarCardapioConsumo === 'function') window.inicializarCardapioConsumo();
    if(typeof window.verificarContasVencendoHojeGestao === 'function' && podeVerGestao) window.verificarContasVencendoHojeGestao();

    const telaGravada = window.obterTelaHomeTravada();
    if (telaGravada && telaGravada !== 'operacao') {
        if (telaGravada === 'perfil') {
            window.abrirPainelPerfil();
        } else if (telaGravada === 'painel' && podeVerPainel) {
            window.abrirPainelAoVivo();
        } else if (telaGravada === 'gestao' && podeVerGestao) {
            window.alternarTelas('gestao');
        } else if (telaGravada === 'relatorios' && podeVerRelatorios) {
            window.alternarTelas('relatorios');
        } else if (telaGravada === 'admin' && (isAdmin || podeVerRelatorios)) {
            window.alternarTelas('admin');
        } else {
            window.atualizarVisualCadeadosHome('operacao');
        }
    } else {
        window.atualizarVisualCadeadosHome('operacao');
    }

    window.atualizarIndicadorOffline();
    window.processarFilaOffline();
};

let sessaoSuiriRecarregando = false;
window.recarregarSessaoSuiri = function() {
    if (sessaoSuiriRecarregando) return;
    sessaoSuiriRecarregando = true;
    document.body.classList.add('suiri-sessao-transicao');
    usuarioAtual = null;
    perfilAtual = null;
    empresaAtualId = null;
    try {
        window.pararInterfaceSuiri?.();
        window.fecharLeitorCameraGestao?.();
    } finally {
        window.location.reload();
    }
};

window.fazerLogoff = async function() {
    if (cliente) await cliente.auth.signOut();
    window.recarregarSessaoSuiri();
};

window.verificarSessao = async function() {
    const abertura = document.getElementById('abertura-suiri');
    const telaLogin = document.getElementById('tela-login');
    const telaApp = document.getElementById('tela-app');
    try {
        if (!cliente) throw new Error('A conexão com o serviço de login está indisponível.');
        const {data: {session}, error} = await cliente.auth.getSession();
        if (error) throw error;
        if (session?.user) {
            usuarioAtual = session.user;
            await window.iniciarApp();
        }
    } catch (erro) {
        const mensagem = document.getElementById('msg-erro');
        if (mensagem) {
            mensagem.textContent = 'Não foi possível recuperar a sessão. Confira a conexão e tente novamente.';
            mensagem.classList.remove('oculto');
        }
        console.error(erro);
    } finally {
        abertura?.classList.add('oculto');
        if (telaApp?.classList.contains('oculto')) telaLogin?.classList.remove('oculto');
    }
};

window.addEventListener('online', () => {
    if (usuarioAtual && !empresaAtualId && document.getElementById('tela-app')?.classList.contains('oculto')) {
        window.iniciarApp();
    }
});

if (cliente && cliente.auth) {
    cliente.auth.onAuthStateChange((event, session) => {
        if (sessaoSuiriRecarregando || window.suiriConfirmandoTroca) return;
        const outroUsuario = session?.user?.id && session.user.id !== usuarioAtual?.id;
        if (usuarioAtual && (event === 'SIGNED_OUT' || outroUsuario)) {
            window.recarregarSessaoSuiri();
            return;
        }
        if (event === 'SIGNED_IN' && session && !window.cadastroEmAndamento) {
            usuarioAtual = session.user;
            setTimeout(() => {
                if (!sessaoSuiriRecarregando && !window.suiriConfirmandoTroca
                    && document.getElementById('tela-app')?.classList.contains('oculto')) window.iniciarApp();
            }, 0);
        } else if (event === 'PASSWORD_RECOVERY') {
            setTimeout(() => window.abrirRecuperacaoSuiri(), 0);
        } else if (event === 'SIGNED_OUT') {
            window.pararInterfaceSuiri?.();
            usuarioAtual = null; perfilAtual = null; empresaAtualId = null;
            window.fecharLeitorCameraGestao?.();
            window.inicializarCardapioConsumo?.();
            window.atualizarConsumoSuiri?.();
            document.getElementById('tela-app')?.classList.add('oculto');
            document.getElementById('tela-login')?.classList.remove('oculto');
        }
    });
}

// ------------------ EVENTOS DE INICIALIZAÇÃO ------------------
document.addEventListener("DOMContentLoaded", () => {
    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            const msgErro = document.getElementById('msg-erro');
            const btnEntrar = document.getElementById('btn-entrar');
            
            if (msgErro) msgErro.classList.add('oculto');

            const email = document.getElementById('email')?.value.toLowerCase().trim();
            const senha = document.getElementById('senha')?.value;
            const nome = document.getElementById('nome-cadastro')?.value.trim() || '';
            const setor = document.getElementById('setor-cadastro')?.value || 'frente';

            if (!cliente && window.supabase) {
                cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
                });
            }

            if (!cliente) {
                if (msgErro) { msgErro.textContent = 'Falha ao conectar com o banco. Recarregue.'; msgErro.classList.remove('oculto'); }
                return;
            }

            if (modoCadastro) {
                if (!email || !senha || senha.length < 8 || !nome) {
                    if (msgErro) { msgErro.textContent = 'Informe seu nome, e-mail e uma senha de pelo menos 8 caracteres.'; msgErro.classList.remove('oculto'); }
                    return;
                }
                
                // Segura os dados na memória e abre o modal de CNPJ antes de criar no banco
                dadosPreCadastroTemporario = { email, senha, nome, setor };
                abrirModalValidacaoCNPJ();
            } else {
                if (btnEntrar) { btnEntrar.textContent = 'Autenticando...'; btnEntrar.disabled = true; }
                const { data, error } = await cliente.auth.signInWithPassword({ email: email, password: senha });
                if (error) {
                    if (msgErro) { msgErro.textContent = 'Dados inválidos. Verifique e tente novamente.'; msgErro.classList.remove('oculto'); }
                    window.somErro();
                } else {
                    usuarioAtual = data.user;
                    await window.iniciarApp();
                }
                if (btnEntrar) {
                    btnEntrar.textContent = 'Entrar no Sistema';
                    btnEntrar.disabled = false;
                }
            }
        });
    }

    window.verificarSessao();
});
