import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {criarBanco,como}from'./test-db.mjs';
export const db=await criarBanco();
await db.exec(fs.readFileSync('banco/02_CONSUMO_APROVACOES.sql','utf8'));
export const users={};
for(const [nome,email]of [['Administrador','admin@example.com'],['Funcionária','staff@example.com'],['Outra empresa','other@example.com']]){
 const id=crypto.randomUUID();await db.query('insert into auth.users(id,email)values($1,$2)',[id,email]);users[email]={id,email,user_metadata:{nome,suiri_cnpj:email.startsWith('other')?'00000000000191':'19131243000197',suiri_empresa:{nome_fantasia:email.startsWith('other')?'Outra empresa':'Suiri • Empresa de teste'}},identities:[{}]};
 await como(db,id,'select suiri_vincular_empresa($1,$2,$3)',[users[email].user_metadata.suiri_cnpj,nome,JSON.stringify(users[email].user_metadata.suiri_empresa)]);
}
const root=path.resolve('work/Suiri Empresas');let fila=Promise.resolve();
const escId=s=>{if(!/^[a-z_][a-z0-9_]*$/i.test(s))throw Error('Identificador inválido');return '"'+s+'"';};
const normalizar=r=>r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Date?((k.startsWith('data_')||k==='vencimento'||k==='ultimo_reinicio')?v.toISOString().slice(0,10):v.toISOString()):v])));
export async function query(req){
 const {table,method='select',args=[],filters=[],orders=[],limit,single}=req;const params=[];const add=v=>{params.push(v);return '$'+params.length;};
 const where=[];
 for(const f of filters){
  if(f.type==='or'){
   const ors=f.value.split(',').map(x=>{const [c,o,...val]=x.split('.');return escId(c)+(o==='is'?' is '+val.join('.'):' = '+add(val.join('.')));});where.push('('+ors.join(' or ')+')');
  }else if(f.type==='in')where.push(escId(f.col)+'=any('+add(f.value)+')');
  else if(f.type==='is')where.push(escId(f.col)+' is '+(f.value===null?'null':f.value===true?'true':'false'));
  else where.push(escId(f.col)+({eq:'=',neq:'<>',gte:'>=',lte:'<=',gt:'>',lt:'<'}[f.type]||'=')+add(f.value));
 }
 let sql;const tb='public.'+escId(table);
 if(method==='select'){
  const columns=args[0]||'*';const cols=columns==='*'?'*':columns.split(',').map(escId).join(',');
  sql='select '+cols+' from '+tb;
 }else if(method==='insert'||method==='upsert'){
  const rows=Array.isArray(args[0])?args[0]:[args[0]],cols=[...new Set(rows.flatMap(Object.keys))];
  const vals=rows.map(row=>'('+cols.map(c=>'(select p.'+escId(c)+' from jsonb_populate_record(null::'+tb+','+add(JSON.stringify(row))+'::jsonb)p)').join(',')+')').join(',');
  sql='insert into '+tb+'('+cols.map(escId).join(',')+')values'+vals;
  if(method==='upsert'){const conflict=args[1]?.onConflict||'id';sql+=' on conflict('+escId(conflict)+')do update set '+cols.filter(c=>c!==conflict).map(c=>escId(c)+'=excluded.'+escId(c)).join(',');}
 }else if(method==='update'){
  const data=args[0];sql='update '+tb+' set '+Object.keys(data).map(c=>escId(c)+'=(select p.'+escId(c)+' from jsonb_populate_record(null::'+tb+','+add(JSON.stringify(data))+'::jsonb)p)').join(',');
 }else if(method==='delete')sql='delete from '+tb;
 if(where.length && !['insert','upsert'].includes(method))sql+=' where '+where.join(' and ');
 if(method==='select'&&orders.length)sql+=' order by '+orders.map(o=>escId(o.col)+(o.options?.ascending===false?' desc':' asc')).join(',');
 if(method==='select'&&limit)sql+=' limit '+Number(limit);
 if(method==='select'&&req.offset)sql+=' offset '+Number(req.offset);
 if(method!=='select')sql+=' returning *';
 const r=await como(db,req.user,sql,params);const rows=normalizar(r);return {data:single?rows[0]||null:rows,error:null};
}
