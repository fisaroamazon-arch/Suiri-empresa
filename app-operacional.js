// ==========================================
// SUPAY / SUIRI - APP-OPERACIONAL.JS (Suiri 2.0)
// ==========================================

// Função utilitária de resolução de nomes resiliente ao banco de dados
window.obterNomeColaborador = function(id, fallback = 'Equipe') {
    if (!id) return fallback;
    if (typeof mapaNomes !== 'undefined' && mapaNomes[id] && String(mapaNomes[id]).trim() !== '') {
        return mapaNomes[id];
    }
    if (typeof mapaPerfis !== 'undefined' && mapaPerfis[id] && mapaPerfis[id].nome && String(mapaPerfis[id].nome).trim() !== '') {
        return mapaPerfis[id].nome;
    }
    if (typeof usuarioAtual !== 'undefined' && usuarioAtual && usuarioAtual.id === id) {
        if (typeof perfilAtual !== 'undefined' && perfilAtual && perfilAtual.nome && String(perfilAtual.nome).trim() !== '') {
            return perfilAtual.nome;
        }
    }
    return fallback;
};

// Obter avatar do colaborador de forma resiliente
window.obterAvatarColaborador = function(id) {
    if (!id) return null;
    if (typeof mapaPerfis !== 'undefined' && mapaPerfis[id] && mapaPerfis[id].avatar_url) {
        return window.urlAvatarSuiri ? window.urlAvatarSuiri(mapaPerfis[id].avatar_url) : mapaPerfis[id].avatar_url;
    }
    if (typeof usuarioAtual !== 'undefined' && usuarioAtual && usuarioAtual.id === id) {
        return window.urlAvatarSuiri ? window.urlAvatarSuiri(perfilAtual?.avatar_url) : perfilAtual?.avatar_url || null;
    }
    return null;
};

// Formatação inteligente de duração: se >= 60 min, exibe em horas (ex: 1h 15min ou 2h)
window.formatarTempoDuracao = function(minutosTotais) {
    if (!minutosTotais || minutosTotais <= 0) return '';
    if (minutosTotais < 60) return `${minutosTotais} min`;
    const horas = Math.floor(minutosTotais / 60);
    const minRestantes = minutosTotais % 60;
    return minRestantes > 0 ? `${horas}h ${minRestantes}min` : `${horas}h`;
};

// ------------------ LIVRO DE PONTO COM RESILIÊNCIA OFFLINE ------------------
function configuracaoPontoEmpresa() {
    if (!empresaAtualId || String(dadosEmpresaAtual?.id) !== String(empresaAtualId)) {
        throw new Error('Não foi possível verificar as regras de ponto da empresa. Conecte-se e atualize os dados.');
    }
    return dadosEmpresaAtual;
}

window.atualizarIndicacaoLocalizacaoPonto = function() {
    const indicacao = document.getElementById('ponto-localizacao-indicacao');
    if (!indicacao) return;
    const ativa = !!empresaAtualId && String(dadosEmpresaAtual?.id) === String(empresaAtualId)
        && dadosEmpresaAtual.ponto_raio_m > 0;
    indicacao.classList.toggle('oculto', !ativa);
    if (ativa) indicacao.textContent = 'Este ponto requer localização precisa dentro da área da empresa.';
};

async function obterLocalizacaoPonto() {
    const {ponto_latitude: latitude, ponto_longitude: longitude, ponto_raio_m: raio} = configuracaoPontoEmpresa();
    if (raio == null) return {};
    const posicao = await window.suiriObterLocalizacao();
    const radianos = graus => graus * Math.PI / 180;
    const dLat = radianos(posicao.latitude - latitude);
    const dLon = radianos(posicao.longitude - longitude);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radianos(latitude))
        * Math.cos(radianos(posicao.latitude)) * Math.sin(dLon / 2) ** 2;
    const distancia = 12742000 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
    if (distancia > raio) throw new Error('Você está fora da área definida pela empresa.');
    if (distancia + posicao.precisao > raio) {
        throw new Error('A localização está imprecisa para esta área. Aproxime-se do centro da empresa, ative a localização precisa e tente novamente.');
    }
    return {ponto_geolocalizacao: posicao};
}

window.carregarStatusPonto = async function() {
    const uid = usuarioAtual?.id;
    const empresa = empresaAtualId;
    if (!uid || !empresa) return;
    const hoje = window.dataLocal();
    const { data: dadosServidor, error: erroPonto } = await cliente.from('livro_ponto').select('*').eq('perfil_id', uid).eq('data_registro', hoje).order('criado_em', { ascending: false }).limit(1);
    if (usuarioAtual?.id !== uid || empresaAtualId !== empresa) return;
    let data = dadosServidor;
    const filaPonto=window.obterFilaOffline();
    const entradaPendente=filaPonto.filter(i=>i.tipo==='ponto' && i.payload.data_registro===hoje).at(-1)?.payload;
    if(entradaPendente){
        data=[entradaPendente];
    } else if (erroPonto && registroPontoAtual?.data_registro === hoje && registroPontoAtual.perfil_id === uid
        && String(registroPontoAtual.empresa_id) === String(empresa)) data = [registroPontoAtual];
    else if(erroPonto) { window.mostrarToast('Não foi possível consultar seu ponto. Confira a conexão.', 'erro'); return; }

    const btnPontoEntrada = document.getElementById('btn-ponto-entrada');
    const btnPontoSaida = document.getElementById('btn-ponto-saida');
    const statusPonto = document.getElementById('status-ponto');
    if(!btnPontoEntrada || !btnPontoSaida || !statusPonto) return;

    btnPontoEntrada.classList.add('oculto');
    btnPontoSaida.classList.add('oculto');

    const diaSemanaHoje = String(new Date().getDay());
    const ehFixo = (perfilAtual?.tipo_contrato || 'fixo') === 'fixo';
    const folgasSemanais = Array.isArray(perfilAtual?.dias_folga_semana) ? perfilAtual.dias_folga_semana : [];
    const ehDiaDeFolgaSemanal = ehFixo && folgasSemanais.includes(diaSemanaHoje);

    if (data && data.length > 0) {
        registroPontoAtual = data[0];
        const saidaPendente = filaPonto.find(({tipo, payload}) => tipo === 'ponto_update' && (
            (payload.id && payload.id === registroPontoAtual.id) ||
            (payload.entrada_operacao && payload.entrada_operacao === registroPontoAtual.suiri_operacao_id)
        ));
        if (saidaPendente) {
            statusPonto.textContent = 'Saída salva no aparelho. Aguardando sincronização.';
        } else if (registroPontoAtual.status_turno === 'folga') {
            statusPonto.innerHTML = `<span style="color:var(--cor-sucesso); font-weight:700;">Dia de Descanso (Folga Semanal / Agendada)</span>`;
        } else if (registroPontoAtual.status_turno === 'falta') {
            statusPonto.innerHTML = `<span style="color:var(--cor-erro); font-weight:700;">Ausência Registrada (Falta)</span>`;
        } else if (registroPontoAtual.status_turno === 'atestado') {
            statusPonto.innerHTML = `<span style="color:var(--cor-alerta); font-weight:700;">Licença Médica (Atestado)</span>`;
        } else if (registroPontoAtual.status_turno === 'aguardando_aprovacao_diaria') {
            statusPonto.innerHTML = `<span style="color:var(--cor-alerta); font-weight:700;">Expediente Concluído (Diária aguardando aprovação da gerência)</span>`;
        } else if (registroPontoAtual.status_turno === 'diaria_aprovada') {
            statusPonto.innerHTML = `<span style="color:var(--cor-sucesso); font-weight:700;">Expediente Concluído (Diária Aprovada ✓)</span>`;
        } else {
            if (!registroPontoAtual.horario_saida) {
                const horaEntrada = new Date(registroPontoAtual.horario_entrada).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                statusPonto.innerHTML = `Em operação desde as <strong style="color:var(--cor-primaria);">${horaEntrada}</strong>`;
                btnPontoSaida.classList.remove('oculto');
            } else {
                statusPonto.innerHTML = `Expediente Concluído.`;
            }
        }
    } else if (ehDiaDeFolgaSemanal) {
        await cliente.from('livro_ponto').insert([{
            perfil_id: usuarioAtual.id,
            empresa_id: empresaAtualId,
            data_registro: hoje,
            status_turno: 'folga'
        }]);
        statusPonto.innerHTML = `<span style="color:var(--cor-sucesso); font-weight:700;">Dia de Descanso (Folga Semanal Fixa)</span>`;
        registroPontoAtual = { status_turno: 'folga' };
    } else {
        registroPontoAtual = null;
        statusPonto.textContent = "Verificando seu turno...";
        btnPontoEntrada.classList.remove('oculto');
    }
};

async function registrarPonto(evento, saida) {
    const uid = usuarioAtual?.id;
    const empresa = empresaAtualId;
    const registro = registroPontoAtual;
    if (!uid || !empresa || (saida && (registro?.perfil_id !== uid
        || String(registro.empresa_id) !== String(empresa)))) return;

    await suiriExecutar(evento.currentTarget, async () => {
        if (navigator.onLine) await window.carregarDadosEmpresa();
        if (usuarioAtual?.id !== uid || empresaAtualId !== empresa) return;
        const localizacao = await obterLocalizacaoPonto();
        if (usuarioAtual?.id !== uid || empresaAtualId !== empresa) return;

        const agora = new Date().toISOString();
        if (!saida) {
            const payload = {
                perfil_id: uid,
                empresa_id: empresa,
                data_registro: window.dataLocal(),
                status_turno: 'presente',
                horario_entrada: agora,
                ...localizacao
            };
            const res = await window.executarOuOffline('ponto', payload, () => cliente.from('livro_ponto').insert([payload]));
            if (usuarioAtual?.id !== uid || empresaAtualId !== empresa) return;
            if (res?.error) throw new Error('Não foi possível registrar a entrada: ' + res.error.message);
            window.somIniciarTarefa();
            window.mostrarToast(res.offline ? 'Entrada salva no aparelho. Aguardando sincronização.' : 'Entrada registrada.');
        } else {
            const ehFreelance = perfilAtual?.tipo_contrato === 'freelance';
            const payload = {
                id: registro.id,
                entrada_operacao: registro.suiri_operacao_id || null,
                horario_saida: agora,
                status_turno: ehFreelance ? 'aguardando_aprovacao_diaria' : 'presente',
                ...localizacao
            };
            const res = await window.executarOuOffline('ponto_update', payload, () => window.enviarSaidaPonto(payload));
            if (usuarioAtual?.id !== uid || empresaAtualId !== empresa) return;
            if (res?.error) throw new Error('Não foi possível registrar a saída: ' + res.error.message);
            window.somConcluirTarefa();
            window.mostrarToast(res.offline ? 'Saída salva no aparelho. Aguardando sincronização.'
                : ehFreelance ? 'Turno encerrado. Diária submetida à aprovação.' : 'Saída registrada.');
        }
        await window.carregarStatusPonto();
        if (saida && typeof window.carregarAvisos === 'function') window.carregarAvisos();
        if (typeof window.carregarPainelAoVivo === 'function') window.carregarPainelAoVivo();
    });
}

document.getElementById('btn-ponto-entrada')?.addEventListener('click', evento => registrarPonto(evento, false));
document.getElementById('btn-ponto-saida')?.addEventListener('click', evento => registrarPonto(evento, true));

