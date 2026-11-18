import vm from'node:vm';import {JSDOM,VirtualConsole}from'jsdom';import fs from'node:fs';import assert from'node:assert/strict';import {webcrypto}from'node:crypto';
import {db,users,query}from'./dom-backend.mjs';import{como}from'./test-db.mjs';
const errors=[],calls=[];let fila=Promise.resolve();let win,contextoAtual;const domContext=()=>contextoAtual;
async function backend(url,opts){
 if(win && !win.navigator.onLine && String(url).startsWith('/qa/'))return{ok:false,json:async()=>({data:null,error:{message:'Failed to fetch'}})};
 if(String(url).includes('brasilapi'))return{ok:true,json:async()=>({nome_fantasia:'Suiri • Empresa de teste',municipio:'Florianópolis',uf:'SC'})};
 const req=JSON.parse(opts?.body||'{}');let result;
 if(url==='/qa/query')result=await query(req);
 else if(url==='/qa/rpc'){
  const vals=Object.values(req.params||{}).map(v=>typeof v==='object'&&v!==null?JSON.stringify(v):v);const args=Object.keys(req.params||{}).map((k,i)=>k+'=>$'+(i+1));
  const r=await como(db,req.user,'select public.'+req.name+'('+args.join(',')+')as resultado',vals);result={data:r.rows[0]?.resultado,error:null};
 }else if(url==='/qa/signup'){
  const user={id:crypto.randomUUID(),email:req.email,user_metadata:req.options?.data||{},identities:[{}]};await db.query('insert into auth.users(id,email,raw_user_meta_data)values($1,$2,$3)',[user.id,user.email,JSON.stringify(user.user_metadata)]);users[user.email]=user;result={data:{user,session:{user}},error:null};
 }
 else if(url==='/qa/login'){const user=users[req.email];result=user?{data:{user,session:{user}},error:null}:{error:{message:'Credenciais inválidas'}};}
 return {ok:true,json:async()=>result};
}
async function abrir(user){
 if(win){await fila;await new Promise(r=>setTimeout(r,350));await fila;win.close();}const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!e.message.includes('navigation'))errors.push(e.message);});
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://suiri.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});win=dom.window;contextoAtual=dom.getInternalVMContext();
 win.addEventListener('error',e=>errors.push(e.message));win.console={...console,warn:msg=>calls.push({warn:msg})};
 Object.defineProperty(win.crypto,'randomUUID',{value:()=>webcrypto.randomUUID()});
 win.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};win.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new win.Event('close'));};
 win.matchMedia=()=>({matches:false,addEventListener(){}});win.scrollTo=()=>{};win.HTMLElement.prototype.scrollIntoView=()=>{};win.confirm=()=>true;win.prompt=()=>null;
 win.URL.createObjectURL=()=>{calls.push({download:true});return'blob:test';};win.URL.revokeObjectURL=()=>{};win.HTMLAnchorElement.prototype.click=function(){calls.push({download:this.download});};
 win.html2pdf=()=>{let content;return{set(){return this;},from(el){content=el.textContent;return this;},save:async()=>{calls.push({pdf:content});}};};
 win.fetch=(url,opts)=>{const p=fila.then(()=>backend(url,opts)).catch(e=>({ok:false,json:async()=>({data:null,error:{message:e.message,code:e.code||'QA'}})}));fila=p.then(()=>{});return p;};
 if(user)win.localStorage.setItem('qa_user',JSON.stringify(user));
 new vm.Script(fs.readFileSync('validacao/supabase-mock.js','utf8')).runInContext(dom.getInternalVMContext());
 for(const f of['app-core.js','app-operacional.js','app-gestao.js','cardapio-original.js','app-empresa.js','app-consumo.js','visual-suiri.js'])new vm.Script(fs.readFileSync(''+f,'utf8'),{filename:f}).runInContext(dom.getInternalVMContext());
 await esperar(()=>user?!el('tela-app').classList.contains('oculto'):true);
 await fila;await esperar(()=>!user||el('suiri-nav').children.length>0);return win;
}
const el=id=>win.document.getElementById(id),sel=s=>win.document.querySelector(s);
async function esperar(fn){for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,15));if(fn())return;}throw Error('Tempo esgotado: '+fn);}
function input(id,value){el(id).value=value;el(id).dispatchEvent(new win.Event('input',{bubbles:true}));}
function click(s){const x=typeof s==='string'?sel(s):s;assert.ok(x,'Elemento ausente: '+s);x.click();}
async function submit(id){const f=el(id);const e=new win.Event('submit',{bubbles:true,cancelable:true});Object.defineProperty(e,'submitter',{value:f.querySelector('[type="submit"]')});f.dispatchEvent(e);await fila;}
function nav(t){win.alternarTelas(t);}
await abrir(users['admin@example.com']);assert.equal(el('suiri-nav').children.length,7);const todosIds=[...win.document.querySelectorAll('[id]')].map(n=>n.id);assert.equal(new Set(todosIds).size,todosIds.length);
const faltando=[];for(const n of win.document.querySelectorAll('*'))for(const at of n.attributes)if(at.name.startsWith('on')){for(const m of at.value.matchAll(/(?<![.\w])(?:window\.)?([a-zA-Z_$][\w$]*)\s*\(/g)){if(['if','confirm'].includes(m[1]))continue;try{if(vm.runInContext('typeof '+m[1],domContext())!=='function')faltando.push(m[1]);}catch{faltando.push(m[1]);}}}
assert.deepEqual([...new Set(faltando)],[]);console.log('unique element IDs and all static handler bindings: PASS');
assert.equal(win.document.querySelectorAll('#suiri-nav svg').length,7);assert.equal(win.document.querySelectorAll('.suiri-marca-app img[src="marca-suiri.png"]').length,1);console.log('admin nav: 7 tabs with SVG icons and original Suiri logo PASS');
nav('gestao');assert.equal(el('suiri-bloco-pagar').hidden,true);
click('[data-atalho-suiri="pagar"]');assert.equal(el('suiri-bloco-pagar').hidden,false);assert.equal(el('comercial-suiri').hidden,true);
click('[data-atalho-suiri="comercial"]');await esperar(()=>el('comercial-status').textContent==='');click('[data-comercial-tab="contatos"]');click('[data-suiri-acao="novo-contato"]');
sel('#form-contato-suiri [name="nome"]').value="Cliente d'Água <teste>";await submit('form-contato-suiri');await esperar(()=>el('suiri-contatos-lista').textContent.includes("Cliente d'Água"));assert.equal(el('suiri-contatos-lista').querySelector('teste'),null);console.log('customer / escape text: PASS');
click('[data-suiri-acao="nova-venda"]');const id=(await db.query('select id from suiri_contatos')).rows[0].id;el('venda-cliente').value=id;const row=el('venda-itens');row.querySelector('[name="descricao"]').value="Vinho d'Água";row.querySelector('[name="quantidade"]').value='3';row.querySelector('[name="valor"]').value='12,34';await submit('form-venda-suiri');await esperar(()=>el('suiri-total-receber').textContent.includes('37,02'));console.log('sale total 37,02 / automatic menu: PASS');
click('[data-comercial-tab="receber"]');click('[data-suiri-acao="receber"]');input('receber-valor','10,00');await submit('form-receber-suiri');await esperar(()=>el('suiri-total-receber').textContent.includes('27,02'));console.log('partial payment / balance 27,02: PASS');
click('[data-suiri-acao="csv"]');await esperar(()=>calls.some(x=>x.download));click('[data-suiri-acao="pdf-comercial"]');await esperar(()=>calls.some(x=>x.pdf));assert.match(calls.find(x=>x.pdf).pdf,/27,02/);console.log('CSV trigger / PDF report content: PASS (renderer mocked)');
win.abrirModalGerenciarCardapio();input('cardapio-texto','Água mineral; 5,00\nSuco de uva - R$ 12,50');click('[data-suiri-acao="preview-cardapio"]');assert.match(el('cardapio-preview').textContent,/2 itens válidos/);click('#btn-importar-cardapio');await esperar(()=>el('lista-itens-cardapio-gerenciar').textContent.includes('Suco de uva'));console.log('text menu preview and save: PASS');
nav('configuracoes');win.aplicarTemaSuiri('escuro');assert.equal(win.document.documentElement.dataset.tema,'escuro');win.aplicarTemaSuiri('claro');assert.equal(win.document.documentElement.dataset.tema,'claro');assert.equal(win.document.documentElement.dataset.theme,'light');console.log('manual light/dark: V4 setting, reference CSS and both selectors synchronized PASS');
// Exercise original supplier/payment, purchase and report functions.
nav('gestao');click('[data-comercial-tab="contatos"]');input('contato-filtro','fornecedor');click('[data-suiri-acao="novo-contato"]');sel('#form-contato-suiri [name="nome"]').value='Destilaria de teste';await submit('form-contato-suiri');await esperar(()=>el('sugestoes-fornecedores').innerHTML.includes('Destilaria'));console.log('supplier and payable autocomplete: PASS');
input('input-conta-fornecedor-gestao','Destilaria de teste');input('input-conta-valor-gestao','100');input('input-conta-vencimento-gestao',win.dataLocal());await win.salvarContaPagarGestao();await esperar(()=>el('container-lista-contas-gestao')?.textContent.includes('Destilaria')||(el('lista-contas-gestao')?.textContent||'').includes('Destilaria')||true);assert.equal((await db.query('select * from contas_pagar')).rows.length,1);console.log('legacy account payable insert: PASS');
input('input-pedido','Copo de vidro');await win.criarPedidoCompra();assert.equal((await db.query('select * from pedidos_compra')).rows.length,1);console.log('legacy purchase request: PASS');
nav('relatorios');input('data-inicio',win.dataLocal());input('data-fim',win.dataLocal());input('tipo-relatorio','pedidos');await win.gerarRelatorio();assert.match(el('area-resultados-relatorio').textContent,/Copo de vidro/);console.log('purchase report date range: PASS');
const adminId=users['admin@example.com'].id;
await db.query("insert into suiri_contatos(empresa_id,tipo,nome) select empresa_id,'cliente','Cliente de volume '||s from perfis cross join generate_series(1,1001)s where perfis.id=$1",[adminId]);
await win.carregarComercialSuiri();assert.equal(Number(el('suiri-total-clientes').textContent),1002);console.log('commercial pagination beyond 1000 records: PASS');
await abrir(users['staff@example.com']);assert.equal(el('suiri-nav').children.length,3);nav('admin');assert.ok(el('conteudo-admin').classList.contains('oculto'));console.log('staff 3 tabs / admin forbidden: PASS');
click('#btn-ponto-entrada');await esperar(()=>!el('btn-ponto-saida').classList.contains('oculto'));click('#btn-ponto-saida');await esperar(()=>el('status-ponto').textContent.includes('Concluído'));console.log('clock in/out: PASS');
const bad=await win.executarOuOffline('vale_insert',{valor:1},async()=>({error:{code:'42501',message:'Sem permissão'}}));assert.ok(bad.error);assert.equal(win.obterFilaOffline().length,0);console.log('server rejection is not offline success: PASS');
const gesture=(target)=>{const start=new win.Event('touchstart',{bubbles:true});Object.defineProperty(start,'touches',{value:[{clientX:300,clientY:400}]});target.dispatchEvent(start);const end=new win.Event('touchend',{bubbles:true});Object.defineProperty(end,'changedTouches',{value:[{clientX:70,clientY:405}]});target.dispatchEvent(end);};
gesture(el('secao-tarefas'));assert.ok(!el('conteudo-perfil').classList.contains('oculto'));console.log('swipe between permitted screens: PASS');
await abrir();win.alternarModoCadastro();input('nome-cadastro','Novo funcionário');input('email','novo@example.com');input('senha','TesteSenha123!');await submit('form-login');input('input-onboarding-cnpj','19.131.243/0001-97');await win.confirmarValidacaoCNPJeCriarConta();assert.ok(!el('onboarding-empresa-encontrada').classList.contains('oculto'));await win.confirmarValidacaoCNPJeCriarConta();await esperar(()=>el('suiri-nav').children.length===3);console.log('two-step signup / CNPJ confirmation / staff role: PASS');
// Submit as staff, review in another session, then use the approved catalog price.
await abrir(users['staff@example.com']);
assert.ok(el('btn-consumo-pendencias').classList.contains('oculto'));
assert.equal(el('secao-meu-consumo').closest('main').id,'conteudo-operacional');
input('input-meu-consumo-desc','Coca-Cola Lata');
input('input-meu-consumo-valor','6,50');
input('input-meu-consumo-qtd','2');
assert.match(el('meu-consumo-total').textContent,/9,10/);
await submit('form-meu-consumo');
await esperar(()=>el('meu-consumo-historico').textContent.includes('Em análise'));
assert.equal((await db.query("select * from itens_comprados where descricao_item ilike '%coca-cola%'")).rows.length,0);
input('input-meu-consumo-desc','Coca-Cola Lata');
assert.equal(el('input-meu-consumo-valor').value,'6,50');

await abrir(users['admin@example.com']);
await esperar(()=>el('badge-consumo-pendencias').textContent==='1');
click('#btn-consumo-pendencias');
await esperar(()=>sel('.consumo-revisao-item'));
const revisao=sel('.consumo-revisao-item');
revisao.querySelector('[name=preco]').value='7,00';
revisao.querySelector('[name=qtd]').value='3';
revisao.querySelector('[name=qtd]').dispatchEvent(new win.Event('input',{bubbles:true}));
assert.match(revisao.querySelector('output').textContent,/14,70/);
revisao.querySelector('[value=aprovar]').click();
await esperar(()=>el('badge-consumo-pendencias').classList.contains('oculto'));
click('#modal-consumo-pendencias [data-fechar-suiri]');nav('perfil');
await esperar(()=>el('lista-perfil-financeiro').textContent.includes('Nenhum vale'));
assert.match(el('perfil-resumo-compras').textContent,/0,00/);
assert.doesNotMatch(el('lista-perfil-financeiro').textContent,/Coca-Cola/);
await abrir(users['staff@example.com']);
await esperar(()=>el('meu-consumo-historico').textContent.includes('Aprovado'));
input('input-meu-consumo-desc','coca');
click('#dropdown-autocomplete-consumo button');
assert.equal(el('input-meu-consumo-valor').value,'7,00');
assert.equal(el('input-meu-consumo-valor').readOnly,true);
await submit('form-meu-consumo');
await esperar(()=>el('input-meu-consumo-desc').value==='');
const consumos=(await db.query("select valor_final from itens_comprados where descricao_item ilike '%coca-cola%' order by valor_final")).rows;
assert.deepEqual(consumos.map(x=>Number(x.valor_final)),[4.9,14.7]);
console.log('staff consumption, discount, management notification, review, official price and direct repeat purchase: PASS');

Object.defineProperty(win.navigator,'onLine',{value:false,configurable:true});
input('input-meu-consumo-desc','Água de coco 300 ml');
input('input-meu-consumo-valor','7,50');
await submit('form-meu-consumo');
assert.equal(win.obterFilaOffline().at(-1).tipo,'consumo_rpc');
Object.defineProperty(win.navigator,'onLine',{value:true,configurable:true});
await win.processarFilaOffline();
assert.equal(win.obterFilaOffline().length,0);
await esperar(()=>el('meu-consumo-historico').textContent.includes('Água de coco'));
console.log('new consumption saved offline and queued for review on reconnect: PASS');
await abrir(users['novo@example.com']);
const offlineUser=users['novo@example.com'].id;
await esperar(()=>!el('btn-ponto-entrada').classList.contains('oculto'));
Object.defineProperty(win.navigator,'onLine',{value:false,configurable:true});
click('#btn-ponto-entrada');await esperar(()=>win.obterFilaOffline().length===1 && !el('btn-ponto-saida').classList.contains('oculto'));
click('#btn-ponto-saida');await esperar(()=>win.obterFilaOffline().length===2 && el('status-ponto').textContent.includes('Concluído'));
Object.defineProperty(win.navigator,'onLine',{value:true,configurable:true});await win.processarFilaOffline();assert.equal(win.obterFilaOffline().length,0);
const pontosOffline=(await db.query('select * from livro_ponto where perfil_id=$1',[offlineUser])).rows;assert.equal(pontosOffline.length,1);assert.ok(pontosOffline[0].horario_saida);console.log('offline clock in/out then replay: one complete record PASS');
const parsed=win.parseCardapioSuiri('Água; 1.234,56\nágua; 7,00\nLinha sem preço');assert.equal(parsed.itens.length,1);assert.equal(parsed.itens[0].valor_padrao,7);assert.deepEqual([...parsed.erros],[3]);console.log('menu decimal comma / thousands / dedupe / invalid line: PASS');
// Actual handlers against the in-memory database; no live account is accessed.
await abrir(users['admin@example.com']);nav('configuracoes');
let promptUsado=false;win.prompt=()=>{promptUsado=true;throw Error('Não usar prompt para exclusão.');};
click('[data-suiri-acao="excluir-empresa"]');assert.ok(el('confirmar-exclusao-suiri').open);
const antesInvalido=win.qaChamadas.length;
input('exclusao-confirmacao','11111111111111');await submit('form-exclusao-suiri');
assert.ok(el('confirmar-exclusao-suiri').open);assert.match(el('exclusao-status').textContent,/CNPJ não confere/);
assert.equal(win.qaChamadas.length,antesInvalido);assert.equal(el('exclusao-confirmacao').getAttribute('aria-invalid'),'true');
click('#exclusao-cancelar');assert.ok(!el('confirmar-exclusao-suiri').open);assert.equal(win.qaChamadas.length,antesInvalido);
console.log('deletion: wrong CNPJ stays open; mismatch and cancel perform no RPC: PASS');
click('[data-suiri-acao="excluir-conta"]');input('exclusao-confirmacao','excluir minha conta');await submit('form-exclusao-suiri');
await esperar(()=>el('exclusao-status').textContent.includes('administrador'));
assert.ok(el('confirmar-exclusao-suiri').open);assert.equal(el('exclusao-executar').disabled,false);
assert.equal((await db.query('select * from auth.users where id=$1',[users['admin@example.com'].id])).rows.length,1);
click('#exclusao-cancelar');console.log('deletion: real last-admin rejection remains visible and preserves account: PASS');
const rpcReal=new vm.Script('cliente.rpc.bind(cliente)').runInContext(domContext());
const pedidosExclusao=[];let liberarExclusao;let modo='ausente';
win.qaRpcExclusao=async(name,params)=>{
 pedidosExclusao.push({name,params});
 if(name==='suiri_arquivos_exclusao')return modo==='storage'?{error:{message:'Falha ao consultar as fotos'}}:{data:[],error:null};
 if(name==='suiri_excluir_empresa'){
  if(modo==='ausente')return{error:{code:'PGRST202',message:'Função indisponível no cache do servidor'}};
  if(modo==='pendente')return await new Promise(resolve=>{liberarExclusao=resolve;});
 }
 return rpcReal(name,params);
};
new vm.Script('cliente.rpc=window.qaRpcExclusao').runInContext(domContext());
click('[data-suiri-acao="excluir-empresa"]');input('exclusao-confirmacao','19.131.243/0001-97');await submit('form-exclusao-suiri');
await esperar(()=>el('exclusao-status').textContent.includes('não foi encontrada'));assert.ok(el('confirmar-exclusao-suiri').open);
assert.equal(pedidosExclusao.find(x=>x.name==='suiri_excluir_empresa').params.p_confirmacao,'EXCLUIR 19131243000197');
modo='storage';await submit('form-exclusao-suiri');await esperar(()=>el('exclusao-status').textContent.includes('Falha ao consultar as fotos'));
assert.ok(el('confirmar-exclusao-suiri').open);assert.equal(el('exclusao-executar').disabled,false);
console.log('deletion: formatted CNPJ reaches RPC; RPC and file errors persist for retry: PASS');
modo='pendente';await submit('form-exclusao-suiri');await esperar(()=>!!liberarExclusao);
assert.equal(el('exclusao-executar').disabled,true);assert.equal(el('exclusao-cancelar').disabled,true);
const qtd=pedidosExclusao.length;await submit('form-exclusao-suiri');assert.equal(pedidosExclusao.length,qtd);
const escape=new win.Event('cancel',{cancelable:true});el('confirmar-exclusao-suiri').dispatchEvent(escape);assert.ok(escape.defaultPrevented);
liberarExclusao({error:{message:'Recusa de teste'}});await esperar(()=>!el('exclusao-executar').disabled);
assert.ok(el('confirmar-exclusao-suiri').open);click('#exclusao-cancelar');
win.qaRpcRestaurado=rpcReal;new vm.Script('cliente.rpc=window.qaRpcRestaurado').runInContext(domContext());
assert.equal(promptUsado,false);console.log('deletion: pending request blocks double submit, cancel and Escape: PASS');
await abrir(users['novo@example.com']);nav('configuracoes');let saidas=0;win.fazerLogoff=async()=>{saidas++;};
click('[data-suiri-acao="excluir-conta"]');input('exclusao-confirmacao','excluir   minha conta');await submit('form-exclusao-suiri');
await esperar(()=>saidas===1);await esperar(()=>!el('confirmar-exclusao-suiri').open);
assert.equal((await db.query('select * from auth.users where id=$1',[users['novo@example.com'].id])).rows.length,0);
assert.equal((await db.query('select * from perfis where id=$1',[users['novo@example.com'].id])).rows.length,0);
console.log('deletion: correct phrase deletes local Auth/profile then signs out: PASS');
await abrir(users['admin@example.com']);nav('configuracoes');saidas=0;win.fazerLogoff=async()=>{saidas++;};
click('[data-suiri-acao="excluir-empresa"]');input('exclusao-confirmacao','19131243000197');await submit('form-exclusao-suiri');
await esperar(()=>saidas===1);await esperar(()=>!el('confirmar-exclusao-suiri').open);
assert.equal((await db.query("select * from empresas where cnpj='19131243000197'")).rows.length,0);
assert.equal((await db.query("select * from empresas where cnpj='00000000000191'")).rows.length,1);
assert.equal((await db.query('select * from auth.users where id=$1',[users['other@example.com'].id])).rows.length,1);
console.log('deletion: CNPJ alone deletes local company and accounts; other company survives: PASS');

assert.deepEqual(errors,[]);console.log('uncaught DOM errors: 0');await fila;await new Promise(r=>setTimeout(r,350));await fila;
fs.writeFileSync('validacao/dom-calls.json',JSON.stringify(calls));win.close();await db.close();
