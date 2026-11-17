# Suiri Empresa V4.1 — visual Suiri restaurado

Esta atualização usa a identidade visual do site de referência enviado: https://fisaroamazon-arch.github.io/Suiri-empresa/ . Foram reaproveitados a logo e o estilo original da faixa de marca, com azul, roxo e verde-água. A camada visual foi adaptada às telas e funções da V4.

## Para atualizar pelo celular

1. Extraia este ZIP.
2. Envie todo o conteúdo da pasta principal ao mesmo repositório do site. O index.html continua na raiz publicada. Inclua marca-suiri.png, marca.css, visual-suiri.css, visual-suiri.js e o sw.js atualizado, além dos arquivos restantes.
3. Recarregue o site no Chrome. Se usa o aplicativo instalado, feche e abra novamente após a atualização do site. A indicação V4.1 aparece ao final de Ajustes.

**Se a V4 já está funcionando, não execute SQL novamente para esta mudança visual.** As pastas banco e os instaladores continuam no pacote para quem ainda não concluiu a instalação original.

## O que mudou

- Logo original Suiri com assinatura Empresa na entrada e no cabeçalho.
- Faixa e botões com os degradês da referência.
- Ícones vetoriais na barra inferior, nos cartões e nos atalhos.
- Claro/escuro com fundos e campos consistentes, mantendo a preferência da V4.
- Aparência aplicada às telas de clientes, fornecedores, vendas, recebimentos e configurações.
- Espaçamentos e tipografia compactos para celular.

## Preservação das funções

Os arquivos app-core.js, app-operacional.js, app-gestao.js, app-empresa.js e cardapio-original.js são os mesmos do ZIP V4 mais recente recebido nesta sessão. A pasta banco foi preservada. A atualização acrescenta uma camada de apresentação e atualiza o carregamento dos arquivos visuais e o cache do aplicativo. A navegação inferior, os gestos e as permissões continuam sendo controlados pela V4.

Os testes de integração da interface passaram com a nova camada: cadastro, permissões, clientes/fornecedores, venda, recebimento parcial, importação, relatórios, ponto e fila offline. O layout foi conferido em navegador com dados fictícios em quadros de 320, 390 e 760 pixels. Não houve publicação no seu GitHub nem alteração no Supabase real.
