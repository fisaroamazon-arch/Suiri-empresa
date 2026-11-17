# Análise e validação — Suiri Empresas V4

Base examinada: o ZIP “Suiri Empresas.zip” anexado nesta conversa. A revisão foi feita sobre esses arquivos; não foi usado outro ZIP anterior como base. Data: 17/11/2026.

## Principais problemas encontrados e tratamento

| Ponto | Situação encontrada | Alteração |
|---|---|---|
| Cadastro | `is_admin: true` em toda nova conta, inclusive empresa existente | Vínculo autenticado e transacional no banco; primeiro membro administrador, próximos funcionários |
| Cargo na entrada | Seleção de setor no cadastro | Cadastro pessoal simplificado; gestão define setor depois |
| Confirmação de e-mail | Perfil criado pelo navegador mesmo sem sessão confirmada | Vinculação no servidor durante cadastro e reserva do primeiro administrador, com acesso após confirmação |
| Segurança entre empresas | Várias consultas sem filtro de empresa e sem SQL de RLS no pacote | Filtros explícitos no cliente e políticas de isolamento no SQL |
| Escalada de acesso | Proteção dependente da interface | Guardas no banco contra alteração indevida de cargo, empresa e dados de terceiros |
| Exclusão de funcionário | Botão somente na inspeção, RPC sem implementação no ZIP | Acesso também na Administração, novas funções com autorização, proteção do último administrador e preservação comercial |
| Exclusão de empresa/conta | Não havia fluxo completo no projeto recebido | Ações em Ajustes, confirmação explícita, tratamento de fotos e transações no banco |
| Cardápio | Catálogo fixo do Sabor da Costa misturado ao de qualquer empresa | Catálogo por empresa, original preservado como importação opcional |
| Importação/aprendizado | Sem importação por texto e sem aprendizado persistente de novos itens | Revisão de TXT/CSV/texto, preços controlados e aprendizado por venda/consumo gerencial |
| Clientes/recebíveis | Ausentes | Clientes, fornecedores, vendas, histórico, recebimentos parciais, atraso, estorno e cancelamento |
| Relatórios | Compras ignoravam período escolhido; erros podiam parecer lista vazia | Período respeitado, falhas explícitas, consulta paginada, CSV/PDF comercial |
| Histórico operacional | Tarefa avulsa era apagada na conclusão; rotina sobrescrevia execução anterior | Histórico persistente, conclusão preservada, reinício autorizado no servidor |
| Offline | Fila global entre logins e saída tratada como upsert incompleto | Fila por usuário/empresa, operações identificadas, saída atualiza entrada correspondente |
| Aviso de diária | Dependia de envio online pelo navegador | Aviso gerado no banco após a saída, inclusive sincronização posterior |
| Leitura de aviso | Leitores concorrentes podiam sobrescrever a lista | Inclusão de leitura no servidor com bloqueio de linha |
| Datas | Dia obtido por UTC podia avançar antes da meia-noite no Brasil | Datas locais na interface; rotinas e validação financeira em America/Sao_Paulo |
| Navegação | Botões de acesso desapareciam conforme a tela | Barra inferior persistente, permissões respeitadas e gestos opcionais |
| Aparência | Tema seguia apenas o aparelho | Claro, escuro e sistema em Ajustes; cartões compactos, indicadores e atalhos |
| Senha | Ação administrativa tentava senha universal 1234 | Recuperação pelo e-mail do titular; validação de oito caracteres em novas senhas |
| Dependências | Bibliotecas de execução dependiam de CDN flutuante | Cópias locais com versão registrada em vendor/VERSOES.json |
| Instalação | Cartão sem eventos completos de instalação | Eventos de instalação conectados, sem promessa de notificações |
| Android/Netlify | Redirecionamento apontava para `wellknown` inexistente | Cópia correspondente incluída, associação original preservada |

## Evidências automatizadas

Os resultados completos das execuções estão em `validacao/RESULTADOS.txt`. Dados e usuários de teste são fictícios. A migração foi executada em PostgreSQL embarcado; a interface foi executada com o banco através de um adaptador de testes, sem chamadas a contas de produção.