// ------------------ GESTÃO DE PRESENÇA NA INSPEÇÃO ------------------
window.lancarGestaoPresencaInspecao = async function() {
    const colabId = document.getElementById('select-inspecionar-colab')?.value;
    const statusPresenca = document.getElementById('select-status-presenca-inspecao')?.value;
    
    let diasTotal = 1;
    if (statusPresenca === 'atestado') {
        diasTotal = parseInt(document.getElementById('input-dias-atestado-inspecao')?.value) || 1;
    } else if (statusPresenca === 'folga') {
        diasTotal = parseInt(document.getElementById('input-dias-folga-inspecao')?.value) || 1;
    }
    diasTotal = Math.max(1, diasTotal);

    if (!colabId) return window.mostrarToast("Selecione um funcionário no painel de inspeção.", "erro");

    const hoje = new Date();

    for (let i = 0; i < diasTotal; i++) {
        const d = new Date(hoje);
        d.setDate(hoje.getDate() + i);
        const dataStr = window.dataLocal(d);

        await cliente.from('livro_ponto').delete().eq('perfil_id', colabId).eq('data_registro', dataStr);

        await cliente.from('livro_ponto').insert([{
            perfil_id: colabId,
            empresa_id: empresaAtualId,
            data_registro: dataStr,
            status_turno: statusPresenca
        }]);
    }

    const rotuloAcao = statusPresenca === 'folga' && diasTotal > 1 ? `${diasTotal} DIAS DE FOLGA` : statusPresenca.toUpperCase();
    window.mostrarToast(`Registro de ${rotuloAcao} lançado com sucesso!`);
    window.inspecionarColaborador(colabId);
    if (typeof window.carregarPainelAoVivo === 'function') window.carregarPainelAoVivo();
};

window.retornoAntecipadoAtestadoInspecao = async function() {
    const colabId = document.getElementById('select-inspecionar-colab')?.value;
    if (!colabId) return window.mostrarToast("Selecione um funcionário.", "erro");

    if (!confirm("Confirmar retorno antecipado? Os registros futuros de folga e atestado deste colaborador serão removidos.")) return;

    const hojeStr = window.dataLocal();
    const { error } = await cliente.from('livro_ponto').delete()
        .eq('perfil_id', colabId)
        .in('status_turno', ['atestado', 'folga'])
        .gte('data_registro', hojeStr);

    if (error) {
        window.mostrarToast("Erro ao processar retorno: " + error.message, "erro");
    } else {
        window.mostrarToast("Retorno antecipado registrado com sucesso!");
        window.inspecionarColaborador(colabId);
        if (typeof window.carregarPainelAoVivo === 'function') window.carregarPainelAoVivo();
    }
};

// ------------------ HOMOLOGAÇÃO DE DIÁRIA FREELANCER ------------------
window.aprovarDiariaFreelancer = async function(pontoId, avisoId) {
    const { error: erroPonto } = await cliente.from('livro_ponto').update({
        status_turno: 'diaria_aprovada'
    }).eq('id', pontoId);

    if (erroPonto) {
        return window.mostrarToast("Erro ao aprovar diária: " + erroPonto.message, "erro");
    }

    if (avisoId) {
        await cliente.from('avisos').delete().eq('id', avisoId);
    }

    if (window.somConcluirTarefa) window.somConcluirTarefa();
    window.mostrarToast("Diária do freelancer aprovada com sucesso!");
    window.carregarAvisos();
    if (typeof window.renderizarPainelPerfilCompleto === 'function') window.renderizarPainelPerfilCompleto();
};

window.reprovarDiariaFreelancer = async function(pontoId, avisoId) {
    if (!confirm("Rejeitar o pagamento desta diária?")) return;

    if (pontoId) {
        await cliente.from('livro_ponto').update({ status_turno: 'falta' }).eq('id', pontoId);
    }
    if (avisoId) {
        await cliente.from('avisos').delete().eq('id', avisoId);
    }

    window.mostrarToast("Diária reprovada.");
    window.carregarAvisos();
    if (typeof window.renderizarPainelPerfilCompleto === 'function') window.renderizarPainelPerfilCompleto();
};

// ------------------ TAREFAS, RECORRÊNCIA, TEMPOS E SUBITENS ------------------
let mapaTempoMedioTarefas = new Map();

window.calcularTempoMedioHistorico = function(todasTarefas) {
    const historico = new Map();
    const execucoes = new Set();
    const inicioRegistrado = tarefa => Date.parse(Object.hasOwn(tarefa, 'suiri_pontos_inicio') ? tarefa.suiri_pontos_inicio : tarefa.hora_inicio);
    const recentes = [...(todasTarefas || [])].sort((a, b) => (inicioRegistrado(b) || 0) - (inicioRegistrado(a) || 0));
    for (const tarefa of recentes) {
        if (tarefa.id == null || tarefa.status !== 'concluida') continue;
        const fim = Date.parse(Object.hasOwn(tarefa, 'suiri_pontos_fim') ? tarefa.suiri_pontos_fim : tarefa.hora_fim);
        const inicio = inicioRegistrado(tarefa);
        const minutos = (fim - inicio) / 60000;
        if (!Number.isFinite(minutos) || minutos < 1 || minutos > 600) continue;
        const quantidadeAjudantes = contarAjudantesTarefa(tarefa);
        const chave = JSON.stringify([tarefa.id, quantidadeAjudantes]);
        const execucao = JSON.stringify([tarefa.id, inicio]);
        if (execucoes.has(execucao)) continue;
        execucoes.add(execucao);
        const tempos = historico.get(chave) || [];
        if (tempos.length < 10) tempos.push(minutos);
        historico.set(chave, tempos);
    }
    mapaTempoMedioTarefas = historico;
};

function contarAjudantesTarefa(tarefa) {
    const ajudantes = Array.isArray(tarefa.ajudantes) ? tarefa.ajudantes : [];
    return new Set(ajudantes.filter(id => id && id !== tarefa.assumido_por)).size;
}

window.obterTempoEstimadoAjustado = function(tarefa) {
    const quantidadeAjudantes = contarAjudantesTarefa(tarefa);
    const chave = JSON.stringify([tarefa.id, quantidadeAjudantes]);
    const amostras = mapaTempoMedioTarefas.get(chave) || [];
    const temHistorico = amostras.length >= 3;
    const minutos = temHistorico
        ? Math.round(amostras.reduce((total, tempo) => total + tempo, 0) / amostras.length)
        : 15;
    return {minutos, temHistorico, totalExecucoes:amostras.length, pontosPrevistos:temHistorico ? minutos / 10 : null};
};

window.adicionarCampoSubitem = function() {
    const container = document.getElementById('container-campos-subitens');
    if (!container) return;
    const div = document.createElement('div');
    div.style.cssText = 'display:flex; gap:6px; align-items:center;';
    div.innerHTML = `
        <input type="text" class="input-subitem-dinamico" placeholder="Subitem a realizar..." style="flex:1; padding:6px; font-size:12px;">
        <button type="button" class="btn-erro" onclick="this.parentElement.remove()" style="padding:4px 8px; font-size:11px; margin:0; width:auto;">✕</button>
    `;
    container.appendChild(div);
};

window.adicionarCampoSubitemAutonomo = function() {
    const container = document.getElementById('container-campos-subitens-autonoma');
    if (!container) return;
    const div = document.createElement('div');
    div.style.cssText = 'display:flex; gap:6px; align-items:center;';
    div.innerHTML = `
        <input type="text" class="input-subitem-autonoma-dinamico" placeholder="Subitem da tarefa..." style="flex:1; padding:6px; font-size:12px;">
        <button type="button" class="btn-erro" onclick="this.parentElement.remove()" style="padding:4px 8px; font-size:11px; margin:0; width:auto;">✕</button>
    `;
    container.appendChild(div);
};

window.salvarTarefaAutonoma = async function() {
    if (!window.verificarPontoParaOperar()) return;

    const inTitulo = document.getElementById('input-autonoma-titulo');
    const inObs = document.getElementById('input-autonoma-obs');
    const titulo = inTitulo?.value.trim();
    const obs = inObs?.value.trim() || null;

    if (!titulo) return window.mostrarToast("Informe o título da tarefa.", "erro");

    const subitens = [];
    document.querySelectorAll('.input-subitem-autonoma-dinamico').forEach((inp, idx) => {
        const val = inp.value.trim();
        if (val) {
            subitens.push({
                id: 'sub_auto_' + Date.now() + '_' + idx,
                texto: val,
                concluido: false,
                feito_por: null
            });
        }
    });

    const hoje = window.dataLocal();
    const agora = new Date().toISOString();

    const payload = {
        titulo: titulo,
        instrucao: obs,
        prioridade: '3',
        categoria: 'bonus',
        criado_por: usuarioAtual.id,
        assumido_por: usuarioAtual.id,
        hora_inicio: agora,
        destinado_a: null,
        setor_destinado: perfilAtual?.setor || 'frente',
        ajudantes: [],
        subitens: subitens,
        status: 'em_andamento',
        recorrente: false,
        horario_reinicio: '01:00',
        ultimo_reinicio: hoje,
        ordem: 0,
        autonoma: true,
        empresa_id: empresaAtualId
    };

    const res = await window.executarOuOffline('tarefa_insert', payload, () => cliente.from('tarefas').insert([payload]));

    if (res && res.error) {
        window.mostrarToast("Erro ao iniciar tarefa autônoma: " + res.error.message, "erro");
    } else {
        if (window.somIniciarTarefa) window.somIniciarTarefa();
        window.mostrarToast(res.offline ? "Tarefa autônoma guardada offline!" : "Tarefa autônoma iniciada! Status: Progredindo.");
        window.fecharModalTarefaAutonoma();
        window.carregarTarefas();
    }
};

// PUBLICAÇÃO DE TAREFA COM HORÁRIO LIMITE OPCIONAL
window.criarTarefa = async function() {
    const input = document.getElementById('input-tarefa');
    const instrucaoInput = document.getElementById('input-instrucao');
    if(!input || !input.value.trim()) return window.mostrarToast("Digite o título da tarefa.", "erro");
    
    const setorTarefa = document.getElementById('select-setor-tarefa')?.value || 'frente';
    const destinadoA = document.getElementById('select-funcionario')?.value || null;
    const prioridadeVal = String(document.getElementById('select-prioridade')?.value || '3');
    const categoriaVal = document.getElementById('select-categoria')?.value || 'abertura';
    const horarioLimiteAlerta = document.getElementById('input-horario-limite-alerta')?.value || null;

    const checkRecorrente = document.getElementById('check-tarefa-recorrente');
    const isRecorrente = checkRecorrente ? checkRecorrente.checked : true;
    const horaReinicio = document.getElementById('input-hora-reinicio')?.value || '01:00';
    const hoje = window.dataLocal();

    const subitens = [];
    document.querySelectorAll('.input-subitem-dinamico').forEach((inp, idx) => {
        const val = inp.value.trim();
        if (val) {
            subitens.push({
                id: 'sub_' + Date.now() + '_' + idx,
                texto: val,
                concluido: false,
                feito_por: null
            });
        }
    });

    const payload = {
        titulo: input.value.trim(),
        instrucao: instrucaoInput?.value?.trim() || null,
        prioridade: prioridadeVal,
        categoria: categoriaVal,
        criado_por: usuarioAtual.id,
        destinado_a: destinadoA,
        setor_destinado: setorTarefa,
        horario_limite_alerta: horarioLimiteAlerta,
        ajudantes: [],
        subitens: subitens,
        status: 'pendente',
        recorrente: isRecorrente,
        horario_reinicio: horaReinicio,
        ultimo_reinicio: hoje,
        ordem: 0,
        autonoma: false,
        empresa_id: empresaAtualId
    };

    const res = await window.executarOuOffline('tarefa_insert', payload, () => cliente.from('tarefas').insert([payload]));

    if (res && res.error) { 
        window.mostrarToast("Erro ao criar: " + res.error.message, "erro");
    } else {
        input.value = ''; 
        if (instrucaoInput) instrucaoInput.value = '';
        const contSub = document.getElementById('container-campos-subitens');
        if (contSub) contSub.innerHTML = '';
        const inHoraLim = document.getElementById('input-horario-limite-alerta');
        if (inHoraLim) inHoraLim.value = '';
        
        const selSetor = document.getElementById('select-setor-tarefa');
        if (selSetor) selSetor.value = 'frente';

        document.getElementById('form-nova-tarefa')?.classList.add('oculto');
        if (typeof window.toggleFormDelegar === 'function') {
            const btn = document.getElementById('btn-toggle-form-tarefa');
            if (btn) { btn.textContent = '+ Delegar'; btn.classList.remove('btn-toggle-aberto'); }
        }
        if (window.somIniciarTarefa) window.somIniciarTarefa();
        window.mostrarToast(res.offline ? "Ordem guardada offline!" : "Nova tarefa emitida com sucesso!");
        window.carregarTarefas();
    }
};

