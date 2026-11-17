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
    const limiteStr3Dias = diaEmpresa(dataLimite3Dias);

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
    const hojeStr = diaEmpresa(new Date());
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

    if (dIniEl) dIniEl.value = diaEmpresa(data30diasAtras);
    if (dFimEl) dFimEl.value = diaEmpresa(agora);
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

let cacheCardapioConsumo = [
    // 1. INDICAÇÕES DO CHEF
    { id: 'chef_1', nome_item: 'Sequências de Camarão (2 pessoas)', valor_padrao: 228.00 },
    { id: 'chef_2', nome_item: 'Caranha à Belle Meunière (2 pessoas)', valor_padrao: 278.00 },
    { id: 'chef_3', nome_item: 'Banquete da Costa – Seleção Premium (4 pessoas)', valor_padrao: 450.00 },

    // 2. BEBIDAS NÃO ALCOÓLICAS
    { id: 'beb_1', nome_item: 'Água Mineral (com ou sem gás)', valor_padrao: 9.00 },
    { id: 'beb_2', nome_item: 'Água Tônica FYS (com ou sem açúcar)', valor_padrao: 8.00 },
    { id: 'beb_3', nome_item: 'Refrigerante (Coca-Cola, Guaraná, Soda, Tônica)', valor_padrao: 10.00 },
    { id: 'beb_4', nome_item: 'Suco Natural (Limão, Laranja, Morango, Abacaxi, Acerola, Maracujá)', valor_padrao: 13.00 },
    { id: 'beb_5', nome_item: 'Soda Italiana (Sabores)', valor_padrao: 15.00 },
    { id: 'beb_6', nome_item: 'Chá Gelado Saborizado', valor_padrao: 18.00 },
    { id: 'beb_7', nome_item: 'Red Bull', valor_padrao: 18.00 },

    // 3. CERVEJAS 600ML
    { id: 'cerv_1', nome_item: 'Amstel 600ml', valor_padrao: 18.00 },
    { id: 'cerv_2', nome_item: 'Petra 600ml', valor_padrao: 20.00 },
    { id: 'cerv_3', nome_item: 'Spaten 600ml', valor_padrao: 22.00 },
    { id: 'cerv_4', nome_item: 'Stella Artois 600ml', valor_padrao: 23.00 },
    { id: 'cerv_5', nome_item: 'Heineken 600ml', valor_padrao: 24.00 },
    { id: 'cerv_6', nome_item: 'Corona 600ml', valor_padrao: 24.00 },
    { id: 'cerv_7', nome_item: 'Cerveja Original 600ml', valor_padrao: 24.00 },
    { id: 'cerv_8', nome_item: 'Stella Artois Gold 600ml', valor_padrao: 24.00 },
    { id: 'cerv_9', nome_item: 'Praya Lager 600ml', valor_padrao: 27.00 },

    // 4. CERVEJAS LONG NECK 330ML & ESPECIAIS
    { id: 'ln_1', nome_item: 'Praya sem glúten Long Neck', valor_padrao: 15.00 },
    { id: 'ln_2', nome_item: 'Stella Artois Long Neck', valor_padrao: 15.00 },
    { id: 'ln_3', nome_item: 'Stella Artois Gold Long Neck', valor_padrao: 15.00 },
    { id: 'ln_4', nome_item: 'LAC Malzbier Long Neck', valor_padrao: 15.00 },
    { id: 'ln_5', nome_item: 'Heineken Long Neck', valor_padrao: 16.00 },
    { id: 'ln_6', nome_item: 'Heineken Ultimate sem Glúten Long Neck', valor_padrao: 16.00 },
    { id: 'ln_7', nome_item: 'Heineken Zero Long Neck', valor_padrao: 16.00 },
    { id: 'esp_1', nome_item: 'Baden IPA 600ml', valor_padrao: 24.00 },
    { id: 'esp_2', nome_item: 'Schornstein 500ml (Pilsen ou IPA)', valor_padrao: 25.00 },
    { id: 'esp_3', nome_item: 'Chopp Saint Bier Golden Ale 750ml', valor_padrao: 43.00 },
    { id: 'esp_4', nome_item: 'Cerveja Coruja Viva 750ml', valor_padrao: 46.00 },

    // 5. DOSES, CAIPIRINHAS & DRINKS
    { id: 'dos_1', nome_item: 'Dose Cachaça Artesanal', valor_padrao: 3.00 },
    { id: 'dos_2', nome_item: 'Dose Vodka Kalvelage', valor_padrao: 15.00 },
    { id: 'dos_3', nome_item: 'Dose Campari', valor_padrao: 16.00 },
    { id: 'dos_4', nome_item: 'Dose Underberg', valor_padrao: 16.00 },
    { id: 'dos_5', nome_item: 'Dose Vodka Absolut', valor_padrao: 20.00 },
    { id: 'dos_6', nome_item: 'Dose Whisky Red Label', valor_padrao: 27.00 },
    { id: 'dos_7', nome_item: 'Dose Whisky Jack Daniel\'s', valor_padrao: 33.00 },
    { id: 'dos_8', nome_item: 'Dose Whisky Black Label', valor_padrao: 33.00 },
    { id: 'dos_9', nome_item: 'Dose Whisky Chivas Regal', valor_padrao: 33.00 },
    { id: 'caip_1', nome_item: 'Caipirinha de Vinho', valor_padrao: 35.00 },
    { id: 'caip_2', nome_item: 'Caipirinha Cachaça 51', valor_padrao: 36.00 },
    { id: 'caip_3', nome_item: 'Caipirinha Cachaça Artesanal', valor_padrao: 39.00 },
    { id: 'caip_4', nome_item: 'Caipirinha Vodka Kalvelage', valor_padrao: 39.00 },
    { id: 'caip_5', nome_item: 'Caipirinha Bacardi', valor_padrao: 39.00 },
    { id: 'caip_6', nome_item: 'Caipirinha de Saquê', valor_padrao: 39.00 },
    { id: 'caip_7', nome_item: 'Caipirinha Steinhaeger', valor_padrao: 39.00 },
    { id: 'caip_8', nome_item: 'Caipirinha Vodka Absolut', valor_padrao: 44.00 },
    { id: 'drk_1', nome_item: 'Drink Fresh Apple', valor_padrao: 35.00 },
    { id: 'drk_2', nome_item: 'Drink Gin Tônica', valor_padrao: 36.00 },
    { id: 'drk_3', nome_item: 'Drink Spiced Hibiscus', valor_padrao: 37.00 },
    { id: 'drk_4', nome_item: 'Drink Jabuticaba Sour', valor_padrao: 37.00 },
    { id: 'drk_5', nome_item: 'Drink Negroni', valor_padrao: 37.00 },
    { id: 'drk_6', nome_item: 'Drink Aperol Spritz', valor_padrao: 37.00 },
    { id: 'drk_7', nome_item: 'Drink Jackie Coke', valor_padrao: 40.00 },
    { id: 'drk_8', nome_item: 'Drink Jackie Tea Sour', valor_padrao: 40.00 },

    // 6. ENTRADAS, PETISCOS & PORÇÕES
    { id: 'ost_1', nome_item: 'Ostras ao Bafo (12 un)', valor_padrao: 63.00 },
    { id: 'ost_2', nome_item: 'Ostras ao Natural (12 un)', valor_padrao: 65.00 },
    { id: 'ost_3', nome_item: 'Ostras Gratinadas (12 un)', valor_padrao: 94.00 },
    { id: 'siri_1', nome_item: 'Casquinha de Siri (1 unidade)', valor_padrao: 20.00 },
    { id: 'siri_2', nome_item: 'Refogado de Siri (1 unidade)', valor_padrao: 32.00 },
    { id: 'siri_3', nome_item: 'Refogado de Siri com Catupiry (1 un)', valor_padrao: 38.00 },
    { id: 'siri_4', nome_item: 'Ceviche de Siri', valor_padrao: 84.00 },
    { id: 'siri_5', nome_item: 'Bolinho de Siri (6 unidades)', valor_padrao: 87.00 },
    { id: 'frut_1', nome_item: 'Marisco à Vinagrete', valor_padrao: 74.00 },
    { id: 'frut_2', nome_item: 'Marisco à Milanesa', valor_padrao: 77.00 },
    { id: 'frut_3', nome_item: 'Ceviche de Carapeva', valor_padrao: 80.00 },
    { id: 'frut_4', nome_item: 'Bolinho de Peixe Carapeva (6 un)', valor_padrao: 82.00 },
    { id: 'frut_5', nome_item: 'Lula à Dorê', valor_padrao: 95.00 },
    { id: 'frut_6', nome_item: 'Lula Grelhada', valor_padrao: 98.00 },
    { id: 'cam_1', nome_item: 'Camarão ao Bafo', valor_padrao: 79.00 },
    { id: 'cam_2', nome_item: 'Camarão Alho e Óleo com Casca', valor_padrao: 79.00 },
    { id: 'cam_3', nome_item: 'Camarão Chips Crocante', valor_padrao: 79.00 },
    { id: 'cam_4', nome_item: 'Camarão à Milanesa (Porção)', valor_padrao: 126.00 },
    { id: 'cam_5', nome_item: 'Camarão Alho e Óleo sem Casca', valor_padrao: 137.00 },
    { id: 'cam_6', nome_item: 'Petisco Misto da Casa (Lula, Isca, Camarões e Fritas)', valor_padrao: 229.00 },
    { id: 'porc_1', nome_item: 'Salada Simples (Alface, Tomate, Cenoura)', valor_padrao: 23.00 },
    { id: 'porc_2', nome_item: 'Salada da Casa Completa', valor_padrao: 48.00 },
    { id: 'porc_3', nome_item: 'Porção Batata Frita ou Souté', valor_padrao: 38.00 },
    { id: 'porc_4', nome_item: 'Maionese Simples', valor_padrao: 41.00 },
    { id: 'porc_5', nome_item: 'Maionese de Camarão', valor_padrao: 73.00 },
    { id: 'porc_6', nome_item: 'Ova de Tainha ou Caranha', valor_padrao: 56.00 },
    { id: 'porc_7', nome_item: 'Iscas de Frango', valor_padrao: 61.00 },
    { id: 'porc_8', nome_item: 'Peixe Frito em Postas (Aperitivo sem Acomp.)', valor_padrao: 77.00 },
    { id: 'porc_9', nome_item: 'Iscas de Peixe Carapeva', valor_padrao: 87.00 },
    { id: 'porc_10', nome_item: 'Iscas de Peixe Robalo', valor_padrao: 89.00 },

    // 7. PASTÉIS (1 UNIDADE)
    { id: 'pas_1', nome_item: 'Pastel de Queijo', valor_padrao: 14.00 },
    { id: 'pas_2', nome_item: 'Pastel de Pizza', valor_padrao: 14.00 },
    { id: 'pas_3', nome_item: 'Pastel de Frango', valor_padrao: 15.00 },
    { id: 'pas_4', nome_item: 'Pastel de Carne', valor_padrao: 16.00 },
    { id: 'pas_5', nome_item: 'Pastel de Camarão', valor_padrao: 18.00 },
    { id: 'pas_6', nome_item: 'Pastel de Siri', valor_padrao: 18.00 },
    { id: 'pas_7', nome_item: 'Pastel de Berbigão', valor_padrao: 18.00 },
    { id: 'pas_8', nome_item: 'Pastel de Camarão com Queijo', valor_padrao: 18.00 },

    // 8. PRATOS PRINCIPAIS (2 PESSOAS)
    { id: 'prat_1', nome_item: 'Espada Grelhada (2 pessoas)', valor_padrao: 124.00 },
    { id: 'prat_2', nome_item: 'Espada Grelhada ao Molho de Camarão', valor_padrao: 152.00 },
    { id: 'prat_3', nome_item: 'Filé de Espada à Milanesa', valor_padrao: 122.00 },
    { id: 'prat_4', nome_item: 'Filé de Espada à Milanesa ao Molho de Camarão', valor_padrao: 150.00 },
    { id: 'prat_5', nome_item: 'Espada à Belle Meunière', valor_padrao: 155.00 },
    { id: 'prat_6', nome_item: 'Anchova Grelhada (2 pessoas)', valor_padrao: 160.00 },
    { id: 'prat_7', nome_item: 'Anchova à Belle Meunière', valor_padrao: 196.00 },
    { id: 'prat_8', nome_item: 'Tainha Grelhada (2 pessoas)', valor_padrao: 160.00 },
    { id: 'prat_9', nome_item: 'Tainha à Belle Meunière', valor_padrao: 196.00 },
    { id: 'prat_10', nome_item: 'Peixe Frito em Postas Refeição Completa', valor_padrao: 132.00 },
    { id: 'prat_11', nome_item: 'Carapeva Grelhada', valor_padrao: 168.00 },
    { id: 'prat_12', nome_item: 'Carapeva Grelhada ao Molho de Camarão', valor_padrao: 192.00 },
    { id: 'prat_13', nome_item: 'Filé de Carapeva à Milanesa', valor_padrao: 164.00 },
    { id: 'prat_14', nome_item: 'Filé de Carapeva ao Molho de Camarão', valor_padrao: 190.00 },
    { id: 'prat_15', nome_item: 'Carapeva à Belle Meunière', valor_padrao: 195.00 },
    { id: 'prat_16', nome_item: 'Robalo Grelhado', valor_padrao: 208.00 },
    { id: 'prat_17', nome_item: 'Filé de Robalo à Milanesa', valor_padrao: 172.00 },
    { id: 'prat_18', nome_item: 'Filé de Robalo ao Molho de Camarão', valor_padrao: 196.00 },
    { id: 'prat_19', nome_item: 'Robalo à Belle Meunière', valor_padrao: 232.00 },
    { id: 'prat_20', nome_item: 'Linguado Grelhado', valor_padrao: 226.00 },
    { id: 'prat_21', nome_item: 'Filé de Linguado à Milanesa', valor_padrao: 199.00 },
    { id: 'prat_22', nome_item: 'Linguado ao Molho de Camarão', valor_padrao: 228.00 },
    { id: 'prat_23', nome_item: 'Linguado à Belle Meunière', valor_padrao: 255.00 },
    { id: 'prat_24', nome_item: 'Caranha Grelhada', valor_padrao: 245.00 },
    { id: 'prat_25', nome_item: 'Sequência Sabor da Costa (2 pessoas)', valor_padrao: 276.00 },

    // 9. PRATOS COM CAMARÃO, MOQUECAS & VEGETARIANOS
    { id: 'cam_p1', nome_item: 'Risoto de Camarão (2 pessoas)', valor_padrao: 169.00 },
    { id: 'cam_p2', nome_item: 'Prato Camarão à Milanesa (2 pessoas)', valor_padrao: 189.00 },
    { id: 'cam_p3', nome_item: 'Camarão à Parmegiana (2 pessoas)', valor_padrao: 199.00 },
    { id: 'cam_p4', nome_item: 'Strogonoff de Camarão (2 pessoas)', valor_padrao: 220.00 },
    { id: 'cam_p5', nome_item: 'Moqueca de Camarão (2 pessoas)', valor_padrao: 228.00 },
    { id: 'moq_1', nome_item: 'Moqueca Mista (Caranha e Camarão)', valor_padrao: 235.00 },
    { id: 'moq_2', nome_item: 'Moqueca Mista (Caranha, Camarão e Lula)', valor_padrao: 237.00 },
    { id: 'veg_1', nome_item: 'Prato Vegetariano (Omelete Especial)', valor_padrao: 90.00 },
    { id: 'veg_2', nome_item: 'Prato Vegano (Moqueca ou Risoto de Legumes)', valor_padrao: 146.00 },

    // 10. CARNES & FRANGOS (2 PESSOAS)
    { id: 'carne_1', nome_item: 'Frango à Milanesa ou Grelhado (2 pessoas)', valor_padrao: 120.00 },
    { id: 'carne_2', nome_item: 'Frango à Parmegiana (2 pessoas)', valor_padrao: 160.00 },
    { id: 'carne_3', nome_item: 'Contra-Filé Grelhado (2 pessoas)', valor_padrao: 180.00 },

    // 11. EXECUTIVOS & KIDS (INDIVIDUAIS)
    { id: 'exec_1', nome_item: 'Prato Kids de Alcatra', valor_padrao: 47.00 },
    { id: 'exec_2', nome_item: 'Prato Feito (Frango ou Peixe)', valor_padrao: 56.00 },
    { id: 'exec_3', nome_item: 'Prato Feito de Alcatra', valor_padrao: 65.00 },

    // 12. SOBREMESAS
    { id: 'sob_1', nome_item: 'Arroz Doce de Pamonha', valor_padrao: 18.00 },
    { id: 'sob_2', nome_item: 'Mousse de Chocolate', valor_padrao: 28.00 },
    { id: 'sob_3', nome_item: 'Pudim de Leite', valor_padrao: 32.00 },
    { id: 'sob_4', nome_item: 'Petit Gâteau com Sorvete', valor_padrao: 36.00 }
];

