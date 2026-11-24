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
    const btn = docu