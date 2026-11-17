> **V4.1 visual:** se a V4 já está funcionando, basta atualizar os arquivos do site. Não execute SQL novamente por causa do visual. Leia primeiro LEIA_PRIMEIRO_V4_1.md.

# Suiri Empresas V4 — atualização completa

O pacote contém o sistema completo, incluindo arquivos originais, novos módulos, bibliotecas e atualização do banco. A interface depende do SQL desta versão: trocar apenas os arquivos do site não ativa os novos cadastros, recebimentos e exclusões.

## Como aplicar usando o celular

1. Extraia o ZIP. Guarde o arquivo anterior e uma cópia dos dados do banco.
2. No Chrome, entre em https://supabase.com/dashboard no **mesmo projeto que o Suiri já utiliza**. Se precisar, ative “Site para computador” no menu do Chrome.
3. Abra o **SQL Editor**. Execute `banco/00_DIAGNOSTICO.sql`, que somente consulta informações. Confira os membros que estão como administradores: o código anterior dava esse cargo a todo novo cadastro. A atualização preserva os cargos existentes para não retirar um acesso legítimo por engano.
4. No celular, abra **INSTALAR_SQL_NO_CELULAR.html**. Ele apresenta sete etapas: seis envios pequenos e uma aplicação final. Copie e execute um bloco por vez em uma consulta nova no SQL Editor, apagando o bloco anterior antes de colar o próximo. Avance somente quando aparecer o resultado esperado, sem erro. A última etapa confere se todos os blocos chegaram completos e aplica o mesmo SQL V4 de uma só vez. O arquivo único `banco/01_ATUALIZACAO.sql` continua disponível para editores que aceitam a cópia completa.
5. Se houver erro, pare nessa etapa e guarde a mensagem. A atualização é transacional: um erro desfaz a operação inteira. Se aparecerem registros sem empresa ou CNPJs repetidos, eles precisam ser identificados corretamente antes de repetir. O script não escolhe uma empresa aleatória.
6. Depois do SQL concluído, envie **todo o conteúdo da pasta extraída** ao repositório do site. `index.html` precisa ficar na raiz publicada. Inclua `vendor`, `wellknown`, `.well-known` e todos os arquivos `app-*.js`. Não envie apenas o ZIP ao GitHub Pages.
7. Abra o site e recarregue. Entre novamente. Se a versão antiga continuar aparecendo, feche o aplicativo instalado e atualize pelo Chrome. Limpar dados do site apaga filas offline locais: confira as pendências antes.
8. Em **Admin**, revise os cargos antigos. Use uma empresa e usuários de teste para conferir o fluxo antes de excluir contas importantes.

A conexão Supabase que veio no projeto foi mantida. Não coloque uma chave `service_role` no HTML ou JavaScript.

## Onde estão as funções

| Função | Caminho |
|---|---|
| Tarefas, avisos e ponto | Missão |
| Acompanhamento da equipe | Equipe, conforme permissão |
| Clientes e fornecedores | Gestão → Clientes e fornecedores |
| Vender a um cliente | Gestão → Nova venda |
| Receber uma parte ou quitar | Gestão → Contas a receber → Registrar recebimento |
| Histórico de um cliente | Gestão → Clientes → Histórico |
| Contas a pagar | Gestão → atalho Contas a pagar |
| Cardápio | Gestão → Cardápio ou Admin → Gerenciar itens |
| Importar texto/TXT/CSV | Cardápio → Importar cardápio por texto ou arquivo |
| Alterar cargos | Admin → escolher membro → Salvar alterações |
| Excluir outro membro | Admin → escolher membro → Excluir este membro |
| Excluir seu login | Ajustes → Excluir minha conta |
| Excluir toda a empresa | Ajustes → Excluir empresa e todos os acessos, somente administrador |
| Modo claro/escuro | Ajustes → Aparência |
| Ativar/desativar gestos | Ajustes → Deslizar entre as telas |

