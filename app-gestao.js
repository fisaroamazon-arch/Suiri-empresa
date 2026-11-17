// ==========================================
// SUPAY / SUIRI - APP-GESTAO.JS (Suiri 2.0)
// Gestão Unificada: Compras (Janela 3 Dias), Contas a Pagar (7 Dias), Fechamento de Caixa Diário, Relatórios PDF e Cardápio Completo
// ==========================================

// =========================================================================
// 🛒 1. MÓDULO DE COMPRAS, REPOSIÇÃO & ESTOQUE (JANELA DE 3 DIAS PARA COMPRADOS)
// =========================================================================

let cachePedidosCompra = [];

const CATEGORIAS_COMPRA = [
    "Frutos do mar",
    "Proteínas, carboidratos e cereais",
    "Hortaliças",
    "Produtos de limpeza e similares",
    "Bebidas"
];

window.criarPedidoCompra = async function() {
    const input = document.getElementById('input-pedido');
    const selCat = document.getElementById('select-categoria-pedido');
    const itemNome = input?.value?.trim();
    const categoria = selCat?.value || 'Frutos do mar';

    if (!itemNome) return window.mostrarToast("Digite o item em falta.", "erro");

    const payload = {
        mensagem: itemNome,
        categoria: categoria,
        status: 'pendente',
        lido: false,
        criado_por: usuarioAtual.id
    };

    const { error } = await cliente.from('pedidos_compra').insert([payload]);
    if (error) {
        window.mostrarToast("Erro: " + error.message, "erro");
    } else {
        if (typeof window.somIniciarTarefa === 'function') window.somIniciarTarefa();
        window.mostrarToast("Solicitação de compra enviada à gerência!");
        input.value = '';
        window.carregarPedidosCompra();
        window.renderizarQuadroComprasUnificado();
    }
};

window.carregarItensComprasModal = async function() {
    const { data, error } = await cliente.from('pedidos_compra').select('*').order('criado_em', { ascending: false });
    if (error) {
        return window.mostrarToast("Erro ao carregar lista de compras: " + error.message, "erro");
    }

    cachePedidosCompra = data || [];
    window.renderizarQuadroComprasModal();
    window.renderizarQuadroComprasUnificado();
};

// Filtro temporal: Pendentes nunca expiram; Comprados ficam visíveis por até 3 dias para reversão
window.obterItensComprasFiltradosPorTempo = function(itens) {
    const agora = new Date();
    const dataLimite3Dias = new Date(agora);
    dataLimite3Dias.setDate(dataLimite3Dias.getDate() - 3);
    const limiteStr3Dias = window.dataLocal(dataLimite3Dias);

    return (itens || []).filter(p => {
        const st = p.status || (p.lido ? 'comprado' : 'pendente');
        // Regra Inviolável: Pendentes NUNCA somem até serem comprados
        if (st === 'pendente') return true;

        // Comprados: Ficam visíveis por até 3 dias após a compra para permitir reversão
        const dataCompradoBase = p.data_comprado || (p.criado_em ? p.criado_em.split('T')[0] : '');
        return dataCompradoBase >= limiteStr3Dias;
    });
};

window.renderizarQuadroComprasModal = function() {
    const container = document.getElementById('container-itens-compras-modal');
    const filtroCat = document.getElementById('filtro-categoria-compras')?.value || 'todos';
    if (!container) return;

    const itensValidos = window.obterItensComprasFiltradosPorTempo(cachePedidosCompra);

    const itensFiltrados = filtroCat === 'todos' 
        ? itensValidos 
        : itensValidos.filter(p => (p.categoria || 'Frutos do mar') === filtroCat);

    container.innerHTML = '';

    if (itensFiltrados.length === 0) {
        container.innerHTML = '<p class="status-texto" style="text-align: center; padding: 24px 0;">Nenhum item encontrado nesta categoria.</p>';
        return;
    }

    const categoriasParaExibir = filtroCat === 'todos' ? CATEGORIAS_COMPRA : [filtroCat];

    categoriasParaExibir.forEach(catNome => {
        const itensDaCat = itensFiltrados.filter(p => (p.categoria || 'Frutos do mar') === catNome);
        if (itensDaCat.length === 0) return;

        const secao = document.createElement('div');
        secao.className = 'secao-categoria-compras';

        const pendentesQtd = itensDaCat.filter(i => (i.status || (i.lido ? 'comprado' : 'pendente')) === 'pendente').length;
        const infoBadge = pendentesQtd > 0 
            ? `<span class="badge-cat-compras" style="color:var(--cor-erro);">${pendentesQtd} pendente(s)</span>` 
            : `<span class="badge-cat-compras" style="color:var(--cor-sucesso);">Tudo comprado</span>`;

        secao.innerHTML = `
            <div class="secao-categoria-compras-titulo">
                <span>🐟 ${esc(catNome)}</span>
                ${infoBadge}
            </div>
            <div class="secao-categoria-compras-lista"></div>
        `;

        const listaDiv = secao.querySelector('.secao-categoria-compras-lista');

        itensDaCat.forEach(item => {
            const st = item.status || (item.lido ? 'comprado' : 'pendente');
            const ehPendente = st === 'pendente';
            const solicitante = window.obterNomeColaborador ? window.obterNomeColaborador(item.criado_por, 'Equipe') : 'Equipe';
            
            const dataPedido = item.criado_em ? item.criado_em.split('T')[0].split('-').reverse().join('/') : '-';
            const dataComprado = item.data_comprado ? item.data_comprado.split('-').reverse().join('/') : dataPedido;

            const card = document.createElement('div');
            card.className = `cartao-compra-item ${ehPendente ? 'cartao-compra-pendente' : 'cartao-compra-comprado'}`;

            const labelData = ehPendente 
                ? `Solicitado em: ${dataPedido}` 
                : `Comprado em: ${dataComprado} (visível por 3 dias para reverter)`;

            const btnAcaoToggle = ehPendente
                ? `<button class="btn-compra-toggle btn-compra-toggle-comprar" onclick="window.marcarItemComoComprado('${item.id}')">✓ Comprar</button>`
                : `<button class="btn-compra-toggle btn-compra-toggle-reverter" onclick="window.reverterItemParaPendente('${item.id}')">↩ Reverter</button>`;

            card.innerHTML = `
                <div class="cartao-compra-info">
                    <span class="cartao-compra-nome">${esc(item.mensagem)}</span>
                    <span class="cartao-compra-data">${labelData}</span>
                    <span class="cartao-compra-solicitante">Solicitante: <strong>${esc(solicitante)}</strong></span>
                </div>
                <div class="cartao-compra-acoes">
                    ${btnAcaoToggle}
                    <button class="btn-compra-excluir" onclick="window.excluirItemCompra('${item.id}')" title="Excluir item definitivamente">🗑️</button>
                </div>
            `;

            listaDiv.appendChild(card);
        });

        container.appendChild(secao);
    });
};

// Renderização na Tela Unificada de Gestão (Pendentes + Comprados nos últimos 3 dias)
window.renderizarQuadroComprasUnificado = function() {
    const container = document.getElementById('container-itens-gestao-compras');
    const filtroCat = document.getElementById('filtro-categoria-gestao-compras')?.value || 'todos';
    if (!container) return;

    const itensValidos = window.obterItensComprasFiltradosPorTempo(cachePedidosCompra);

    const itensFiltrados = filtroCat === 'todos' 
        ? itensValidos 
        : itensValidos.filter(p => (p.categoria || 'Frutos do mar') === filtroCat);

    container.innerHTML = '';

    if (itensFiltrados.length === 0) {
        container.innerHTML = '<p class="status-texto" style="text-align: center; padding: 18px 0; color: var(--cor-sucesso); font-weight:700;">🎉 Nenhuma compra pendente ou recente!</p>';
        return;
    }

    const categoriasParaExibir = filtroCat === 'todos' ? CATEGORIAS_COMPRA : [filtroCat];

    categoriasParaExibir.forEach(catNome => {
        const itensDaCat = itensFiltrados.filter(p => (p.categoria || 'Frutos do mar') === catNome);
        if (itensDaCat.length === 0) return;

        const secao = document.createElement('div');
        secao.className = 'secao-categoria-compras';
        secao.style.marginBottom = '8px';

        const pendentesQtd = itensDaCat.filter(i => (i.status || (i.lido ? 'comprado' : 'pendente')) === 'pendente').length;
        const infoBadge = pendentesQtd > 0 
            ? `<span class="badge-cat-compras" style="color:var(--cor-erro);">${pendentesQtd} pendente(s)</span>` 
            : `<span class="badge-cat-compras" style="color:var(--cor-sucesso);">Comprados (janela 3d)</span>`;

        secao.innerHTML = `
            <div class="secao-categoria-compras-titulo">
                <span>🐟 ${esc(catNome)}</span>
                ${infoBadge}
            </div>
            <div class="secao-categoria-compras-lista"></div>
        `;

        const listaDiv = secao.querySelector('.secao-categoria-compras-lista');

        itensDaCat.forEach(item => {
            const st = item.status || (item.lido ? 'comprado' : 'pendente');
            const ehPendente = st === 'pendente';
            const solicitante = window.obterNomeColaborador ? window.obterNomeColaborador(item.criado_por, 'Equipe') : 'Equipe';
            const dataPedido = item.criado_em ? item.criado_em.split('T')[0].split('-').reverse().join('/') : '-';
            const dataComprado = item.data_comprado ? item.data_comprado.split('-').reverse().join('/') : dataPedido;

            const card = document.createElement('div');
            card.className = `cartao-compra-item ${ehPendente ? 'cartao-compra-pendente' : 'cartao-compra-comprado'}`;

            const labelData = ehPendente 
                ? `Solicitado em: ${dataPedido}` 
                : `Comprado em: ${dataComprado} (ativo por 3 dias para reverter)`;

            const btnAcaoToggle = ehPendente
                ? `<button class="btn-compra-toggle btn-compra-toggle-comprar" onclick="window.marcarItemComoComprado('${item.id}')">✓ Comprar</button>`
                : `<button class="btn-compra-toggle btn-compra-toggle-reverter" onclick="window.reverterItemParaPendente('${item.id}')">↩ Reverter</button>`;

            card.innerHTML = `
                <div class="cartao-compra-info">
                    <span class="cartao-compra-nome">${esc(item.mensagem)}</span>
                    <span class="cartao-compra-data">${labelData}</span>
                    <span class="cartao-compra-solicitante">Por: <strong>${esc(solicitante)}</strong></span>
                </div>
                <div class="cartao-compra-acoes">
                    ${btnAcaoToggle}
                    <button class="btn-compra-excluir" onclick="window.excluirItemCompra('${item.id}')" title="Excluir item definitivamente">🗑️</button>
                </div>
            `;

            listaDiv.appendChild(card);
        });

        container.appendChild(secao);
    });
};

