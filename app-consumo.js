(() => {
    'use strict';
    const form = suiriEl('form-meu-consumo');
    const nome = suiriEl('input-meu-consumo-desc');
    const preco = suiriEl('input-meu-consumo-valor');
    const quantidade = suiriEl('input-meu-consumo-qtd');
    const sugestoes = suiriEl('dropdown-autocomplete-consumo');
    const solicitacoes = suiriEl('meu-consumo-solicitacoes');
    const sino = suiriEl('btn-consumo-pendencias');
    const modal = suiriEl('modal-consumo-pendencias');
    const revisoes = suiriEl('consumo-revisao-lista');
    const pagina = 15;
    let chaveSessao;
    let itensPessoais = [];
    let proprioCarregado = false;
    let paginaPessoal = 0;
    let consultaPessoal = 0;
    let consultaGestao = 0;
    let operacao;
    let revisoesVisiveis = 0;
    let chavePreco = '';
    let veioDoCatalogo = false;

    const chave = texto => texto.trim().replace(/\s+/g, ' ').toLowerCase();
    const podeRevisar = () => !!(perfilAtual?.is_admin || perfilAtual?.is_gerente || perfilAtual?.is_socio);
    const sessao = () => usuarioAtual && empresaAtualId && !suiriEl('tela-app').classList.contains('oculto')
        ? usuarioAtual.id + ':' + empresaAtualId : null;
    const moeda = valor => suiriMoeda(Math.round(Number(valor) * 100));
    const centavosOuZero = valor => {
        try { return window.centavosSuiri(valor); } catch { return 0; }
    };
    const quantidadeValida = valor => Number.isInteger(valor) && valor >= 1 && valor <= 9999;
    const itemCatalogado = () => cacheCardapioConsumo.find(item => chave(item.nome_item) === chave(nome.value));
    const solicitacaoPendente = () => itensPessoais.find(item => item.status === 'pendente' && chave(item.nome_item) === chave(nome.value));

    sino.classList.add('consumo-sino');
    suiriEl('abrir-ajustes-marca').before(sino);

    function fecharSugestoes() {
        sugestoes.classList.remove('ativo');
        sugestoes.replaceChildren();
    }

    function atualizarTotal() {
        const valor = centavosOuZero(preco.value);
        const qtd = quantidade.valueAsNumber;
        const total = valor * qtd;
        suiriEl('meu-consumo-total').textContent = total > 0 && quantidadeValida(qtd) && total <= 99999999999
            ? suiriMoeda(Math.round(total * 70 / 100)) : '—';
    }

    function atualizarPreco() {
        const catalogado = itemCatalogado();
        const digitado = chave(nome.value);
        const provisoria = digitado && solicitacaoPendente();
        if (chavePreco !== digitado || (veioDoCatalogo && !catalogado)) {
            preco.value = '';
            chavePreco = digitado;
        }
        if (catalogado) preco.value = Number(catalogado.valor_padrao).toFixed(2).replace('.', ',');
        else if (!preco.value && provisoria) preco.value = Number(provisoria.valor_informado).toFixed(2).replace('.', ',');
        preco.readOnly = !!catalogado;
        veioDoCatalogo = !!catalogado;
        suiriEl('meu-consumo-origem').textContent = catalogado ? 'Preço do cardápio.'
            : provisoria ? 'Preço sugerido por você. Este lançamento também será revisado.'
            : digitado ? 'Item novo. A gestão vai conferir o preço e a quantidade.' : '';
        atualizarTotal();
    }

    window.atualizarPrecoConsumoSuiri = atualizarPreco;

    nome.addEventListener('input', () => {
        atualizarPreco();
        fecharSugestoes();
        const termo = chave(nome.value);
        if (!termo || itemCatalogado()) return;
        const itens = cacheCardapioConsumo.filter(item => chave(item.nome_item).includes(termo)).slice(0, 7);
        for (const item of itens) {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = 'autocomplete-item';
            botao.innerHTML = `<span>${esc(item.nome_item)}</span><strong>${moeda(item.valor_padrao)}</strong>`;
            botao.addEventListener('click', () => {
                nome.value = item.nome_item;
                atualizarPreco();
                fecharSugestoes();
                quantidade.focus();
            });
            sugestoes.append(botao);
        }
        sugestoes.classList.toggle('ativo', !!itens.length);
    });
    document.addEventListener('click', e => {
        if (e.target instanceof Element && !e.target.closest('.autocomplete-container')) fecharSugestoes();
    });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') fecharSugestoes(); });
    form.addEventListener('input', atualizarTotal);

    function prepararSessao() {
        const atual = sessao();
        if (atual === chaveSessao) return atual;
        chaveSessao = atual;
        itensPessoais = [];
        proprioCarregado = false;
        paginaPessoal = 0;
        operacao = null;
        consultaPessoal++;
        consultaGestao++;
        form.reset();
        fecharSugestoes();
        atualizarPreco();
        solicitacoes.open = false;
        modal.classList.add('oculto');
        suiriEl('meu-consumo-historico').replaceChildren();
        suiriEl('meu-consumo-pendentes').textContent = '';
        mostrarContagem(0);
        return atual;
    }

    form.addEventListener('submit', e => {
        e.preventDefault();
        const identidade = prepararSessao();
        if (!identidade) return;
        suiriExecutar(e.submitter, async () => {
            const valor = window.centavosSuiri(preco.value);
            const qtd = quantidade.valueAsNumber;
            if (!nome.value.trim() || !valor || !quantidadeValida(qtd) || valor * qtd > 99999999999) {
                throw new Error('Confira o produto, o preço por unidade e a quantidade.');
            }
            const dados = {p_nome:nome.value.trim(),p_valor:valor / 100,p_qtd:qtd,p_data:window.dataLocal()};
            const assinatura = JSON.stringify(dados);
            if (operacao?.assinatura !== assinatura) operacao = {assinatura,id:suiriUID()};
            dados.p_operacao = operacao.id;
            const r = await window.executarOuOffline('consumo_rpc', dados, () => cliente.rpc('suiri_lancar_consumo',dados));
            if (identidade !== sessao()) return;
            if (r.error) throw new Error(erroConsumo(r.error));
            operacao = null;
            form.reset();
            fecharSugestoes();
            atualizarPreco();
            window.mostrarToast(r.offline ? 'Consumo salvo no aparelho. O envio ocorre ao reconectar.'
                : r.data === 'lancado' ? 'Consumo registrado com 30% de desconto.' : 'Consumo enviado para aprovação.');
            if (r.data === 'lancado' && suiriTelaAtual === 'perfil') window.renderizarPainelPerfilCompleto?.();
            await window.atualizarConsumoSuiri();
        });
    });

    function erroConsumo(erro) {
        return erro?.code === 'PGRST202' || erro?.code === '42883'
            ? 'A atualização de consumo ainda precisa ser instalada no banco da empresa.'
            : erro?.message || 'Não foi possível carregar os consumos.';
    }

    async function carregarPessoal(deslocamento = 0) {
        const identidade = sessao();
        const numero = ++consultaPessoal;
        const lista = suiriEl('meu-consumo-historico');
        const proximaPagina = Math.max(0,paginaPessoal + deslocamento);
        const {data,error} = await cliente.rpc('suiri_listar_consumos',
            {p_gestao:false,p_limite:pagina,p_pular:proximaPagina * pagina});
        if (identidade !== sessao() || numero !== consultaPessoal) return;
        if (error) {
            lista.textContent = erroConsumo(error);
            return;
        }
        const itens = data?.itens || [];
        if (proximaPagina === 0) {
            const atualizou = proprioCarregado && itens.some(item => item.status === 'aprovado' &&
                itensPessoais.some(anterior => anterior.id === item.id && anterior.status === 'pendente'));
            itensPessoais = itens;
            proprioCarregado = true;
            if (atualizou) {
                window.inicializarCardapioConsumo();
                if (suiriTelaAtual === 'perfil') window.renderizarPainelPerfilCompleto?.();
            }
        }
        paginaPessoal = proximaPagina;
        suiriEl('meu-consumo-pendentes').textContent = data?.pendentes ? `(${data.pendentes} pendente${data.pendentes === 1 ? '' : 's'})` : '';
        suiriEl('meu-consumo-anterior').classList.toggle('oculto', !paginaPessoal);
        suiriEl('meu-consumo-mais').classList.toggle('oculto', (paginaPessoal + 1) * pagina >= data.total);
        lista.innerHTML = itens.length ? itens.map(item => {
            const aprovado = item.status === 'aprovado';
            const status = aprovado ? 'Aprovado' : item.status === 'recusado' ? 'Recusado' : 'Em análise';
            const valor = aprovado ? item.valor_aprovado : item.valor_informado;
            const qtd = aprovado ? item.quantidade_aprovada : item.quantidade_informada;
            const total = suiriMoeda(Math.round(Math.round(Number(valor) * 100) * qtd * 70 / 100));
            return `<div class="consumo-historico-linha"><strong>${esc(item.nome_item)}</strong><span>${status} · ${suiriData(item.data_compra)}</span><span>${qtd} × ${moeda(valor)} · ${total}</span></div>`;
        }).join('') : '<p class="consumo-nota">Você ainda não tem solicitações.</p>';
        atualizarPreco();
    }

    function mostrarContagem(total) {
        const badge = suiriEl('badge-consumo-pendencias');
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.classList.toggle('oculto', !total);
        sino.setAttribute('aria-label', total ? `Aprovações de consumo, ${total} pendentes` : 'Aprovações de consumo');
    }

    async function carregarGestao({listar = false, mais = false} = {}) {
        if (!podeRevisar()) return;
        const identidade = sessao();
        const numero = ++consultaGestao;
        const pular = mais ? revisoesVisiveis : 0;
        const {data,error} = await cliente.rpc('suiri_listar_consumos',{p_gestao:true,p_limite:listar ? pagina : 0,p_pular:pular});
        if (identidade !== sessao() || numero !== consultaGestao) return;
        if (error) {
            if (listar) suiriEl('consumo-revisao-status').textContent = erroConsumo(error);
            return;
        }
        mostrarContagem(data?.pendentes || 0);
        if (!listar) return;
        if (!mais) revisoes.replaceChildren();
        const itens = data?.itens || [];
        revisoesVisiveis = pular + itens.length;
        suiriEl('consumo-revisao-mais').classList.toggle('oculto', revisoesVisiveis >= data.pendentes || !itens.length);
        suiriEl('consumo-revisao-status').textContent = data.pendentes
            ? `${data.pendentes} aguardando revisão` : 'Nenhuma aprovação pendente.';
        for (const item of itens) {
            if ([...revisoes.children].some(el => el.dataset.id === item.id)) continue;
            const linha = document.createElement('form');
            linha.className = 'suiri-form consumo-revisao-item';
            linha.dataset.id = item.id;
            linha.innerHTML = `<div><strong>${esc(item.nome_item)}</strong><p class="consumo-nota">${esc(item.colaborador)} · ${suiriData(item.data_compra)}</p></div>
                <div class="suiri-grid"><label>Preço por unidade (R$)<input name="preco" inputmode="decimal" required value="${Number(item.valor_informado).toFixed(2).replace('.', ',')}"></label>
                <label>Quantidade<input name="qtd" type="number" min="1" max="9999" step="1" required value="${item.quantidade_informada}"></label></div>
                <div class="consumo-total"><span>Total com 30% de desconto</span><output></output></div>
                <div class="consumo-acoes"><button type="submit" class="btn-principal" value="aprovar">Aprovar</button><button type="submit" class="btn-secundario" value="recusar" formnovalidate>Recusar</button></div>`;
            const atualizar = () => {
                const qtd = linha.elements.qtd.valueAsNumber;
                const total = centavosOuZero(linha.elements.preco.value) * qtd;
                linha.querySelector('output').textContent = total > 0 && quantidadeValida(qtd)
                    ? suiriMoeda(Math.round(total * 70 / 100)) : '—';
            };
            linha.addEventListener('input', atualizar);
            linha.addEventListener('submit', e => {
                e.preventDefault();
                const aprovar = e.submitter?.value !== 'recusar';
                const botoes = [...linha.querySelectorAll('button')];
                if (botoes.some(botao => botao.disabled)) return;
                suiriExecutar(e.submitter, async () => {
                    const outro = botoes.find(botao => botao !== e.submitter);
                    outro.disabled = true;
                    try {
                        const valor = aprovar ? window.centavosSuiri(linha.elements.preco.value) / 100 : null;
                        const qtd = aprovar ? linha.elements.qtd.valueAsNumber : null;
                        const {data:status,error:falha} = await cliente.rpc('suiri_revisar_consumo',
                            {p_id:item.id,p_aprovar:aprovar,p_valor:valor,p_qtd:qtd});
                        if (falha) throw new Error(erroConsumo(falha));
                        if (identidade !== sessao()) return;
                        window.mostrarToast(status === 'aprovado' ? 'Consumo aprovado.' : 'Consumo recusado.');
                        if (status === 'aprovado') window.inicializarCardapioConsumo();
                        await Promise.all([carregarGestao({listar:true}),carregarPessoal()]);
                    } finally { outro.disabled = false; }
                });
            });
            atualizar();
            revisoes.append(linha);
        }
    }

    window.atualizarConsumoSuiri = async function(atualizarCatalogo = false) {
        const atual = prepararSessao();
        sino.classList.toggle('oculto', !atual || !podeRevisar());
        if (!atual || !navigator.onLine) return;
        const tarefas = [carregarPessoal()];
        if (atualizarCatalogo) tarefas.push(window.inicializarCardapioConsumo());
        if (modal.classList.contains('oculto')) tarefas.push(carregarGestao());
        await Promise.all(tarefas);
    };
    solicitacoes.addEventListener('toggle', () => {
        if (solicitacoes.open && sessao()) carregarPessoal();
    });
    sino.addEventListener('click', () => {
        if (!sessao() || !podeRevisar()) return;
        revisoes.replaceChildren();
        suiriEl('consumo-revisao-mais').classList.add('oculto');
        suiriEl('consumo-revisao-status').textContent = 'Carregando solicitações…';
        modal.classList.remove('oculto');
        carregarGestao({listar:true});
    });
    suiriEl('meu-consumo-anterior').addEventListener('click', e => suiriExecutar(e.currentTarget, () => carregarPessoal(-1)));
    suiriEl('meu-consumo-mais').addEventListener('click', e => suiriExecutar(e.currentTarget, () => carregarPessoal(1)));
    suiriEl('consumo-revisao-mais').addEventListener('click', e => suiriExecutar(e.currentTarget, () => carregarGestao({listar:true,mais:true})));
    window.addEventListener('focus', () => window.atualizarConsumoSuiri(true));
    setInterval(() => { if (!document.hidden) window.atualizarConsumoSuiri(); }, 45000);
})();
