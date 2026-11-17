# Suiri Empresa V4.2 — confirmação de exclusão corrigida

## Atualização pelo celular

1. Extraia o ZIP e envie o conteúdo da pasta Suiri Empresas ao repositório, com index.html diretamente na raiz publicada. Preserve a pasta vendor.
2. Atualize todos os arquivos do site, incluindo app-empresa.js, visual-suiri.css, visual-suiri.js, index.html e sw.js. A V4.2 aparece ao final de Ajustes.
3. Abra novamente o site. Para excluir a empresa, use Ajustes > Excluir empresa e todos os acessos. A nova confirmação fica dentro da página.

**Não precisa executar outro SQL para esta correção.** As funções existentes no banco continuam sendo utilizadas. A pasta banco é idêntica à da V4.1. Se houver falha de permissão, vínculo, fotos ou servidor, a mensagem será exibida na própria confirmação.

## O que foi corrigido

A confirmação anterior usava prompt e exigia a frase inteira EXCLUIR seguida do CNPJ. Digitar somente o CNPJ, mesmo correto, fechava a janela sem mensagem e não iniciava a exclusão.

Agora a empresa é confirmada pelo CNPJ, com ou sem pontuação. O sistema mostra nome e CNPJ antes de executar. Número incorreto mantém a janela aberta e não consulta o servidor. A exclusão de conta pessoal continua exigindo EXCLUIR MINHA CONTA, aceitando maiúsculas/minúsculas e espaços repetidos.

A janela mostra o andamento, bloqueia envio duplo e permanece aberta quando o servidor recusa a operação. Os controles só são liberados ao terminar a solicitação. O fluxo usa as mesmas funções de arquivos e exclusão no Supabase, sem remover as verificações de autorização. O último administrador continua precisando transferir a administração para excluir somente a própria conta.

## Validação

Os testes de integração usam PostgreSQL em memória e dados fictícios: CNPJ incorreto sem RPC, cancelamento sem RPC, CNPJ com pontuação, mensagem de erro persistente, falhas de arquivos, envio duplo, bloqueio do último administrador, exclusão da própria conta e exclusão da empresa preservando outra empresa. A suíte das funções anteriores também passou.

A confirmação foi conferida em navegador em quadros de 320 e 390 pixels, nos temas claro e escuro, sem transbordamento horizontal. A prévia do navegador usa um adaptador fictício que não acompanha este ZIP. Nenhuma conta real foi excluída nos testes. O repositório publicado não foi alterado por esta entrega.
