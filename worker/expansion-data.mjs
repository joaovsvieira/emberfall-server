import {HERO_IDS,ITEMS,weekStart} from '../server/catalog.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export async function expansionData(db,op,v){
 const stmt=(sql,...args)=>db.prepare(sql).bind(...args),one=(sql,...args)=>stmt(sql,...args).first(),all=async(sql,...args)=>(await stmt(sql,...args).all()).results,run=(sql,...args)=>stmt(sql,...args).run();
 const page=Math.max(1,Math.min(10000,Number(v.page)||1)),offset=(page-1)*20;
 if(op==='key-activate'){
  if(!HERO_IDS.includes(v.hero)||![1,2,3].includes(v.chapter)||typeof v.round!=='string')fail('Chave inválida.');
  const week=weekStart();await run("UPDATE mythic_keys SET status='active',run_id=?,resolved=0 WHERE account_id=? AND hero=? AND chapter=? AND week=? AND status='available'",v.round,v.id,v.hero,v.chapter,week);
  const key=await one("SELECT * FROM mythic_keys WHERE run_id=? AND account_id=? AND hero=? AND chapter=? AND week=? AND status='active'",v.round,v.id,v.hero,v.chapter,week);if(!key)fail('Chave indisponível, já usada ou expirada.',409);return key;
 }
 if(op==='key-resolve'){
  const success=v.success===true,upgrade=Number(v.upgrade);if(success&&(!Number.isInteger(upgrade)||upgrade<0||upgrade>3))fail('Resultado inválido.');
  await run('UPDATE mythic_keys SET status=?,level=MIN(100,level+?),resolved=1 WHERE run_id=? AND resolved=0',success?'available':'broken',success?upgrade:0,v.round);return {ok:true};
 }
 if(op==='market-history'){
  const side=v.side==='buy'?'buyer':v.side==='sell'?'seller':null;
  const rows=await all(`SELECT s.*,i.catalog_id,b.display_name AS buyer_name,a.display_name AS seller_name FROM sales s JOIN items i ON i.id=s.item_id JOIN accounts b ON b.id=s.buyer JOIN accounts a ON a.id=s.seller WHERE s.applied=1 AND ${side?'s.'+side+'=?':'(s.buyer=? OR s.seller=?)'} ORDER BY s.created_at DESC,s.id DESC LIMIT 21 OFFSET ?`,v.id,...(side?[]:[v.id]),offset);
  return {transactions:rows.slice(0,20).map(s=>({...s,definition:ITEMS[s.catalog_id]})),page,hasMore:rows.length>20};
 }
 // Internal operations: public HTTP routes may never dispatch arbitrary payment observations.
 if(op==='payment-create'){
  if(!Number.isSafeInteger(v.amountCents)||v.amountCents<1||v.coins!==10)fail('Produto inválido.');
  const r=await run('INSERT OR IGNORE INTO payment_orders(id,account_id,amount_cents,coins,live,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM payment_orders WHERE account_id=? AND created_at>?)<10',v.order,v.id,v.amountCents,v.coins,v.live?1:0,Date.now(),v.id,Date.now()-3600000);
  const order=await one('SELECT * FROM payment_orders WHERE id=? AND account_id=?',v.order,v.id);if(!order)fail('Limite de cobranças por hora atingido.',429);return order;
 }
 if(op==='payment-get')return one('SELECT * FROM payment_orders WHERE id=?'+(v.id?' AND account_id=?':''),v.order,...(v.id?[v.id]:[]));
 if(op==='payment-list')return {orders:await all('SELECT id,amount_cents,coins,status,granted,live,created_at FROM payment_orders WHERE account_id=? ORDER BY created_at DESC LIMIT 20',v.id)};
 if(op==='payment-update'){
  const order=await one('SELECT * FROM payment_orders WHERE id=?',v.order);if(!order)fail('Cobrança não encontrada.',404);
  if(order.provider_id&&order.provider_id!==v.providerId)fail('Pagamento divergente.',409);
  if(order.amount_cents!==v.amountCents||Boolean(order.live)!==v.live)fail('Valor ou ambiente divergente.',409);
  const granted=v.live&&v.status==='approved'?order.coins:0;
  const current="updated_at<=? AND (status NOT IN ('refunded','charged_back') OR ? IN ('refunded','charged_back'))";
  await db.batch([
   stmt(`UPDATE accounts SET gems=gems+?-COALESCE((SELECT granted FROM payment_orders WHERE id=?),0) WHERE id=? AND EXISTS(SELECT 1 FROM payment_orders WHERE id=? AND ${current})`,granted,v.order,order.account_id,v.order,v.updatedAt,v.status),
   stmt(`UPDATE payment_orders SET provider_id=?,status=?,granted=?,updated_at=? WHERE id=? AND ${current}`,v.providerId,v.status,granted,v.updatedAt,v.order,v.updatedAt,v.status)
  ]);return one('SELECT * FROM payment_orders WHERE id=?',v.order);
 }
 if(!op.startsWith('clan-'))return undefined;
 const mine=await one('SELECT m.*,c.owner,c.name FROM clan_members m JOIN clans c ON c.id=m.clan_id WHERE m.account_id=?',v.id);
 if(op==='clan-view'){
  if(!mine)return {clan:null,clans:await all('SELECT c.id,c.name,COUNT(m.account_id) AS members,EXISTS(SELECT 1 FROM clan_requests r WHERE r.clan_id=c.id AND r.account_id=? AND r.kind=?) AS applied FROM clans c LEFT JOIN clan_members m ON m.clan_id=c.id WHERE instr(c.name_key,?)>0 GROUP BY c.id ORDER BY c.name_key LIMIT 21 OFFSET ?',v.id,'apply',String(v.q??'').normalize('NFKC').toLowerCase().slice(0,32),offset),invites:await all("SELECT c.id,c.name FROM clan_requests r JOIN clans c ON c.id=r.clan_id WHERE r.account_id=? AND r.kind='invite'",v.id),page};
  return {clan:mine,members:await all('SELECT m.account_id AS id,m.role,a.display_name AS name,a.username,EXISTS(SELECT 1 FROM presence p JOIN sessions s ON s.hash=p.session_hash WHERE p.account_id=m.account_id AND p.last_seen>? AND s.expires_at>?) AS online FROM clan_members m JOIN accounts a ON a.id=m.account_id WHERE m.clan_id=? ORDER BY m.role,a.username',Date.now()-75000,Date.now(),mine.clan_id),applications:mine.role==='admin'?await all("SELECT a.id,a.display_name AS name FROM clan_requests r JOIN accounts a ON a.id=r.account_id WHERE r.clan_id=? AND r.kind='apply'",mine.clan_id):[]};
 }
 if(op==='clan-create'){
  const name=String(v.name??'').normalize('NFKC').trim();if(!/^[\p{L}\p{N} _-]{3,32}$/u.test(name))fail('Use de 3 a 32 letras, números, espaços, _ ou -.');if(mine)fail('Você já pertence a um clã.');const id=crypto.randomUUID();
  const result=await db.batch([
   stmt('INSERT INTO clans(id,name,name_key,owner,created_at) SELECT ?,?,?,id,? FROM accounts WHERE id=? AND gold>=1000 AND NOT EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)',id,name,name.toLowerCase(),Date.now(),v.id,v.id),
   stmt('UPDATE accounts SET gold=gold-1000 WHERE id=? AND EXISTS(SELECT 1 FROM clans WHERE id=? AND paid=0)',v.id,id),
   stmt("INSERT INTO clan_members(account_id,clan_id,role,joined_at) SELECT owner,id,'admin',created_at FROM clans WHERE id=? AND paid=0",id),
   stmt('UPDATE clans SET paid=1 WHERE id=?',id),stmt('DELETE FROM clan_requests WHERE account_id=? AND EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)',v.id,v.id)
  ]);if(!result[0].meta.changes)fail('Você precisa de 1.000 gold e não pode pertencer a outro clã.',409);return {ok:true};
 }
 const clan=mine?.clan_id??String(v.clan??'');
 if(op==='clan-apply'){
  if(mine)fail('Você já pertence a um clã.');if(!await one('SELECT id FROM clans WHERE id=?',clan))fail('Clã não encontrado.',404);
  await run("INSERT OR IGNORE INTO clan_requests(clan_id,account_id,kind,created_at) SELECT ?,?,'apply',? WHERE NOT EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)",clan,v.id,Date.now(),v.id);return {ok:true};
 }
 if(op==='clan-accept-invite'){
  if(mine)fail('Você já pertence a um clã.');const result=await db.batch([stmt("INSERT INTO clan_members(account_id,clan_id,role,joined_at) SELECT account_id,clan_id,'member',? FROM clan_requests WHERE clan_id=? AND account_id=? AND kind='invite' AND NOT EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)",Date.now(),clan,v.id,v.id),stmt('DELETE FROM clan_requests WHERE account_id=? AND EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)',v.id,v.id)]);if(!result[0].meta.changes)fail('Convite indisponível.',409);return {ok:true};
 }
 if(!mine)fail('Entre em um clã primeiro.',403);
 if(op==='clan-leave'){if(mine.owner===v.id)fail('O fundador precisa excluir o clã.');await run('DELETE FROM clan_members WHERE account_id=? AND clan_id=?',v.id,clan);return {ok:true};}
 if(mine.role!=='admin')fail('Somente administradores podem gerenciar o clã.',403);
 const auth="EXISTS(SELECT 1 FROM clan_members auth WHERE auth.account_id=? AND auth.clan_id=? AND auth.role='admin')",a=[v.id,clan];
 if(op==='clan-invite'){
  const target=await one('SELECT id FROM accounts WHERE username=?',String(v.username??'').trim().toLowerCase());if(!target)fail('Jogador não encontrado.',404);
  const r=await run(`INSERT OR IGNORE INTO clan_requests(clan_id,account_id,kind,created_at) SELECT ?,?,'invite',? WHERE ${auth} AND NOT EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)`,clan,target.id,Date.now(),...a,target.id);if(!r.meta.changes)fail('Jogador já possui clã ou convite.',409);return {ok:true};
 }
 if(op==='clan-approve'){
  const result=await db.batch([stmt(`INSERT INTO clan_members(account_id,clan_id,role,joined_at) SELECT account_id,clan_id,'member',? FROM clan_requests WHERE clan_id=? AND account_id=? AND kind='apply' AND ${auth} AND NOT EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)`,Date.now(),clan,v.target,...a,v.target),stmt('DELETE FROM clan_requests WHERE account_id=? AND EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)',v.target,v.target)]);if(!result[0].meta.changes)fail('Solicitação indisponível.',409);return {ok:true};
 }
 if(op==='clan-reject'){await run(`DELETE FROM clan_requests WHERE clan_id=? AND account_id=? AND ${auth}`,clan,v.target,...a);return {ok:true};}
 if(op==='clan-kick'){await run(`DELETE FROM clan_members WHERE account_id=? AND clan_id=? AND account_id<>(SELECT owner FROM clans WHERE id=?) AND ${auth} AND (role='member' OR EXISTS(SELECT 1 FROM clans WHERE id=? AND owner=?))`,v.target,clan,clan,...a,clan,v.id);return {ok:true};}
 if(op==='clan-role'){if(!['admin','member'].includes(v.role))fail('Cargo inválido.');await run('UPDATE clan_members SET role=? WHERE account_id=? AND clan_id=? AND account_id<>? AND EXISTS(SELECT 1 FROM clans WHERE id=? AND owner=?)',v.role,v.target,clan,v.id,clan,v.id);return {ok:true};}
 if(op==='clan-delete'){if(mine.owner!==v.id)fail('Somente o fundador pode excluir o clã.',403);await db.batch([stmt('DELETE FROM chat_messages WHERE clan_id=? AND EXISTS(SELECT 1 FROM clans WHERE id=? AND owner=?)',clan,clan,v.id),stmt('DELETE FROM clans WHERE id=? AND owner=?',clan,v.id)]);return {ok:true};}
 fail('Ação inválida.');
}
