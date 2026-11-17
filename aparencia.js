// Preferência visual independente da sessão.
(() => {
    const chave = 'suiri:aparencia';
    const sistema = window.matchMedia('(prefers-color-scheme: dark)');
    let preferencia = 'sistema';
    try { preferencia = localStorage.getItem(chave) || 'sistema'; } catch {}
    function aplicar() {
        const escuro = preferencia === 'escuro' || (preferencia === 'sistema' && sistema.matches);
        document.documentElement.dataset.theme = escuro ? 'dark' : 'light';
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = escuro ? '#10141e' : '#f1f3f8';
    }
    aplicar();
    sistema.addEventListener('change', aplicar);
    document.addEventListener('DOMContentLoaded', () => {
        const seletor = document.getElementById('tema-interface');
        seletor.value = preferencia;
        seletor.addEventListener('change', () => {
            preferencia = seletor.value;
            try { localStorage.setItem(chave, preferencia); } catch {}
            aplicar();
        });
    });
})();