window.marcarItemComoComprado = async function(id) {
    const hojeStr = window.dataLocal();
    const { error } = await cliente.from('pedidos_compra').update({
        status: 'comprado',
        lido: true,
        data_comprado: hojeStr
    }).eq('id', id);

    if (error) {
        window.mostrarToast("Erro ao marcar compra: " + error.message, "erro");
    } else {
        if (typeof window.somConcluirTarefa === 'function') window.somConcluirTarefa();
        window.mostrarToast("Comprado! Ficará visível por 3 dias caso precise reverter.");
        await window.carregarItensComprasModal();
        window.carregarPedidosCompra();
    }
};

window.reverterItemParaPendente = async function(id) {
    const { error } = await cliente.from('pedidos_compra').update({
        status: 'pendente',
        lido: false,
        data_comprado: null
    }).eq('id', id);

    if (error) {
        window.mostrarToast("Erro ao reverter: " + error.message, "erro");
    } else {
        if (typeof window.somIniciarTarefa === 'function') window.somIniciarTarefa();
        window.mostrarToast("Item revertido para pendente!");
        await window.carregarItensComprasModal();
        window.carregarPedidosCompra();
    }
};

window.excluirItemCompra = async function(id) {
    if (!confirm("Excluir definitivamente este item da lista de compras?")) return;

    const { error } = await cliente.from('pedidos_compra').delete().eq('id', id);
    if (error) {
        window.mostrarToast("Erro ao excluir: " + error.message, "erro");
    } else {
        window.mostrarToast("Item excluído com sucesso!");
        await window.carregarItensComprasModal();
        window.carregarPedidosCompra();
    }
};

window.emitirRelatorioComprasGestao = function() {
    const agora = new Date();
    const data30diasAtras = new Date(agora);
    data30diasAtras.setDate(data30diasAtras.getDate() - 30);

    const dIniEl = document.getElementById('data-inicio');
    const dFimEl = document.getElementById('data-fim');
    const tRelEl = document.getElementById('tipo-relatorio');

    if (dIniEl) dIniEl.value = window.dataLocal(data30diasAtras);
    if (dFimEl) dFimEl.value = window.dataLocal(agora);
    if (tRelEl) tRelEl.value = 'pedidos';

    window.alternarTelas('relatorios');
    window.gerarRelatorio();
};

window.emitirRelatorioComprasModal = function() {
    window.fecharModalComprasEstoque();
    window.emitirRelatorioComprasGestao();
};

window.carregarPedidosCompra = async function() {
    const temPermissao = perfilAtual?.is_admin || perfilAtual?.is_socio || perfilAtual?.is_gerente;
    const container = document.getElementById('lista-pedidos');
    if (!container) return;

    if (!temPermissao) {
        container.innerHTML = '';
        return;
    }

    const { data } = await cliente.from('pedidos_compra')
        .select('*')
        .or('status.eq.pendente,lido.eq.false')
        .order('criado_em', { ascending: false });

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="status-texto" style="text-align: center;">Nenhuma solicitação pendente no momento.</p>';
        return;
    }

    container.innerHTML = '<h4 style="color:var(--cor-pedido); margin-bottom:10px; font-size:14px; font-weight:800;">Solicitações da Equipe (Em Aberto):</h4>';
    data.forEach(pedido => {
        const card = document.createElement('div');
        card.className = 'cartao-lista cartao-pedido';
        const nomeSolicitante = window.obterNomeColaborador ? window.obterNomeColaborador(pedido.criado_por, 'Equipe') : 'Equipe';
        const cat = pedido.categoria || 'Geral';
        const dataPedido = pedido.criado_em ? pedido.criado_em.split('T')[0].split('-').reverse().join('/') : '-';

        card.innerHTML = `
            <div style="font-size: 13px; font-weight: 800; margin-bottom: 2px;">${esc(pedido.mensagem)} <span class="tag-setor" style="font-size:9px; background:var(--cor-pedido);">${esc(cat)}</span></div>
            <div style="font-size: 11px; color: var(--texto-suave); font-weight: 600;">Pedido por ${esc(nomeSolicitante)} em ${dataPedido}</div>
            <div style="display:flex; gap:6px; margin-top:6px;">
                <button class="btn-acao btn-concluir" style="padding:4px 8px; font-size:11px;" onclick="window.marcarItemComoComprado('${pedido.id}')">✓ Comprar</button>
                <button class="btn-secundario" style="padding:4px 8px; font-size:11px;" onclick="alternarTelas('gestao')">Ver Gestão</button>
            </div>
        `;
        container.appendChild(card);
    });
};

// =========================================================================
// 🍲 2. CARDÁPIO OFICIAL COMPLETO (SABOR DA COSTA) EM MEMÓRIA RAM
// =========================================================================

let cacheCardapioConsumo = [];

window.inicializarCardapioConsumo = async function() {
    const {data, error} = await cliente.from('cardapio_consumo').select('*').eq('ativo', true).order('nome_item');
    if (error) { cacheCardapioConsumo = []; window.mostrarToast('Não foi possível carregar o cardápio: ' + error.message, 'erro'); return; }
    cacheCardapioConsumo = data || [];
};

window.filtrarAutocompleteConsumo = function(termo) {
    const dropdown = document.getElementById('dropdown-autocomplete-consumo');
    if (!dropdown) return;

    const busca = (termo || '').trim().toLowerCase();
    if (busca.length === 0) {
        dropdown.classList.remove('ativo');
        dropdown.innerHTML = '';
        return;
    }

    const filtrados = cacheCardapioConsumo.filter(item => 
        item.nome_item.toLowerCase().includes(busca)
    );

    if (filtrados.length === 0) {
        dropdown.classList.remove('ativo');
        dropdown.innerHTML = '';
        return;
    }

    dropdown.innerHTML = '';
    filtrados.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'autocomplete-item';
        const valorOriginal = Number(item.valor_padrao || 0).toFixed(2);
        const valorComDesconto = (item.valor_padrao * 0.70).toFixed(2);

        itemDiv.innerHTML = `
            <span>${esc(item.nome_item)}</span>
            <span class="autocomplete-item-preco">R$ ${valorOriginal} <small style="opacity:0.8; font-size:10px;">(-30%: R$ ${valorComDesconto})</small></span>
        `;

        itemDiv.onclick = function() {
            window.selecionarItemAutocomplete(item.nome_item, item.valor_padrao);
        };

        dropdown.appendChild(itemDiv);
    });

    dropdown.classList.add('ativo');
};

// Ao selecionar o item, calcula e preenche diretamente sem necessitar de ajustes manuais
window.selecionarItemAutocomplete = function(nome, valor) {
    const inputDesc = document.getElementById('input-meu-consumo-desc');
    const inputVal = document.getElementById('input-meu-consumo-valor');
    const dropdown = document.getElementById('dropdown-autocomplete-consumo');

    if (inputDesc) inputDesc.value = nome;
    if (inputVal) inputVal.value = Number(valor || 0).toFixed(2);
    if (dropdown) {
        dropdown.classList.remove('ativo');
        dropdown.innerHTML = '';
    }
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-container')) {
        const dropdown = document.getElementById('dropdown-autocomplete-consumo');
        if (dropdown) dropdown.classList.remove('ativo');
    }
});

// Modal para Sócios/Admin gerenciarem o cardápio
window.abrirModalGerenciarCardapio = function() {
    window.renderizarListaCardapioGerenciar();
    document.getElementById('modal-gerenciar-cardapio')?.classList.remove('oculto');
};

window.fecharModalGerenciarCardapio = function() {
    document.getElementById('modal-gerenciar-cardapio')?.classList.add('oculto');
};

window.renderizarListaCardapioGerenciar = function() {
    const container = document.getElementById('lista-itens-cardapio-gerenciar');
    if (!container) return;

    container.innerHTML = '';
    if (cacheCardapioConsumo.length === 0) {
        container.innerHTML = '<p class="status-texto" style="text-align:center;">Nenhum item cadastrado no cardápio.</p>';
        return;
    }

    cacheCardapioConsumo.forEach(item => {
        const linha = document.createElement('div');
        linha.className = 'consumo-item-linha';
        linha.innerHTML = `
            <div style="flex:1;">
                <strong>${esc(item.nome_item)}</strong>
                <div style="font-size:10px; color:var(--texto-suave);">Valor Padrão: R$ ${Number(item.valor_padrao).toFixed(2)}</div>
            </div>
            <button class="btn-compra-excluir" onclick="window.excluirItemCardapio('${item.id}')" title="Excluir do cardápio">🗑️</button>
        `;
        container.appendChild(linha);
    });
};

window.salvarNovoItemCardapio = async function() {
    const inputNome = document.getElementById('input-novo-item-cardapio-nome');
    const inputValor = document.getElementById('input-novo-item-cardapio-valor');
    const nome = inputNome?.value.trim();
    const valor = parseFloat(inputValor?.value);

    if (!nome || isNaN(valor) || valor <= 0) {
        return window.mostrarToast("Informe o nome e um valor válido.", "erro");
    }

    const payload = {
        nome_item: nome,
        valor_padrao: valor,
        ativo: true
    };

    const { data, error } = await cliente.from('cardapio_consumo').insert([payload]).select();

    if (error) {
        window.mostrarToast("Erro ao adicionar item: " + error.message, "erro");
    } else {
        window.mostrarToast("Item cadastrado no cardápio!");
        if (data && data[0]) cacheCardapioConsumo.push(data[0]);
        else cacheCardapioConsumo.push({ id: 'local_' + Date.now(), ...payload });
        
        if (inputNome) inputNome.value = '';
        if (inputValor) inputValor.value = '';
        window.renderizarListaCardapioGerenciar();
    }
};

