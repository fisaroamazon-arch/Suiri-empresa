(() => {
    'use strict';

    const bucket = 'sistema-imagens';
    const padraoArquivo = /^avatar_[0-9a-f-]{36}_[0-9]+\.(webp|png)$/i;
    const links = new Map();
    let identidade;

    function arquivoAvatar(valor) {
        if (typeof valor !== 'string') return null;
        if (valor.startsWith(bucket + ':')) {
            const nome = valor.slice(bucket.length + 1);
            return padraoArquivo.test(nome) ? nome : null;
        }
        try {
            const url = new URL(valor);
            const prefixo = '/storage/v1/object/public/' + bucket + '/';
            if (url.origin !== SUPABASE_URL || !url.pathname.startsWith(prefixo)) return null;
            const nome = decodeURIComponent(url.pathname.slice(prefixo.length));
            return padraoArquivo.test(nome) ? nome : null;
        } catch {
            return null;
        }
    }

    function sessao() {
        return usuarioAtual?.id && empresaAtualId ? usuarioAtual.id + ':' + empresaAtualId : null;
    }

    window.urlAvatarSuiri = valor => {
        if (!valor) return null;
        const nome = arquivoAvatar(valor);
        if (!nome) return /^https:\/\//i.test(valor) ? valor : null;
        if (identidade !== sessao()) return null;
        const link = links.get(nome);
        return link?.expira > Date.now() ? link.url : null;
    };

    window.prepararAvataresSuiri = async perfis => {
        const atual = sessao();
        if (identidade !== atual) {
            identidade = atual;
            links.clear();
        }
        if (!atual || !cliente?.storage) return;
        const nomes = [...new Set(perfis.map(p => arquivoAvatar(p?.avatar_url)).filter(Boolean))]
            .filter(nome => !(links.get(nome)?.expira > Date.now() + 60000));
        if (!nomes.length) return;
        try {
            const expira = Date.now() + 30 * 60000;
            const {data, error} = await cliente.storage.from(bucket).createSignedUrls(nomes, 1800);
            if (error || identidade !== atual || sessao() !== atual) return;
            for (const item of data || []) {
                if (item.signedUrl && !item.error) links.set(item.path, {url:item.signedUrl, expira});
            }
        } catch (erro) {
            console.warn('Não foi possível carregar os avatares.', erro.message);
        }
    };
})();