window.editarTarefaNome = async function(id, tituloAtual) {
    const novoTitulo = prompt("Editar título da tarefa:", tituloAtual);
    if (!novoTitulo || novoTitulo.trim() === "") return;
    const { error } = await cliente.from('tarefas').update({ titulo: novoTitulo.trim() }).eq('id', id);
    if(error) window.mostrarToast("Erro: " + error.message, "erro");
    else { window.mostrarToast("Tarefa atualizada!"); window.carregarTarefas(); }
};

window.editarTarefaInstrucao = async function(id) {
    const tarefa = cacheTarefas.find(t => t.id === id);
    const instAtual = tarefa ? tarefa.instrucao : '';
    const novaInst = prompt("Editar instrução técnica / observação:", instAtual || '');
    if (novaInst === null) return;
    const { error } = await cliente.from('tarefas').update({ instrucao: novaInst.trim() }).eq('id', id);
    if(error) window.mostrarToast("Erro: " + error.message, "erro");
    else { window.mostrarToast("Instrução atualizada!"); window.carregarTarefas(); }
};

async function atualizarStatusTarefa(id, payloadUpdate, msgToast, tipoSom = 'iniciar') {
    if (tipoSom === 'iniciar' && window.somIniciarTarefa) window.somIniciarTarefa();
    else if (tipoSom === 'concluir' && window.somConcluirTarefa) window.somConcluirTarefa();

    const payloadOffline = { id: id, dados: payloadUpdate };
    const res = await window.executarOuOffline('tarefa_update', payloadOffline, () => cliente.from('tarefas').update(payloadUpdate).eq('id', id));

    if (res?.error) return window.mostrarToast('Não foi possível alterar a tarefa: ' + res.error.message,'erro');
    window.mostrarToast(res.offline ? `${msgToast} (Guardado offline)` : msgToast);
    window.carregarTarefas(); 
}

window.verificarPontoParaOperar = function() {
    if (perfilAtual?.is_admin) return true;

    if (!registroPontoAtual || registroPontoAtual.horario_saida || (registroPontoAtual.status_turno !== 'presente' && registroPontoAtual.status_turno !== 'diaria_aprovada')) {
        window.mostrarToast("Você precisa registrar o ponto de entrada antes de iniciar ou ajudar em tarefas.", "erro");
        return false;
    }
    return true;
};

window.iniciarTarefa = (id) => {
    if (!window.verificarPontoParaOperar()) return;
    
    atualizarStatusTarefa(id, 
        { status: 'em_andamento', assumido_por: usuarioAtual.id, hora_inicio: new Date().toISOString(), ajudantes: [] }, 
        "Tarefa assumida! Status: Progredindo.", 'iniciar'
    );
};

window.entrarComoAjudante = async function(id) {
    if (!window.verificarPontoParaOperar()) return;

    const tarefa = cacheTarefas.find(t => t.id === id);
    if (!tarefa) return;

    let ajudantes = Array.isArray(tarefa.ajudantes) ? [...tarefa.ajudantes] : [];
    if (!ajudantes.includes(usuarioAtual.id) && tarefa.assumido_por !== usuarioAtual.id) {
        ajudantes.push(usuarioAtual.id);
        const payloadUpdate = { ajudantes: ajudantes };
        const payloadOffline = { id: id, dados: payloadUpdate };

        const res=await window.executarOuOffline('tarefa_update', payloadOffline, () => cliente.from('tarefas').update(payloadUpdate).eq('id', id));
        if(res?.error)return window.mostrarToast(res.error.message,'erro');

        if (window.somIniciarTarefa) window.somIniciarTarefa();
        window.mostrarToast("Você agora está ajudando nesta tarefa!");
        window.carregarTarefas();
    }
};

window.concluirTarefa = async function(id) {
    const tarefa = cacheTarefas.find(t => t.id === id);
    if (!tarefa) return;

    const subitens = Array.isArray(tarefa.subitens) ? tarefa.subitens : [];
    if (subitens.length > 0) {
        const pendentes = subitens.filter(s => !s.concluido).length;
        if (pendentes > 0) {
            return window.mostrarToast(`Ainda restam ${pendentes} subitem(ns) pendente(s) no checklist.`, "erro");
        }
    }

    if (tarefa.assumido_por && tarefa.assumido_por !== usuarioAtual.id && !perfilAtual?.is_admin) {
        const nomeDono = window.obterNomeColaborador(tarefa.assumido_por, 'quem iniciou');
        return window.mostrarToast(`Apenas ${nomeDono} pode finalizar esta tarefa.`, "erro");
    }

    if (tarefa.autonoma === true && !perfilAtual?.is_admin) {
        const agora = new Date().toISOString();
        const {error:erroConclusao} = await cliente.from('tarefas').update({
            status: 'aguardando_aprovacao',
            hora_fim: agora
        }).eq('id', id);

        if (erroConclusao) return window.mostrarToast('Não foi possível concluir: '+erroConclusao.message,'erro');
        const nomeExecutor = window.obterNomeColaborador(tarefa.assumido_por, 'Colaborador');
        const tituloAviso = `Aprovação de Tarefa Autônoma: ${tarefa.titulo}`;
        const msgAviso = `${nomeExecutor} concluiu a tarefa autônoma "${tarefa.titulo}". Necessária aprovação gerencial.`;

        await cliente.from('avisos').insert([{
            titulo: tituloAviso,
            mensagem: msgAviso,
            setor_destino: 'todos',
            criado_por: usuarioAtual.id,
            empresa_id: empresaAtualId,
            lidos_por: [],
            tarefa_autonoma_id: tarefa.id
        }]);

        if (window.somConcluirTarefa) window.somConcluirTarefa();
        window.mostrarToast("Tarefa enviada aos administradores para aprovação!");
        window.carregarTarefas();
        if (typeof window.carregarAvisos === 'function') window.carregarAvisos();
        return;
    }

    await atualizarStatusTarefa(id,{status:'concluida',hora_fim:new Date().toISOString(),ultimo_reinicio:window.dataLocal()},'Excelente! Tarefa finalizada.','concluir');

};

// ------------------ HOMOLOGAÇÃO DE TAREFA AUTÓNOMA ------------------
window.aprovarTarefaAutonoma = async function(tarefaId, avisoId) {
    const agora = new Date().toISOString();
    const { error: erroTarefa } = await cliente.from('tarefas').update({
        status: 'concluida',
        hora_fim: agora
    }).eq('id', tarefaId);

    if (erroTarefa) {
        return window.mostrarToast("Erro ao aprovar tarefa: " + erroTarefa.message, "erro");
    }

    if (avisoId) {
        await cliente.from('avisos').delete().eq('id', avisoId);
    }

    if (window.somConcluirTarefa) window.somConcluirTarefa();
    window.mostrarToast("Tarefa autônoma aprovada com sucesso!");
    window.carregarTarefas();
    window.carregarAvisos();
};

window.transformarTarefaAutonomaEmRotina = async function(tarefaId, avisoId) {
    const agora = new Date().toISOString();
    const hojeStr = agora.split('T')[0];
    const { error: erroTarefa } = await cliente.from('tarefas').update({
        status: 'concluida',
        recorrente: true,
        horario_reinicio: '01:00',
        hora_fim: agora,
        ultimo_reinicio: hojeStr,
        autonoma: false
    }).eq('id', tarefaId);

    if (erroTarefa) {
        return window.mostrarToast("Erro ao transformar em rotina: " + erroTarefa.message, "erro");
    }

    if (avisoId) {
        await cliente.from('avisos').delete().eq('id', avisoId);
    }

    if (window.somConcluirTarefa) window.somConcluirTarefa();
    window.mostrarToast("Tarefa aprovada e transformada em Rotina Diária!");
    window.carregarTarefas();
    window.carregarAvisos();
};

window.reprovarTarefaAutonoma = async function(tarefaId, avisoId) {
    if (!confirm("Rejeitar e desaprovar esta tarefa autônoma?")) return;

    if (tarefaId) {
        await cliente.from('tarefas').delete().eq('id', tarefaId);
    }
    if (avisoId) {
        await cliente.from('avisos').delete().eq('id', avisoId);
    }

    window.mostrarToast("Tarefa autônoma reprovada.");
    window.carregarTarefas();
    window.carregarAvisos();
};

// ------------------ MOTOR AUTOMÁTICO DE REINÍCIO DIÁRIO ------------------
let ultimoResetAvisosDia = null;
try {
    ultimoResetAvisosDia = window.localStorage ? window.localStorage.getItem('SaborDaCosta_ResetAvisos') : null;
} catch (e) {
    ultimoResetAvisosDia = null;
}

let suiriReiniciando = false;
window.verificarReinicioTarefasRecorrentes = async function() {
    if (suiriReiniciando || !navigator.onLine) return;
    suiriReiniciando=true;
    try {
        const {data,error}=await cliente.rpc('suiri_reiniciar_rotinas');
        if(error) { console.warn('Rotinas não atualizadas:',error.message); return; }
        if(data>0) await window.carregarTarefas();
    } finally {suiriReiniciando=false;}
};

window.reverterTarefa = async function(id) { 
    if(!confirm("Reiniciar esta tarefa e devolver ao painel de pendentes?")) return;

    const tarefa = cacheTarefas.find(t => t.id === id);
    const subitensResetados = (Array.isArray(tarefa?.subitens) ? tarefa.subitens : []).map(s => ({
        ...s,
        concluido: false,
        feito_por: null
    }));

    await atualizarStatusTarefa(id, 
        { 
            status: 'pendente', 
            assumido_por: null, 
            ajudantes: [], 
            hora_inicio: null, 
            hora_fim: null,
            subitens: subitensResetados 
        }, 
        "Tarefa reiniciada e subitens desmarcados.", 'iniciar'
    );
};

window.apagarTarefa = async function(id) { 
    if(confirm("Confirmar exclusão desta tarefa?")) { 
        const {error}=await cliente.from('tarefas').delete().eq('id', id);
        if(error)return window.mostrarToast(error.message,'erro');
        window.mostrarToast("Tarefa excluída.");
        window.carregarTarefas(); 
    } 
};

window.mudarPrioridadeTarefa = async function(id, novaPrio) {
    const {error}=await cliente.from('tarefas').update({ prioridade: String(novaPrio) }).eq('id', id);
    if(error)return window.mostrarToast(error.message,'erro');
    if (window.somIniciarTarefa) window.somIniciarTarefa();
    window.mostrarToast("Prioridade atualizada!");
    window.carregarTarefas();
};