window.excluirItemCardapio = async function(id) {
    if (!confirm("Remover este item do catálogo de consumo?")) return;

    const { error } = await cliente.from('cardapio_consumo').delete().eq('id', id);
    if (!error) {
        cacheCardapioConsumo = cacheCardapioConsumo.filter(i => i.id !== id);
        window.mostrarToast("Item removido do cardápio!");
        window.renderizarListaCardapioGerenciar();
    } else {
        window.mostrarToast("Erro ao remover: " + error.message, "erro");
    }
};

// =========================================================================
// 💳 3. CONTAS A PAGAR (PRÓXIMOS 7 DIAS POR DEFEITO & CÂMARA)
// =========================================================================

let cacheContasPagar = [];
let leitorCodigoBarrasZXing = null;

window.toggleFormNovaContaGestao = function() {
    const form = document.getElementById('form-nova-conta-gestao');
    if (form) form.classList.toggle('oculto');
};

window.alternarTipoContaGestao = function(tipo) {
    const labelCodigo = document.getElementById('label-conta-codigo-gestao');
    const inputCodigo = document.getElementById('input-conta-codigo-gestao');
    const boxFavorecido = document.getElementById('box-conta-favorecido-gestao');

    if (tipo === 'pix') {
        if (labelCodigo) labelCodigo.textContent = 'Chave Pix ou Código Copia e Cola';
        if (inputCodigo) inputCodigo.placeholder = 'Cole a chave Pix ou código...';
        if (boxFavorecido) boxFavorecido.classList.remove('oculto');
    } else {
        if (labelCodigo) labelCodigo.textContent = 'Linha Digitável / Código de Barras';
        if (inputCodigo) inputCodigo.placeholder = 'Cole ou escaneie o código do boleto...';
        if (boxFavorecido) boxFavorecido.classList.add('oculto');
    }
};

window.carregarContasPagar = async function() {
    const { data, error } = await cliente.from('contas_pagar').select('*').order('data_vencimento', { ascending: true });
    if (!error) {
        cacheContasPagar = data || [];
        window.renderizarListaContasGestao();
        window.verificarContasVencendoHojeGestao();
    }
};

window.verificarContasVencendoHojeGestao = async function() {
    const hojeStr = window.dataLocal();
    const { data } = await cliente.from('contas_pagar')
        .select('*')
        .eq('status', 'pendente')
        .lte('data_vencimento', hojeStr);

    const alertaBox = document.getElementById('alerta-box-gestao-contas');
    const textoAlerta = document.getElementById('texto-alerta-gestao-contas');

    if (alertaBox) {
        if (data && data.length > 0) {
            alertaBox.classList.remove('oculto');
            if (textoAlerta) {
                textoAlerta.textContent = `Atenção: Existem ${data.length} conta(s) a pagar vencendo hoje ou já atrasadas!`;
            }
        } else {
            alertaBox.classList.add('oculto');
        }
    }
};

window.filtrarContasHojeGestao = function() {
    const hojeStr = window.dataLocal();
    const container = document.getElementById('container-itens-gestao-contas');
    if (!container) return;

    const contasHoje = cacheContasPagar.filter(c => c.status === 'pendente' && c.data_vencimento <= hojeStr);
    window.desenharCartoesContas(contasHoje, container);
};

// Renderização estrita dos próximos 7 dias por defeito
window.renderizarListaContasGestao = function() {
    const container = document.getElementById('container-itens-gestao-contas');
    const filtro = document.getElementById('filtro-visualizacao-contas-gestao')?.value || '7dias';
    if (!container) return;

    const hoje = new Date();
    
    const limite7Dias = new Date(hoje);
    limite7Dias.setDate(limite7Dias.getDate() + 7);
    const limite7DiasStr = window.dataLocal(limite7Dias);

    let contas = cacheContasPagar;

    if (filtro === '7dias') {
        // Exibe apenas as pendentes que vencem de hoje até aos próximos 7 dias (ou já em atraso)
        contas = contas.filter(c => c.status === 'pendente' && c.data_vencimento <= limite7DiasStr);
    } else if (filtro === 'pendentes_todas') {
        contas = contas.filter(c => c.status === 'pendente');
    } else if (filtro === 'pagas') {
        contas = contas.filter(c => c.status === 'pago');
    }

    window.desenharCartoesContas(contas, container);
};

window.desenharCartoesContas = function(contas, container) {
    container.innerHTML = '';
    const hojeStr = window.dataLocal();

    if (contas.length === 0) {
        container.innerHTML = '<p class="status-texto" style="text-align:center; padding:18px 0; color:var(--cor-sucesso); font-weight:700;">✓ Nenhuma conta a pagar para os próximos 7 dias.</p>';
        return;
    }

    contas.forEach(c => {
        const card = document.createElement('div');
        card.className = 'cartao-conta-item';

        const ehPendente = c.status === 'pendente';
        const vencida = ehPendente && c.data_vencimento < hojeStr;
        const venceHoje = ehPendente && c.data_vencimento === hojeStr;

        let badgeVencimento = `<span style="color:var(--cor-sucesso); font-weight:700;">Vence: ${c.data_vencimento.split('-').reverse().join('/')}</span>`;
        if (venceHoje) {
            badgeVencimento = `<span style="color:var(--cor-alerta); font-weight:800;">⚠️ VENCE HOJE (${c.data_vencimento.split('-').reverse().join('/')})</span>`;
        } else if (vencida) {
            badgeVencimento = `<span style="color:var(--cor-erro); font-weight:800;">🚨 ATRASADA (${c.data_vencimento.split('-').reverse().join('/')})</span>`;
        } else if (!ehPendente) {
            badgeVencimento = `<span style="color:var(--cor-sucesso); font-weight:700;">✓ Pago em ${c.data_pagamento ? c.data_pagamento.split('-').reverse().join('/') : '-'}</span>`;
        }

        const temCodigo = !!c.codigo_barras_pix;
        const btnCopiar = temCodigo 
            ? `<button class="btn-copiar-codigo" onclick="window.copiarCodigoConta(${window.atributoJS(c.codigo_barras_pix)})">📋 Copiar ${c.tipo_pagamento === 'pix' ? 'Pix' : 'Código'}</button>` 
            : '';

        const btnPagar = ehPendente
            ? `<button class="btn-sucesso" style="padding:5px 10px; font-size:11px; margin-top:0; width:auto;" onclick="window.marcarContaComoPaga('${c.id}')">✓ Pagar</button>`
            : `<button class="btn-secundario" style="padding:5px 8px; font-size:10px; margin-top:0; width:auto;" onclick="window.reverterContaPendente('${c.id}')">↩ Reabrir</button>`;

        card.innerHTML = `
            <div class="cartao-conta-topo">
                <div>
                    <div class="cartao-conta-fornecedor">${esc(c.fornecedor_descricao)}</div>
                    <div class="cartao-conta-detalhes">
                        <span>🏷️ ${esc(c.categoria || 'Geral')}</span>
                        <span>Tipo: <strong>${c.tipo_pagamento === 'pix' ? 'Pix' : 'Boleto'}</strong></span>
                        ${c.favorecido_pix ? `<span>Favorecido: <strong>${esc(c.favorecido_pix)}</strong></span>` : ''}
                    </div>
                </div>
                <div class="cartao-conta-valor">R$ ${Number(c.valor || 0).toFixed(2)}</div>
            </div>
            <div style="font-size:11px; margin-top:2px;">${badgeVencimento}</div>
            <div class="cartao-conta-acoes">
                ${btnCopiar}
                ${btnPagar}
                <button class="btn-compra-excluir" style="padding:4px 8px; font-size:11px;" onclick="window.excluirContaPagar('${c.id}')">🗑️</button>
            </div>
        `;

        container.appendChild(card);
    });
};

window.copiarCodigoConta = function(codigo) {
    if (!codigo) return;
    navigator.clipboard.writeText(codigo).then(() => {
        window.mostrarToast("Código copiado para a área de transferência!");
    }).catch(() => {
        prompt("Copie o código manualmente:", codigo);
    });
};

window.salvarContaPagarGestao = async function() {
    const fornecedor = document.getElementById('input-conta-fornecedor-gestao')?.value.trim();
    const valor = parseFloat(document.getElementById('input-conta-valor-gestao')?.value);
    const vencimento = document.getElementById('input-conta-vencimento-gestao')?.value;
    const tipo = document.getElementById('select-conta-tipo-gestao')?.value || 'boleto';
    const categoria = document.getElementById('select-conta-categoria-gestao')?.value || 'Fornecedores';
    const codigo = document.getElementById('input-conta-codigo-gestao')?.value.trim() || null;
    const favorecido = document.getElementById('input-conta-favorecido-gestao')?.value.trim() || null;

    if (!fornecedor || isNaN(valor) || valor <= 0 || !vencimento) {
        return window.mostrarToast("Preencha fornecedor, valor e data de vencimento.", "erro");
    }

    const payload = {
        fornecedor_descricao: fornecedor,
        valor: valor,
        data_vencimento: vencimento,
        tipo_pagamento: tipo,
        categoria: categoria,
        codigo_barras_pix: codigo,
        favorecido_pix: favorecido,
        status: 'pendente',
        criado_por: usuarioAtual.id
    };

    const { error } = await cliente.from('contas_pagar').insert([payload]);

    if (error) {
        window.mostrarToast("Erro ao cadastrar conta: " + error.message, "erro");
    } else {
        window.mostrarToast("Conta a pagar cadastrada com sucesso!");
        document.getElementById('input-conta-fornecedor-gestao').value = '';
        document.getElementById('input-conta-valor-gestao').value = '';
        document.getElementById('input-conta-vencimento-gestao').value = '';
        document.getElementById('input-conta-codigo-gestao').value = '';
        document.getElementById('input-conta-favorecido-gestao').value = '';
        window.toggleFormNovaContaGestao();
        window.carregarContasPagar();
    }
};

