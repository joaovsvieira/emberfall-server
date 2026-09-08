import {gameData} from './game-data.mjs';
// Persistent data belongs to D1; only the game server may call this narrow API.
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function dataOperation(db,op,v){
 const one=(sql,...args)=>db.prepare(sql).bind(...args).first();
 const run=(sql,...args)=>db.prepare(sql).bind(...args).run();
 if(op==='find-user')return one('SELECT * FROM accounts WHERE username = ?',v.username);
 if(op==='account')return one('SELECT * FROM accounts WHERE id = ?',v.id);
 if(op==='register'){
  await run('INSERT INTO accounts (id,username,display_name,password_hash,created_at) VALUES (?,?,?,?,?)',v.id,v.username,v.displayName,v.passwordHash,Date.now());
  return one('SELECT * FROM accounts WHERE id = ?',v.id);
 }
 if(op==='session-create'){
  await db.batch([db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),db.prepare('INSERT INTO sessions (hash,account_id,expires_at) VALUES (?,?,?)').bind(v.hash,v.accountId,v.expiresAt)]);return {ok:true};
 }
 if(op==='session')return one('SELECT a.* FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.hash=? AND s.expires_at>?',v.hash,Date.now());
 if(op==='logout'){await run('DELETE FROM sessions WHERE hash=?',v.hash);return {ok:true};}
 if(op==='hero'){await run('UPDATE accounts SET preferred_hero=? WHERE id=?',v.hero,v.id);return {ok:true};}
 if(op==='complete'){
  if(![1,2,3].includes(v.chapter)||!Array.isArray(v.ids)||v.ids.length>4)throw new Error('Invalid completion');
  const statements=[];
  for(const id of new Set(v.ids)){
   statements.push(db.prepare('INSERT OR IGNORE INTO completions (id,account_id,chapter,created_at) SELECT ?,id,?,? FROM accounts WHERE id=? AND unlocked_chapter>=?').bind(`${v.round}:${id}`,v.chapter,Date.now(),id,v.chapter));
   statements.push(db.prepare('UPDATE accounts SET unlocked_chapter=MAX(unlocked_chapter,?) WHERE id=? AND unlocked_chapter>=?').bind(Math.min(3,v.chapter+1),id,v.chapter));
  }
  await db.batch(statements);return {ok:true};
 }
 const result=await gameData(db,op,v);if(result!==undefined)return result;
 throw new Error('Unknown operation');
}
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/internal/data'){
  if(!env.DATA_SERVICE_KEY||request.headers.get('Authorization')!==`Bearer ${env.DATA_SERVICE_KEY}`)return json({error:'Unauthorized'},401);
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  try{const body=await request.text();if(body.length>60000)return json({error:'Payload too large'},413);const {op,value}=JSON.parse(body);return json({value:await dataOperation(env.DB,op,value)});}catch(e){console.error('Database operation failed',e?.message);return json({error:e.status?e.message:/purchase_unavailable/.test(e?.message??'')?'Item vendido, saldo insuficiente ou compra inválida.':/item_unavailable/.test(e?.message??'')?'Este item não está disponível para venda.':/UNIQUE constraint/i.test(e?.message??'')?'Operação já realizada ou registro existente.':'storage_unavailable'},e.status??(/constraint|unavailable/.test(e?.message??'')?409:503));}
 }
 // Preserve same-origin HttpOnly sessions on the public game URL.
 const target=new URL(env.GAME_SERVER_URL||'https://emberfall-server.onrender.com');target.pathname=url.pathname;target.search=url.search;
 const headers=new Headers(request.headers);headers.delete('host');headers.delete('authorization');
 headers.delete('x-emberfall-proxy');headers.set('x-emberfall-proxy',env.DATA_SERVICE_KEY||'');
 headers.set('x-emberfall-client-ip',request.headers.get('CF-Connecting-IP')||'unknown');
 try{return await fetch(new Request(target,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'}));}
 catch{return json({error:'O servidor está despertando. Tente novamente em instantes.'},503);}
}};