// ------------------ GESTÃO CONCORRENTE DE SUBITENS ------------------
window.toggleSubitemTarefa = async function(tarefaId, subitemId) {
    const tarefa = cacheTarefas.find(t => t.id === tarefaId);
    if (!tarefa || !Array.isArray(tarefa.subitens)) return;

    const souIniciador = tarefa.assumido_por === usuarioAtual.id;
    const souAjudante = Array.isArray(tarefa.ajudantes) && tarefa.ajudantes.includes(usuarioAtual.id);
    const isAdmin = !!perfilAtual?.is_admin;

    if (!souIniciador && !souAjudante && !isAdmin) {
        window.mostrarToast("Você precisa pegar a tarefa ou clicar em Ajudar antes de marcar os subitens.", "erro");
        window.desenharTarefas(cacheTarefas);
        return;
    }

    const subitens = JSON.parse(JSON.stringify(tarefa.subitens));
    const sub = subitens.find(s => s.id === subitemId);
    if (!sub) return;

    if (!sub.concluido) {
        sub.concluido = true;
        sub.feito_por = usuarioAtual.id;
        if (window.somPop) window.somPop();
    } else {
        if (sub.feito_por && sub.feito_por !== usuarioAtual.id && !isAdmin) {
            const quemFez = window.obterNomeColaborador(sub.feito_por, 'o seu colega');
            if (window.somErro) window.somErro();
            window.mostrarToast(`Ação bloqueada: Apenas ${quemFez} pode desmarcar este item!`, "erro");
            window.desenharTarefas(cacheTarefas);
            return;
        }
        sub.concluido = false;
        sub.feito_por = null;
    }

    const payloadOffline = { id: tarefaId, dados: { subitens: subitens } };
    await window.executarOuOffline('tarefa_update', payloadOffline, () => cliente.from('tarefas').update({ subitens: subitens }).eq('id', tarefaId));
    window.carregarTarefas();
};

window.abrirModalGerenciarSubitens = function(tarefaId) {
    const tarefa = cacheTarefas.find(t => t.id === tarefaId);
    if (!tarefa) return;

    document.getElementById('subitem-tarefa-id').value = tarefaId;
    const lista = document.getElementById('lista-modal-subitens');
    if (!lista) return;

    const subitens = Array.isArray(tarefa.subitens) ? tarefa.subitens : [];
    lista.innerHTML = '';

    if (subitens.length === 0) {
        lista.innerHTML = '<div style="font-size:12px; color:var(--texto-suave);">Nenhum subitem cadastrado.</div>';
    } else {
        subitens.forEach(s => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:var(--input-bg); padding:6px 10px; border-radius:6px; font-size:12px;';
            div.innerHTML = `
                <span>${esc(s.texto)}</span>
                <button class="btn-erro" style="padding:2px 6px; font-size:10px; margin:0; width:auto;" onclick="window.removerSubitemDaTarefa('${s.id}')">Excluir</button>
            `;
            lista.appendChild(div);
        });
    }

    document.getElementById('modal-gerenciar-subitens')?.classList.remove('oculto');
};

window.fecharModalSubitens = function() {
    document.getElementById('modal-gerenciar-subitens')?.classList.add('oculto');
};

window.adicionarSubitemNaTarefa = async function() {
    const tarefaId = document.getElementById('subitem-tarefa-id')?.value;
    const input = document.getElementById('input-novo-subitem-modal');
    const texto = input?.value.trim();
    if (!tarefaId || !texto) return window.mostrarToast("Digite o subitem.", "erro");

    const tarefa = cacheTarefas.find(t => t.id === tarefaId);
    if (!tarefa) return;

    const subitens = Array.isArray(tarefa.subitens) ? [...tarefa.subitens] : [];
    subitens.push({
        id: 'sub_' + Date.now(),
        texto: texto,
        concluido: false,
        feito_por: null
    });

    await cliente.from('tarefas').update({ subitens: subitens }).eq('id', tarefaId);
    input.value = '';
    window.mostrarToast("Subitem adicionado!");
    window.abrirModalGerenciarSubitens(tarefaId);
    window.carregarTarefas();
};

window.removerSubitemDaTarefa = async function(subitemId) {
    const tarefaId = document.getElementById('subitem-tarefa-id')?.value;
    const tarefa = cacheTarefas.find(t => t.id === tarefaId);
    if (!tarefa || !Array.isArray(tarefa.subitens)) return;

    const subitens = tarefa.subitens.filter(s => s.id !== subitemId);
    await cliente.from('tarefas').update({ subitens: subitens }).eq('id', tarefaId);
    window.mostrarToast("Subitem removido!");
    window.abrirModalGerenciarSubitens(tarefaId);
    window.carregarTarefas();
};

// ------------------ MENU FLUTUANTE ------------------
window.toggleMenuAdmin = function(id, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (typeof window.somPop === 'function') window.somPop();

    const menuAtual = document.getElementById(`menu-admin-${id}`);
    const estavaAberto = menuAtual ? menuAtual.classList.contains('ativo') : false;

    document.querySelectorAll('.dropdown-admin').forEach(el => el.classList.remove('ativo'));
    document.querySelectorAll('.bloco-categoria-tarefas, .cartao-lista').forEach(el => {
        el.style.zIndex = '';
        el.style.position = '';
    });

    if (menuAtual && !estavaAberto) {
        menuAtual.classList.add('ativo');

        const cardPai = menuAtual.closest('.cartao-lista');
        const blocoCatPai = menuAtual.closest('.bloco-categoria-tarefas');

        if (blocoCatPai) {
            blocoCatPai.style.position = 'relative';
            blocoCatPai.style.zIndex = '99999';
        }
        if (cardPai) {
            cardPai.style.position = 'relative';
            cardPai.style.zIndex = '100000';
        }
    }
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-dots-container')) {
        document.querySelectorAll('.dropdown-admin.ativo').forEach(el => el.classList.remove('ativo'));
        document.querySelectorAll('.bloco-categoria-tarefas, .cartao-lista').forEach(el => {
            el.style.zIndex = '';
            el.style.position = '';
        });
    }
});

window.toggleInstrucao = function(id) {
    if(window.somPop) window.somPop();
    document.getElementById(`instrucao-${id}`)?.classList.toggle('oculto');
};

// ------------------ CONTROLE DE SANFONA DAS CATEGORIAS ------------------
window.toggleCategoriaTarefas = function(idLista, btn) {
    if (window.somPop) window.somPop();
    const container = document.getElementById(idLista);
    if (!container) return;

    const estaOculto = container.classList.contains('oculto');
    const novoEstadoAberto = estaOculto;

    container.classList.toggle('oculto', !novoEstadoAberto);

    const btnIndicador = btn?.querySelector ? (btn.querySelector('.btn-expandir-cat') || btn) : document.getElementById(btn);
    if (btnIndicador) {
        btnIndicador.textContent = novoEstadoAberto ? '−' : '+';
    }

    if (usuarioAtual && usuarioAtual.id) {
        try {
            window.localStorage.setItem(`SaborDaCosta_cat_${usuarioAtual.id}_${idLista}`, novoEstadoAberto ? 'aberto' : 'fechado');
        } catch(e) {}
    }
};

window.aplicarEstadoSanfonasTarefas = function() {
    if (!usuarioAtual || !usuarioAtual.id) return;

    const categoriasIds = [
        'lista-tarefas-abertura',
        'lista-tarefas-bonus',
        'lista-tarefas-fechamento',
        'lista-tarefas-concluidas-main'
    ];

    categoriasIds.forEach(idLista => {
        const container = document.getElementById(idLista);
        if (!container) return;

        let salvo = null;
        try {
            salvo = window.localStorage.getItem(`SaborDaCosta_cat_${usuarioAtual.id}_${idLista}`);
        } catch(e) {}

        const deveEstarAberto = (salvo === 'aberto');
        container.classList.toggle('oculto', !deveEstarAberto);

        const blocoPai = container.closest('.bloco-categoria-tarefas');
        const btnIndicador = blocoPai ? blocoPai.querySelector('.btn-expandir-cat') : null;
        if (btnIndicador) {
            btnIndicador.textContent = deveEstarAberto ? '−' : '+';
        }
    });
};

// ------------------ REORDENAÇÃO DE TAREFAS ------------------
let categoriaReordenarAtual = null;

window.abrirModalReordenar = function(categoria, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (window.somPop) window.somPop();

    categoriaReordenarAtual = categoria;
    const modal = document.getElementById('modal-reordenar');
    const container = document.getElementById('lista-drag-tarefas');
    const tituloModal = document.getElementById('titulo-modal-reordenar');
    if (!modal || !container) return;

    let nomeCat = "Abertura";
    if (categoria === 'bonus') nomeCat = "Manutenção";
    if (categoria === 'fechamento') nomeCat = "Fechamento";
    if (tituloModal) tituloModal.textContent = `Reordenar - ${nomeCat}`;

    const tarefasDaCat = (cacheTarefas || []).filter(t => (t.categoria || 'abertura') === categoria && t.status !== 'concluida' && t.status !== 'aguardando_aprovacao');
    tarefasDaCat.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

    container.innerHTML = '';
    if (tarefasDaCat.length === 0) {
        container.innerHTML = '<li class="status-texto" style="text-align:center; padding:16px;">Nenhuma tarefa ativa para reordenar.</li>';
    } else {
        tarefasDaCat.forEach(t => {
            const li = document.createElement('li');
            li.className = 'drag-item';
            li.draggable = true;
            li.dataset.tarefaId = t.id;
            li.innerHTML = `
                <span class="drag-handle">☰</span>
                <span style="flex:1;">${esc(t.titulo)}</span>
            `;
            container.appendChild(li);
        });
        window.configurarDragAndDrop(container);
    }

    modal.classList.remove('oculto');
};

window.fecharModalReordenar = function() {
    document.getElementById('modal-reordenar')?.classList.add('oculto');
    categoriaReordenarAtual = null;
};

window.configurarDragAndDrop = function(container) {
    let itemArrastado = null;

    container.querySelectorAll('.drag-item').forEach(item => {
        item.addEventListener('dragstart', () => {
            itemArrastado = item;
            setTimeout(() => item.classList.add('dragging'), 0);
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            itemArrastado = null;
        });

        item.addEventListener('touchstart', () => {
            itemArrastado = item;
            item.classList.add('dragging');
        }, { passive: true });

        item.addEventListener('touchend', () => {
            item.classList.remove('dragging');
            itemArrastado = null;
        });
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const aposElemento = obterElementoAposArrasto(container, e.clientY);
        if (!itemArrastado) return;
        if (aposElemento == null) {
            container.appendChild(itemArrastado);
        } else {
            container.insertBefore(itemArrastado, aposElemento);
        }
    });

    container.addEventListener('touchmove', (e) => {
        if (!itemArrastado) return;
        const toque = e.touches[0];
        const aposElemento = obterElementoAposArrasto(container, toque.clientY);
        if (aposElemento == null) {
            container.appendChild(itemArrastado);
        } else {
            container.insertBefore(itemArrastado, aposElemento);
        }
    }, { passive: true });
};