window.marcarContaComoPaga = async function(id) {
    const hojeStr = window.dataLocal();
    const { error } = await cliente.from('contas_pagar').update({
        status: 'pago',
        data_pagamento: hojeStr
    }).eq('id', id);

    if (!error) {
        if (typeof window.somConcluirTarefa === 'function') window.somConcluirTarefa();
        window.mostrarToast("Conta marcada como PAGA!");
        window.carregarContasPagar();
    } else {
        window.mostrarToast("Erro: " + error.message, "erro");
    }
};

window.reverterContaPendente = async function(id) {
    const { error } = await cliente.from('contas_pagar').update({
        status: 'pendente',
        data_pagamento: null
    }).eq('id', id);

    if (!error) {
        window.mostrarToast("Conta reaberta como pendente!");
        window.carregarContasPagar();
    }
};

window.excluirContaPagar = async function(id) {
    if (!confirm("Excluir este lançamento de conta a pagar?")) return;

    const { error } = await cliente.from('contas_pagar').delete().eq('id', id);
    if (!error) {
        window.mostrarToast("Lançamento excluído!");
        window.carregarContasPagar();
    }
};

// Leitor de Código de Barras / QR Code com Câmera
window.abrirLeitorCameraGestao = function() {
    const box = document.getElementById('box-leitor-camera-gestao');
    const video = document.getElementById('video-leitor-camera-gestao');
    if (!box || !video) return;

    if (typeof ZXing === 'undefined') {
        return window.mostrarToast("Leitor de código indisponível.", "erro");
    }

    box.classList.remove('oculto');
    leitorCodigoBarrasZXing = new ZXing.BrowserMultiFormatReader();

    leitorCodigoBarrasZXing.decodeFromVideoDevice(null, video, (result, err) => {
        if (result) {
            const codigoLido = result.getText();
            const inputCodigo = document.getElementById('input-conta-codigo-gestao');
            if (inputCodigo) inputCodigo.value = codigoLido;
            if (typeof window.somConcluirTarefa === 'function') window.somConcluirTarefa();
            window.mostrarToast("Código lido com sucesso!");
            window.fecharLeitorCameraGestao();
        }
    }).catch(err => {
        window.mostrarToast("Não foi possível acessar a câmera.", "erro");
        window.fecharLeitorCameraGestao();
    });
};

window.fecharLeitorCameraGestao = function() {
    const box = document.getElementById('box-leitor-camera-gestao');
    if (box) box.classList.add('oculto');
    if (leitorCodigoBarrasZXing) {
        leitorCodigoBarrasZXing.reset();
        leitorCodigoBarrasZXing = null;
    }
};

// =========================================================================
// 💵 4. SEGUIMENTO: FECHAMENTO DE CAIXA DIÁRIO & EXCLUSÃO SEGURA
// =========================================================================

let ultimoFechamentoCaixaObj = null;
let dadosPreFechamentoTemp = null;

window.toggleFormFechamentoCaixa = function() {
    if (typeof window.somPop === 'function') window.somPop();
    const form = document.getElementById('form-fechamento-caixa');
    const btn = document.getElementById('btn-toggle-form-caixa');
    if (!form) return;

    form.classList.toggle('oculto');
    const aberto = !form.classList.contains('oculto');
    if (btn) {
        btn.textContent = aberto ? '✕ Fechar' : '+ Novo Fechamento';
        btn.classList.toggle('btn-toggle-aberto', aberto);
    }

    if (aberto) {
        const inData = document.getElementById('input-caixa-data');
        if (inData && !inData.value) {
            inData.value = window.dataLocal();
        }
        window.recalcularTotaisFormCaixa();
    }
};

window.recalcularTotaisFormCaixa = function() {
    const fundo = parseFloat(document.getElementById('input-caixa-fundo')?.value) || 0;
    const dinheiro = parseFloat(document.getElementById('input-caixa-dinheiro')?.value) || 0;
    const pix = parseFloat(document.getElementById('input-caixa-pix')?.value) || 0;
    const debito = parseFloat(document.getElementById('input-caixa-debito')?.value) || 0;
    const credito = parseFloat(document.getElementById('input-caixa-credito')?.value) || 0;
    const sangrias = parseFloat(document.getElementById('input-caixa-sangrias')?.value) || 0;

    const total = fundo + dinheiro + pix + debito + credito - sangrias;
    const lbl = document.getElementById('label-form-caixa-total');
    if (lbl) {
        lbl.textContent = `R$ ${total.toFixed(2)}`;
    }
    return { fundo, dinheiro, pix, debito, credito, sangrias, total };
};

// Modal de conferência prévia antes da gravação final
window.abrirModalConferenciaCaixa = function() {
    const dataFechamento = document.getElementById('input-caixa-data')?.value;
    if (!dataFechamento) return window.mostrarToast("Selecione a data do fechamento.", "erro");

    const totais = window.recalcularTotaisFormCaixa();
    const obs = document.getElementById('input-caixa-obs')?.value.trim();

    dadosPreFechamentoTemp = {
        data_fechamento: dataFechamento,
        responsavel_id: usuarioAtual.id,
        fundo_troco: totais.fundo,
        valor_dinheiro: totais.dinheiro,
        valor_pix: totais.pix,
        valor_debito: totais.debito,
        valor_credito: totais.credito,
        sangrias: totais.sangrias,
        total_entradas: totais.total,
        observacoes: obs || null
    };

    const dFmt = dataFechamento.split('-').reverse().join('/');
    const respNome = perfilAtual?.nome || 'Eu';

    document.getElementById('conf-caixa-data').textContent = dFmt;
    document.getElementById('conf-caixa-responsavel').textContent = respNome;
    document.getElementById('conf-caixa-fundo').textContent = `R$ ${totais.fundo.toFixed(2)}`;
    document.getElementById('conf-caixa-dinheiro').textContent = `R$ ${totais.dinheiro.toFixed(2)}`;
    document.getElementById('conf-caixa-pix').textContent = `R$ ${totais.pix.toFixed(2)}`;
    document.getElementById('conf-caixa-debito').textContent = `R$ ${totais.debito.toFixed(2)}`;
    document.getElementById('conf-caixa-credito').textContent = `R$ ${totais.credito.toFixed(2)}`;
    document.getElementById('conf-caixa-sangrias').textContent = `- R$ ${totais.sangrias.toFixed(2)}`;
    document.getElementById('conf-caixa-total').textContent = `R$ ${totais.total.toFixed(2)}`;

    if (typeof window.somPop === 'function') window.somPop();
    document.getElementById('modal-conferencia-caixa')?.classList.remove('oculto');
};

window.fecharModalConferenciaCaixa = function() {
    document.getElementById('modal-conferencia-caixa')?.classList.add('oculto');
};

window.confirmarEGravarFechamentoCaixa = async function() {
    if (!dadosPreFechamentoTemp) return;

    const payload = { ...dadosPreFechamentoTemp };

    const res = await window.executarOuOffline('fechamento_caixa_insert', payload, () => 
        cliente.from('fechamento_caixa').insert([payload])
    );

    if (res && res.error) {
        window.mostrarToast("Erro ao gravar fechamento de caixa: " + res.error.message, "erro");
    } else {
        if (typeof window.somConcluirTarefa === 'function') window.somConcluirTarefa();
        window.mostrarToast(res.offline ? "Fechamento salvo offline!" : "Caixa fechado com sucesso!");
        
        window.fecharModalConferenciaCaixa();
        
        // Limpa campos
        document.getElementById('input-caixa-fundo').value = '';
        document.getElementById('input-caixa-dinheiro').value = '';
        document.getElementById('input-caixa-pix').value = '';
        document.getElementById('input-caixa-debito').value = '';
        document.getElementById('input-caixa-credito').value = '';
        document.getElementById('input-caixa-sangrias').value = '';
        document.getElementById('input-caixa-obs').value = '';

        window.toggleFormFechamentoCaixa();
        await window.carregarFechamentoCaixaAtual();
    }
};

// Carrega o último fechamento de caixa homologado para fixar no painel
window.carregarFechamentoCaixaAtual = async function() {
    const boxUltimo = document.getElementById('box-ultimo-fechamento-caixa');
    const msgSem = document.getElementById('msg-sem-fechamento-caixa');

    const { data, error } = await cliente.from('fechamento_caixa')
        .select('*')
        .order('data_fechamento', { ascending: false })
        .order('criado_em', { ascending: false })
        .limit(1);

    if (error || !data || data.length === 0) {
        ultimoFechamentoCaixaObj = null;
        if (boxUltimo) boxUltimo.classList.add('oculto');
        if (msgSem) msgSem.classList.remove('oculto');
        return;
    }

    ultimoFechamentoCaixaObj = data[0];

    if (msgSem) msgSem.classList.add('oculto');
    if (boxUltimo) boxUltimo.classList.remove('oculto');

    const respNome = window.obterNomeColaborador 
        ? window.obterNomeColaborador(ultimoFechamentoCaixaObj.responsavel_id, 'Colaborador') 
        : (mapaNomes[ultimoFechamentoCaixaObj.responsavel_id] || 'Colaborador');

    const dataFmt = ultimoFechamentoCaixaObj.data_fechamento 
        ? ultimoFechamentoCaixaObj.data_fechamento.split('-').reverse().join('/') 
        : '-';

    const lblDataResp = document.getElementById('ultimo-caixa-data-responsavel');
    if (lblDataResp) {
        lblDataResp.textContent = `${dataFmt} • Fechado por ${respNome}`;
    }

    document.getElementById('card-caixa-fundo').textContent = `R$ ${Number(ultimoFechamentoCaixaObj.fundo_troco || 0).toFixed(2)}`;
    document.getElementById('card-caixa-dinheiro').textContent = `R$ ${Number(ultimoFechamentoCaixaObj.valor_dinheiro || 0).toFixed(2)}`;
    document.getElementById('card-caixa-pix').textContent = `R$ ${Number(ultimoFechamentoCaixaObj.valor_pix || 0).toFixed(2)}`;
    document.getElementById('card-caixa-debito').textContent = `R$ ${Number(ultimoFechamentoCaixaObj.valor_debito || 0).toFixed(2)}`;
    document.getElementById('card-caixa-credito').textContent = `R$ ${Number(ultimoFechamentoCaixaObj.valor_credito || 0).toFixed(2)}`;
    document.getElementById('card-caixa-sangrias').textContent = `- R$ ${Number(ultimoFechamentoCaixaObj.sangrias || 0).toFixed(2)}`;
    document.getElementById('card-caixa-total').textContent = `R$ ${Number(ultimoFechamentoCaixaObj.total_entradas || 0).toFixed(2)}`;

    const obsContainer = document.getElementById('ultimo-caixa-obs-container');
    const obsTxt = document.getElementById('ultimo-caixa-obs');
    if (ultimoFechamentoCaixaObj.observacoes) {
        obsContainer?.classList.remove('oculto');
        if (obsTxt) obsTxt.textContent = ultimoFechamentoCaixaObj.observacoes;
    } else {
        obsContainer?.classList.add('oculto');
    }
};

