(() => {
    'use strict';
    const nativo = window.SuiriAndroidNative;
    if (!nativo) return;

    let ordem = 0;
    const pendentes = new Map();
    window.suiriResultadoNativo = (id, resultado) => {
        pendentes.get(id)?.(resultado);
        pendentes.delete(id);
    };
    window.suiriAndroid = {
        site: 'https://fisaroamazon-arch.github.io/Suiri-empresa/',
        permitirNotificacoes() {
            return new Promise(resolve => {
                const id = String(++ordem);
                pendentes.set(id, resolve);
                nativo.requestNotifications(id);
            });
        },
        async notificarDetalhes(novas) {
            nativo.notifyDetails(JSON.stringify(novas.map(item => ({
                id: String(item.id), titulo: String(item.titulo ?? ''), detalhe: String(item.detalhe ?? '')
            }))));
        },
        async limparNotificacoes() { nativo.clearNotifications(); },
        async salvarArquivo(blob, nome, tipo) {
            const dados = await new Promise((resolve, reject) => {
                const leitor = new FileReader();
                leitor.onload = () => resolve(leitor.result.split(',')[1]);
                leitor.onerror = () => reject(leitor.error);
                leitor.readAsDataURL(blob);
            });
            return nativo.saveFile(dados, nome, tipo);
        }
    };

    window.addEventListener('suiri-android-notificacoes', () => {
        if (!document.getElementById('tela-app')?.classList.contains('oculto')) {
            document.getElementById('abrir-alertas')?.click();
            return;
        }
        const tela = document.getElementById('tela-app');
        if (!tela) return;
        const observar = new MutationObserver(() => {
            if (tela.classList.contains('oculto')) return;
            observar.disconnect();
            document.getElementById('abrir-alertas')?.click();
        });
        observar.observe(tela, {attributes: true, attributeFilter: ['class']});
    });

    const abrir = window.open.bind(window);
    window.open = (url, alvo, recursos) => {
        if (alvo === '_blank' && typeof url === 'string' && url.startsWith('https://')) {
            nativo.open(url);
            return null;
        }
        return abrir(url, alvo, recursos);
    };

    window.suiriTratarVoltarAndroid = () => {
        const dialogo = [...document.querySelectorAll('dialog[open]')].at(-1);
        if (dialogo) {
            const fechar = [...dialogo.querySelectorAll('button')].find(botao => botao.getAttribute('aria-label')?.startsWith('Fechar'));
            if (fechar) fechar.click();
            else dialogo.close();
            return true;
        }
        const modal = [...document.querySelectorAll('.modal-overlay:not(.oculto)')].filter(elemento => elemento.getClientRects().length).at(-1);
        if (modal) {
            modal.querySelector('[data-fechar-suiri], button[onclick*="fecharModal"], #btn-cancelar-onboarding-cnpj')?.click();
            return true;
        }
        const tela = document.getElementById('tela-app');
        const guia = document.querySelector('#suiri-nav [aria-current="page"]');
        if (tela && !tela.classList.contains('oculto') && guia && guia.dataset.telaSuiri !== 'operacao') {
            window.alternarTelas?.('operacao');
            return true;
        }
        return false;
    };

    const cor = () => nativo.palette(document.documentElement.dataset.tema === 'escuro');
    new MutationObserver(cor).observe(document.documentElement, {attributes:true, attributeFilter:['data-tema']});
    cor();
    document.addEventListener('DOMContentLoaded', () => nativo.ready(), {once:true});
})();
