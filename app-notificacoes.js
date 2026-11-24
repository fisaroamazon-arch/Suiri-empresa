(() => {
    'use strict';

    const categorias = {
        mural: 'Mural de avisos',
        mensagem: 'Mensagens diretas',
        vencimento: 'Contas a vencer e vencendo hoje',
        atraso: 'Contas atrasadas',
        pagamento: 'Contas pagas',
        tarefaInicio: 'Tarefas iniciadas',
        tarefaFim: 'Tarefas concluídas',
        pontoEntrada: 'Entrada de funcionários',
        pontoSaida: 'Saída de funcionários',
        consumo: 'Compras e consumos de funcionários',
        revisao: 'Solicitações e decisões de consumo',
        pedido: 'Pedidos de reposição',
        aprovacao: 'Tarefas autônomas e diárias para aprovação'
    };
    const urgentes = ['mural', 'atraso'];
    const tela = document.getElementById('tela-app');
    const topo = tela.querySelector('.suiri-marca-app');
    topo.querySelector('#suiri-trocar-usuario').insertAdjacentHTML('beforebegin', `
        <button type="button" class="config-marca suiri-alertas-sino" id="abrir-alertas" aria-label="Notificações">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/></svg>
            <span id="alertas-contador" class="oculto"></span>
        </button>`);
    tela.insertAdjacentHTML('beforeend', `
        <dialog id="notificacoes-suiri" aria-labelledby="notificacoes-titulo">
            <div class="suiri-dialog-cabecalho"><h2 id="notificacoes-titulo">Notificações</h2>
                <button type="button" id="fechar-alertas" aria-label="Fechar notificações">×</button>
            </div>
            <div class="suiri-alertas-acoes">
                <button type="button" class="btn-secundario" id="ler-alertas">Marcar todas como lidas</button>
                <button type="button" class="btn-secundario" id="ajustar-alertas">Ajustes</button>
            </div>
            <p id="alertas-status" role="status"></p>
            <ul id="alertas-lista"></ul>
        </dialog>`);
    const el = id => document.getElementById(id);
    const dialogo = el('notificacoes-suiri');
    const aprovacoes = el('atalho-aprovacoes').content.firstElementChild;
    dialogo.querySelector('.suiri-alertas-acoes').append(aprovacoes);
    aprovacoes.addEventListener('click', () => dialogo.close());
    el('conteudo-configuracoes').insertAdjacentHTML('beforeend', `
        <section class="cartao-geral suiri-alertas-ajustes">
            <h2>Notificações</h2>
            <p>Escolha os avisos que quer receber. As janelas aparecem enquanto o app está em uso.</p>
            <div class="suiri-alertas-acoes">
                <button type="button" class="btn-secundario" id="abrir-alertas-ajustes">Ver notificações</button>
                <button type="button" class="btn-secundario oculto" id="ativar-alertas-android">Permitir no Android</button>
            </div>
            <p id="alertas-permissao" role="status"></p>
            <div id="alertas-preferencias"></div>
        </section>`);

    let identidade = null;
    let estado;
    let eventos = [];
    let geracao = 0;
    let consulta = null;
    let timer;
    let foco;
    let erroConsulta = false;

    function lerEstado() {
        try {
            const salvo = JSON.parse(localStorage.getItem(identidade) || '{}');
            return { preferencias: salvo.preferencias || {}, vistos: new Set(salvo.vistos || []), lidos: new Set(salvo.lidos || []), inicializadas: new Set(salvo.inicializadas || []) };
        } catch {
            return { preferencias: {}, vistos: new Set(), lidos: new Set(), inicializadas: new Set() };
        }
    }

    function salvarEstado() {
        try {
            localStorage.setItem(identidade, JSON.stringify({
                preferencias: estado.preferencias,
                vistos: [...estado.vistos].slice(-1500),
                lidos: [...estado.lidos].slice(-1500),
                inicializadas: [...estado.inicializadas]
            }));
        } catch { /* Preferências continuam disponíveis nesta sessão. */ }
    }

    function preferencia(tipo) {
        return estado.preferencias[tipo] || { ativa: true, janela: urgentes.includes(tipo) };
    }

    function preferencias() {
        el('alertas-preferencias').innerHTML = Object.entries(categorias).map(([tipo, titulo]) => {
            const { ativa, janela } = preferencia(tipo);
            return `<fieldset data-alerta="${tipo}"><legend>${titulo}</legend>
                <label><input type="checkbox" data-opcao="ativa" ${ativa ? 'checked' : ''}> Receber</label>
                <label><input type="checkbox" data-opcao="janela" ${janela ? 'checked' : ''} ${ativa ? '' : 'disabled'}> Mostrar janela</label></fieldset>`;
        }).join('');
    }

    function renderizar() {
        const lista = el('alertas-lista');
        lista.replaceChildren();
        const habilitados = estado ? eventos.filter(item => preferencia(item.tipo).ativa) : [];
        const total = habilitados.filter(item => !estado.lidos.has(item.id)).length;
        el('alertas-contador').textContent = total > 99 ? '99+' : total;
        el('alertas-contador').classList.toggle('oculto', total === 0);
        el('abrir-alertas').setAttribute('aria-label', total ? `Notificações, ${total} não lidas` : 'Notificações');
        el('ler-alertas').disabled = !total;
        el('alertas-status').textContent = erroConsulta
            ? 'Alguns alertas podem estar desatualizados. A consulta será repetida.'
            : habilitados.length ? '' : 'Nenhuma notificação recente.';
        for (const item of habilitados) {
            const linha = document.createElement('li');
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = 'suiri-alerta-item';
            botao.classList.toggle('suiri-alerta-novo', !estado.lidos.has(item.id));
            const titulo = document.createElement('strong');
            titulo.textContent = item.titulo;
            const detalhe = document.createElement('span');
            detalhe.textContent = item.detalhe;
            botao.append(titulo, detalhe);
            botao.onclick = () => {
                estado.lidos.add(item.id);
                salvarEstado();
                dialogo.close();
                if (item.abrir) item.abrir();
                renderizar();
            };
            linha.append(botao);
            lista.append(linha);
        }
    }

    const diaBrasil = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const dataCurta = valor => String(valor).slice(0, 10).split('-').reverse().join('/');
    const hora = valor => new Date(valor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const permissao = (...chaves) => chaves.some(chave => window.podeSuiri(chave));
    const pessoa = id => window.obterNomeColaborador?.(id, 'Colaborador') || 'Colaborador';

    const ir = (guia, alvo) => () => {
        window.alternarTelas(guia);
        if (alvo === 'suiri-bloco-pagar') suiriMostrarBlocoGestao('pagar');
        if (alvo) requestAnimationFrame(() => {
            const secao = el(alvo);
            if (secao?.tagName === 'DETAILS') secao.open = true;
            secao?.scrollIntoView({block:'start'});
        });
    };

    function abrirDialogo() {
        if (dialogo.open) return;
        foco = document.activeElement;
        dialogo.showModal();
    }

    async function consultar() {
        const versao = geracao;
        const uid = usuarioAtual.id;
        const perfil = perfilAtual;
        const gestaoConsumo = perfil.is_admin || perfil.is_socio || perfil.is_gerente;
        const agora = Date.now();
        const desde = new Date(agora - 7 * 86400000).toISOString();
        const hoje = diaBrasil.format(agora);
        const ate = diaBrasil.format(agora + 3 * 86400000);
        const empresa = empresaAtualId;
        const tarefasVisiveis = tarefa => gestaoConsumo || permissao('tarefas', 'inspecao')
            || tarefa.destinado_a === uid || tarefa.criado_por === uid || tarefa.assumido_por === uid
            || tarefa.ajudantes?.includes(uid) || (!tarefa.destinado_a && (!tarefa.setor_destinado || ['todos', perfil.setor].includes(tarefa.setor_destinado)));
        const tabela = (nome, colunas) => cliente.from(nome).select(colunas).eq('empresa_id', empresa);
        const recentes = (query, campo, limite = desde) => window.todosRegistrosSuiri(
            query.gte(campo, limite).order(campo, {ascending:false}).order('id'));
        const registros = [];
        const fontes = [];
        const adicionar = (grupo, tipo, ref, data, titulo, detalhe, abrir) => {
            registros.push({ grupo, tipo, id: tipo + ':' + ref, data, titulo, detalhe, abrir });
        };
        const fonte = (grupo, query, aplicar) => {
            fontes.push(Promise.resolve(query).then(({ data, error }) => {
                if (error) throw error;
                aplicar(data);
                return grupo;
            }));
        };

        fonte('mural', recentes(tabela('avisos', 'id,titulo,mensagem,setor_destino,criado_por,destinado_a,criado_em,tarefa_autonoma_id,ponto_freelance_id'), 'criado_em'), avisos => {
            for (const aviso of avisos || []) {
                if (aviso.destinado_a && aviso.destinado_a !== uid) continue;
                const aprovar = aviso.tarefa_autonoma_id || aviso.ponto_freelance_id;
                if (aprovar && !gestaoConsumo) continue;
                if (!aviso.destinado_a && ![null, '', 'todos', perfil.setor].includes(aviso.setor_destino) && !gestaoConsumo && !permissao('avisos')) continue;
                adicionar('mural', aprovar ? 'aprovacao' : aviso.destinado_a ? 'mensagem' : 'mural',
                    aviso.id, aviso.criado_em, aviso.titulo || 'Novo aviso',
                    aviso.mensagem || (aviso.destinado_a ? 'Mensagem para você' : 'Mural de avisos'), ir('operacao', 'secao-quadro-avisos'));
            }
        });
        fonte('inicio', recentes(tabela('tarefas', 'id,titulo,hora_inicio,destinado_a,setor_destinado,criado_por,assumido_por,ajudantes'), 'hora_inicio'), tarefas => {
            for (const tarefa of (tarefas || []).filter(tarefasVisiveis)) {
                adicionar('inicio', 'tarefaInicio', tarefa.id + ':' + tarefa.hora_inicio, tarefa.hora_inicio,
                    'Tarefa iniciada', tarefa.titulo, ir('operacao', 'secao-tarefas'));
            }
        });
        fonte('fim', recentes(tabela('suiri_historico_tarefas', 'id,concluida_em,registro'), 'concluida_em'), tarefas => {
            for (const linha of tarefas || []) {
                if (!linha.registro || !tarefasVisiveis(linha.registro)) continue;
                adicionar('fim', 'tarefaFim', linha.id, linha.concluida_em,
                    'Tarefa concluída', linha.registro.titulo, ir('operacao', 'secao-tarefas'));
            }
        });
        fonte('ponto', recentes(tabela('livro_ponto', 'id,perfil_id,horario_entrada,horario_saida,data_registro'), 'data_registro', desde.slice(0, 10)), pontos => {
            for (const linha of pontos || []) {
                for (const [campo, tipo, titulo] of [['horario_entrada', 'pontoEntrada', 'Entrada registrada'], ['horario_saida', 'pontoSaida', 'Saída registrada']]) {
                    const instante = linha[campo];
                    if (instante) adicionar('ponto', tipo, linha.id + ':' + instante, instante,
                        titulo, `${pessoa(linha.perfil_id)} · ${hora(instante)}`, ir('operacao', 'status-ponto'));
                }
            }
        });
        fonte('compras', recentes(tabela('itens_comprados', 'id,perfil_id,descricao_item,data_compra'), 'data_compra', desde.slice(0, 10)), itens => {
            for (const item of itens || []) adicionar('compras', 'consumo', item.id, item.data_compra,
                'Consumo registrado', item.descricao_item, ir('operacao', 'secao-meu-consumo'));
        });
        fonte('pedidos', recentes(tabela('pedidos_compra', 'id,mensagem,status,criado_em,criado_por,data_comprado'), 'criado_em'), pedidos => {
            for (const pedido of pedidos || []) {
                if (pedido.criado_por !== uid && !permissao('compras', 'gestao')) continue;
                adicionar('pedidos', 'pedido', pedido.id + ':' + (pedido.status || 'pendente'), pedido.data_comprado || pedido.criado_em,
                    pedido.status === 'comprado' ? 'Reposição comprada' : 'Pedido de reposição', pedido.mensagem,
                    permissao('compras', 'gestao') ? ir('gestao') : ir('operacao'));
            }
        });
        for (const gestao of gestaoConsumo ? [false, true] : [false]) {
            const grupo = gestao ? 'revisaoGestao' : 'revisaoPessoal';
            fonte(grupo, cliente.rpc('suiri_listar_consumos', { p_gestao: gestao, p_limite: 30, p_pular: 0 }), dados => {
                for (const item of dados?.itens || []) {
                    if (!gestao && item.status === 'pendente') continue;
                    const titulo = gestao ? 'Consumo para aprovação'
                        : item.status === 'aprovado' ? 'Consumo aprovado' : 'Consumo recusado';
                    adicionar(grupo, 'revisao', grupo + ':' + item.id + ':' + item.status, item.criado_em,
                        titulo, item.nome_item, gestao ? () => el('btn-consumo-pendencias').click() : ir('operacao', 'secao-meu-consumo'));
                }
            });
        }
        if (permissao('contas', 'gestao')) {
            const contas = () => tabela('contas_pagar', 'id,fornecedor_descricao,data_vencimento,data_pagamento,status');
            const pendentes = () => contas().eq('status', 'pendente');
            fonte('vencimentos', pendentes().gte('data_vencimento', hoje).lte('data_vencimento', ate).order('data_vencimento').limit(100), linhas => {
                for (const linha of linhas || []) {
                    const data = linha.data_vencimento;
                    const venceHoje = data === hoje;
                    adicionar('vencimentos', 'vencimento', linha.id + ':' + data + (venceHoje ? ':hoje' : ''),
                        hoje, venceHoje ? 'Conta vence hoje' : 'Conta a vencer',
                        `${linha.fornecedor_descricao} · ${dataCurta(data)}`, ir('gestao', 'suiri-bloco-pagar'));
                }
            });
            const ontem = diaBrasil.format(agora - 86400000);
            fonte('atrasos', pendentes().lte('data_vencimento', ontem).order('data_vencimento', { ascending: false }).limit(100), linhas => {
                for (const linha of linhas || []) adicionar('atrasos', 'atraso', linha.id + ':' + linha.data_vencimento,
                    hoje, 'Conta atrasada', `${linha.fornecedor_descricao} · ${dataCurta(linha.data_vencimento)}`, ir('gestao', 'suiri-bloco-pagar'));
            });
            fonte('pagamentos', recentes(contas().eq('status', 'pago'), 'data_pagamento', desde.slice(0, 10)), linhas => {
                for (const linha of linhas || []) adicionar('pagamentos', 'pagamento', linha.id + ':' + linha.data_pagamento,
                    linha.data_pagamento, 'Conta paga', linha.fornecedor_descricao, ir('gestao', 'suiri-bloco-pagar'));
            });
        }

        const resultados = await Promise.allSettled(fontes);
        if (versao !== geracao || document.hidden) return;
        const atualizados = new Set(resultados.filter(r => r.status === 'fulfilled').map(r => r.value));
        erroConsulta = resultados.some(r => r.status === 'rejected');
        const novas = registros.filter(item => preferencia(item.tipo).ativa && !estado.vistos.has(item.id)
            && (estado.inicializadas.has(item.grupo) || ['atraso', 'vencimento'].includes(item.tipo)));
        for (const item of registros) estado.vistos.add(item.id);
        for (const grupo of atualizados) estado.inicializadas.add(grupo);
        eventos = registros.sort((a, b) => String(b.data).localeCompare(String(a.data)));
        salvarEstado();
        renderizar();
        if (!novas.length) return;
        if (window.suiriAndroid?.notificarDetalhes) {
            const mensagens = novas.map(({id, titulo, detalhe}) => ({id, titulo, detalhe:detalhe || titulo}));
            window.suiriAndroid.notificarDetalhes(mensagens).catch(erro => console.warn('Notificações do Android:', erro.message));
        }
        const emEdicao = document.activeElement?.matches('input, textarea, select, [contenteditable]');
        if (!emEdicao && !document.querySelector('dialog[open], .modal-overlay:not(.oculto)')
            && novas.some(item => preferencia(item.tipo).janela)) abrirDialogo();
    }

    function sincronizar() {
        if (!identidade || !usuarioAtual || !perfilAtual || !navigator.onLine || document.hidden) return;
        if (consulta) return consulta;
        const versao = geracao;
        consulta = consultar().catch(() => {
            if (versao !== geracao) return;
            erroConsulta = true;
            renderizar();
        }).finally(() => {
            if (versao === geracao) consulta = null;
        });
        return consulta;
    }

    window.pararNotificacoesSuiri = () => {
        geracao++;
        clearInterval(timer);
        identidade = null;
        consulta = null;
        estado = null;
        eventos = [];
        erroConsulta = false;
        if (dialogo.open) dialogo.close();
        el('alertas-preferencias').replaceChildren();
        el('alertas-permissao').textContent = '';
        window.suiriAndroid?.limparNotificacoes?.().catch(() => {});
        renderizar();
    };

    window.iniciarNotificacoesSuiri = () => {
        if (!usuarioAtual || !perfilAtual || !empresaAtualId) return;
        const chave = `suiri-alertas:${empresaAtualId}:${usuarioAtual.id}`;
        if (identidade === chave) return sincronizar();
        window.pararNotificacoesSuiri();
        identidade = chave;
        estado = lerEstado();
        preferencias();
        el('ativar-alertas-android').classList.toggle('oculto', !window.suiriAndroid?.permitirNotificacoes);
        timer = setInterval(sincronizar, 60000);
        return sincronizar();
    };

    el('alertas-preferencias').onchange = ({ target }) => {
        const grupo = target.closest('[data-alerta]');
        if (!grupo || !target.dataset.opcao || !estado) return;
        const tipo = grupo.dataset.alerta;
        estado.preferencias[tipo] = { ...preferencia(tipo), [target.dataset.opcao]: target.checked };
        grupo.querySelector('[data-opcao="janela"]').disabled = !preferencia(tipo).ativa;
        if (!preferencia(tipo).ativa) window.suiriAndroid?.limparNotificacoes?.().catch(() => {});
        salvarEstado();
        renderizar();
    };
    el('ativar-alertas-android').onclick = async () => {
        const versao = geracao;
        const permitido = await window.suiriAndroid.permitirNotificacoes().catch(() => false);
        if (versao === geracao) el('alertas-permissao').textContent = permitido
            ? 'Avisos do Android autorizados.' : 'Autorize os avisos nas configurações do Android.';
    };
    el('abrir-alertas').onclick = el('abrir-alertas-ajustes').onclick = () => {
        abrirDialogo();
        sincronizar();
    };
    el('fechar-alertas').onclick = () => dialogo.close();
    el('ajustar-alertas').onclick = () => {
        dialogo.close();
        window.alternarTelas('configuracoes');
        document.querySelector('.suiri-alertas-ajustes').scrollIntoView({ block: 'start' });
    };
    el('ler-alertas').onclick = () => {
        for (const item of eventos) if (preferencia(item.tipo).ativa) estado.lidos.add(item.id);
        salvarEstado();
        window.suiriAndroid?.limparNotificacoes?.().catch(() => {});
        renderizar();
    };
    dialogo.addEventListener('close', () => {
        if (identidade) foco?.focus();
    });
    window.atualizarNotificacoesSuiri = sincronizar;
    document.addEventListener('visibilitychange', sincronizar);
    window.addEventListener('online', sincronizar);
})();
