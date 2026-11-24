(() => {
    const el = id => document.getElementById(id);
    const trocar = el('suiri-trocar-usuario');
    trocar.insertAdjacentHTML('afterend', `<dialog id="suiri-quiosque" aria-labelledby="suiri-quiosque-titulo">
        <div class="suiri-dialog-cabecalho"><h2 id="suiri-quiosque-titulo">Trocar usuário</h2>
            <button type="button" id="fechar-quiosque" aria-label="Fechar">×</button></div>
        <div id="suiri-contas-aparelho"></div>
        <form id="suiri-quiosque-form" class="suiri-form oculto">
            <strong id="suiri-quiosque-nome"></strong>
            <label>Senha<input id="suiri-quiosque-senha" type="password" autocomplete="current-password" required></label>
            <button class="btn-principal" type="submit">Entrar</button>
        </form>
        <p id="suiri-quiosque-status" role="status"></p>
        <button type="button" id="suiri-outra-conta" class="btn-secundario">Entrar com outro e-mail</button>
    </dialog>`);
    const dialogo = el('suiri-quiosque');
    // Keep the password prompt open while the current session is closed.
    document.body.append(dialogo);
    const form = el('suiri-quiosque-form');
    const senha = el('suiri-quiosque-senha');
    const status = el('suiri-quiosque-status');
    let escolhida;
    let trocando = false;
    let canal, chave, atualizacao, intervalo;
    let conectado = false;

    function contas(empresa) {
        try {
            return JSON.parse(localStorage.getItem('suiri-quiosque:' + empresa) || '[]');
        } catch {
            return [];
        }
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

    trocar.onclick = () => {
        const lista = el('suiri-contas-aparelho');
        lista.replaceChildren();
        form.reset();
        form.classList.add('oculto');
        status.textContent = '';
        escolhida = null;
        for (const conta of contas(empresaAtualId)) {
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
            if (conta.id === usuarioAtual?.id) {
                const atual = document.createElement('small');
                atual.textContent = 'Conta atual';
                nome.append(atual);
                botao.disabled = true;
            }
            botao.onclick = () => {
                escolhida = conta;
                senha.value = '';
                status.textContent = '';
                el('suiri-quiosque-nome').textContent = conta.nome;
                form.classList.remove('oculto');
                senha.focus();
            };
            lista.append(botao);
        }
        dialogo.showModal();
    };

    el('fechar-quiosque').onclick = () => { if (!trocando) dialogo.close(); };
    dialogo.addEventListener('cancel', e => { if (trocando) e.preventDefault(); });
    el('suiri-outra-conta').onclick = () => { if (!trocando) window.fazerLogoff(); };
    dialogo.addEventListener('close', () => { senha.value = ''; escolhida = null; });
    form.onsubmit = async evento => {
        evento.preventDefault();
        if (!escolhida) return;
        const conta = escolhida;
        const digitada = senha.value;
        await suiriExecutar(evento.submitter, async () => {
            trocando = true;
            status.textContent = 'Verificando a senha…';
            try {
                const autenticador = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false}
                });
                const {data, error} = await autenticador.auth.signInWithPassword({email:conta.email, password:digitada});
                if (error || !data.session || data.user?.id !== conta.id) {
                    status.textContent = 'Não foi possível entrar. Confira a senha e a conexão.';
                    senha.focus();
                    return;
                }
                const tela = el('tela-app');
                tela.classList.add('oculto');
                const acesso = await cliente.auth.setSession({
                    access_token:data.session.access_token, refresh_token:data.session.refresh_token
                });
                if (acesso.error) {
                    if (usuarioAtual) tela.classList.remove('oculto');
                    status.textContent = 'Não foi possível trocar de usuário. Tente novamente.';
                    return;
                }
                window.pararInterfaceSuiri();
                usuarioAtual = acesso.data.user;
                perfilAtual = null;
                empresaAtualId = null;
                dialogo.close();
                await window.iniciarApp();
            } finally {
                senha.value = '';
                trocando = false;
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
            try {
                localStorage.setItem('suiri-quiosque:' + empresaAtualId, JSON.stringify([
                    ...contas(empresaAtualId).filter(item => item.id !== conta.id), conta
                ]));
            } catch { /* A sessão continua mesmo sem armazenamento local. */ }
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
