/* Suiri Empresa 4.1: presentation only. Data, permissions and routes belong to the V4 modules. */
(() => {
    'use strict';
    const paths = {
        operacao:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
        painel:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5"/>',
        gestao:'<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M3 12q9 5 18 0"/>',
        relatorios:'<path d="M4 4v16h17M8 15v-3m5 3V8m5 7v-5"/>',
        admin:'<path d="M12 3l8 3v6c0 5-5 8-8 10-3-2-8-5-8-10V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
        perfil:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
        configuracoes:'<path d="M3 7h5m4 0h9M3 17h11m4 0h3"/><circle cx="10" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
        aviso:'<path d="m4 10 14-6v16L4 14zM7 15l1 6h4l-2-5M21 9v6"/>',
        tarefas:'<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 3h8v4H8zM8 12l1 1 2-2M14 12h3M8 17l1 1 2-2M14 17h3"/>',
        compras:'<path d="M3 4h2l2 12h12l2-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
        pagar:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
        receber:'<path d="M5 16 17 4M8 4h9v9M4 21h16"/>',
        caixa:'<path d="M5 8h14l2 12H3zM8 8V4h8v4M8 16h8M12 13v6"/>',
        cardapio:'<path d="M12 5c-3-2-6-2-10 0v15c4-2 7-2 10 0 3-2 6-2 10 0V5c-4-2-7-2-10 0zM12 5v15M5 8h3M5 12h3M16 8h3M16 12h3"/>',
        empresa:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 21v-5h6v5"/>'
    };
    const icon = nome => '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(paths[nome] || paths.gestao)+'</svg>';
    function replaceLeadingSymbol(el,nome,classe='pictograma') {
        if(!el || el.querySelector(':scope > .'+classe))return;
        const texto=[...el.childNodes].find(n=>n.nodeType===3 && n.textContent.trim());
        if(texto)texto.textContent=texto.textContent.replace(/^[^\p{L}\p{N}]+/u,'');
        el.insertAdjacentHTML('afterbegin','<span class="'+classe+'" aria-hidden="true">'+icon(nome)+'</span>');
    }
    function decorateNavigation() {
        document.querySelectorAll('#suiri-nav [data-tela-suiri]').forEach(btn=>{
            const target=btn.querySelector('span:first-child');
            if(target){target.classList.add('suiri-nav-icon');target.innerHTML=icon(btn.dataset.telaSuiri);}
        });
    }
    const drawNav=window.suiriDesenharNav;
    if(typeof drawNav==='function')window.suiriDesenharNav=function(...args){const out=drawNav.apply(this,args);decorateNavigation();return out;};
    function decorateCommercial() {
        const tipos=['receber','operacao','painel'];
        document.querySelectorAll('.suiri-kpis > div').forEach((card,i)=>{
            if(!card.querySelector('.suiri-kpi-icone'))card.insertAdjacentHTML('afterbegin','<span class="suiri-kpi-icone" aria-hidden="true">'+icon(tipos[i])+'</span>');
        });
        document.querySelectorAll('.suiri-vazio > span:first-child').forEach(el=>el.innerHTML=icon(el.closest('#suiri-contatos-lista')?'painel':'receber'));
    }
    const renderCommercial=window.suiriRenderComercial;
    if(typeof renderCommercial==='function')window.suiriRenderComercial=function(...args){const out=renderCommercial.apply(this,args);decorateCommercial();return out;};

    // Keep V4's theme preference and both selectors in sync. No authentication state is changed.
    const applyTheme=window.aplicarTemaSuiri;
    window.aplicarTemaSuiri=function(preferencia){
        applyTheme(preferencia);
        document.documentElement.dataset.theme=document.documentElement.dataset.tema==='escuro'?'dark':'light';
        const atual=localStorage.getItem('suiri_tema') || 'sistema';
        for(const id of ['tema-interface','suiri-tema']){const select=document.getElementById(id);if(select)select.value=atual;}
        document.querySelector('meta[name="theme-color"]').content=document.documentElement.dataset.tema==='escuro'?'#10141e':'#f1f3f8';
    };
    window.aplicarTemaSuiri(localStorage.getItem('suiri_tema')||localStorage.getItem('suiri:aparencia')||'sistema');
    const dialog=document.getElementById('config-visual');
    let previousFocus;
    document.getElementById('abrir-aparencia-login')?.addEventListener('click',()=>{
        previousFocus=document.activeElement;
        try{dialog.showModal();}catch{dialog.setAttribute('open','');dialog.classList.add('suiri-dialog-fallback');}
    });
    document.getElementById('fechar-aparencia-login')?.addEventListener('click',()=>{
        try{dialog.close();}catch{dialog.removeAttribute('open');}
        dialog.classList.remove('suiri-dialog-fallback');previousFocus?.focus();
    });
    document.getElementById('tema-interface')?.addEventListener('change',e=>window.aplicarTemaSuiri(e.target.value));
    document.getElementById('abrir-ajustes-marca')?.addEventListener('click',()=>window.alternarTelas('configuracoes'));
    const titulos = [
        ['.cartao-ponto > h3','operacao'],['#secao-quadro-avisos h3','aviso'],['#secao-tarefas h3','tarefas'],
        ['#suiri-bloco-compras h3','compras'],['#suiri-bloco-pagar h3','pagar'],['#suiri-bloco-caixa h3','caixa'],
        ['#cartao-financeiro-gerencial h3','pagar'],['#conteudo-admin h3','admin'],
        ['#conteudo-painel-ao-vivo h3','painel'],['#conteudo-relatorios h3','relatorios']
    ];
    document.querySelectorAll('#conteudo-operacional h3').forEach(el=>{if(el.textContent.includes('Reposição'))replaceLeadingSymbol(el,'compras');else if(el.textContent.includes('Consumo Rápido'))replaceLeadingSymbol(el,'cardapio');});
    titulos.forEach(([selector,tipo])=>document.querySelectorAll(selector).forEach(el=>replaceLeadingSymbol(el,tipo)));
    document.querySelectorAll('[data-atalho-suiri]').forEach(el=>replaceLeadingSymbol(el,el.dataset.atalhoSuiri,'suiri-inline-icon'));
    document.querySelectorAll('[data-suiri-catalogo]').forEach(el=>{if(el.closest('.suiri-atalhos'))replaceLeadingSymbol(el,'cardapio','suiri-inline-icon');});
    document.querySelectorAll('[data-comercial-tab]').forEach(el=>replaceLeadingSymbol(el,el.dataset.comercialTab==='receber'?'receber':'painel','suiri-inline-icon'));
    const config=document.querySelector('#conteudo-configuracoes > section');
    if(config){
        config.insertAdjacentHTML('beforeend','<p class="suiri-assinatura-rodape">Suiri Empresa <span>V4.1</span></p>');
        replaceLeadingSymbol(config.querySelector('h2'),'configuracoes');
    }
    decorateNavigation();decorateCommercial();
})();
