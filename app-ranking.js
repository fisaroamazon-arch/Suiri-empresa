(() => {
    const painel = document.getElementById('suiri-ranking');
    if (!painel) return;

    const posicao = document.getElementById('suiri-ranking-posicao');
    const resultados = document.getElementById('suiri-ranking-resultados');
    const atualizar = document.getElementById('suiri-ranking-atualizar');
    const formatarPontos = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
    let consulta = 0;

    function mostrarLista(titulo, participantes) {
        if (participantes.length === 0) return;
        const cabecalho = document.createElement('h4');
        cabecalho.textContent = titulo;
        const lista = document.createElement('ol');
        lista.className = 'suiri-ranking-lista';
        for (const dados of participantes) {
            const item = document.createElement('li');
            const nome = document.createElement('span');
            nome.textContent = `${dados.posicao ? dados.posicao + 'º · ' : ''}${dados.nome}${dados.voce ? ' (você)' : ''}`;
            const pontos = document.createElement('strong');
            pontos.textContent = `${formatarPontos.format(dados.pontos)} pts`;
            item.append(nome, pontos);
            lista.append(item);
        }
        resultados.append(cabecalho, lista);
    }

    async function carregarRanking() {
        const uid = usuarioAtual?.id;
        const empresa = empresaAtualId;
        if (!uid || !empresa) return;
        const chamada = ++consulta;
        atualizar.disabled = true;
        posicao.textContent = 'Consultando pontuação do mês…';
        resultados.replaceChildren();

        try {
            const { data, error } = await cliente.rpc('suiri_campeoes_mes');
            if (chamada !== consulta || usuarioAtual?.id !== uid || empresaAtualId !== empresa) return;
            if (error || !Array.isArray(data?.participantes)) throw error || new Error('Resposta incompleta');
            const participantes = data.participantes;
            const eu = participantes.find(pessoa => pessoa.voce);
            const comPontos = participantes.filter(pessoa => pessoa.posicao);
            const mes = new Date(`${data.mes}-01T12:00:00Z`).toLocaleDateString('pt-BR', {month:'long', year:'numeric', timeZone:'UTC'});
            posicao.textContent = eu?.posicao
                ? `${mes} · Sua posição: ${eu.posicao}º · ${formatarPontos.format(eu.pontos)} pontos.`
                : `${mes} · Você ainda não marcou pontos.`;
            mostrarLista('Pódio do mês', comPontos.slice(0, 3));
            const podio = new Set(comPontos.slice(0, 3));
            mostrarLista('Demais participantes', participantes.filter(pessoa => !podio.has(pessoa)));
        } catch {
            if (chamada === consulta && usuarioAtual?.id === uid && empresaAtualId === empresa) {
                posicao.textContent = 'Ranking indisponível. Verifique a conexão ou tente novamente mais tarde.';
            }
        } finally {
            if (chamada === consulta) {
                atualizar.hidden = false;
                atualizar.disabled = false;
            }
        }
    }

    painel.addEventListener('toggle', () => { if (painel.open) carregarRanking(); });
    atualizar.addEventListener('click', carregarRanking);
    let uidAtual;
    cliente?.auth?.onAuthStateChange?.((_evento, sessao) => {
        const uid = sessao?.user?.id;
        if (uid === uidAtual) return;
        uidAtual = uid;
        consulta++;
        painel.open = false;
        resultados.replaceChildren();
        posicao.textContent = '';
        atualizar.hidden = true;
    });
})();
