window.qaChamadas=[];
const qaFetch=async(path,body)=>{window.qaChamadas.push({path,body});return(await fetch('/qa/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,user:JSON.parse(localStorage.getItem('qa_user')||'null')?.id})})).json();};
class Query{
 constructor(table){this.x={table,filters:[],orders:[],args:[]};}
 select(...args){if(!this.x.method){this.x.method='select';this.x.args=args;}return this;}
 insert(...args){this.x.method='insert';this.x.args=args;return this;}upsert(...args){this.x.method='upsert';this.x.args=args;return this;}
 update(...args){this.x.method='update';this.x.args=args;return this;}delete(){this.x.method='delete';return this;}
 eq(col,value){this.x.filters.push({type:'eq',col,value});return this;}neq(col,value){this.x.filters.push({type:'neq',col,value});return this;}
 gte(col,value){this.x.filters.push({type:'gte',col,value});return this;}lte(col,value){this.x.filters.push({type:'lte',col,value});return this;}
 in(col,value){this.x.filters.push({type:'in',col,value});return this;}is(col,value){this.x.filters.push({type:'is',col,value});return this;}
 or(value){this.x.filters.push({type:'or',value});return this;}order(col,options){this.x.orders.push({col,options});return this;}
 limit(limit){this.x.limit=limit;return this;}range(a,b){this.x.offset=a;this.x.limit=b-a+1;return this;}
 single(){this.x.single=true;return this;}maybeSingle(){this.x.single=true;return this;}
 then(a,b){return qaFetch('query',this.x).then(a,b);}
}
window.supabase={createClient:()=>({from:table=>new Query(table),rpc:(name,params)=>qaFetch('rpc',{name,params}),storage:{from:()=>({upload:async()=>({data:{},error:null}),remove:async()=>({data:[],error:null}),getPublicUrl:()=>({data:{publicUrl:''}})})},auth:{
 getSession:async()=>({data:{session:localStorage.getItem('qa_user')?{user:JSON.parse(localStorage.getItem('qa_user'))}:null}}),
 onAuthStateChange:cb=>{window.qaAuthCallback=cb;return {data:{subscription:{unsubscribe(){}}}};},
 signInWithPassword:async data=>{const r=await qaFetch('login',data);if(r.data)localStorage.setItem('qa_user',JSON.stringify(r.data.user));return r;},
 signUp:async data=>{const r=await qaFetch('signup',data);if(r.data)localStorage.setItem('qa_user',JSON.stringify(r.data.user));return r;},
 signOut:async()=>{localStorage.removeItem('qa_user');return {};},
 resetPasswordForEmail:async()=>({error:null}),updateUser:async()=>({data:{},error:null})
}})};
