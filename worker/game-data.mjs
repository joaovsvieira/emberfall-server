import {ITEMS,HERO_IDS,progression,attributes,killXp,BALANCE,weekStart,lootPool} from '../server/catalog.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export async function gameData(db,op,v){
 const stmt=(sql,...args)=>db.prepare(sql).bind(...args);
 const one=(sql,...args)=>stmt(sql,...args).first();
 const all=async(sql,...args)=>(await stmt(sql,...args).all()).results;
 const run=(sql,...args)=>stmt(sql,...args).run();
 const pair=(a,b)=>[a,b].sort();
 const validHero=hero=>{if(!HERO_IDS.includes(hero))fail('Herói inválido.');};
 const related=async(a,b)=>{const [x,y]=pair(a,b);return one('SELECT * FROM friendships WHERE a=? AND b=?',x,y);};
 const itemView=i=>({...i,definition:ITEMS[i.catalog_id]});
 const page=Math.max(1,Math.min(10000,Number(v.page)||1)),offset=(page-1)*20;
 if(op==='game-profile'){
  const [heroes,items,account]=await Promise.all([all('SELECT * FROM hero_progress WHERE account_id=?',v.id),all('SELECT i.*,EXISTS(SELECT 1 FROM listings l WHERE l.item_id=i.id AND l.status=?) AS listed FROM items i WHERE account_id=? ORDER BY created_at DESC','active',v.id),one('SELECT gold FROM accounts WHERE id=?',v.id)]);
  return {gold:account?.gold??0,heroes:HERO_IDS.map(id=>{const xp=heroes.find(h=>h.hero===id)?.xp??0;const inventory=items.filter(i=>i.hero===id);return {id,...progression(xp),attributes:attributes(id,xp,inventory.filter(i=>i.equipped)),inventory:inventory.map(itemView)};})};
 }
 if(op==='equip'){
  validHero(v.hero);if(typeof v.equip!=='boolean')fail('Ação inválida.');
  const item=await one('SELECT * FROM items WHERE id=? AND account_id=? AND hero=?',v.item,v.id,v.hero),def=ITEMS[item?.catalog_id];
  if(!item||!def)fail('Item não encontrado.',404);
  if(v.equip){if(def.hero!==v.hero)fail('Este item pertence a outra classe.');const h=await one('SELECT xp FROM hero_progress WHERE account_id=? AND hero=?',v.id,v.hero);if(progression(h?.xp??0).level<def.requiredLevel)fail('Nível insuficiente.');}
  if(await one("SELECT id FROM listings WHERE item_id=? AND status='active'",v.item))fail('Cancele a venda antes de equipar.');
  // Both checks live inside SQL too: listing/equipment requests may overlap.
  const condition="EXISTS(SELECT 1 FROM items target WHERE target.id=? AND target.account_id=? AND target.hero=? AND NOT EXISTS(SELECT 1 FROM listings l WHERE l.item_id=target.id AND l.status='active'))";
  await db.batch([stmt(`UPDATE items SET equipped=0 WHERE account_id=? AND hero=? AND slot=? AND ${condition}`,v.id,v.hero,item.slot,v.item,v.id,v.hero),stmt(`UPDATE items SET equipped=? WHERE id=? AND account_id=? AND hero=? AND NOT EXISTS(SELECT 1 FROM listings WHERE item_id=items.id AND status='active')`,v.equip?1:0,v.item,v.id,v.hero)]);
  return {ok:true};
 }
 if(op==='rewards'||op==='settle'){
  if(![1,2,3].includes(v.chapter)||!['solo','coop','pvp'].includes(v.mode)||!Array.isArray(v.players)||!v.players.length||v.players.length>4||!Array.isArray(v.kills)||v.kills.length>100)fail('Partida inválida.');
  const now=v.finishedAt??Date.now(),queries=[];
  if(op==='settle')queries.push(stmt('INSERT OR IGNORE INTO matches(id,mode,chapter,duration_ms,outcome,week,created_at) VALUES(?,?,?,?,?,?,?)',v.round,v.mode,v.chapter,Math.max(0,Math.round(v.duration*1000)),v.outcome,weekStart(now),now));
  for(const p of v.players){
   validHero(p.hero);
   if(v.mode!=='pvp'){
    const kills=p.earnedKills??v.kills;
    for(let offset=0;offset<kills.length;offset+=12){const batch=kills.slice(offset,offset+12);queries.push(stmt('INSERT OR IGNORE INTO reward_events(id,account_id,hero,xp,gold,created_at,round_id) VALUES '+batch.map(()=>'(?,?,?,?,0,?,?)').join(','),...batch.flatMap(k=>[`${v.round}:${p.id}:mob:${k.id}`,p.id,p.hero,killXp(k.kind,v.chapter),now,v.round])));}
   }
   if(op!=='settle'){applyRewards(queries,p);continue;}
   const won=v.mode!=='pvp'&&v.outcome==='won'&&!p.departed,gold=won?BALANCE.chapterGold[v.chapter]:0;
   let itemId=null;
   if(won){
    // Stable random selection provided by the authoritative room; validate against chapter pool.
    const def=ITEMS[p.loot];if(!def||def.tier!==v.chapter)fail('Loot inválido.');itemId=`${v.round}:${p.id}:item`;
    queries.push(stmt('INSERT OR IGNORE INTO reward_events(id,account_id,hero,xp,gold,created_at,round_id) VALUES(?,?,?,0,?,?,?)',`${v.round}:${p.id}:clear`,p.id,p.hero,gold,now,v.round));
    queries.push(stmt('INSERT OR IGNORE INTO items(id,account_id,hero,catalog_id,slot,equipped,created_at) VALUES(?,?,?,?,?,0,?)',itemId,p.id,p.hero,def.id,def.slot,now));
    queries.push(stmt('INSERT OR IGNORE INTO completions(id,account_id,chapter,created_at) VALUES(?,?,?,?)',`${v.round}:${p.id}`,p.id,v.chapter,now));
    queries.push(stmt('UPDATE accounts SET unlocked_chapter=MAX(unlocked_chapter,?) WHERE id=? AND unlocked_chapter>=?',Math.min(3,v.chapter+1),p.id,v.chapter));
   }
   const outcome=p.departed?'left':v.mode==='pvp'?(p.id===v.winner?'won':'lost'):v.outcome;
   queries.push(stmt('INSERT OR IGNORE INTO match_players(match_id,account_id,hero,name,kills,outcome,gold,item_id) VALUES(?,?,?,?,?,?,?,?)',v.round,p.id,p.hero,p.name,v.mode==='pvp'?(p.id===v.winner&&v.reason==='knockout'?1:0):v.kills.length,outcome,gold,itemId));
  }
  // Apply each receipt once, in the same atomic batch that inserts it.
  function applyRewards(q,p){
   q.push(stmt('INSERT INTO hero_progress(account_id,hero,xp) SELECT ?,?,SUM(xp) FROM reward_events WHERE account_id=? AND hero=? AND round_id=? AND applied=0 HAVING COUNT(*)>0 ON CONFLICT(account_id,hero) DO UPDATE SET xp=xp+excluded.xp',p.id,p.hero,p.id,p.hero,v.round));
   q.push(stmt('UPDATE accounts SET gold=gold+COALESCE((SELECT SUM(gold) FROM reward_events WHERE account_id=? AND hero=? AND round_id=? AND applied=0),0) WHERE id=?',p.id,p.hero,v.round,p.id));
   q.push(stmt('UPDATE reward_events SET applied=1 WHERE account_id=? AND hero=? AND round_id=? AND applied=0',p.id,p.hero,v.round));
  }
  if(op==='settle')for(const p of v.players)applyRewards(queries,p);
  // Insert kill receipts in bounded groups: at most 72 bound values per query.
  await db.batch(queries);
  if(op==='rewards')return {ok:true};
  return {rewards:await all('SELECT p.account_id,p.gold,i.catalog_id FROM match_players p LEFT JOIN items i ON i.id=p.item_id WHERE p.match_id=?',v.round)};
 }
 if(op==='presence'){
  await run('INSERT INTO presence(account_id,session_hash,last_seen) VALUES(?,?,?) ON CONFLICT(account_id,session_hash) DO UPDATE SET last_seen=excluded.last_seen',v.id,v.session,Date.now());return {ok:true};
 }
 if(op==='friends'){
  const rows=await all('SELECT f.*,a.id,a.username,a.display_name AS name,EXISTS(SELECT 1 FROM presence p JOIN sessions s ON s.hash=p.session_hash WHERE p.account_id=a.id AND p.last_seen>? AND s.expires_at>?) AS online FROM friendships f JOIN accounts a ON a.id=CASE WHEN f.a=? THEN f.b ELSE f.a END WHERE f.a=? OR f.b=? ORDER BY f.status,a.username',Date.now()-75000,Date.now(),v.id,v.id,v.id);
  return {friends:rows.filter(r=>r.status==='accepted'),incoming:rows.filter(r=>r.status==='pending'&&r.requester!==v.id),outgoing:rows.filter(r=>r.status==='pending'&&r.requester===v.id)};
 }
 if(op==='friend-search'){
  const q=String(v.q??'').toLowerCase().trim();if(q.length<3)return {users:[]};
  return {users:await all('SELECT a.id,a.username,a.display_name AS name,f.status,f.requester FROM accounts a LEFT JOIN friendships f ON f.a=MIN(a.id,?) AND f.b=MAX(a.id,?) WHERE a.id<>? AND instr(a.username,?)>0 ORDER BY a.username LIMIT 20',v.id,v.id,v.id,q.slice(0,18))};
 }
 if(op==='friend-action'){
  if(v.id===v.target)fail('Escolha outro jogador.');const [a,b]=pair(v.id,String(v.target??''));
  if(!await one('SELECT id FROM accounts WHERE id=?',v.target))fail('Jogador não encontrado.',404);
  if(v.action==='add')await run("INSERT OR IGNORE INTO friendships(a,b,requester,status,created_at) VALUES(?,?,?,'pending',?)",a,b,v.id,Date.now());
  else if(v.action==='accept')await run("UPDATE friendships SET status='accepted' WHERE a=? AND b=? AND requester<>? AND status='pending'",a,b,v.id);
  else if(['remove','reject','cancel'].includes(v.action))await run('DELETE FROM friendships WHERE a=? AND b=?',a,b);
  else fail('Ação inválida.');return {ok:true};
 }
 if(op==='chat-read'||op==='chat-send'){
  if(v.channel==='clan')fail('Guildas ainda não estão disponíveis.');
  if(!['global','friends'].includes(v.channel))fail('Canal inválido.');
  const recipient=v.channel==='friends'?String(v.target??''):null;
  if(recipient&&(await related(v.id,recipient))?.status!=='accepted')fail('Adicione este jogador aos amigos para conversar.',403);
  if(v.channel==='friends'&&!recipient)fail('Selecione um amigo.');
  if(op==='chat-send'){
   const body=String(v.body??'').normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu,'').trim();if(!body||body.length>500)fail('Envie de 1 a 500 caracteres.');
   const recent=await one('SELECT COUNT(*) AS n FROM chat_messages WHERE sender=? AND created_at>?',v.id,Date.now()-10000);if(recent.n>=5)fail('Aguarde um momento antes de enviar mais mensagens.',429);
   const inserted=await run('INSERT INTO chat_messages(sender,recipient,body,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM chat_messages WHERE sender=? AND created_at>?)<5',v.id,recipient,body,Date.now(),v.id,Date.now()-10000);if(inserted.meta.changes===0)fail('Aguarde um momento antes de enviar mais mensagens.',429);
  }
  const condition=recipient?'((m.sender=? AND m.recipient=?) OR (m.sender=? AND m.recipient=?))':'m.recipient IS NULL';
  const args=recipient?[v.id,recipient,recipient,v.id]:[];
  return {messages:(await all(`SELECT m.id,m.sender,a.display_name AS name,m.body AS text,m.created_at FROM chat_messages m JOIN accounts a ON a.id=m.sender WHERE ${condition} ORDER BY m.id DESC LIMIT 60`,...args)).reverse()};
 }
 if(op==='market-list'){
  const q=String(v.q??'').toLowerCase().slice(0,100),ids=Object.values(ITEMS).filter(i=>(!v.slot||i.slot===v.slot)&&i.name.toLowerCase().includes(q)).map(i=>i.id);
  if(!ids.length)return {listings:[],page,hasMore:false};
  const rows=await all(`SELECT l.*,i.catalog_id,a.display_name AS seller_name FROM listings l JOIN items i ON i.id=l.item_id JOIN accounts a ON a.id=l.seller WHERE l.status='active' AND i.catalog_id IN (${ids.map(()=>'?').join(',')}) ${v.mine?'AND l.seller=?':''} ORDER BY l.created_at DESC,l.id DESC LIMIT 21 OFFSET ?`,...ids,...(v.mine?[v.id]:[]),offset);
  return {listings:rows.slice(0,20).map(itemView),page,hasMore:rows.length>20};
 }
 if(op==='market-sell'){
  if(!Number.isSafeInteger(v.price)||v.price<1||v.price>1000000000)fail('Informe um preço inteiro entre 1 e 1 bilhão.');
  const result=await run('INSERT INTO listings(id,item_id,seller,price,created_at) SELECT ?,id,?,?,? FROM items WHERE id=? AND account_id=? AND equipped=0',crypto.randomUUID(),v.id,v.price,Date.now(),v.item,v.id);if(result.meta.changes===0)fail('Este item não está disponível para venda.',409);return {ok:true};
 }
 if(op==='market-cancel'){await run("UPDATE listings SET status='cancelled' WHERE id=? AND seller=? AND status='active'",v.listing,v.id);return {ok:true};}
 if(op==='market-buy'){
  validHero(v.hero);const id=crypto.randomUUID();
  const result=await db.batch([
   stmt("INSERT INTO sales(id,listing_id,buyer,hero,created_at,item_id,seller,price) SELECT ?,l.id,?,?,?,l.item_id,l.seller,l.price FROM listings l JOIN items i ON i.id=l.item_id JOIN accounts a ON a.id=? WHERE l.id=? AND l.status='active' AND l.seller<>? AND i.account_id=l.seller AND i.equipped=0 AND a.gold>=l.price",id,v.id,v.hero,Date.now(),v.id,v.listing,v.id),
   stmt('UPDATE accounts SET gold=gold-(SELECT price FROM sales WHERE id=?) WHERE id=(SELECT buyer FROM sales WHERE id=? AND applied=0)',id,id),
   stmt('UPDATE accounts SET gold=gold+(SELECT price FROM sales WHERE id=?) WHERE id=(SELECT seller FROM sales WHERE id=? AND applied=0)',id,id),
   stmt('UPDATE items SET account_id=?,hero=? WHERE id=(SELECT item_id FROM sales WHERE id=? AND applied=0)',v.id,v.hero,id),
   stmt("UPDATE listings SET status='sold' WHERE id=(SELECT listing_id FROM sales WHERE id=? AND applied=0)",id),
   stmt('UPDATE sales SET applied=1 WHERE id=? AND applied=0',id)
  ]);
  if(result[0].meta.changes===0)fail('Item vendido, saldo insuficiente ou compra inválida.',409);return {ok:true};
 }
 if(op==='history'){
  const modes=['solo','coop','pvp'],mode=modes.includes(v.mode)?v.mode:null;
  const rows=await all(`SELECT m.*,p.hero,p.outcome AS player_outcome,p.gold,p.kills,p.item_id FROM match_players p JOIN matches m ON m.id=p.match_id WHERE p.account_id=? ${mode?'AND m.mode=?':''} ORDER BY m.created_at DESC,m.id DESC LIMIT 21 OFFSET ?`,v.id,...(mode?[mode]:[]),offset);
  return {matches:rows.slice(0,20),page,hasMore:rows.length>20};
 }
 if(op==='ranking'){
  const mode=['solo','coop','pvp'].includes(v.mode)?v.mode:'solo',week=weekStart();
  if(mode==='pvp')return {week,nextReset:week+7*86400000,entries:await all("SELECT a.id,a.display_name AS name,SUM(p.kills) AS kills FROM match_players p JOIN matches m ON m.id=p.match_id JOIN accounts a ON a.id=p.account_id WHERE m.week=? AND m.mode='pvp' GROUP BY a.id HAVING SUM(p.kills)>0 ORDER BY kills DESC,a.username LIMIT 100",week)};
  const chapter=[1,2,3].includes(Number(v.chapter))?Number(v.chapter):null;
  // Team identity is the sorted set of account IDs, independent of host or order.
  const rows=await all(`WITH runs AS (SELECT m.*, (SELECT GROUP_CONCAT(account_id,',') FROM (SELECT account_id FROM match_players WHERE match_id=m.id ORDER BY account_id)) AS team,(SELECT GROUP_CONCAT(name,' + ') FROM (SELECT name FROM match_players WHERE match_id=m.id ORDER BY account_id)) AS name FROM matches m WHERE m.week=? AND m.mode=? AND m.outcome='won' ${chapter?'AND m.chapter=?':''} AND NOT EXISTS(SELECT 1 FROM match_players p WHERE p.match_id=m.id AND p.outcome<>'won')), ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY team,chapter ORDER BY duration_ms,created_at,id) AS rank FROM runs) SELECT * FROM ranked WHERE rank=1 ORDER BY duration_ms,created_at,id LIMIT 100`,week,mode,...(chapter?[chapter]:[]));
  return {week,nextReset:week+7*86400000,entries:rows};
 }
 if(op==='admin'){
  return {accounts:await all('SELECT id,username,display_name,unlocked_chapter,preferred_hero,gold,created_at FROM accounts WHERE instr(username,?)>0 ORDER BY created_at DESC LIMIT 20 OFFSET ?',String(v.q??'').toLowerCase().slice(0,18),offset),sessions:await all('SELECT a.username,s.expires_at,MAX(p.last_seen) AS last_seen FROM sessions s JOIN accounts a ON a.id=s.account_id LEFT JOIN presence p ON p.session_hash=s.hash WHERE s.expires_at>? GROUP BY s.hash ORDER BY last_seen DESC LIMIT 100',Date.now()),totals:await one('SELECT (SELECT COUNT(*) FROM accounts) AS accounts,(SELECT COUNT(*) FROM sessions WHERE expires_at>?) AS sessions,(SELECT COUNT(*) FROM listings WHERE status=?) AS listings,(SELECT COUNT(*) FROM items) AS items',Date.now(),'active'),page};
 }
 return undefined;
}
