# Testes reproduzíveis

Para desenvolvimento em computador/CI, a partir da pasta principal extraída:

```bash
npm install --prefix validacao
node validacao/test-db.mjs
node validacao/test-extra.mjs
node validacao/test-consumo.mjs
node validacao/test-camera.mjs
node validacao/test-dom.mjs
node validacao/test-mobile.mjs
node validacao/test-repair-copy.mjs
```

Não é necessário executar estes testes no celular para usar o aplicativo. Eles usam somente dados fictícios em memória e não acessam o banco real. O adaptador de DOM substitui autenticação, consulta CNPJ, Storage e gerador de PDF. O SQL e as políticas são executados em PGlite/PostgreSQL; a renderização em navegador e os serviços reais não são testados por este conjunto.
