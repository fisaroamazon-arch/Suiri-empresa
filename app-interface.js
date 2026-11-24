(() => {
    const el = id => document.getElementById(id);
    const trocar = el('suiri-trocar-usuario');
    trocar.insertAdjacentHTML('afterend', `<dialog id="suiri-quiosque" aria-labelledby="suiri-quiosque-titulo">
        <div class="suiri-dialog-cabecalho"><h2 id="suiri-quiosque-titulo">Trocar usuário</h2>
            <button type="button" id="fechar-quiosque" aria-label="Fechar">×</button></div>
        <div id="suiri-contas-aparelho" aria-label="Equipe da empresa"></div>
        <form id="suiri-quiosque-form" class="suiri-form oculto">
            <strong id="suiri-quiosque-nome"></strong>
            <label id="suiri-quiosque-email-grupo" hidden>E-mail da conta
                <input id="suiri-quiosque-email" type="email" autocomplete="username" autocapitalize="none">
            </label>
            <label>Senha<input id="suiri-quiosque-senha" type="password" autocomplete="current-password" required></label>
            <button class="btn-principal" type="submit">Entrar</button>
        </form>
        <p id="suiri-quiosque-status" role="status"></p>
        <button type="button" id="suiri-outra-conta" class="btn-secundario">Entrar com outro e-mail</button>
    </dialog>`);
    const dialogo = el('suiri-quiosque');
    // Keep the credentials prompt outside the app while the session changes.
    document.body.append(dialogo);
    const lista = el('suiri-contas-aparelho');
    const form = el('suiri-quiosque-form');
    const email = el('suiri-quiosque-email');
    const grupoEmail = el('suiri-quiosque-email-grupo');
    const senha = el('suiri-quiosque-senha');
    const status = el('suiri-quiosque-status');
    let escolhida;
    let abertura = 0;
    let trocando = false;
    let canal, chave, atualizacao, intervalo;
    let conectado = false;

    function contas(empresa) {
        try {
            const salvas = JSON.parse(localStorage.getItem('suiri-quiosque:' + empresa) || '[]');
            return Array.isArray(salvas)
                ? salvas.filter(conta => typeof conta?.id === 'string' && typeof conta.email === 'string' && conta.email)
                : [];
        } catch {
            return [];
        }
    }

    function salvarContas(empresa, salvas) {
        try {
            localStorage.setItem('suiri-quiosque:' + empresa, JSON.stringify(salvas.map(({id, email}) => ({id, email}))));
        } catch { /* A sessão continua mesmo sem armazenamento local. */ }
    }

    function foto(elemento, conta) {
        elemento.replaceChildren();
        const url = window.urlAvatarSuiri ? window.urlAvatarSuiri(conta.foto) : conta.foto;
        if (url && /^https:\/\//i.test(url)) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = '';
            img.addEventListener('error', () => { elemento.textContent = conta.nome[0] || '?'; });
            elemento.append(img);
        } else elemento.textContent = conta.nome[0] || '?';
    }

    function renderizarEquipe(perfis, empresa) {
        const salvas = new Map(contas(empresa).map(conta => [conta.id, conta.email]));
        const equipe = [...new Map(perfis.map(perfil => [perfil.id, perfil])).values()]
            .filter(perfil => perfil.id)
            .map(perfil => ({
                id: perfil.id,
                nome: perfil.nome || 'Colaborador',
                foto: perfil.avatar_url,
                email: salvas.get(perfil.id)
            }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        return equipe.map(conta => {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = 'btn-secundario suiri-quiosque-conta';
            const avatar = document.createElement('span');
            avatar.className = 'suiri-quiosque-avatar';
            avatar.setAttribute('aria-hidden', 'true');
            foto(avatar, conta);
            const nome = document.createElement('span');
            nome.textContent = conta.nome;
            botao.append(avatar, nome);
            const atual = conta.id === usuarioAtual?.id;
            botao.disabled = atual;
            const detalhe = document.createElement('small');
            detalhe.textContent = atual ? 'Conta atual' : conta.email ? 'Entrar com senha' : 'Primeiro acesso neste aparelho';
            nome.append(detalhe);
            botao.onclick = () => {
                if (trocando) return;
                escolhida = conta;
                form.reset();
                grupoEmail.hidden = !!conta.email;
                email.disabled = !!conta.email;
                email.required = !conta.email;
                status.textContent = '';
                el('suiri-quiosque-nome').textContent = conta.nome;
                form.classList.remove('oculto');
                (conta.email ? senha : email).focus();
            };
            lista.append(botao);
            return {avatar, conta};
        });
    }

    trocar.onclick = async () => {
        const empresa = empresaAtualId;
        const usuario = usuarioAtual?.id;
        if (!empresa || !usuario || dialogo.open) return;
        const consulta = ++abertura;
        const aindaAberto = () => consulta === abertura && dialogo.open
            && empresaAtualId === empresa && usuarioAtual?.id === usuario;
        lista.replaceChildren();
        form.reset();
        form.classList.add('oculto');
        escolhida = null;
        status.textContent = navigator.onLine ? 'Carregando a equipe…' : 'Conecte-se à internet para trocar de usuário.';
        dialogo.showModal();
        if (!navigator.onLine) return;

        try {
            const {data, error} = await cliente.rpc('suiri_equipe_basica');
            if (!aindaAberto()) return;
            if (error || !Array.isArray(data)) throw new Error('Diretório indisponível');
            const ids = new Set(data.map(perfil => perfil.id));
            salvarContas(empresa, contas(empresa).filter(conta => ids.has(conta.id)));
            const avatares = renderizarEquipe(data, empresa);
            status.textContent = avatares.length ? '' : 'Nenhum funcionário encontrado nesta empresa.';
            await window.prepararAvataresSuiri?.(data);
            if (!aindaAberto()) return;
            for (const {avatar, conta} of avatares) foto(avatar, conta);
        } catch {
            if (aindaAberto() && !lista.children.length) {
                status.textContent = 'Não foi possível carregar a equipe. Feche e abra o quiosque para tentar novamente.';
            }
        }
    };

    el('fechar-quiosque').onclick = () => { if (!trocando) dialogo.close(); };
    dialogo.addEventListener('cancel', e => { if (trocando) e.preventDefault(); });
    el('suiri-outra-conta').onclick = () => { if (!trocando) window.fazerLogoff(); };
    dialogo.addEventListener('close', () => { abertura++; form.reset(); escolhida = null; });
    form.onsubmit = async evento => {
        evento.preventDefault();
        if (!escolhida || trocando) return;
        if (!navigator.onLine) {
            status.textContent = 'Conecte-se à internet para entrar com esta conta.';
            return;
        }
        const conta = escolhida;
        const empresa = empresaAtualId;
        const usuario = usuarioAtual?.id;
        const origemAtiva = () => dialogo.open && empresaAtualId === empresa && usuarioAtual?.id === usuario;
        const endereco = conta.email || email.value.trim();
        const digitada = senha.value;
        await suiriExecutar(evento.submitter, async () => {
            trocando = true;
            status.textContent = 'Verificando a senha…';
            try {
                const autenticador = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth:{storageKey:'suiri-quiosque-auth', persistSession:false, autoRefreshToken:false, detectSessionInUrl:false}
                });
                const {data, error} = await autenticador.auth.signInWithPassword({email:endereco, password:digitada});
                if (!origemAtiva()) return;
                if (error || !data?.session || data.user?.id !== conta.id) {
                    status.textContent = 'Não foi possível entrar na conta selecionada. Confira os dados e a conexão.';
                    return;
                }
                const {data: vinculo, error: erroVinculo} = await autenticador
                    .from('perfis').select('empresa_id').eq('id', conta.id).maybeSingle();
                if (!origemAtiva()) return;
                if (erroVinculo || vinculo?.empresa_id !== empresa) {
                    status.textContent = 'Não foi possível confirmar o vínculo desta conta com a empresa.';
                    return;
                }
                await window.inicializacaoSuiri;
                if (!origemAtiva()) return;
                const tela = el('tela-app');
                tela.classList.add('oculto');
                let acesso;
                try {
                    acesso = await cliente.auth.setSession({
                        access_token:data.session.access_token, refresh_token:data.session.refresh_token
                    });
                } catch {
                    acesso = null;
                }
                if (acesso?.error || !acesso?.data?.user) {
                    if (usuarioAtual) tela.classList.remove('oculto');
                    status.textContent = 'Não foi possível trocar de usuário. Tente novamente.';
                    return;
                }
                window.pararInterfaceSuiri();
                usuarioAtual = acesso.data.user;
                perfilAtual = null;
                empresaAtualId = null;
                await window.iniciarApp();
            } finally {
                senha.value = '';
                trocando = false;
                if (dialogo.open) senha.focus();
            }
        });
    };

    let consultaLive;
    function atualizar() {
        if (!chave || document.hidden || !navigator.onLine || consultaLive) return;
        const identidade = chave;
        const painel = suiriTelaAtual === 'painel';
        const consultas = [window.carregarTarefas?.(), window.carregarStatusPonto?.(),
            window.carregarAvisos?.(), window.atualizarNotificacoesSuiri?.()];
        const consulta = Promise.allSettled(consultas).then(() => {
            if (chave === identidade && painel && suiriTelaAtual === 'painel') return window.carregarPainelAoVivo?.();
        }).catch(console.error).finally(() => {
            if (consultaLive === consulta) consultaLive = null;
        });
        consultaLive = consulta;
    }

    window.pararInterfaceSuiri = () => {
        if (dialogo.open) dialogo.close();
        clearTimeout(atualizacao);
        clearInterval(intervalo);
        if (canal) cliente.removeChannel(canal);
        canal = null;
        chave = null;
        conectado = false;
        consultaLive = null;
        window.pararNotificacoesSuiri?.();
    };

    const iniciar = window.iniciarAppSeguro;
    window.iniciarAppSeguro = async () => {
        await iniciar();
        if (!usuarioAtual || !empresaAtualId || el('tela-app').classList.contains('oculto')) return;
        const conta = {id:usuarioAtual.id, email:usuarioAtual.email, nome:perfilAtual.nome || 'Usuário', foto:perfilAtual.avatar_url};
        foto(el('suiri-foto-usuario'), conta);
        if (conta.email) {
            salvarContas(empresaAtualId, [
                ...contas(empresaAtualId).filter(item => item.id !== conta.id), conta
            ]);
        }
        const empresa = empresaAtualId;
        const identidade = empresa + ':' + conta.id;
        if (chave === identidade) return;
        window.pararInterfaceSuiri();
        chave = identidade;
        window.iniciarNotificacoesSuiri?.();
        if (typeof cliente.channel === 'function') {
            canal = cliente.channel('suiri-atividade-' + identidade);
            for (const tabela of ['tarefas', 'livro_ponto', 'avisos']) {
                canal.on('postgres_changes', {event:'*', schema:'public', table:tabela, filter:'empresa_id=eq.' + empresa}, () => {
                    if (chave !== identidade) return;
                    clearTimeout(atualizacao);
                    atualizacao = setTimeout(atualizar, 350);
                });
            }
            canal.subscribe(situacao => { if (chave === identidade) conectado = situacao === 'SUBSCRIBED'; });
        }
        intervalo = setInterval(() => {
            if (!conectado || suiriTelaAtual === 'painel') atualizar();
        }, 15000);
    };
    document.addEventListener('visibilitychange', () => atualizar());
    window.addEventListener('online', () => atualizar());
})();