function obterElementoAposArrasto(container, y) {
    const elementosArrastaveis = [...container.querySelectorAll('.drag-item:not(.dragging)')];
    return elementosArrastaveis.reduce((maisProximo, filho) => {
        const caixa = filho.getBoundingClientRect();
        const deslocamento = y - caixa.top - caixa.height / 2;
        if (deslocamento < 0 && deslocamento > maisProximo.offset) {
            return { offset: deslocamento, element: filho };
        } else {
            return maisProximo;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

window.salvarReordenacao = async function() {
    const container = document.getElementById('lista-drag-tarefas');
    if (!container) return;

    const itens = container.querySelectorAll('.drag-item');
    if (itens.length === 0) return window.fecharModalReordenar();

    window.mostrarToast("Salvando nova ordem...");

    const updates = [];
    itens.forEach((li, index) => {
        const tId = li.dataset.tarefaId;
        if (tId) {
            updates.push(cliente.from('tarefas').update({ ordem: index }).eq('id', tId));
        }
    });

    await Promise.all(updates);
    if (window.somConcluirTarefa) window.somConcluirTarefa();
    window.mostrarToast("Ordem das tarefas atualizada!");
    window.fecharModalReordenar();
    window.carregarTarefas();
};

// ------------------ CARREGAMENTO E DESENHO DE TAREFAS COM EMPRESA_ID ------------------
window.carregarTarefas = async function() {
    let query = cliente.from('tarefas').select('*');
    if (empresaAtualId) {
        query = query.eq('empresa_id', empresaAtualId);
    }
    const { data, error } = await query.order('ordem', { ascending: true }).order('criado_em', { ascending: false });
    if (error) return;

    cacheTarefas = data || [];
    const {data:historico,error:erroHistorico} = await cliente.from('suiri_historico_tarefas').select('registro').order('concluida_em',{ascending:false}).limit(1000);
    if (erroHistorico) console.warn('Histórico de aprendizado indisponível:',erroHistorico.message);
    const execucoes = new Map();
    [...cacheTarefas,...(historico||[]).map(h=>h.registro)].forEach(t=>execucoes.set(t.id+'|'+t.hora_fim,t));
    window.calcularTempoMedioHistorico([...execucoes.values()]);
    
    if (typeof window.verificarReinicioTarefasRecorrentes === 'function') {
        window.verificarReinicioTarefasRecorrentes();
    }

    window.desenharTarefas(cacheTarefas);
    window.aplicarEstadoSanfonasTarefas();

    const painelAoVivoEl = document.getElementById('conteudo-painel-ao-vivo');
    if (painelAoVivoEl && !painelAoVivoEl.classList.contains('oculto')) {
        window.carregarPainelAoVivo();
    }
};

window.desenharTarefas = function(tarefas) {
    const setorUsuario = perfilAtual?.setor || 'frente';
    const temPermissaoGerencial = perfilAtual?.is_admin || perfilAtual?.is_socio || perfilAtual?.is_gerente;
    const horaAgoraStr = new Date().toTimeString().slice(0, 5);

    const tarefasFiltradas = temPermissaoGerencial ? tarefas : tarefas.filter(t => {
        return (!t.destinado_a && (!t.setor_destinado || t.setor_destinado === 'todos')) || 
               (t.destinado_a === usuarioAtual.id) || 
               (t.setor_destinado === setorUsuario);
    });

    const contEmServico = document.getElementById('lista-tarefas-em-servico');
    const contConcluidasMain = document.getElementById('lista-tarefas-concluidas-main');
    if(contEmServico) contEmServico.innerHTML = '';
    if(contConcluidasMain) contConcluidasMain.innerHTML = '';

    const statusCat = {
        abertura:   { total: 0, concluidas: 0, elCont: document.getElementById('contador-abertura'),   container: document.getElementById('lista-tarefas-abertura'),   nivel: document.getElementById('nivel-abertura') },
        bonus:      { total: 0, concluidas: 0, elCont: document.getElementById('contador-bonus'),      container: document.getElementById('lista-tarefas-bonus'),      nivel: document.getElementById('nivel-bonus') },
        fechamento: { total: 0, concluidas: 0, elCont: document.getElementById('contador-fechamento'), container: document.getElementById('lista-tarefas-fechamento'), nivel: document.getElementById('nivel-fechamento') }
    };

    Object.values(statusCat).forEach(c => { if(c.container) c.container.innerHTML = ''; });

    let totalEmServico = 0;
    let totalConcluidasGeral = 0;

    tarefasFiltradas.forEach(tarefa => {
        const card = document.createElement('div');
        card.id = `card-tarefa-${tarefa.id}`;
        
        const responsavelNome = window.obterNomeColaborador(tarefa.assumido_por, '');
        const ajudantesLista = Array.isArray(tarefa.ajudantes) ? tarefa.ajudantes : [];
        
        const prazoExecucao = tarefa.status === 'em_andamento' ? Date.parse(tarefa.suiri_prazo_execucao) : NaN;
        const estaAtrasada = Number.isFinite(prazoExecucao)
            ? Date.now() >= prazoExecucao
            : ['pendente', 'em_andamento'].includes(tarefa.status) &&
                tarefa.horario_limite_alerta && horaAgoraStr > tarefa.horario_limite_alerta;
        if (Number.isFinite(prazoExecucao)) card.dataset.prazoExecucao = String(prazoExecucao);

        let classeStatus = 'tarefa-pendente';
        let textoStatus = 'Aguardando início';
        let botaoHTML = `<button class="btn-acao btn-iniciar" onclick="window.iniciarTarefa('${tarefa.id}')">Pegar</button>`;

        const previsaoSalva = tarefa.status === 'em_andamento' && Number(tarefa.suiri_tempo_previsto_min);
        const infoTempo = previsaoSalva
            ? {minutos:previsaoSalva, pontosPrevistos:previsaoSalva / 10, temHistorico:true}
            : window.obterTempoEstimadoAjustado(tarefa);
        let tagTempoMedioHTML = '';
        if (tarefa.status !== 'concluida' && tarefa.status !== 'aguardando_aprovacao') {
            const duracao = window.formatarTempoDuracao(infoTempo.minutos);
            const pontos = infoTempo.pontosPrevistos?.toLocaleString('pt-BR', {maximumFractionDigits:1});
            const rotulo = infoTempo.temHistorico
                ? `${previsaoSalva ? 'Prazo' : 'Média'}: ${duracao} · ${pontos} pts previstos`
                : `Estimativa inicial: ${duracao} · Aprendendo (${infoTempo.totalExecucoes}/3)`;
            tagTempoMedioHTML = `<div class="tarefa-tempo-medio">${rotulo}</div>`;
        }

        const subitens = Array.isArray(tarefa.subitens) ? tarefa.subitens : [];
        let checklistHTML = '';
        let barrasColaborativasHTML = '';
        let todosSubitensConcluidos = true;

        if (subitens.length > 0) {
            checklistHTML = '<div class="checklist-subtarefas">';
            const contagemPorPessoa = {};
            let totalFeitos = 0;

            subitens.forEach(s => {
                if (!s.concluido) todosSubitensConcluidos = false;

                const checked = s.concluido ? 'checked' : '';
                const classeFeito = s.concluido ? 'subtarefa-feita' : '';
                const autorNome = window.obterNomeColaborador(s.feito_por, '');
                const etiquetaAutor = (s.concluido && autorNome) ? `<span class="subtarefa-autor">${esc(autorNome)}</span>` : '';

                if (s.concluido && s.feito_por) {
                    contagemPorPessoa[s.feito_por] = (contagemPorPessoa[s.feito_por] || 0) + 1;
                    totalFeitos++;
                }

                const souAutorDoSubitem = (s.feito_por === usuarioAtual.id);
                const podeMexer = (!s.concluido) || souAutorDoSubitem || perfilAtual?.is_admin;
                const disabled = (!podeMexer || tarefa.status === 'concluida' || tarefa.status === 'aguardando_aprovacao') ? 'disabled' : '';

                checklistHTML += `
                    <div class="subtarefa-item">
                        <label class="${classeFeito}">
                            <input type="checkbox" ${checked} ${disabled} onchange="window.toggleSubitemTarefa('${tarefa.id}', '${s.id}')">
                            <span>${esc(s.texto)}</span>
                        </label>
                        ${etiquetaAutor}
                    </div>
                `;
            });
            checklistHTML += '</div>';

            if (Object.keys(contagemPorPessoa).length > 0) {
                barrasColaborativasHTML = '<div class="barras-colaborativas-container">';
                Object.keys(contagemPorPessoa).forEach(pId => {
                    const nomeColab = window.obterNomeColaborador(pId, 'Equipe');
                    const qtd = contagemPorPessoa[pId];
                    const pct = Math.round((qtd / subitens.length) * 100);
                    barrasColaborativasHTML += `
                        <div class="barra-colaborador-linha">
                            <span style="min-width:65px; color:var(--texto-suave);">${esc(nomeColab)}:</span>
                            <div class="barra-progresso-mini-fundo">
                                <div class="barra-progresso-mini-fill" style="width:${pct}%;"></div>
                            </div>
                            <span>${pct}%</span>
                        </div>
                    `;
                });
                barrasColaborativasHTML += '</div>';
            }
        }

        if (tarefa.status === 'em_andamento') {
            classeStatus = 'tarefa-andamento';
            
            const nomesAjudantes = ajudantesLista.map(id => window.obterNomeColaborador(id, 'Colega')).join(', ');
            const infoAjudantes = ajudantesLista.length > 0 ? ` + 🤝 ${esc(nomesAjudantes)}` : '';
            textoStatus = `⚡ Progredindo por <strong>${esc(responsavelNome || 'Equipe')}</strong>${infoAjudantes}`;

            const jaSouAjudante = ajudantesLista.includes(usuarioAtual.id);
            const souIniciador = tarefa.assumido_por === usuarioAtual.id;

            let btnAjudarHTML = '';
            if (!souIniciador && !jaSouAjudante) {
                btnAjudarHTML = `<button class="btn-acao btn-ajudar" style="margin-right:6px;" onclick="window.entrarComoAjudante('${tarefa.id}')">🤝 Ajudar</button>`;
            }

            const btnFinalizarOpacity = (!todosSubitensConcluidos && subitens.length > 0) ? 'opacity:0.5;' : '';
            const btnFinalizarHTML = souIniciador || perfilAtual?.is_admin
                ? `<button class="btn-acao btn-concluir" style="${btnFinalizarOpacity}" onclick="window.concluirTarefa('${tarefa.id}')">Finalizar</button>`
                : `<span style="font-size:11px; color:var(--texto-suave); align-self:center;">(Iniciado por ${esc(responsavelNome || 'Equipe')})</span>`;

            botaoHTML = `<div style="display:flex; align-items:center;">${btnAjudarHTML}${btnFinalizarHTML}</div>`;
        } else if (tarefa.status === 'aguardando_aprovacao') {
            classeStatus = 'tarefa-andamento';
            textoStatus = `⏳ <strong>Aguardando Aprovação do Administrador</strong> (Concluída por ${esc(responsavelNome || 'Equipe')})`;
            botaoHTML = `<span style="font-size:11px; font-weight:700; color:var(--cor-alerta); align-self:center;">Pendente de Validação</span>`;
        } else if (tarefa.status === 'concluida') { 
            const horaFim = tarefa.hora_fim ? new Date(tarefa.hora_fim).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '';
            classeStatus = 'tarefa-concluida'; 
            
            const nomesAjudantes = ajudantesLista.map(id => window.obterNomeColaborador(id, 'Colega')).join(', ');
            const textoAjudantes = ajudantesLista.length > 0 ? ` (🤝 Ajudantes: ${esc(nomesAjudantes)})` : '';
            textoStatus = `✓ Feita por <strong>${esc(responsavelNome || 'Equipe')}</strong>${textoAjudantes} ${horaFim ? 'às ' + horaFim : ''}`; 
            botaoHTML = ''; 
        }

        if (estaAtrasada) classeStatus += ' tarefa-atrasada-alerta';
        if (Number.isFinite(prazoExecucao)) {
            const minutos = Math.max(0, Math.floor((Date.now() - prazoExecucao) / 60000));
            textoStatus += ` <span class="suiri-prazo-aviso" ${estaAtrasada ? '' : 'hidden'}>Atrasada há ${minutos} min</span>`;
        } else if (estaAtrasada) {
            textoStatus += ` <span class="suiri-prazo-aviso">Atrasada. Limite às ${esc(tarefa.horario_limite_alerta)}</span>`;
        }

        const prio = tarefa.prioridade || '3';
        const badgePrioHTML = `<span class="badge-prio badge-prio-${prio}">${prio === '1' || prio === 1 ? 'Urgente' : (prio === '2' || prio === 2 ? 'Moderada' : 'Tranquilidade')}</span>`;
        const tagSetorTarefa = tarefa.setor_destinado ? `<span class="tag-setor" style="font-size:9px; padding:2px 6px;">${esc(tarefa.setor_destinado)}</span>` : '';
        const tagDestinoHTML = tarefa.destinado_a ? `<span style="font-size:10px; font-weight:700; color:var(--cor-socio);">👤 Para: ${esc(window.obterNomeColaborador(tarefa.destinado_a, 'Específico'))}</span>` : '';
        const tagRecorrencia = tarefa.recorrente ? `<span style="font-size:10px; color:var(--cor-primaria); font-weight:700;">🔁 Reinício: ${tarefa.horario_reinicio || '01:00'}</span>` : '';
        const tagAutonoma = tarefa.autonoma ? `<span style="font-size:10px; color:var(--cor-alerta); font-weight:700;">⚡ Autônoma</span>` : '';
        const tagLimiteAlerta = tarefa.horario_limite_alerta ? `<span style="font-size:10px; color:${estaAtrasada ? 'var(--cor-erro)' : 'var(--texto-suave)'}; font-weight:700;">⏰ Limite: ${tarefa.horario_limite_alerta}</span>` : '';

        let btnCobrarWhatsHTML = '';
        if (estaAtrasada && tarefa.horario_limite_alerta && temPermissaoGerencial) {
            const idAlvo = tarefa.assumido_por || tarefa.destinado_a;
            const colabAlvo = idAlvo ? mapaPerfis[idAlvo] : null;
            if (colabAlvo && colabAlvo.telefone_whatsapp) {
                btnCobrarWhatsHTML = `
                    <button class="btn-whats" style="padding:4px 8px; font-size:10px; margin-top:4px;" onclick="window.cobrarTarefaWhatsApp(${window.atributoJS(colabAlvo.telefone_whatsapp)}, ${window.atributoJS(colabAlvo.nome)}, ${window.atributoJS(tarefa.titulo)}, ${window.atributoJS(tarefa.horario_limite_alerta)})">
                        📲 Cobrar no Whats
                    </button>
                `;
            }
        }

        const blocoInstrucao = (tarefa.instrucao && tarefa.instrucao.trim() !== '' && tarefa.instrucao !== 'null') ? `
            <button id="btn-instrucao-${tarefa.id}" class="btn-toggle-instrucao" onclick="window.toggleInstrucao('${tarefa.id}')">Instrução 💡</button>
            <div id="instrucao-${tarefa.id}" class="instrucao-tarefa oculto">${esc(tarefa.instrucao)}</div>
        ` : '';

        let controlesAdminHTML = '';
        if (temPermissaoGerencial) {
            const btnReverter = tarefa.status !== 'pendente' 
                ? `<button type="button" class="dropdown-item" onclick="event.stopPropagation(); window.reverterTarefa('${tarefa.id}')">🔄 Reiniciar Tarefa</button>` 
                : '';
                
            controlesAdminHTML = `
            <div class="menu-dots-container">
                <button type="button" class="btn-dots" onclick="event.stopPropagation(); window.toggleMenuAdmin('${tarefa.id}', event)">⋮</button>
                <div id="menu-admin-${tarefa.id}" class="dropdown-admin" onclick="event.stopPropagation()">
                    <button type="button" class="dropdown-item" onclick="window.editarTarefaNome('${tarefa.id}', ${window.atributoJS(tarefa.titulo)})">✏️ Editar Título</button>
                    <button type="button" class="dropdown-item" onclick="window.editarTarefaInstrucao('${tarefa.id}')">📝 Editar Instrução</button>
                    <button type="button" class="dropdown-item" onclick="window.abrirModalGerenciarSubitens('${tarefa.id}')">☑️ Gerenciar Subitens</button>
                    <div style="padding: 6px 12px 2px 12px; font-size: 10px; color: #034078; font-weight: 800;">PRIORIDADE</div>
                    <button type="button" class="dropdown-item" onclick="window.mudarPrioridadeTarefa('${tarefa.id}', '1')">🔴 1 - Urgente</button>
                    <button type="button" class="dropdown-item" onclick="window.mudarPrioridadeTarefa('${tarefa.id}', '2')">🟡 2 - Moderada</button>
                    <button type="button" class="dropdown-item" onclick="window.mudarPrioridadeTarefa('${tarefa.id}', '3')">🟢 3 - Tranquilidade</button>
                    ${btnReverter}
                    <button type="button" class="dropdown-item dropdown-item-erro" onclick="window.apagarTarefa('${tarefa.id}')">🗑️ Excluir Tarefa</button>
                </div>
            </div>`;
        }

        card.className = `cartao-lista ${classeStatus} prio-${prio}`;
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="flex:1; padding-right:6px;">
                    <div class="tarefa-cabecalho-meta">${badgePrioHTML} ${tagSetorTarefa} ${tagDestinoHTML} ${tagRecorrencia} ${tagAutonoma} ${tagLimiteAlerta}</div>
                    <div class="tarefa-titulo">${esc(tarefa.titulo)}</div>
                    ${tagTempoMedioHTML}
                    <div class="tarefa-status">${textoStatus}</div>
                    ${btnCobrarWhatsHTML}
                </div>
                ${controlesAdminHTML}
            </div>
            ${blocoInstrucao}
            ${checklistHTML}
            ${barrasColaborativasHTML}
            <div style="display:flex; justify-content:flex-end; margin-top:6px;">${botaoHTML}</div>
        `;
        
        const catKey = statusCat[tarefa.categoria] ? tarefa.categoria : 'abertura';
        const target = statusCat[catKey];

        target.total++;
        if (tarefa.status === 'concluida') { 
            target.concluidas++; 
            if(contConcluidasMain) contConcluidasMain.appendChild(card); 
            totalConcluidasGeral++;
        } else if (tarefa.status === 'em_andamento' || tarefa.status === 'aguardando_aprovacao') {
            totalEmServico++;
            if (contEmServico) contEmServico.appendChild(card);
        } else if (target.container) {
            target.container.appendChild(card);
        }
    });

    Object.values(statusCat).forEach(c => {
        const pendentes = c.total - c.concluidas;
        if(c.elCont) c.elCont.textContent = pendentes;
        if(c.nivel) c.nivel.style.width = `${c.total > 0 ? (c.concluidas / c.total) * 100 : 0}%`;
        
        if(c.total === 0 && c.container) {
            c.container.innerHTML = '<p class="status-texto" style="font-size:11px; text-align:center; margin-bottom:0;">Nenhuma tarefa nesta etapa.</p>';
        }
    });

    const elContEmServico = document.getElementById('contador-em-servico');
    if (elContEmServico) elContEmServico.textContent = totalEmServico;
    if (totalEmServico === 0 && contEmServico) {
        contEmServico.innerHTML = '<p class="status-texto" style="font-size:11px; text-align:center; margin-bottom:0;">Nenhuma tarefa em andamento agora.</p>';
    }

    const elContConcluidasMain = document.getElementById('contador-concluidas-main');
    if(elContConcluidasMain) elContConcluidasMain.textContent = totalConcluidasGeral;
};

// Disparo de mensagem no WhatsApp em caso de cobrança
window.cobrarTarefaWhatsApp = function(telefone, nome, titulo, limite) {
    if (!telefone) return window.mostrarToast("Colaborador sem WhatsApp cadastrado.", "erro");
    const numLimpo = telefone.replace(/\D/g, '');
    const numFinal = numLimpo.startsWith('55') ? numLimpo : '55' + numLimpo;
    const msg = `Olá, ${nome}! A tarefa *"${titulo}"* estava prevista para até às *${limite}* e encontra-se pendente no Suiri. Tudo certo por aí?`;
    window.open(`https://wa.me/${numFinal}?text=${encodeURIComponent(msg)}`, '_blank');
};

// ------------------ PAINEL AO VIVO COM AVATARES & FILTRO (06:00 ÀS 23:30) ------------------
let cacheTimelineOperacionalDia = [];

function atualizarPrazoVisivelSuiri() {
    if (document.hidden || !usuarioAtual) return;
    const agora = Date.now();
    for (const card of document.querySelectorAll('[data-prazo-execucao]')) {
        const restante = agora - Number(card.dataset.prazoExecucao);
        const aviso = card.querySelector('.suiri-prazo-aviso');
        if (!aviso || restante < 0) continue;
        card.classList.add('tarefa-atrasada-alerta');
        aviso.hidden = false;
        const texto = `Atrasada há ${Math.floor(restante / 60000)} min`;
        if (aviso.textContent !== texto) aviso.textContent = texto;
    }
}
window.setInterval(atualizarPrazoVisivelSuiri, 15000);

let consultaPainelAoVivo = 0;
window.carregarPainelAoVivo = async function() {
    if (!usuarioAtual || !empresaAtualId) return;
    const consulta = ++consultaPainelAoVivo;
    const uid = usuarioAtual.id;
    const containerGrade = document.getElementById('grade-colaboradores-painel');
    const containerHistorico = document.getElementById('lista-historico-diario');
    const selFiltroColab = document.getElementById('filtro-historico-colab');
    if (!containerGrade || !containerHistorico) return;

    const listaFuncionarios = Object.values(mapaPerfis || {});

    if (listaFuncionarios.length === 0) {
        containerGrade.innerHTML = '<p class="status-texto" style="text-align:center;">Nenhum funcionário encontrado.</p>';
        return;
    }

    if (selFiltroColab && selFiltroColab.options.length <= 1) {
        selFiltroColab.innerHTML = '<option value="todos">Todos os Funcionários</option>';
        listaFuncionarios.forEach(f => {
            selFiltroColab.innerHTML += `<option value="${f.id}">${esc(f.nome || 'Colaborador')}</option>`;
        });
    }

    const agora = new Date();
    const hojeStr = window.dataLocal(agora);
    const diaSemanaHoje = String(agora.getDay());
    const horaAgoraStr = agora.toTimeString().slice(0, 5);

    let queryPontos = cliente.from('livro_ponto').select('*').eq('data_registro', hojeStr);
    if (empresaAtualId) {
        queryPontos = queryPontos.eq('empresa_id', empresaAtualId);
    }
    const { data: pontosHoje, error } = await queryPontos;
    if (consulta !== consultaPainelAoVivo || uid !== usuarioAtual?.id || error) return;
    containerGrade.innerHTML = '';
    const mapaPontoHoje = {};
    (pontosHoje || []).forEach(p => { mapaPontoHoje[p.perfil_id] = p; });

    const cardsEmServico = [];
    const cardsAusentes = [];

    const funcionariosParaCards = listaFuncionarios.filter(f => !f.is_admin);

    for (const f of funcionariosParaCards) {
        const regPonto = mapaPontoHoje[f.id];
        const statusPontoHoje = regPonto?.status_turno;
        const ehFixo = (f.tipo_contrato || 'fixo') === 'fixo';
        const folgasSemanais = Array.isArray(f.dias_folga_semana) ? f.dias_folga_semana : [];
        const ehDiaDeFolgaSemanal = ehFixo && folgasSemanais.includes(diaSemanaHoje);

        const avatarUrl = window.obterAvatarColaborador(f.id);
        const nomeExibicao = window.obterNomeColaborador(f.id, f.nome || 'Equipe');
        
        const avatarHTML = avatarUrl
            ? `<img src="${esc(avatarUrl)}" class="avatar-painel-colab" loading="lazy" alt="${esc(nomeExibicao)}">`
            : `<div class="avatar-painel-colab">${esc(nomeExibicao.charAt(0).toUpperCase())}</div>`;

        const bateuEntrada = !!(regPonto && regPonto.horario_entrada);
        const bateuSaida = !!(regPonto && regPonto.horario_saida);

        const tarefaEmAndamento = cacheTarefas.find(t => 
            (t.status === 'em_andamento' || t.status === 'aguardando_aprovacao') && 
            (t.assumido_por === f.id || (Array.isArray(t.ajudantes) && t.ajudantes.includes(f.id)))
        );

        if (bateuEntrada && !bateuSaida) {
            let classeCard = 'colab-card-painel';
            const setorFuncionario = String(f.setor || '').toLowerCase().trim();
            const ehSetorFrente = (setorFuncionario === 'frente');
            
            let textoPadraoSemTarefa = ehSetorFrente
                ? `<span style="color:var(--cor-sucesso); font-weight:700;">🟢 Atendendo</span>`
                : `<span style="color:var(--cor-sucesso); font-weight:700;">🟢 Afazeres gerais</span>`;

            let textoAcao = textoPadraoSemTarefa;

            if (tarefaEmAndamento) {
                classeCard += ' colab-card-realizando';
                const horaIni = tarefaEmAndamento.hora_inicio ? new Date(tarefaEmAndamento.hora_inicio).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : '';
                const souIniciador = tarefaEmAndamento.assumido_por === f.id;

                if (tarefaEmAndamento.status === 'aguardando_aprovacao') {
                    textoAcao = `<strong style="color:var(--cor-alerta);">⏳ Aguardando Aprovação:</strong> ${esc(tarefaEmAndamento.titulo)}`;
                } else if (souIniciador) {
                    textoAcao = `<strong style="color:var(--cor-alerta);">⚡ Executando:</strong> ${esc(tarefaEmAndamento.titulo)} ${horaIni ? '(iniciou às ' + horaIni + ')' : ''}`;
                } else {
                    const nomeDono = window.obterNomeColaborador(tarefaEmAndamento.assumido_por, 'Equipe');
                    textoAcao = `<strong style="color:#0284c7;">🤝 Ajudando:</strong> ${esc(tarefaEmAndamento.titulo)} <span style="font-size:11px; color:var(--texto-suave);">(de ${esc(nomeDono)})</span>`;
                }
            }

            const card = document.createElement('div');
            card.className = classeCard;
            card.innerHTML = `
                <div class="colab-card-cabecalho">
                    <div class="colab-card-perfil-box">
                        ${avatarHTML}
                        <div>
                            <h4 style="margin:0 0 2px 0; font-size:14px; font-weight:800; color:var(--cor-texto);">${esc(nomeExibicao)} <span class="tag-setor" style="font-size:9px;">${esc(f.setor || 'Equipe')}</span></h4>
                            <div style="font-size:12px; line-height:1.3;">${textoAcao}</div>
                        </div>
                    </div>
                    <button class="btn-secundario" style="padding:4px 8px; font-size:11px; white-space:nowrap;" onclick="window.abrirModalMensagemDireta('${f.id}', ${window.atributoJS(nomeExibicao)})">✉️ Mensagem</button>
                </div>
            `;
            cardsEmServico.push(card);
            continue;
        }

        if (bateuSaida) {
            const card = document.createElement('div');
            card.className = 'colab-card-painel colab-card-concluido';
            card.innerHTML = `
                <div class="colab-card-cabecalho">
                    <div class="colab-card-perfil-box">
                        ${avatarHTML}
                        <div>
                            <h4 style="margin:0 0 2px 0; font-size:14px; font-weight:800; color:var(--cor-texto);">${esc(nomeExibicao)} <span class="tag-setor" style="font-size:9px;">${esc(f.setor || 'Equipe')}</span></h4>
                            <div style="font-size:12px; color:var(--cor-sucesso); font-weight:700;">Expediente Concluído hoje.</div>
                        </div>
                    </div>
                    <button class="btn-secundario" style="padding:4px 8px; font-size:11px; white-space:nowrap;" onclick="window.abrirModalMensagemDireta('${f.id}', ${window.atributoJS(nomeExibicao)})">✉️ Mensagem</button>
                </div>
            `;
            cardsEmServico.push(card);
            continue;
        }

        let tagStatusHTML = '';
        let textoDetalhe = '';
        let classeBorda = 'colab-card-ausente';

        if (statusPontoHoje === 'atestado') {
            tagStatusHTML = `<span class="tag-status-colab tag-status-atestado">Atestado Médico</span>`;
            textoDetalhe = `Licença médica registada no livro ponto.`;
            classeBorda += ' colab-card-atestado';
        } else if (statusPontoHoje === 'folga' || ehDiaDeFolgaSemanal) {
            tagStatusHTML = `<span class="tag-status-colab tag-status-folga">Folga</span>`;
            textoDetalhe = `Dia de descanso semanal / agendado.`;
            classeBorda += ' colab-card-folga';
        } else if (statusPontoHoje === 'falta' || horaAgoraStr >= '14:30') {
            tagStatusHTML = `<span class="tag-status-colab tag-status-falta">Falta (+5h de atraso)</span>`;
            textoDetalhe = `Não compareceu ao turno e ultrapassou 5 horas do horário limite.`;
            classeBorda += ' colab-card-falta';
        } else if (horaAgoraStr >= '09:30') {
            tagStatusHTML = `<span class="tag-status-colab tag-status-atrasado">Atrasado</span>`;
            textoDetalhe = `Turno iniciado e entrada não registrada até ao momento.`;
            classeBorda += ' colab-card-atrasado';
        } else {
            tagStatusHTML = `<span class="tag-status-colab" style="background:#e2e8f0; color:#475569;">Aguardando Turno</span>`;
            textoDetalhe = `Turno previsto para iniciar em breve.`;
        }

        const card = document.createElement('div');
        card.className = `colab-card-painel ${classeBorda}`;
        card.innerHTML = `
            <div class="colab-card-cabecalho">
                <div class="colab-card-perfil-box">
                    ${avatarHTML}
                    <div>
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                            <h4 style="margin:0; font-size:14px; font-weight:800; color:var(--cor-texto);">${esc(nomeExibicao)}</h4>
                            ${tagStatusHTML}
                        </div>
                        <div style="font-size:11px; color:var(--texto-suave);">${textoDetalhe}</div>
                    </div>
                </div>
                <button class="btn-secundario" style="padding:4px 8px; font-size:11px; white-space:nowrap;" onclick="window.abrirModalMensagemDireta('${f.id}', ${window.atributoJS(nomeExibicao)})">✉️ Mensagem</button>
            </div>
        `;
        cardsAusentes.push(card);
    }

    cardsEmServico.forEach(c => containerGrade.appendChild(c));
    cardsAusentes.forEach(c => containerGrade.appendChild(c));

    // ------------------ HISTÓRICO DAS 06:00 ÀS 23:30 ------------------
    const inicioJanelaHoje = new Date(`${hojeStr}T06:00:00`);
    const fimJanelaHoje = new Date(`${hojeStr}T23:30:59`);
    cacheTimelineOperacionalDia = [];

    (pontosHoje || []).forEach(p => {
        const nomeColab = window.obterNomeColaborador(p.perfil_id, 'Colaborador');
        const avatarUrl = window.obterAvatarColaborador(p.perfil_id);
        
        const avatarHTML = avatarUrl 
            ? `<img src="${esc(avatarUrl)}" class="avatar-colab-mini" loading="lazy" alt="${esc(nomeColab)}">`
            : `<div class="avatar-colab-mini">${esc(nomeColab.charAt(0).toUpperCase())}</div>`;

        if (p.horario_entrada) {
            const dataEnt = new Date(p.horario_entrada);
            if (dataEnt >= inicioJanelaHoje && dataEnt <= fimJanelaHoje) {
                cacheTimelineOperacionalDia.push({
                    colabId: p.perfil_id,
                    tipo: 'entrada_ponto',
                    dataHora: dataEnt,
                    horaStr: dataEnt.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
                    texto: `🟢 <strong>Entrada:</strong> <strong>${esc(nomeColab)}</strong> iniciou o turno de trabalho.`,
                    avatarStackHTML: `<div class="avatar-historico-stack">${avatarHTML}</div>`
                });
            }
        }

        if (p.horario_saida) {
            const dataSai = new Date(p.horario_saida);
            if (dataSai >= inicioJanelaHoje && dataSai <= fimJanelaHoje) {
                cacheTimelineOperacionalDia.push({
                    colabId: p.perfil_id,
                    tipo: 'saida_ponto',
                    dataHora: dataSai,
                    horaStr: dataSai.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
                    texto: `🔴 <strong>Saída:</strong> <strong>${esc(nomeColab)}</strong> encerrou o expediente.`,
                    avatarStackHTML: `<div class="avatar-historico-stack">${avatarHTML}</div>`
                });
            }
        }
    });

    (cacheTarefas || []).forEach(t => {
        if (!['em_andamento', 'aguardando_aprovacao', 'concluida'].includes(t.status)) return;
        const dataReferencia = t.hora_fim || t.hora_inicio;
        if (!dataReferencia) return;
        const dataEvt = new Date(dataReferencia);
        if (dataEvt < inicioJanelaHoje || dataEvt > fimJanelaHoje) return;

        const quem = window.obterNomeColaborador(t.assumido_por, 'Equipe');
        const horaStr = dataEvt.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        
        let tempoTexto = '';
        if (t.hora_inicio && t.hora_fim) {
            const min = Math.round((new Date(t.hora_fim) - new Date(t.hora_inicio)) / 60000);
            const duracaoFormatada = window.formatarTempoDuracao(min);
            if (duracaoFormatada) {
                tempoTexto = ` (levou ${duracaoFormatada})`;
            }
        }

        const ajudantesLista = Array.isArray(t.ajudantes)
            ? [...new Set(t.ajudantes.filter(id => id && id !== t.assumido_por))]
            : [];
        const ajudantesNomes = ajudantesLista.map(id => window.obterNomeColaborador(id, 'Colega')).join(', ');
        const infoAjudantes = ajudantesNomes ? `<span>Apoio: ${esc(ajudantesNomes)}</span>` : '';
        const tipoParticipacao = ajudantesLista.length ? 'Em grupo' : 'Individual';

        const participantesIds = [t.assumido_por, ...ajudantesLista].filter(Boolean);
        let stackHTML = '<div class="avatar-historico-stack">';
        participantesIds.forEach(pId => {
            const pNome = window.obterNomeColaborador(pId, 'Colaborador');
            const pAvatar = window.obterAvatarColaborador(pId);
            if (pAvatar) {
                stackHTML += `<img src="${esc(pAvatar)}" class="avatar-colab-mini" loading="lazy" title="${esc(pNome)}" alt="${esc(pNome)}">`;
            } else {
                stackHTML += `<div class="avatar-colab-mini" title="${esc(pNome)}">${esc(pNome.charAt(0).toUpperCase())}</div>`;
            }
        });
        stackHTML += '</div>';

        let tagStatus = `<span style="color:var(--cor-alerta); font-weight:700;">⏳ Em Andamento</span>`;
        if (t.status === 'concluida') {
            tagStatus = `<span style="color:var(--cor-sucesso); font-weight:700;">✓ Concluída</span>`;
        } else if (t.status === 'aguardando_aprovacao') {
            tagStatus = `<span style="color:var(--cor-alerta); font-weight:700;">⏳ Aguardando Aprovação</span>`;
        }

        cacheTimelineOperacionalDia.push({
            colabId: t.assumido_por,
            participantes: participantesIds,
            tipo: 'tarefa',
            dataHora: dataEvt,
            horaStr: horaStr,
            tagStatus: tagStatus,
            texto: `<strong>${esc(t.titulo)}</strong><span>${tipoParticipacao} · Responsável: ${esc(quem)}</span>${infoAjudantes}<span>${tempoTexto.trim()}</span>`,
            avatarStackHTML: stackHTML
        });
    });

    cacheTimelineOperacionalDia.sort((a, b) => b.dataHora - a.dataHora);
    const filtroAtual = selFiltroColab?.value || 'todos';
    window.filtrarHistoricoDiarioPorColab(filtroAtual);
};

window.filtrarHistoricoDiarioPorColab = function(colabId) {
    const containerHistorico = document.getElementById('lista-historico-diario');
    if (!containerHistorico) return;

    let itens = cacheTimelineOperacionalDia || [];
    if (colabId && colabId !== 'todos') {
        itens = itens.filter(item => {
            if (item.colabId === colabId) return true;
            if (Array.isArray(item.participantes) && item.participantes.includes(colabId)) return true;
            return false;
        });
    }

    containerHistorico.innerHTML = '';
    if (itens.length === 0) {
        containerHistorico.innerHTML = '<p class="status-texto" style="font-size:12px; text-align:center; padding:18px 0;">Nenhuma atividade registrada neste filtro entre as 06:00 e as 23:30.</p>';
        return;
    }

    itens.forEach(item => {
        const div = document.createElement('div');
        div.className = 'linha-tempo-item';

        if (item.tipo === 'entrada_ponto' || item.tipo === 'saida_ponto') {
            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; flex:1;">
                    ${item.avatarStackHTML}
                    <div>${item.texto}</div>
                </div>
                <div style="font-size:11px; white-space:nowrap; text-align:right; font-weight:700; color:var(--cor-primaria);">${item.horaStr}</div>
            `;
        } else {
            div.classList.add('linha-tempo-tarefa');
            div.innerHTML = `
                <div class="linha-tempo-tarefa-corpo">${item.avatarStackHTML}<div>${item.texto}</div></div>
                <div class="linha-tempo-tarefa-status">${item.tagStatus} · ${item.horaStr}</div>
            `;
        }
        containerHistorico.appendChild(div);
    });
};

// ------------------ MODAL DE MENSAGEM DIRETA ------------------
window.abrirModalMensagemDireta = function(destId, destNome) {
    document.getElementById('msg-direta-destinatario-id').value = destId;
    document.getElementById('msg-direta-destinatario-nome').textContent = destNome;
    document.getElementById('input-texto-msg-direta').value = '';
    document.getElementById('modal-enviar-mensagem-direta')?.classList.remove('oculto');
};

window.fecharModalMensagemDireta = function() {
    document.getElementById('modal-enviar-mensagem-direta')?.classList.add('oculto');
};

window.confirmarEnvioMensagemDireta = async function() {
    const destId = document.getElementById('msg-direta-destinatario-id')?.value;
    const destNome = document.getElementById('msg-direta-destinatario-nome')?.textContent || 'Colaborador';
    const texto = document.getElementById('input-texto-msg-direta')?.value.trim();

    if (!destId || !texto) return window.mostrarToast("Digite uma mensagem.", "erro");

    const titulo = `Mensagem Direta para ${destNome}`;
    const payload = {
        titulo: titulo,
        mensagem: texto,
        setor_destino: 'todos',
        destinado_a: destId,
        criado_por: usuarioAtual.id,
        empresa_id: empresaAtualId,
        lidos_por: []
    };

    const { error } = await cliente.from('avisos').insert([payload]);

    if (error) {
        window.mostrarToast("Erro ao enviar: " + error.message, "erro");
    } else {
        window.mostrarToast(`Mensagem enviada com sucesso para ${destNome}!`);
        window.fecharModalMensagemDireta();
        window.carregarAvisos();
    }
};

window.enviarMensagemDiretaWhatsApp = function() {
    const destId = document.getElementById('msg-direta-destinatario-id')?.value;
    const texto = document.getElementById('input-texto-msg-direta')?.value.trim();
    if (!destId || !texto) return window.mostrarToast("Digite o texto da mensagem.", "erro");

    const colab = mapaPerfis[destId];
    if (!colab || !colab.telefone_whatsapp) {
        return window.mostrarToast("Este colaborador não tem WhatsApp cadastrado.", "erro");
    }

    const numLimpo = colab.telefone_whatsapp.replace(/\D/g, '');
    const numFinal = numLimpo.startsWith('55') ? numLimpo : '55' + numLimpo;
    window.open(`https://wa.me/${numFinal}?text=${encodeURIComponent(texto)}`, '_blank');
    window.fecharModalMensagemDireta();
};

// ------------------ MURAL DE AVISOS COM EMPRESA_ID ------------------
window.criarAviso = async function() {
    const titulo = document.getElementById('input-titulo-aviso')?.value;
    const mensagem = document.getElementById('input-msg-aviso')?.value;
    const setor = document.getElementById('select-setor-aviso')?.value;

    if(!titulo || !titulo.trim() || !mensagem || !mensagem.trim()) return window.mostrarToast("Preencha o título e a mensagem.", "erro");
    
    const payload = {
        titulo: titulo,
        mensagem: mensagem,
        setor_destino: setor,
        criado_por: usuarioAtual.id,
        empresa_id: empresaAtualId,
        lidos_por: []
    };

    await cliente.from('avisos').insert([payload]);
    document.getElementById('input-titulo-aviso').value = '';
    document.getElementById('input-msg-aviso').value = '';
    document.getElementById('form-novo-aviso')?.classList.add('oculto');
    if (typeof window.toggleFormAviso === 'function') {
        const btn = document.getElementById('btn-toggle-form-aviso');
        if (btn) { btn.textContent = '+ Publicar'; btn.classList.remove('btn-toggle-aberto'); }
    }
    window.mostrarToast("Aviso publicado no mural!");
    window.carregarAvisos();
};

window.apagarAviso = async function(id) {
    if(confirm("Retirar aviso do ar?")) { 
        await cliente.from('avisos').delete().eq('id', id); 
        window.mostrarToast("Aviso removido.");
        window.carregarAvisos(); 
    }
};

window.marcarAvisoLido = async function(id) {
    const { data, error } = await cliente.from('avisos').select('lidos_por').eq('id', id).single();
    if (error || !data) return;

    let listaLidos = Array.isArray(data.lidos_por) ? [...data.lidos_por] : [];
    if (!listaLidos.includes(usuarioAtual.id)) {
        listaLidos.push(usuarioAtual.id);
        const payloadOffline = { id: id, lidos_por: listaLidos };

        await window.executarOuOffline('aviso_leitura', payloadOffline, () => cliente.from('avisos').update({ lidos_por: listaLidos }).eq('id', id));

        window.somIniciarTarefa();
        window.mostrarToast("Leitura confirmada!");
        window.carregarAvisos();
    }
};

window.carregarAvisos = async function() {
    const limite12h = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    let query = cliente.from('avisos').select('*').gte('criado_em', limite12h);
    if (empresaAtualId) {
        query = query.eq('empresa_id', empresaAtualId);
    }
    const { data, error } = await query.order('criado_em', { ascending: false });
    if (error) return;

    cacheAvisos = data || []; 
    const setorUsuario = perfilAtual?.setor || 'frente';
    const listaAvisosEl = document.getElementById('lista-avisos');
    if(!listaAvisosEl) return;
    
    if (cacheAvisos.length === 0) { 
        listaAvisosEl.innerHTML = '<p class="status-texto" style="text-align: center;">Mural Limpo.</p>'; 
        return; 
    }

    listaAvisosEl.innerHTML = '';
    cacheAvisos.forEach(aviso => {
        const temPermissaoGerencial = perfilAtual?.is_admin || perfilAtual?.is_socio || perfilAtual?.is_gerente;
        const paraMimDireto = aviso.destinado_a === usuarioAtual.id;
        const paraMeuSetor = (aviso.setor_destino === 'todos' || aviso.setor_destino === setorUsuario || temPermissaoGerencial || paraMimDireto);
        if (!paraMeuSetor) return;

        const card = document.createElement('div');
        card.className = 'cartao-lista cartao-aviso';
        const dataAviso = new Date(aviso.criado_em).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        
        let tagDestino = aviso.setor_destino === 'todos' ? 'Geral' : (aviso.setor_destino.charAt(0).toUpperCase() + aviso.setor_destino.slice(1));
        if (aviso.destinado_a) {
            tagDestino = `Direto para ${window.obterNomeColaborador(aviso.destinado_a, 'Você')}`;
        }

        const lidosArr = Array.isArray(aviso.lidos_por) ? aviso.lidos_por : [];
        let blocoLeituraGeral = '';
        if (lidosArr.length > 0) {
            const nomesLidos = lidosArr.map(id => window.obterNomeColaborador(id, 'Alguém')).join(', ');
            blocoLeituraGeral = `<div class="info-leitura" style="font-size:10px; color:var(--texto-suave); margin-top:4px;">LIDO POR: <span style="color:var(--cor-texto);">${esc(nomesLidos)}</span></div>`;
        } else {
            blocoLeituraGeral = `<div class="info-leitura" style="font-size:10px; color:var(--texto-suave); margin-top:4px;">Ninguém confirmou leitura ainda.</div>`;
        }

        let blocoAprovacaoHTML = '';
        if (aviso.tarefa_autonoma_id && temPermissaoGerencial) {
            blocoAprovacaoHTML = `
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin: 8px 0;">
                    <button class="btn-acao btn-concluir" style="flex:1; padding:6px; font-size:11px;" onclick="window.aprovarTarefaAutonoma('${aviso.tarefa_autonoma_id}', '${aviso.id}')">✓ Aprovar</button>
                    <button class="btn-acao btn-iniciar" style="flex:1.2; padding:6px; font-size:11px;" onclick="window.transformarTarefaAutonomaEmRotina('${aviso.tarefa_autonoma_id}', '${aviso.id}')">🔁 Tornar Rotina</button>
                    <button class="btn-acao btn-erro" style="flex:1; padding:6px; font-size:11px; margin-top:0;" onclick="window.reprovarTarefaAutonoma('${aviso.tarefa_autonoma_id}', '${aviso.id}')">✕ Reprovar</button>
                </div>
            `;
        }

        let blocoDiariaFreelanceHTML = '';
        if (aviso.ponto_freelance_id && temPermissaoGerencial) {
            blocoDiariaFreelanceHTML = `
                <div style="display:flex; gap:6px; margin: 8px 0;">
                    <button class="btn-acao btn-concluir" style="flex:1; padding:6px; font-size:11px;" onclick="window.aprovarDiariaFreelancer('${aviso.ponto_freelance_id}', '${aviso.id}')">✓ Aprovar Diária</button>
                    <button class="btn-acao btn-erro" style="flex:1; padding:6px; font-size:11px;" onclick="window.reprovarDiariaFreelancer('${aviso.ponto_freelance_id}', '${aviso.id}')">✕ Reprovar Diária</button>
                </div>
            `;
        }

        let btnAcaoUsuario = '';
        const jaLeu = lidosArr.includes(usuarioAtual.id);
        if (!jaLeu && !aviso.tarefa_autonoma_id && !aviso.ponto_freelance_id) {
            btnAcaoUsuario = `<button class="btn-acao" style="background:var(--cor-sucesso); margin-bottom: 6px;" onclick="window.marcarAvisoLido('${aviso.id}')">✓ Mensagem Lida</button>`;
        }

        let controlesAdminHTML = '';
        if (temPermissaoGerencial && !aviso.tarefa_autonoma_id && !aviso.ponto_freelance_id) {
            controlesAdminHTML = `<div class="controles-admin" style="margin-top:6px;"><button class="btn-admin-tarefa btn-apagar" style="background:none; border:none; color:var(--cor-erro); cursor:pointer; font-size:11px; font-weight:700;" onclick="window.apagarAviso('${aviso.id}')">Excluir Aviso</button></div>`;
        }

        card.innerHTML = `
            <div class="aviso-titulo" style="font-weight:700; margin-bottom:4px;">${esc(aviso.titulo)} <span class="tag-setor" style="font-size:9px; background:var(--cor-primaria); color:#fff; padding:2px 6px; border-radius:4px;">${esc(tagDestino)}</span></div>
            <div class="aviso-msg" style="font-size:12px; margin-bottom:6px;">${esc(aviso.mensagem)}</div>
            ${blocoAprovacaoHTML}
            ${blocoDiariaFreelanceHTML}
            <div style="font-size: 10px; color: var(--texto-suave); font-weight: 700; text-align: right; margin-bottom: 6px;">Postado às ${dataAviso}</div>
            ${btnAcaoUsuario}
            ${blocoLeituraGeral}
            ${controlesAdminHTML}
        `;
        listaAvisosEl.appendChild(card);
    });

    const painelAoVivoEl = document.getElementById('conteudo-painel-ao-vivo');
    if (painelAoVivoEl && !painelAoVivoEl.classList.contains('oculto')) {
        window.carregarPainelAoVivo();
    }
};