// Exclui o fechamento de caixa ativo exibido no banner de Gestão
window.excluirUltimoFechamentoCaixa = async function() {
    if (!ultimoFechamentoCaixaObj || !ultimoFechamentoCaixaObj.id) {
        return window.mostrarToast("Nenhum fechamento ativo para excluir.", "erro");
    }

    const dataFmt = ultimoFechamentoCaixaObj.data_fechamento 
        ? ultimoFechamentoCaixaObj.data_fechamento.split('-').reverse().join('/') 
        : '';

    if (!confirm(`TEM CERTEZA de que deseja excluir o fechamento de caixa do dia ${dataFmt}? Esta ação não pode ser desfeita.`)) {
        return;
    }

    const { error } = await cliente.from('fechamento_caixa').delete().eq('id', ultimoFechamentoCaixaObj.id);

    if (error) {
        window.mostrarToast("Erro ao excluir fechamento: " + error.message, "erro");
    } else {
        if (typeof window.somPop === 'function') window.somPop();
        window.mostrarToast("Fechamento de caixa excluído!");
        await window.carregarFechamentoCaixaAtual();
    }
};

// Exclui um fechamento de caixa individual a partir do relatório
window.excluirFechamentoCaixaPorId = async function(idCaixa) {
    if (!idCaixa) return;

    if (!confirm("Confirmar a exclusão permanente deste fechamento de caixa?")) return;

    const { error } = await cliente.from('fechamento_caixa').delete().eq('id', idCaixa);

    if (error) {
        window.mostrarToast("Erro ao excluir: " + error.message, "erro");
    } else {
        if (typeof window.somPop === 'function') window.somPop();
        window.mostrarToast("Lançamento excluído com sucesso!");
        if (typeof window.gerarRelatorio === 'function') window.gerarRelatorio();
        await window.carregarFechamentoCaixaAtual();
    }
};

// Formatação do resumo textual para disparo no WhatsApp
window.obterTextoWhatsAppFechamento = function() {
    if (!ultimoFechamentoCaixaObj) return '';
    const dEmpresa = dadosEmpresaAtual?.nome_empresa || 'Sabor da Costa';
    const respNome = window.obterNomeColaborador 
        ? window.obterNomeColaborador(ultimoFechamentoCaixaObj.responsavel_id, 'Colaborador') 
        : (mapaNomes[ultimoFechamentoCaixaObj.responsavel_id] || 'Colaborador');
    const dataFmt = ultimoFechamentoCaixaObj.data_fechamento.split('-').reverse().join('/');

    return `*FECHAMENTO DE CAIXA - ${dEmpresa.toUpperCase()}*\n` +
           `📅 Data: *${dataFmt}*\n` +
           `👤 Responsável: *${respNome}*\n` +
           `---------------------------------\n` +
           `💵 Dinheiro (Gaveta): R$ ${Number(ultimoFechamentoCaixaObj.valor_dinheiro || 0).toFixed(2)}\n` +
           `📱 Pix: R$ ${Number(ultimoFechamentoCaixaObj.valor_pix || 0).toFixed(2)}\n` +
           `💳 Cartão de Débito: R$ ${Number(ultimoFechamentoCaixaObj.valor_debito || 0).toFixed(2)}\n` +
           `💳 Cartão de Crédito: R$ ${Number(ultimoFechamentoCaixaObj.valor_credito || 0).toFixed(2)}\n` +
           `🪙 Fundo de Troco Inicial: R$ ${Number(ultimoFechamentoCaixaObj.fundo_troco || 0).toFixed(2)}\n` +
           `🔴 Sangrias / Retiradas: - R$ ${Number(ultimoFechamentoCaixaObj.sangrias || 0).toFixed(2)}\n` +
           `---------------------------------\n` +
           `💰 *TOTAL APURADO: R$ ${Number(ultimoFechamentoCaixaObj.total_entradas || 0).toFixed(2)}*\n` +
           (ultimoFechamentoCaixaObj.observacoes ? `📝 Obs: ${ultimoFechamentoCaixaObj.observacoes}` : '');
};

// Modal de disparo opcional para WhatsApp (Grupo ou Sócios individuais)
window.abrirModalDisparoWhatsCaixa = function() {
    if (!ultimoFechamentoCaixaObj) return window.mostrarToast("Nenhum fechamento registrado para compartilhar.", "erro");

    const listaSocios = document.getElementById('lista-socios-disparo-whats');
    if (listaSocios) {
        listaSocios.innerHTML = '';
        const socios = Object.values(mapaPerfis || {}).filter(p => p.is_socio || p.is_admin);

        if (socios.length === 0) {
            listaSocios.innerHTML = '<p class="status-texto" style="font-size:11px; text-align:center;">Nenhum sócio ou administrador encontrado.</p>';
        } else {
            socios.forEach(s => {
                const tel = s.telefone_whatsapp ? s.telefone_whatsapp : 'Sem tel cadastrado';
                const temNumero = !!s.telefone_whatsapp;

                const item = document.createElement('div');
                item.className = 'item-whats-socio';
                item.innerHTML = `
                    <div class="item-whats-socio-info">
                        <span class="item-whats-socio-nome">${esc(s.nome)} ${s.is_admin ? '<small style="color:var(--cor-admin); font-weight:800;">(Admin)</small>' : '<small style="color:var(--cor-socio); font-weight:800;">(Sócio)</small>'}</span>
                        <span class="item-whats-socio-tel">${esc(tel)}</span>
                    </div>
                    ${temNumero 
                        ? `<button class="btn-whats" onclick="window.dispararFechamentoSocioDireto(${window.atributoJS(s.telefone_whatsapp)})">Enviar</button>` 
                        : `<span style="font-size:10px; color:var(--texto-suave);">Sem Whats</span>`
                    }
                `;
                listaSocios.appendChild(item);
            });
        }
    }

    if (typeof window.somPop === 'function') window.somPop();
    document.getElementById('modal-disparo-whats-caixa')?.classList.remove('oculto');
};

window.fecharModalDisparoWhatsCaixa = function() {
    document.getElementById('modal-disparo-whats-caixa')?.classList.add('oculto');
};

window.dispararFechamentoGrupoAdmin = function() {
    const texto = window.obterTextoWhatsAppFechamento();
    if (!texto) return;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank');
};

window.dispararFechamentoSocioDireto = function(telefone) {
    if (!telefone) return window.mostrarToast("Número de WhatsApp não informado.", "erro");
    const numLimpo = telefone.replace(/\D/g, '');
    const numFinal = numLimpo.startsWith('55') ? numLimpo : '55' + numLimpo;
    const texto = window.obterTextoWhatsAppFechamento();
    window.open(`https://wa.me/${numFinal}?text=${encodeURIComponent(texto)}`, '_blank');
};

// =========================================================================
// 📄 5. MOTOR AVANÇADO DE RELATÓRIOS & PDF COM NOMENCLATURA INTELIGENTE
// =========================================================================

let nomeArquivoPdfSugerido = 'Relatorio_Suiri.pdf';
let ultimoResumoFechamentoTexto = '';
let ultimoWhatsAppColaboradorRelatorio = '';