As abas continuam na barra inferior. Deslizar para a esquerda abre a próxima aba permitida; para a direita, a anterior. Campos, botões, modais e áreas de rolagem horizontal não iniciam a troca por gesto. No acesso básico aparecem Missão, Perfil e Ajustes.

## Cadastro por CNPJ

Primeiro são informados nome, e-mail e senha de pelo menos oito caracteres. Não há escolha de cargo nem de setor nessa tela. Depois é aberto o CNPJ; o sistema consulta a BrasilAPI e mostra a empresa encontrada para confirmação.

Na criação da conta, um gatilho do banco vincula a pessoa e reserva o cargo correto, inclusive quando o e-mail ainda precisa de confirmação. A primeira conta criada para um CNPJ sem membros fica como administradora; os seguintes entram como funcionários sem permissões administrativas. Essa decisão acontece no banco e protege contra dois cadastros simultâneos virarem administradores. O setor inicial é Frente e pode ser alterado pela gestão.

Se o Supabase exigir confirmação de e-mail, o acesso só é liberado depois da confirmação. O cargo da primeira conta já fica reservado, mesmo que outra pessoa confirme o e-mail antes. Em Authentication → URL Configuration, mantenha o endereço publicado do site entre os redirecionamentos permitidos para confirmação e recuperação de senha. Uma conta antiga sem empresa pode usar “Vincular minha conta” na entrada.

CNPJ público não comprova vínculo empregatício: conforme o fluxo solicitado, quem souber o número pode se cadastrar como membro básico. Não foi acrescentado um convite obrigatório. Administradores podem remover membros indevidos.

## Clientes, vendas e recebimentos

Cadastre o cliente, registre os produtos/serviços, quantidade, preço, data e vencimento. A venda entra como conta a receber; registre o dinheiro recebido separadamente. Pagamentos parciais diminuem o saldo, e a quitação acontece quando o saldo chega a zero. Vencimentos anteriores ao dia atual aparecem em atraso.

Há filtros por cliente, situação, busca e período da venda. CSV e PDF respeitam esses filtros. O histórico inclui os itens vendidos e os recebimentos. Estornos exigem administrador e motivo; os registros permanecem no histórico. Uma venda só pode ser cancelada depois de estornar seus recebimentos. Arquivar cliente ou fornecedor preserva o histórico.

O recebimento não é integrado automaticamente ao fechamento de caixa antigo. Registre o caixa conforme o procedimento da empresa; isso evita contar o mesmo dinheiro duas vezes. Este módulo é um controle gerencial de vendas e recebimentos, sem emissão fiscal ou cobrança bancária automática.

## Cardápio e aprendizado

Digite ou envie um TXT/CSV com uma linha por item:

```text
Água mineral; 5,00
Suco de uva - R$ 12,50
Café; 6.00
```

Revise o texto e corrija as linhas indicadas antes de importar. O limite é de 500 itens por envio e 1 MB por arquivo. Não é um importador de PDF, foto ou planilha XLSX. CSVs com cabeçalho devem ter o cabeçalho removido. Itens repetidos no mesmo texto usam a última ocorrência. A opção de atualizar preços existentes fica desmarcada por padrão.

Novos produtos de vendas e novos itens lançados pela gestão no consumo são aprendidos automaticamente. O aprendizado acrescenta nomes novos; ele não muda silenciosamente os preços existentes. Consumo de funcionário usa o catálogo da própria empresa.

O cardápio original do Sabor da Costa foi preservado no botão “Carregar cardápio original”. Ele precisa ser revisado e importado na empresa correta; não é mais inserido automaticamente nas empresas de outras pessoas. Os preços preservados são os do ZIP recebido, sem atualização externa.

As tarefas concluídas mantêm registros de execução. Ao reiniciar uma rotina, o histórico continua disponível para relatórios e cálculo do tempo médio. A estimativa operacional usa as últimas 1.000 execuções carregadas; relatórios e financeiro comercial consultam os dados em páginas para não truncar no primeiro lote do servidor.

## Exclusões

