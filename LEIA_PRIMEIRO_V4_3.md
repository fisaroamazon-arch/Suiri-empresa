# Suiri Empresa V4.3

## Atualizar pelo celular

1. Faça backup do projeto e do banco. Se a sua empresa já usa a V4.2 com o banco configurado, abra o **SQL Editor** no mesmo projeto do Supabase e execute todo o arquivo `banco/02_CONSUMO_APROVACOES.sql`. Em uma instalação nova, execute primeiro `banco/01_ATUALIZACAO.sql`, seguindo o guia original.
2. Extraia o ZIP. Envie o conteúdo da pasta **Suiri Empresas** ao seu site, com `index.html` na raiz publicada. Inclua `app-consumo.js`, `sw.js` e a pasta `vendor`. A pasta `banco` é para o SQL Editor e a pasta `validacao` é para testes. Ambas podem ficar fora do site publicado.
3. Reabra o site atualizado e confira **V4.3** em **Ajustes**. Para testar a câmera, abra o site por HTTPS e conceda acesso à câmera no navegador.

## Testar com uma conta de colaborador e outra de gestão

1. Em **Missão → Meu consumo**, digite um item que ainda não está no cardápio. Para duas unidades a R$ 6,50, o total exibido é R$ 9,10. Envie a solicitação e confira **Minhas solicitações**.
2. Entre com a conta de administrador, gerente ou sócio. Abra o **sino no topo**. Confira ou ajuste o preço unitário e a quantidade. Depois escolha **Aprovar** ou **Recusar**. O contador mostra as pendências da própria empresa.
3. A aprovação lança o valor com o desconto de 30% no perfil do colaborador e ensina o item ao cardápio. O lançamento financeiro usa a data da aprovação. A solicitação guarda a data da compra. Se o nome já estiver cadastrado, o preço oficial é preservado. Para mudar o preço oficial, use o cardápio da gestão.
4. Quando o item já existe no cardápio e o preço coincide, o consumo é contabilizado na hora. Se o aparelho estiver offline, o envio é retomado ao reconectar.

## Conferir o leitor

Abra **Gestão → Contas a pagar → Nova conta → Usar câmera**. Enquadre o código de barras do boleto ou selecione **Pix** para capturar um QR Code Pix. Também é possível colar a linha digitável. Confira os dados da conta e salve. Use **Copiar código** para pagar no aplicativo do banco. Depois, use **Marcar como paga** para atualizar o controle no Suiri.

## Validação local

Os testes usam dados fictícios. Foram testados lançamento, aprovação e recusa, desconto, acesso por cargo e empresa, sincronização offline, catálogo e leitura de um código ITF de 44 dígitos pela biblioteca do aplicativo. A câmera, incluindo sua permissão e liberação, foi testada por simulação. A validação em aparelho físico e no Supabase publicado ainda está pendente.