| Área | Resultado |
|---|---|
| Sintaxe de todos os scripts do aplicativo | Aprovada |
| Migração inicial e repetição | Aprovadas |
| Empresa com identificador UUID e bigint | Aprovadas nos modelos de teste |
| Primeiro membro/admin e membros seguintes/funcionários | Aprovado |
| Bloqueio de autopromoção e de acesso a outra empresa | Aprovado |
| Proteção do último administrador | Aprovada |
| Cadastro de cliente e fornecedor, inclusive nome com apóstrofo e sinais de HTML | Aprovado |
| Venda, cálculo em centavos e aprendizado do item | Aprovados |
| Recebimento parcial e saldo | Aprovados |
| Reenvio da mesma operação sem duplicação | Aprovado |
| Bloqueio de recebimento maior que o saldo | Aprovado |
| Estorno e cancelamento com histórico | Aprovados |
| Importar sem alterar preços / importar atualizando preços | Aprovados |
| Mensagem direta e leitura autorizada | Aprovadas |
| Exclusão de membro e preservação comercial | Aprovadas |
| Exclusão de empresa isolada das demais | Aprovada em dados fictícios |
| Dados antigos ambíguos | Migração abortou sem perda dos registros no teste |
| Tarefas, conclusão e arquivo de execução | Aprovados |
| Aviso automático de diária | Aprovado |
| Ponto online e entrada/saída offline com sincronização única | Aprovados |
| Navegação de administrador e funcionário / gesto horizontal | Aprovados em DOM simulado |
| CSV e conteúdo HTML para PDF | Aprovados; gerador PDF substituído por adaptador no teste |
| Tema claro/escuro | Estado e troca aprovados em DOM; aparência visual depende de conferência no navegador |

A revisão não é uma garantia de que 100% dos fluxos estejam corretos em qualquer esquema ou dispositivo. Permanecem pendentes a instalação da migração e a validação no Supabase do usuário. Os testes não simulam toda a infraestrutura Auth/Storage do Supabase nem concorrência real entre conexões independentes.

## Conferência no ambiente publicado

Use registros de teste para verificar: primeiro e segundo cadastros de um mesmo CNPJ; confirmação e recuperação por e-mail; limitações do funcionário; promoção autorizada; fornecedor e conta a pagar; venda com dois recebimentos; relatório; consumo; tarefa recorrente; saída de freelancer; câmera de código; instalação; imagem de perfil; exclusão de membro; e, por último, exclusão da empresa de teste.

Revise os administradores antigos e os triggers mostrados por `00_DIAGNOSTICO.sql`. Os novos fluxos não usam os antigos RPCs de exclusão/reset; a migração revoga seus acessos. Funções adicionais existentes no banco, que não aparecem no ZIP, precisam de auditoria própria.

## Fontes técnicas consultadas

- Supabase, gerenciamento de usuários: https://supabase.com/docs/guides/auth/managing-user-data
- Supabase, políticas de acesso por linha: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase, eventos de autenticação: https://supabase.com/docs/reference/javascript/auth-onauthstatechange
- Supabase, funções e privilégios: https://supabase.com/docs/guides/database/functions
- BrasilAPI, especificação de CNPJ: https://github.com/BrasilAPI/BrasilAPI/blob/main/pages/docs/doc/cnpj.json

## Ajuste da instalação pelo celular

O SQL original completo contém 56.741 bytes. A mensagem enviada pelo usuário terminou no meio de `proteger_registro`, antes do delimitador de fechamento. Foi acrescentado um instalador com seis envios de até 10.742 caracteres e uma aplicação final. O conteúdo é exatamente o SQL anterior, sem os comandos externos de BEGIN/COMMIT, executado dentro de uma única transação no último passo. A tabela temporária de montagem fica em um esquema privado, com acessos de anon/authenticated revogados, e é removida após o sucesso.

Testes locais adicionais: partes ausentes recusadas sem alteração do esquema do aplicativo; conteúdo adulterado recusado por checksum; instalação completa; reserva do primeiro administrador no gatilho Auth; repetição em banco V4 preservando membros; e interface offline das sete etapas com igualdade do texto copiado. Não houve execução no banco real.

## Recuperação de diferenças de formatação

A conferência inicial exigia igualdade de todos os caracteres e podia recusar recuos ou quebras de linha alterados na colagem. A etapa final agora aceita o arquivo literal original ou uma forma canônica de conteúdo conhecido: CRLF/CR são convertidos para LF, e espaços/tabulações no início/fim das linhas são removidos. O texto canônico só é executado se seu checksum coincidir com o esperado. A proteção contra conteúdo diferente permanece.

Testes locais: recuperação do arquivo literal, CRLF, recuos, combinação dos dois, recuperação após transação abortada, preservação da atribuição de cargos no gatilho Auth, recusa de alteração real, identificação apenas do envio alterado e retomada direta da etapa 7 pela interface. A situação exata dos seis textos no banco do usuário não foi consultada.