window.gerarRelatorio = async function() {
    const dataInicio = document.getElementById('data-inicio')?.value;
    const dataFim = document.getElementById('data-fim')?.value;
    const filtroFunc = document.getElementById('filtro-func-relatorio')?.value || 'todos';
    const filtroSetor = document.getElementById('filtro-setor-relatorio')?.value || 'todos';
    const tipoSelecionado = document.getElementById('tipo-relatorio')?.value;
    
    if (dataInicio && dataFim && dataInicio > dataFim) return window.mostrarToast('A data inicial deve ser anterior à final.', 'erro');
    if(!dataInicio || !dataFim) return window.mostrarToast("Selecione o intervalo de datas.", "erro");

    try {
    let nomeTipo = "Relatório Completo";
    if(tipoSelecionado === 'frequencia') nomeTipo = "Relatório de Assiduidade e Ponto";
    if(tipoSelecionado === 'produtividade') nomeTipo = "Relatório de Produtividade & Tempos";
    if(tipoSelecionado === 'financeiro') nomeTipo = "Fechamento Financeiro & Histórico";
    if(tipoSelecionado === 'pedidos') nomeTipo = "Relatório de Itens Faltantes / Reposição de Estoque";
    if(tipoSelecionado === 'fechamento_caixa') nomeTipo = "Relatório de Fechamento de Caixa Diário";

    const dataI = dataInicio.split('-').reverse().join('/');
    const dataF = dataFim.split('-').reverse().join('/');

    const nomeFiltroFunc = filtroFunc !== 'todos' ? window.obterNomeColaborador(filtroFunc, 'Colaborador') : '';
    const subtituloPdf = filtroFunc === 'todos' 
        ? `${nomeTipo} | Período: ${dataI} a ${dataF} (Setor: ${filtroSetor.toUpperCase()})` 
        : `${nomeTipo}: ${nomeFiltroFunc} | Período: ${dataI} a ${dataF}`;
    
    // Nomenclatura Inteligente do Arquivo PDF (ex: Relatorio_Filipe_23-10-2026.pdf)
    const nomeLimpoParaArquivo = nomeFiltroFunc ? nomeFiltroFunc.replace(/\s+/g, '_') : 'Equipe';
    const dataHojeFormatada = window.dataLocal().split('-').reverse().join('-');
    nomeArquivoPdfSugerido = `Relatorio_${nomeLimpoParaArquivo}_${dataHojeFormatada}.pdf`;

    ultimoWhatsAppColaboradorRelatorio = (filtroFunc !== 'todos' && mapaPerfis[filtroFunc]) 
        ? (mapaPerfis[filtroFunc].telefone_whatsapp || '') 
        : '';

    const containerResultados = document.getElementById('area-resultados-relatorio');
    if (!containerResultados) return;

    document.getElementById('relatorio-pdf-container')?.classList.remove('oculto');
    containerResultados.innerHTML = '<p style="text-align:center; color:#000;">Compilando dados...</p>';
    
    const logoUrl = "icon-192x192.png";

    const dEmpresa = dadosEmpresaAtual || {};
    const nomeEmpresa = dEmpresa.nome_fantasia || dEmpresa.nome_empresa || 'Suiri';
    const cnpjEmpresa = dEmpresa.cnpj ? `CNPJ: ${esc(dEmpresa.cnpj)}` : '';
    const telEmpresa = dEmpresa.telefone ? `Tel: ${esc(dEmpresa.telefone)}` : '';
    const endEmpresa = dEmpresa.endereco ? esc(dEmpresa.endereco) : '';

    let ponto = [], tarefas = [], vales = [], compras = [], pedidosRel = [], caixasRel = [];

    if (tipoSelecionado === 'fechamento_caixa') {
        let qC = cliente.from('fechamento_caixa').select('*').gte('data_fechamento', dataInicio).lte('data_fechamento', dataFim).order('data_fechamento', { ascending: true });
        if (filtroFunc !== 'todos') qC = qC.eq('responsavel_id', filtroFunc);
        const { data: dCaixa, error: erroConsulta1 } = await window.todosRegistrosSuiri(qC); if (erroConsulta1) throw erroConsulta1;
        caixasRel = dCaixa || [];
    }

    if (tipoSelecionado === 'pedidos') {
        const { data: todosPedidos, error: erroPedidos } = await window.todosRegistrosSuiri(cliente.from('pedidos_compra').select('*').order('criado_em', { ascending: false }).order('id'));
        if (erroPedidos) throw erroPedidos;
        const agora = new Date();
        const dataLimite30Dias = new Date(agora);
        dataLimite30Dias.setDate(dataLimite30Dias.getDate() - 30);
        const limiteStr = window.dataLocal(dataLimite30Dias);

        pedidosRel = (todosPedidos || []).filter(p => {
            const dataBase = p.data_comprado || window.dataInstanteLocal(p.criado_em);
            return dataBase >= dataInicio && dataBase <= dataFim;
        });

        if (filtroFunc !== 'todos') {
            pedidosRel = pedidosRel.filter(p => p.criado_por === filtroFunc);
        }
    }

    if (tipoSelecionado === 'ambos' || tipoSelecionado === 'frequencia' || tipoSelecionado === 'financeiro') {
        let q = cliente.from('livro_ponto').select('*').gte('data_registro', dataInicio).lte('data_registro', dataFim);
        if (filtroFunc !== 'todos') q = q.eq('perfil_id', filtroFunc);
        const { data, error: erroConsulta2 } = await window.todosRegistrosSuiri(q); if (erroConsulta2) throw erroConsulta2; ponto = data || [];
    }

    if (tipoSelecionado === 'ambos' || tipoSelecionado === 'produtividade') {
        let q = cliente.from('tarefas').select('*').eq('status', 'concluida');
        const { data, error: erroConsulta3 } = await window.todosRegistrosSuiri(q); if (erroConsulta3) throw erroConsulta3;
        const {data:historicoRel,error:erroHistoricoRel}=await window.todosRegistrosSuiri(cliente.from('suiri_historico_tarefas').select('registro').gte('concluida_em',dataInicio+'T00:00:00-03:00').lte('concluida_em',dataFim+'T23:59:59.999-03:00').order('concluida_em').order('id'));
        if(erroHistoricoRel)throw erroHistoricoRel;
        const execucoesRel=new Map();
        [...(data||[]),...(historicoRel||[]).map(h=>h.registro)].forEach(t=>execucoesRel.set(t.id+'|'+t.hora_fim,t));
        tarefas = [...execucoesRel.values()].filter(t => {
            const dataFimTarefa = window.dataInstanteLocal(t.hora_fim);
            const noPeriodo = dataFimTarefa >= dataInicio && dataFimTarefa <= dataFim;
            if (!noPeriodo) return false;

            if (filtroFunc !== 'todos') {
                const souIniciador = t.assumido_por === filtroFunc;
                const souAjudante = Array.isArray(t.ajudantes) && t.ajudantes.includes(filtroFunc);
                return souIniciador || souAjudante;
            }
            return true;
        });
    }

    if (tipoSelecionado === 'ambos' || tipoSelecionado === 'financeiro') {
        let qV = cliente.from('vales').select('*').gte('data_vale', dataInicio).lte('data_vale', dataFim);
        if (filtroFunc !== 'todos') qV = qV.eq('perfil_id', filtroFunc);
        const { data: dV, error: erroConsulta4 } = await window.todosRegistrosSuiri(qV); if (erroConsulta4) throw erroConsulta4; vales = dV || [];

        let qC = cliente.from('itens_comprados').select('*').gte('data_compra', dataInicio).lte('data_compra', dataFim);
        if (filtroFunc !== 'todos') qC = qC.or(`perfil_id.eq.${filtroFunc},registrado_por.eq.${filtroFunc}`);
        const { data: dC, error: erroConsulta5 } = await window.todosRegistrosSuiri(qC); if (erroConsulta5) throw erroConsulta5; compras = dC || [];
    }

    if (filtroSetor && filtroSetor !== 'todos') {
        ponto = ponto.filter(p => mapaPerfis[p.perfil_id]?.setor === filtroSetor);
        vales = vales.filter(v => mapaPerfis[v.perfil_id]?.setor === filtroSetor);
        compras = compras.filter(c => mapaPerfis[c.perfil_id]?.setor === filtroSetor);
        tarefas = tarefas.filter(t=>mapaPerfis[t.assumido_por]?.setor===filtroSetor || (t.ajudantes||[]).some(id=>mapaPerfis[id]?.setor===filtroSetor));
    }

    const valesPendentes = vales.filter(v => !v.pago);
    const valesQuitados = vales.filter(v => v.pago);

    const totalValesPendentes = valesPendentes.reduce((acc, v) => acc + Number(v.valor), 0);
    const totalValesQuitados = valesQuitados.reduce((acc, v) => acc + Number(v.valor), 0);
    const totalCompras = compras.reduce((acc, c) => acc + Number(c.valor_final), 0);
    const totalDescontosHoje = totalValesPendentes + totalCompras;

    let remuneracaoBrutaPeriodo = 0;
    let labelRemuneracaoPeriodo = "Salário Base Contratual:";
    let detalheContratoPDF = "";

    if (filtroFunc !== 'todos') {
        const dadosColabRel = mapaPerfis[filtroFunc] || {};
        const ehFreelance = dadosColabRel.tipo_contrato === 'freelance';
        const dataAdmStr = dadosColabRel.data_admissao ? dadosColabRel.data_admissao.split('-').reverse().join('/') : 'Não informada';

        if (ehFreelance) {
            labelRemuneracaoPeriodo = "Diárias Trabalhadas (Período):";
            const diasValidados = ponto.filter(p => p.horario_saida || p.status_turno === 'diaria_aprovada').length;
            const valorDiaria = Number(dadosColabRel.valor_diaria) || 0;
            remuneracaoBrutaPeriodo = diasValidados * valorDiaria;
            detalheContratoPDF = `Modalidade: <strong>Freelancer (Diarista)</strong> | Diária: <strong>R$ ${valorDiaria.toFixed(2)}</strong> (${diasValidados} dia(s) trabalhados) | Admissão: <strong>${dataAdmStr}</strong>`;
        } else {
            labelRemuneracaoPeriodo = "Salário Base Mensal:";
            remuneracaoBrutaPeriodo = Number(dadosColabRel.salario_base) || 0;
            detalheContratoPDF = `Modalidade: <strong>Fixo (Mensalista)</strong> | Salário: <strong>R$ ${remuneracaoBrutaPeriodo.toFixed(2)}</strong> | Admissão: <strong>${dataAdmStr}</strong>`;
        }
    }

    const liquidoFinalAPagar = Math.max(0, remuneracaoBrutaPeriodo - totalDescontosHoje);

    // Formata o resumo para envio rápido no WhatsApp
    if (filtroFunc !== 'todos') {
        ultimoResumoFechamentoTexto = `Olá, *${nomeFiltroFunc}*! Segue seu resumo de fechamento (${nomeEmpresa}) referente a ${dataI} a ${dataF}:\n` +
            `• Remuneração Bruta: R$ ${remuneracaoBrutaPeriodo.toFixed(2)}\n` +
            `• Vales Pendentes: R$ ${totalValesPendentes.toFixed(2)}\n` +
            `• Consumo Próprio: R$ ${totalCompras.toFixed(2)}\n` +
            `• *Total Líquido a Receber: R$ ${liquidoFinalAPagar.toFixed(2)}*`;
    }

    let historico6MesesHTML = '';
    if (tipoSelecionado === 'financeiro' || tipoSelecionado === 'ambos') {
        const dataLimite6M = new Date();
        dataLimite6M.setMonth(dataLimite6M.getMonth() - 6);
        const dataStr6M = window.dataLocal(dataLimite6M);

        let qV6 = cliente.from('vales').select('*').gte('data_vale', dataStr6M);
        let qC6 = cliente.from('itens_comprados').select('*').gte('data_compra', dataStr6M);

        if (filtroFunc !== 'todos') {
            qV6 = qV6.eq('perfil_id', filtroFunc);
            qC6 = qC6.or(`perfil_id.eq.${filtroFunc},registrado_por.eq.${filtroFunc}`);
        }

        const [{data:vales6M,error:erroV6},{data:compras6M,error:erroC6}]=await Promise.all([window.todosRegistrosSuiri(qV6),window.todosRegistrosSuiri(qC6)]);
        if(erroV6||erroC6)throw(erroV6||erroC6);

        const mapaMeses = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const chaveMes = d.toISOString().slice(0, 7);
            mapaMeses[chaveMes] = { vales: 0, compras: 0 };
        }

        (vales6M || []).forEach(v => {
            const m = (v.data_vale || '').slice(0, 7);
            if (mapaMeses[m]) mapaMeses[m].vales += Number(v.valor);
        });

        (compras6M || []).forEach(c => {
            const m = (c.data_compra || '').slice(0, 7);
            if (mapaMeses[m]) mapaMeses[m].compras += Number(c.valor_final);
        });

        historico6MesesHTML = `
            <div class="relatorio-bloco-historico">
                <h4 style="margin:0 0 6px 0; font-size:12px; color:#000;">Histórico dos Últimos 6 Meses (Gasto com Vales e Compras):</h4>
                <table class="relatorio-tabela">
                    <tr><th>Mês/Ano</th><th>Total Vales (R$)</th><th>Total Compras (R$)</th><th style="text-align:right;">Total Mês (R$)</th></tr>
        `;

        Object.keys(mapaMeses).forEach(mChave => {
            const [ano, mes] = mChave.split('-');
            const rotulo = `${mes}/${ano}`;
            const vVal = mapaMeses[mChave].vales;
            const cVal = mapaMeses[mChave].compras;
            const tot = vVal + cVal;
            historico6MesesHTML += `
                <tr>
                    <td><strong>${rotulo}</strong></td>
                    <td>R$ ${vVal.toFixed(2)}</td>
                    <td>R$ ${cVal.toFixed(2)}</td>
                    <td style="text-align:right;"><strong>R$ ${tot.toFixed(2)}</strong></td>
                </tr>
            `;
        });
        historico6MesesHTML += `</table></div>`;
    }

    let html = `
        <div style="background: #ffffff !important; color: #000000 !important; font-family: 'Inter', sans-serif; padding: 20px; font-size: 11px; line-height: 1.4;">
            <div style="text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 10px;">
                <img src="${logoUrl}" alt="${esc(nomeEmpresa)}" style="max-height: 52px; object-fit: contain; margin-bottom: 4px;">
                <h2 style="margin: 0; font-size: 17px; color: #000; font-weight: 800; text-transform: uppercase;">${esc(nomeEmpresa)}</h2>
                <div style="font-size: 10px; color: #444; margin-top: 2px;">
                    ${cnpjEmpresa ? cnpjEmpresa + ' | ' : ''}${telEmpresa}
                    ${endEmpresa ? `<br>${endEmpresa}` : ''}
                </div>
                <p style="font-size: 11px; color: #333; font-weight: 600; margin: 6px 0 0 0;">${subtituloPdf}</p>
                ${detalheContratoPDF ? `<div style="font-size:10px; color:#1e293b; margin-top:4px;">${detalheContratoPDF}</div>` : ''}
            </div>
    `;

    // BLOCO EXCLUSIVO: RELATÓRIO DE FECHAMENTO DE CAIXA DIÁRIO COM BOTÃO DE EXCLUSÃO
    if (tipoSelecionado === 'fechamento_caixa') {
        const totalGeralCaixas = caixasRel.reduce((acc, c) => acc + Number(c.total_entradas || 0), 0);
        const totalDinheiro = caixasRel.reduce((acc, c) => acc + Number(c.valor_dinheiro || 0), 0);
        const totalPix = caixasRel.reduce((acc, c) => acc + Number(c.valor_pix || 0), 0);
        const totalCartoes = caixasRel.reduce((acc, c) => acc + Number(c.valor_debito || 0) + Number(c.valor_credito || 0), 0);
        const totalSangrias = caixasRel.reduce((acc, c) => acc + Number(c.sangrias || 0), 0);

        html += `
            <div style="margin-bottom: 14px; border: 1.5px solid #000; padding: 10px; border-radius: 6px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <tr>
                        <td style="padding: 4px;">Fechamentos no Período: <strong>${caixasRel.length}</strong></td>
                        <td style="padding: 4px;">Dinheiro (Espécie): <strong>R$ ${totalDinheiro.toFixed(2)}</strong></td>
                        <td style="padding: 4px;">Pix: <strong>R$ ${totalPix.toFixed(2)}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding: 4px;">Cartões (Déb./Créd.): <strong>R$ ${totalCartoes.toFixed(2)}</strong></td>
                        <td style="padding: 4px; color:#b91c1c;">Total Sangrias: <strong>- R$ ${totalSangrias.toFixed(2)}</strong></td>
                        <td style="padding: 4px; color:#047857; text-align:right;"><strong>TOTAL CONSOLIDADO: R$ ${totalGeralCaixas.toFixed(2)}</strong></td>
                    </tr>
                </table>
            </div>
        `;

        if (caixasRel.length === 0) {
            html += `<p style="text-align:center; color:#555; padding: 10px;">Nenhum fechamento de caixa registrado para o intervalo selecionado.</p>`;
        } else {
            html += `
                <table class="relatorio-tabela">
                    <tr>
                        <th>Data</th>
                        <th>Responsável</th>
                        <th>Fundo</th>
                        <th>Dinheiro</th>
                        <th>Pix</th>
                        <th>Cartões</th>
                        <th>Sangrias</th>
                        <th>Total Declarado</th>
                        <th style="text-align:right;">Ação</th>
                    </tr>
            `;

            caixasRel.forEach(c => {
                const dataFmt = c.data_fechamento ? c.data_fechamento.split('-').reverse().join('/') : '-';
                const resp = window.obterNomeColaborador ? window.obterNomeColaborador(c.responsavel_id, 'Colaborador') : (mapaNomes[c.responsavel_id] || 'Colaborador');
                const totCartao = Number(c.valor_debito || 0) + Number(c.valor_credito || 0);

                html += `
                    <tr>
                        <td><strong>${dataFmt}</strong></td>
                        <td>${esc(resp)}</td>
                        <td>R$ ${Number(c.fundo_troco || 0).toFixed(2)}</td>
                        <td>R$ ${Number(c.valor_dinheiro || 0).toFixed(2)}</td>
                        <td>R$ ${Number(c.valor_pix || 0).toFixed(2)}</td>
                        <td>R$ ${totCartao.toFixed(2)}</td>
                        <td style="color:#b91c1c;">- R$ ${Number(c.sangrias || 0).toFixed(2)}</td>
                        <td><strong>R$ ${Number(c.total_entradas || 0).toFixed(2)}</strong></td>
                        <td style="text-align:right;">
                            <button class="btn-compra-excluir" style="padding:3px 6px; font-size:10px;" onclick="window.excluirFechamentoCaixaPorId('${c.id}')" title="Excluir este fechamento">🗑️</button>
                        </td>
                    </tr>
                `;
            });

            html += `</table>`;
        }
    }

    if (tipoSelecionado === 'pedidos') {
        const pendentesCount = pedidosRel.filter(p => (p.status || (p.lido ? 'comprado' : 'pendente')) === 'pendente').length;
        const compradosCount = pedidosRel.length - pendentesCount;

        html += `
            <div style="margin-bottom: 14px; border: 1.5px solid #000; padding: 10px; border-radius: 6px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <tr>
                        <td style="padding: 4px;">Total de Itens Listados: <strong>${pedidosRel.length}</strong></td>
                        <td style="padding: 4px; text-align: center; color:#b91c1c;">Pendentes: <strong>${pendentesCount}</strong></td>
                        <td style="padding: 4px; text-align: right; color:#047857;">Comprados: <strong>${compradosCount}</strong></td>
                    </tr>
                </table>
            </div>
        `;

        if (pedidosRel.length === 0) {
            html += `<p style="text-align:center; color:#555; padding: 10px;">Nenhum item faltante encontrado nos critérios selecionados.</p>`;
        } else {
            html += `
                <table class="relatorio-tabela">
                    <tr>
                        <th>Item Solicitado</th>
                        <th>Segmento / Categoria</th>
                        <th>Solicitante</th>
                        <th>Data Registro</th>
                        <th style="text-align:right;">Situação</th>
                    </tr>
            `;

            pedidosRel.forEach(p => {
                const st = p.status || (p.lido ? 'comprado' : 'pendente');
                const cat = p.categoria || 'Frutos do mar';
                const solicitante = window.obterNomeColaborador ? window.obterNomeColaborador(p.criado_por, 'Equipe') : 'Equipe';
                const dataPedido = p.criado_em ? p.criado_em.split('T')[0].split('-').reverse().join('/') : '-';
                
                let dataStatusTxt = '';
                let statusBadge = '';
                if (st === 'comprado') {
                    const dtComp = p.data_comprado ? p.data_comprado.split('-').reverse().join('/') : dataPedido;
                    statusBadge = `<span style="color:#047857; font-weight:700;">✓ Comprado</span>`;
                    dataStatusTxt = `Comprado em ${dtComp}`;
                } else {
                    statusBadge = `<span style="color:#b91c1c; font-weight:700;">● Pendente</span>`;
                    dataStatusTxt = `Solicitado em ${dataPedido}`;
                }

                html += `
                    <tr>
                        <td><strong>${esc(p.mensagem)}</strong></td>
                        <td>${esc(cat)}</td>
                        <td>${esc(solicitante)}</td>
                        <td>${dataStatusTxt}</td>
                        <td style="text-align:right;">${statusBadge}</td>
                    </tr>
                `;
            });
            html += `</table>`;
        }
    }

    if (tipoSelecionado === 'financeiro' || tipoSelecionado === 'ambos') {
        html += `
            <div style="margin-bottom: 16px; border: 1.5px solid #000; padding: 10px; border-radius: 6px;">
                <h3 style="font-size: 13px; margin: 0 0 6px 0; border-bottom: 1px solid #000; padding-bottom: 4px; color: #000;">Quadro de Acerto de Contas & Fechamento</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        `;

        if (filtroFunc !== 'todos') {
            html += `
                    <tr>
                        <td style="padding: 4px; border-bottom: 1px solid #ddd;">${labelRemuneracaoPeriodo}</td>
                        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right; color:#047857;"><strong>R$ ${remuneracaoBrutaPeriodo.toFixed(2)}</strong></td>
                    </tr>
            `;
        }

        html += `
                    <tr>
                        <td style="padding: 4px; border-bottom: 1px solid #ddd;">Vales em Aberto (Pendentes):</td>
                        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right; color:#b91c1c;"><strong>- R$ ${totalValesPendentes.toFixed(2)}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding: 4px; border-bottom: 1px solid #ddd;">Compras / Consumos Registados (-30% OFF):</td>
                        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right; color:#b91c1c;">- R$ ${totalCompras.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px; font-size: 11px; color: #b91c1c; border-bottom: 1px solid #ddd;"><strong>TOTAL DE DESCONTOS ACUMULADOS:</strong></td>
                        <td style="padding: 5px; font-size: 11px; text-align: right; color: #b91c1c; border-bottom: 1px solid #ddd;"><strong>- R$ ${totalDescontosHoje.toFixed(2)}</strong></td>
                    </tr>
        `;

        if (filtroFunc !== 'todos') {
            html += `
                    <tr>
                        <td style="padding: 6px; font-size: 12px; color: #000; background: #f0fdf4;"><strong>LÍQUIDO A RECEBER / A PAGAR:</strong></td>
                        <td style="padding: 6px; font-size: 12px; text-align: right; color: #047857; background: #f0fdf4;"><strong>R$ ${liquidoFinalAPagar.toFixed(2)}</strong></td>
                    </tr>
            `;
        }

        html += `
                    <tr>
                        <td style="padding: 4px; font-size: 10px; color: #555; border-top: 1px solid #ddd;">(Vales Já Quitados no Período):</td>
                        <td style="padding: 4px; font-size: 10px; color: #555; border-top: 1px solid #ddd; text-align: right;">R$ ${totalValesQuitados.toFixed(2)}</td>
                    </tr>
                </table>
            </div>
        `;

        if (vales.length > 0) {
            html += `<p style="font-size:12px; font-weight:700; margin-bottom:4px; color:#000;">Detalhamento de Vales do Período</p>
            <table class="relatorio-tabela">
                <tr><th>Data</th><th>Colaborador</th><th>Observação</th><th>Situação</th><th style="text-align:right;">Valor</th></tr>`;
            vales.forEach(v => {
                const nome = window.obterNomeColaborador ? window.obterNomeColaborador(v.perfil_id, 'Equipe') : 'Equipe';
                const statusPago = v.pago ? '<span style="color:#047857;">Quitado</span>' : '<span style="color:#b91c1c;">Em Aberto</span>';
                html += `<tr><td>${v.data_vale.split('-').reverse().join('/')}</td><td>${esc(nome)}</td><td>${esc(v.observacao) || '-'}</td><td>${statusPago}</td><td style="text-align:right;">R$ ${Number(v.valor).toFixed(2)}</td></tr>`;
            });
            html += `</table>`;
        }

        if (compras.length > 0) {
            html += `<p style="font-size:12px; font-weight:700; margin:12px 0 4px 0; color:#000;">Detalhamento de Compras / Consumo (Com 30% OFF)</p>
            <table class="relatorio-tabela">
                <tr><th>Data</th><th>Item</th><th>Desconto</th><th style="text-align:right;">Valor Final</th></tr>`;
            compras.forEach(c => {
                html += `<tr><td>${c.data_compra.split('-').reverse().join('/')}</td><td>${esc(c.descricao_item)}</td><td>${c.porcentagem_desconto}%</td><td style="text-align:right;">R$ ${Number(c.valor_final).toFixed(2)}</td></tr>`;
            });
            html += `</table>`;
        }

        html += historico6MesesHTML;
    }

    if (tarefas.length > 0) {
        html += `<p style="font-size:12px; font-weight:700; margin:14px 0 4px 0; color:#000;">Produtividade de Tarefas Executadas</p>
        <table class="relatorio-tabela">
            <tr><th>Tarefa</th><th>Iniciador</th><th>Ajudantes</th><th>Tempo Gasto</th><th style="text-align:right;">Concluído às</th></tr>`;
        
        tarefas.forEach(t => {
            const iniciador = window.obterNomeColaborador ? window.obterNomeColaborador(t.assumido_por, 'Equipe') : 'Equipe';
            const ajudantesNomes = (t.ajudantes || []).map(id => window.obterNomeColaborador ? window.obterNomeColaborador(id, 'Colega') : 'Colega').join(', ') || '-';
            
            let tempoGastoTxt = '-';
            if (t.hora_inicio && t.hora_fim) {
                const min = Math.round((new Date(t.hora_fim) - new Date(t.hora_inicio)) / 60000);
                tempoGastoTxt = window.formatarTempoDuracao ? window.formatarTempoDuracao(min) : `${min} min`;
            }

            const horaFim = t.hora_fim ? new Date(t.hora_fim).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '-';
            html += `<tr><td><strong>${esc(t.titulo)}</strong></td><td>${esc(iniciador)}</td><td>${esc(ajudantesNomes)}</td><td>${tempoGastoTxt}</td><td style="text-align:right;">${horaFim}</td></tr>`;
        });
        html += `</table>`;
    }

    if (ponto.length > 0) {
        html += `<p style="font-size:12px; font-weight:700; margin:14px 0 4px 0; color:#000;">Registro de Frequência (Livro Ponto)</p>
        <table class="relatorio-tabela">
            <tr><th>Data</th><th>Colaborador</th><th>Status</th><th>Entrada</th><th style="text-align:right;">Saída</th></tr>`;
        ponto.forEach(p => {
            const nome = window.obterNomeColaborador ? window.obterNomeColaborador(p.perfil_id, 'Equipe') : 'Equipe';
            let ent = p.horario_entrada ? new Date(p.horario_entrada).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '-';
            let sai = p.horario_saida ? new Date(p.horario_saida).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '-';
            html += `<tr><td>${p.data_registro.split('-').reverse().join('/')}</td><td>${esc(nome)}</td><td>${p.status_turno.toUpperCase()}</td><td>${ent}</td><td style="text-align:right;">${sai}</td></tr>`;
        });
        html += `</table>`;
    }

    html += `</div>`;
    containerResultados.innerHTML = html;
    
    const btnPdf = document.getElementById('btn-imprimir-pdf');
    if (btnPdf) {
        btnPdf.classList.remove('oculto');
        btnPdf.textContent = `Baixar ${nomeArquivoPdfSugerido}`;
    }

    const btnWhatsFechamento = document.getElementById('btn-whatsapp-fechamento');
    if (btnWhatsFechamento) {
        if (ultimoWhatsAppColaboradorRelatorio && ultimoResumoFechamentoTexto) {
            btnWhatsFechamento.classList.remove('oculto');
        } else {
            btnWhatsFechamento.classList.add('oculto');
        }
    }
    } catch(e) {
        document.getElementById('area-resultados-relatorio').textContent = 'Relatório não gerado: falha ao consultar os dados. ' + e.message;
        document.getElementById('btn-imprimir-pdf')?.classList.add('oculto');
        window.mostrarToast('Não foi possível gerar o relatório: ' + e.message, 'erro');
    }
};