window.inicializarCardapioConsumo = async function() {
    try {
        const { data, error } = await cliente.from('cardapio_consumo').select('*').eq('ativo', true).order('nome_item');
        if (!error && data && data.length > 0) {
            const mapaItens = {};
            cacheCardapioConsumo.forEach(item => { mapaItens[item.nome_item.toLowerCase()] = item; });
            data.forEach(item => { mapaItens[item.nome_item.toLowerCase()] = item; });
            cacheCardapioConsumo = Object.values(mapaItens);
        }
    } catch(e) {}
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
    const hojeStr = diaEmpresa(new Date());
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
    const hojeStr = diaEmpresa(new Date());
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
    const limite7DiasStr = diaEmpresa(limite7Dias);

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
    const hojeStr = diaEmpresa(new Date());

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
            ? `<button class="btn-copiar-codigo" onclick="window.copiarCodigoConta('${esc(c.codigo_barras_pix)}')">📋 Copiar ${c.tipo_pagamento === 'pix' ? 'Pix' : 'Código'}</button>` 
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
    const hojeStr = diaEmpresa(new Date());
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
            inData.value = diaEmpresa(new Date());
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
                        ? `<button class="btn-whats" onclick="window.dispararFechamentoSocioDireto('${esc(s.telefone_whatsapp)}')">Enviar</button>` 
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
    
    if(!dataInicio || !dataFim) return window.mostrarToast("Selecione o intervalo de datas.", "erro");

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
    const dataHojeFormatada = diaEmpresa(new Date()).split('-').reverse().join('-');
    nomeArquivoPdfSugerido = `Relatorio_${nomeLimpoParaArquivo}_${dataHojeFormatada}.pdf`;

    ultimoWhatsAppColaboradorRelatorio = (filtroFunc !== 'todos' && mapaPerfis[filtroFunc]) 
        ? (mapaPerfis[filtroFunc].telefone_whatsapp || '') 
        : '';

    const containerResultados = document.getElementById('area-resultados-relatorio');
    if (!containerResultados) return;

    document.getElementById('relatorio-pdf-container')?.classList.remove('oculto');
    containerResultados.innerHTML = '<p style="text-align:center; color:#000;">Compilando dados...</p>';
    
    const logoUrl = "https://apbqjbrqwulgohcjkxae.supabase.co/storage/v1/object/public/sistema-imagens/barco_sabor_da_costa.png";

    const dEmpresa = dadosEmpresaAtual || {};
    const nomeEmpresa = dEmpresa.nome_empresa || 'Sabor da Costa';
    const cnpjEmpresa = dEmpresa.cnpj ? `CNPJ: ${esc(dEmpresa.cnpj)}` : '';
    const telEmpresa = dEmpresa.telefone ? `Tel: ${esc(dEmpresa.telefone)}` : '';
    const endEmpresa = dEmpresa.endereco ? esc(dEmpresa.endereco) : '';

    let ponto = [], tarefas = [], vales = [], compras = [], pedidosRel = [], caixasRel = [];

    if (tipoSelecionado === 'fechamento_caixa') {
        let qC = cliente.from('fechamento_caixa').select('*').gte('data_fechamento', dataInicio).lte('data_fechamento', dataFim).order('data_fechamento', { ascending: true });
        if (filtroFunc !== 'todos') qC = qC.eq('responsavel_id', filtroFunc);
        const { data: dCaixa } = await qC;
        caixasRel = dCaixa || [];
    }

    if (tipoSelecionado === 'pedidos') {
        const { data: todosPedidos } = await cliente.from('pedidos_compra').select('*').order('criado_em', { ascending: false });
        const agora = new Date();
        const dataLimite30Dias = new Date(agora);
        dataLimite30Dias.setDate(dataLimite30Dias.getDate() - 30);
        const limiteStr = diaEmpresa(dataLimite30Dias);

        pedidosRel = (todosPedidos || []).filter(p => {
            const st = p.status || (p.lido ? 'comprado' : 'pendente');
            if (st === 'pendente') return true;
            const dataBase = p.data_comprado || (p.criado_em ? p.criado_em.split('T')[0] : '');
            return dataBase >= limiteStr;
        });

        if (filtroFunc !== 'todos') {
            pedidosRel = pedidosRel.filter(p => p.criado_por === filtroFunc);
        }
    }

    if (tipoSelecionado === 'ambos' || tipoSelecionado === 'frequencia' || tipoSelecionado === 'financeiro') {
        let q = cliente.from('livro_ponto').select('*').gte('data_registro', dataInicio).lte('data_registro', dataFim);
        if (filtroFunc !== 'todos') q = q.eq('perfil_id', filtroFunc);
        const { data } = await q; ponto = data || [];
    }

    if (tipoSelecionado === 'ambos' || tipoSelecionado === 'produtividade') {
        let q = cliente.from('tarefas').select('*').eq('status', 'concluida');
        const { data } = await q;
        tarefas = (data || []).filter(t => {
            const dataFimTarefa = t.hora_fim ? t.hora_fim.split('T')[0] : '';
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
        const { data: dV } = await qV; vales = dV || [];

        let qC = cliente.from('itens_comprados').select('*').gte('data_compra', dataInicio).lte('data_compra', dataFim);
        if (filtroFunc !== 'todos') qC = qC.or(`perfil_id.eq.${filtroFunc},registrado_por.eq.${filtroFunc}`);
        const { data: dC } = await qC; compras = dC || [];
    }

    if (filtroSetor && filtroSetor !== 'todos') {
        ponto = ponto.filter(p => mapaPerfis[p.perfil_id]?.setor === filtroSetor);
        vales = vales.filter(v => mapaPerfis[v.perfil_id]?.setor === filtroSetor);
        compras = compras.filter(c => mapaPerfis[c.perfil_id]?.setor === filtroSetor);
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
        const dataStr6M = diaEmpresa(dataLimite6M);

        let qV6 = cliente.from('vales').select('*').gte('data_vale', dataStr6M);
        let qC6 = cliente.from('itens_comprados').select('*').gte('data_compra', dataStr6M);

        if (filtroFunc !== 'todos') {
            qV6 = qV6.eq('perfil_id', filtroFunc);
            qC6 = qC6.or(`perfil_id.eq.${filtroFunc},registrado_por.eq.${filtroFunc}`);
        }

        const [{ data: vales6M }, { data: compras6M }] = await Promise.all([qV6, qC6]);

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
