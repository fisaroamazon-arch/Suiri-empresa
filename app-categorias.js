(() => {
    const produtosPadrao = CATEGORIAS_COMPRA;
    const el = id => document.getElementById(id);
    let empresaCarregada;
    let usuarioCarregado;
    let consulta;
    let categorias = [];
    let disponivel = false;

    function limparEmpresa() {
        categorias = [];
        disponivel = false;
        consulta = null;
        empresaCarregada = empresaAtualId;
        usuarioCarregado = usuarioAtual?.id;
        document.querySelectorAll('[data-gerir-categorias]').forEach(editor => {
            editor.hidden = true;
            editor.open = false;
            editor.querySelector('[data-nome-categoria]').value = '';
            editor.querySelector('[role="status"]').textContent = '';
        });
    }

    function conferirEmpresa() {
        if (empresaCarregada !== empresaAtualId || usuarioCarregado !== usuarioAtual?.id) limparEmpresa();
    }

    function opcoes(tipo, legadas = []) {
        conferirEmpresa();
        const mapa = new Map();
        for (const chave of [...(tipo === 'produto' ? produtosPadrao : []), ...legadas]) {
            if (chave) mapa.set(chave, {chave, nome:chave});
        }
        for (const categoria of categorias) {
            if (categoria.tipo === tipo) mapa.set(categoria.chave, categoria);
        }
        return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }

    function preencher(select, itens, extra, atual = select?.value) {
        if (!select) return;
        select.replaceChildren(...(extra ? [new Option(extra.nome, extra.chave)] : []),
            ...itens.map(item => new Option(item.nome, item.chave)));
        if ([...select.options].some(option => option.value === atual)) select.value = atual;
    }

    function atualizarCampos() {
        const compras = opcoes('produto', cachePedidosCompra.map(pedido => pedido.categoria));
        preencher(el('select-categoria-pedido'), compras);
        for (const id of ['filtro-categoria-compras','filtro-categoria-gestao-compras','filtro-categoria-relatorio']) {
            preencher(el(id), compras, {chave:'todos', nome:'Todas as categorias'});
        }
        const categoriaFornecedor = el('contato-categoria-fornecedor');
        if (categoriaFornecedor) {
            preencher(categoriaFornecedor, opcoes('fornecedor'), {chave:'', nome:'Sem categoria'});
            categoriaFornecedor.closest('label').hidden = !disponivel || categoriaFornecedor.form.elements.tipo.value !== 'fornecedor';
            categoriaFornecedor.disabled = !disponivel;
        }
        for (const editor of document.querySelectorAll('[data-gerir-categorias]')) {
            const tipo = editor.dataset.gerirCategorias;
            const ehFornecedor = tipo === 'fornecedor';
            editor.hidden = !disponivel || (ehFornecedor && categoriaFornecedor?.form.elements.tipo.value !== 'fornecedor');
            preencher(editor.querySelector('[data-editar-categoria]'), ehFornecedor ? opcoes(tipo) : compras,
                {chave:'', nome:'Criar categoria'});
        }
    }

    async function carregar() {
        conferirEmpresa();
        if (!empresaAtualId || !usuarioAtual) return;
        if (consulta) return consulta;
        const empresa = empresaAtualId;
        const usuario = usuarioAtual.id;
        consulta = (async () => {
            const {data, error} = await window.todosRegistrosSuiri(
                cliente.from('suiri_categorias').select('tipo,chave,nome')
                    .eq('empresa_id', empresa).order('tipo').order('chave'));
            if (empresaAtualId !== empresa || usuarioAtual?.id !== usuario) return;
            if (!error) {
                categorias = data || [];
                disponivel = true;
            } else if (error.code === 'PGRST205' || error.code === '42P01') {
                disponivel = false;
            }
            atualizarCampos();
        })();
        const emAndamento = consulta;
        try { await emAndamento; }
        finally { if (consulta === emAndamento) consulta = null; }
    }

    function montarEditor(conteiner, tipo) {
        if (!conteiner) return;
        const editor = document.createElement('details');
        editor.hidden = true;
        editor.className = 'suiri-editor-categorias';
        editor.dataset.gerirCategorias = tipo;
        editor.innerHTML = `<summary>Gerenciar categorias</summary>
            <div class="suiri-form">
                <label>Ação<select data-editar-categoria></select></label>
                <label>Nome da categoria<input data-nome-categoria type="text" maxlength="80" autocomplete="off"></label>
                <button class="btn-secundario" type="button">Salvar categoria</button>
                <p role="status"></p>
            </div>`;
        conteiner.append(editor);
        const seletor = editor.querySelector('[data-editar-categoria]');
        const nome = editor.querySelector('[data-nome-categoria]');
        const botao = editor.querySelector('button');
        const status = editor.querySelector('[role="status"]');
        seletor.addEventListener('change', () => {
            nome.value = seletor.value ? seletor.options[seletor.selectedIndex].textContent : '';
            status.textContent = '';
        });
        botao.addEventListener('click', async () => {
            conferirEmpresa();
            const novoNome = nome.value.trim();
            if (!novoNome) {
                status.textContent = 'Informe o nome da categoria.';
                nome.focus();
                return;
            }
            if (!disponivel || !empresaAtualId) return;
            const empresa = empresaAtualId;
            const usuario = usuarioAtual?.id;
            const chave = seletor.value || novoNome;
            const existente = categorias.some(item => item.tipo === tipo && item.chave === chave);
            const itens = tipo === 'produto'
                ? opcoes(tipo, cachePedidosCompra.map(pedido => pedido.categoria))
                : opcoes(tipo);
            if (chave === 'todos' || (!seletor.value && itens.some(item => item.chave === chave))
                || itens.some(item => item.chave !== chave && item.nome.toLocaleLowerCase('pt-BR') === novoNome.toLocaleLowerCase('pt-BR'))) {
                status.textContent = 'Esta categoria já existe.';
                return;
            }
            botao.disabled = true;
            status.textContent = 'Salvando…';
            try {
                const tabela = cliente.from('suiri_categorias');
                const resposta = existente
                    ? await tabela.update({nome:novoNome}).eq('empresa_id', empresa).eq('tipo', tipo).eq('chave', chave).select('chave').single()
                    : await tabela.insert({empresa_id:empresa, tipo, chave, nome:novoNome});
                if (empresaAtualId !== empresa || usuarioAtual?.id !== usuario) return;
                if (resposta.error) throw resposta.error;
                await carregar();
                if (empresaAtualId !== empresa || usuarioAtual?.id !== usuario) return;
                seletor.value = chave;
                nome.value = novoNome;
                status.textContent = 'Categoria salva.';
                const selecao = el(tipo === 'produto' ? 'select-categoria-pedido' : 'contato-categoria-fornecedor');
                if (selecao) selecao.value = chave;
                window.renderizarQuadroComprasModal?.();
                window.renderizarQuadroComprasUnificado?.();
                if (tipo === 'fornecedor') suiriRenderContatos();
            } catch (error) {
                if (empresaAtualId !== empresa || usuarioAtual?.id !== usuario) return;
                status.textContent = error.code === '23505'
                    ? 'Esta categoria já existe. Atualize a lista e tente novamente.'
                    : 'Não foi possível salvar a categoria. Confira sua conexão e acesso.';
            } finally {
                botao.disabled = false;
            }
        });
    }

    window.suiriCategorias = {
        carregar, atualizarCampos,
        disponivel() { conferirEmpresa(); return disponivel; },
        nome(chave, tipo = 'produto') {
            return opcoes(tipo).find(item => item.chave === chave)?.nome || chave;
        }
    };

    montarEditor(el('cadastro-categoria-produto'), 'produto');
    const form = el('form-contato-suiri');
    if (form) {
        const campo = document.createElement('label');
        campo.hidden = true;
        campo.innerHTML = 'Categoria do fornecedor<select id="contato-categoria-fornecedor" name="categoria_fornecedor"><option value="">Sem categoria</option></select>';
        form.elements.nome.closest('label').before(campo);
        form.elements.tipo.addEventListener('change', atualizarCampos);
        montarEditor(form, 'fornecedor');
    }
    el('tipo-relatorio')?.addEventListener('change', () => {
        el('campo-categoria-relatorio').hidden = el('tipo-relatorio').value !== 'pedidos';
    });
})();