window.imprimirPDF = function() {
    const btn = document.getElementById('btn-imprimir-pdf');
    if(!btn) return;
    btn.textContent = 'Gerando PDF...';

    if (typeof html2pdf === 'undefined') {
        window.mostrarToast("Biblioteca PDF indisponível.", "erro");
        btn.textContent = `Baixar ${nomeArquivoPdfSugerido}`;
        return;
    }

    const elementoPdf = document.getElementById('relatorio-pdf-container');
    elementoPdf.classList.remove('oculto');

    const opt = { 
        margin: [8, 8, 8, 8], 
        filename: nomeArquivoPdfSugerido, 
        image: { type: 'jpeg', quality: 0.98 }, 
        html2canvas: { scale: 2, useCORS: true, logging: false }, 
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } 
    };

    html2pdf().set(opt).from(elementoPdf).save().then(() => {
        btn.textContent = `Baixar ${nomeArquivoPdfSugerido}`;
        window.mostrarToast(`PDF gerado: ${nomeArquivoPdfSugerido}`);
    }).catch(err => {
        window.mostrarToast("Erro ao gerar PDF: " + err.message, "erro");
        btn.textContent = `Baixar ${nomeArquivoPdfSugerido}`;
    });
};

window.enviarResumoFechamentoWhatsApp = function() {
    if (!ultimoWhatsAppColaboradorRelatorio) {
        return window.mostrarToast("Colaborador não tem WhatsApp cadastrado.", "erro");
    }
    const numLimpo = ultimoWhatsAppColaboradorRelatorio.replace(/\D/g, '');
    const numFinal = numLimpo.startsWith('55') ? numLimpo : '55' + numLimpo;
    window.open(`https://wa.me/${numFinal}?text=${encodeURIComponent(ultimoResumoFechamentoTexto)}`, '_blank');
};