Excluir um membro remove seu login, perfil, ponto, vales, consumo e tarefas autônomas pessoais. Fotos do aplicativo são removidas pela API de arquivos; atribuições e participações nas rotinas são desvinculadas. Vendas, recebimentos, fornecedores, contas a pagar e caixa da empresa permanecem. O administrador pode excluir outro membro, inclusive outro administrador, desde que reste pelo menos um administrador.

Excluir a própria conta segue a mesma regra. O último administrador precisa promover outra pessoa antes ou escolher excluir toda a empresa.

Excluir a empresa pede a frase `EXCLUIR` seguida do CNPJ mostrado. A função apaga os dados do aplicativo daquela empresa e os logins dos membros vinculados. O modelo atual tem uma empresa por login. Dados de outras empresas ficam protegidos. Exclusão de contas precisa de internet.

A remoção dos arquivos de foto acontece antes da transação do banco. Se houver uma falha posterior, a transação preserva a conta, mas fotos já removidas não são restauradas automaticamente. Arquivos de outros aplicativos/buckets e dependências externas ao ZIP podem exigir tratamento adicional no projeto real; um impedimento é exibido como erro, sem anunciar exclusão bem-sucedida.

## Offline e instalação

Depois de entrar e carregar o sistema com internet, ponto e ações compatíveis podem ser guardados no aparelho e sincronizados ao reconectar. Entrada e saída offline são reconciliadas no mesmo registro. A fila é separada por usuário e empresa; falhas de permissão não são tratadas como sucesso offline. Vendas, recebimentos e exclusões exigem conexão.

As filas da versão antiga foram preservadas, mas não são enviadas automaticamente: elas não identificavam o dono das ações. Reabrir o aplicativo totalmente offline ainda pode exigir voltar à internet para autenticar/carregar o perfil. Arquivos estáticos podem ser guardados pelo aplicativo instalado; isso não é uma cópia offline completa do banco.

O convite de instalação aparece quando o navegador disponibiliza essa opção. A instalação do site não habilita notificações push.

## Limites da validação realizada

Foram executados testes de banco PostgreSQL embarcado (PGlite) e testes de integração da interface em DOM simulado (JSDOM), usando dados fictícios. O relatório completo está em `ANALISE_E_VALIDACAO.md` e os testes reproduzíveis em `validacao`.

Não houve alteração no Supabase real, publicação no GitHub, criação de usuários reais ou exclusão real de contas. Não havia sessão administrativa do seu banco nem seu esquema SQL no ZIP. Confirmação de e-mail, políticas/triggers antigos, limpeza real de Storage, câmera, instalação em Android e aparência final no navegador precisam ser conferidos no ambiente publicado. O conteúdo do relatório PDF foi validado; a renderização e o download reais não foram executados nesta sessão.

## Erro de cópia incompleta no SQL

Se aparecer `unterminated dollar-quoted string`, uma função chegou sem o fechamento completo. Não complete apenas com `$$`: pode faltar uma parte inteira do código. Abra uma consulta nova e use o instalador em blocos. Ele não altera as funções do aplicativo durante os seis envios; a alteração efetiva só ocorre na etapa final, após conferir a integridade do texto. Se faltar uma parte ou a cópia estiver alterada, a aplicação é recusada.

## Recuperar somente a etapa 7

Se os seis envios chegaram, mas a conferência final recusou o texto, execute `banco/RECUPERAR_ETAPA_7.sql` em uma consulta nova. O script reaproveita as partes já salvas. Ele aceita diferenças de recuo e de quebra de linha, mas compara o resultado com a versão canônica conhecida antes de executar. Não se trata de remover a validação. O comando inicial ROLLBACK encerra uma eventual transação falha da tentativa anterior.

O instalador HTML possui “Ir direto à etapa 7”. Se a nova conferência ainda recusar o arquivo, execute `banco/celular/08_DIAGNOSTICAR_ENVIOS.sql`. Essa consulta é somente leitura e mostra quais envios estão OK, ausentes ou precisam ser repetidos. Reenvie somente os indicados e tente a etapa 7 novamente.
