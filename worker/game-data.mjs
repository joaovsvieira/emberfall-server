import {adventureData,adventureProfile} from './adventure-data.mjs';
import {expansionData} from './expansion-data.mjs';
import {ITEMS,HERO_IDS,progression,attributes,killXp,BALANCE,weekStart,lootPool,itemDefinition,qualityBand,CHAPTER_DROPS} from '../server/catalog.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export async function gameData(db,op,v){
 const adventure=await adventureData(db,op,v);if(adventure!==undefined)return adventure;
 const extra=await expansionData(db,op,v);if(extra!==undefined)return extra;
 const stmt=(sql,...args)=>db.prepare(sql).bind(...args);
 const one=(sql,...args)=>stmt(sql,...args).first();
 const all=async(sql,...args)=>(await stmt(sql,...args).all()).results;
 const run=(sql,...args)=>stmt(sql,...args).run();
 const pair=(a,b)=>[a,b].sort();
 const validHero=hero=>{if(!HERO_IDS.includes(hero))fail('Herói inválido.');};
 const related=async(a,b)=>{const [x,y]=pair(a,b);return one('SELECT * FROM friendships WHERE a=? AND b=?',x,y);};
 const itemView=i=>({...i,definition:itemDefinition(i)});
 const page=Math.max(1,Math.min(10000,Number(v.page)||1)),offset=(page-1)*20;
 if(op==='game-profile'){
  const [heroes,items,account]=await Promise.all([all('SELECT * FROM hero_progress WHERE account_id=?',v.id),all('SELECT i.*,EXISTS(SELECT 1 FROM listings l JOIN listing_items li ON li.listing_id=l.id WHERE li.item_id=i.id AND l.status=?) AS listed FROM items i WHERE account_id=? AND location=\'inventory\' ORDER BY created_at DESC','active',v.id),one('SELECT gold,gems FROM accounts WHERE id=?',v.id)]);
  const keys=await all('SELECT * FROM mythic_keys WHERE account_id=? AND week=?',v.id,weekStart());const clan=await one('SELECT clan_id,role FROM clan_members WHERE account_id=?',v.id);
  return {...await adventureProfile(db,v.id),gems:account?.gems??0,clan,gold:account?.gold??0,heroes:HERO_IDS.map(id=>{const xp=heroes.find(h=>h.hero===id)?.xp??0;const inventory=items.filter(i=>i.hero===id);return {id,skin:heroes.find(h=>h.hero===id)?.skin??'default',title:heroes.find(h=>h.hero===id)?.title??'',unlockedChapter:heroes.find(h=>h.hero===id)?.unlocked_chapter??1,keys:keys.filter(k=>k.hero===id),...progression(xp),attributes:attributes(id,xp,inventory.filter(i=>i.equipped)),inventory:inventory.map(itemView)};})};
 }
 if(op==='equip'){
  validHero(v.hero);if(typeof v.equip!=='boolean')fail('Ação inválida.');
  const item=await one("SELECT * FROM items WHERE id=? AND account_id=? AND hero=? AND location='inventory'",v.item,v.id,v.hero),def=ITEMS[item?.catalog_id];
  if(!item||!def)fail('Item não encontrado.',404);
  if(v.equip){if(def.hero!==v.hero)fail('Este item pertence a outra classe.');const h=await one('SELECT xp FROM hero_progress WHERE account_id=? AND hero=?',v.id,v.hero);if(progression(h?.xp??0).level<def.requiredLevel)fail('Nível insuficiente.');}
  if(await one("SELECT l.id FROM listings l JOIN listing_items li ON li.listing_id=l.id WHERE li.item_id=? AND l.status='active'",v.item))fail('Cancele a venda antes de equipar.');
  // Both checks live inside SQL too: listing/equipment requests may overlap.
  const condition="EXISTS(SELECT 1 FROM items target WHERE target.id=? AND target.account_id=? AND target.hero=? AND target.location='inventory' AND NOT EXISTS(SELECT 1 FROM listings l JOIN listing_items li ON li.listing_id=l.id WHERE li.item_id=target.id AND l.status='active'))";
  await db.batch([stmt(`UPDATE items SET equipped=0 WHERE account_id=? AND hero=? AND slot=? AND ${condition}`,v.id,v.hero,item.slot,v.item,v.id,v.hero),stmt(`UPDATE items SET equipped=? WHERE id=? AND account_id=? AND hero=? AND location='inventory' AND NOT EXISTS(SELECT 1 FROM listings l JOIN listing_items li ON li.listing_id=l.id WHERE li.item_id=items.id AND l.status='active')`,v.equip?1:0,v.item,v.id,v.hero)]);
  return {ok:true};
 }
 if(op==='rewards'||op==='settle'){
  if(![1,2,3].includes(v.chapter)||!['solo','coop','pvp'].includes(v.mode)||!Array.isArray(v.players)||!v.players.length||v.players.length>4||!Array.isArray(v.kills)||v.kills.length>100)fail('Partida inválida.');
  const now=v.finishedAt??Date.now(),queries=[];
  if(op==='settle')queries.push(stmt('INSERT OR IGNORE INTO matches(id,mode,chapter,duration_ms,outcome,week,created_at,mythic_level) VALUES(?,?,?,?,?,?,?,?)',v.round,v.mode,v.chapter,Math.max(0,Math.round(v.duration*1000)),v.outcome,weekStart(now),now,v.mythic?.level??0));
  for(const p of v.players){
   validHero(p.hero);
   if(v.mode!=='pvp'){
    const kills=p.earnedKills??v.kills;
    for(let offset=0;offset<kills.length;offset+=12){const batch=kills.slice(offset,offset+12);queries.push(stmt('INSERT OR IGNORE INTO reward_events(id,account_id,hero,xp,gold,created_at,round_id,kind) VALUES '+batch.map(()=>'(?,?,?,?,0,?,?,?)').join(','),...batch.flatMap(k=>[`${v.round}:${p.id}:mob:${k.id}`,p.id,p.hero,killXp(k.kind,v.chapter),now,v.round,k.kind])));}
   }
   if(op!=='settle'){applyRewards(queries,p);continue;}
   const won=v.mode!=='pvp'&&v.outcome==='won'&&!p.departed,gold=won?BALANCE.chapterGold[v.chapter]:0;
   let itemId=null;
   if(won){
    // Stable random selection provided by the authoritative room; validate against chapter pool.
    const def=ITEMS[p.loot];if(!def||def.tier!==v.chapter)fail('Loot inválido.');itemId=`${v.round}:${p.id}:item`;
    queries.push(stmt('INSERT OR IGNORE INTO reward_events(id,account_id,hero,xp,gold,created_at,round_id) VALUES(?,?,?,0,?,?,?)',`${v.round}:${p.id}:clear`,p.id,p.hero,gold,now,v.round));
    queries.push(stmt('INSERT OR IGNORE INTO items(id,account_id,hero,catalog_id,slot,equipped,created_at,quality) VALUES(?,?,?,?,?,0,?,?)',itemId,p.id,p.hero,def.id,def.slot,now,qualityBand(v.mythic?.level??0)));
    queries.push(stmt('INSERT OR IGNORE INTO completions(id,account_id,chapter,created_at) VALUES(?,?,?,?)',`${v.round}:${p.id}`,p.id,v.chapter,now));
    queries.push(stmt('INSERT INTO hero_progress(account_id,hero,unlocked_chapter) VALUES(?,?,?) ON CONFLICT(account_id,hero) DO UPDATE SET unlocked_chapter=MAX(unlocked_chapter,excluded.unlocked_chapter)',p.id,p.hero,Math.min(3,v.chapter+1)));
    if(!v.mythic)queries.push(stmt("INSERT INTO mythic_keys(account_id,hero,chapter,week) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM reward_events WHERE id=? AND applied=0) ON CONFLICT(account_id,hero,chapter,week) DO UPDATE SET level=2,status='available',run_id=NULL,resolved=0 WHERE mythic_keys.status='broken'",p.id,p.hero,v.chapter,weekStart(now),`${v.round}:${p.id}:clear`));
    for(const {suffix,catalog} of CHAPTER_DROPS)queries.push(stmt('INSERT OR IGNORE INTO items(id,account_id,hero,catalog_id,slot,created_at) VALUES(?,?,?,?,?,?)',`${v.round}:${p.id}:${suffix}`,p.id,p.hero,catalog,ITEMS[catalog].slot,now));
   }
   const outcome=p.departed?'left':v.mode==='pvp'?(p.id===v.winner?'won':'lost'):v.outcome;
   queries.push(stmt('INSERT OR IGNORE INTO match_players(match_id,account_id,hero,name,kills,outcome,gold,item_id) VALUES(?,?,?,?,?,?,?,?)',v.round,p.id,p.hero,p.name,v.mode==='pvp'?(p.id===v.winner&&v.reason==='knockout'?1:0):v.kills.length,outcome,gold,itemId));
  }
  // Apply each receipt once, in the same atomic batch that inserts it.
  function applyRewards(q,p){
   q.push(stmt('INSERT INTO hero_progress(account_id,hero,xp) SELECT ?,?,SUM(xp) FROM reward_events WHERE account_id=? AND hero=? AND round_id=? AND applied=0 HAVING COUNT(*)>0 ON CONFLICT(account_id,hero) DO UPDATE SET xp=xp+excluded.xp',p.id,p.hero,p.id,p.hero,v.round));
   q.push(stmt('UPDATE accounts SET gold=gold+COALESCE((SELECT SUM(gold) FROM reward_events WHERE account_id=? AND hero=? AND round_id=? AND applied=0),0) WHERE id=?',p.id,p.hero,v.round,p.id));
   q.push(stmt("INSERT OR IGNORE INTO achievements(account_id,hero,achievement,created_at) SELECT ?,?,'dragon_hunter',? WHERE (SELECT COUNT(*) FROM reward_events WHERE account_id=? AND hero=? AND kind='forest_dragon')>=5",p.id,p.hero,now,p.id,p.hero));
   q.push(stmt('UPDATE reward_events SET applied=1 WHERE account_id=? AND hero=? AND round_id=? AND applied=0',p.id,p.hero,v.round));
  }
  if(op==='settle')for(const p of v.players)applyRewards(queries,p);
  // Insert kill receipts in bounded groups: at most 72 bound values per query.
  await db.batch(queries);
  if(op==='rewards')return {ok:true,heroes:await all('SELECT account_id,hero,xp FROM hero_progress WHERE account_id IN ('+v.players.map(()=>'?').join(',')+')',...v.players.map(p=>p.id))};
  return {rewards:await all('SELECT p.account_id,p.gold,i.catalog_id,i.quality FROM match_players p LEFT JOIN items i ON i.id=p.item_id WHERE p.match_id=?',v.round)};
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
  const clan=v.channel==='clan'?await one('SELECT clan_id FROM clan_members WHERE account_id=?',v.id):null;
  if(v.channel==='clan'&&!clan)fail('Entre em um clã para conversar.');
  if(!['global','friends','clan'].includes(v.channel))fail('Canal inválido.');
  const recipient=v.channel==='friends'?String(v.target??''):null;
  if(recipient&&(await related(v.id,recipient))?.status!=='accepted')fail('Adicione este jogador aos amigos para conversar.',403);
  if(v.channel==='friends'&&!recipient)fail('Selecione um amigo.');
  if(op==='chat-send'){
   const body=String(v.body??'').normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu,'').trim();if(!body||body.length>500)fail('Envie de 1 a 500 caracteres.');
   const recent=await one('SELECT COUNT(*) AS n FROM chat_messages WHERE sender=? AND created_at>?',v.id,Date.now()-10000);if(recent.n>=5)fail('Aguarde um momento antes de enviar mais mensagens.',429);
   const inserted=await run('INSERT INTO chat_messages(sender,recipient,clan_id,body,created_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM chat_messages WHERE sender=? AND created_at>?)<5 AND (? IS NULL OR EXISTS(SELECT 1 FROM clan_members WHERE account_id=? AND clan_id=?))',v.id,recipient,clan?.clan_id??null,body,Date.now(),v.id,Date.now()-10000,clan?.clan_id??null,v.id,clan?.clan_id??null);if(inserted.meta.changes===0)fail('Aguarde um momento antes de enviar mais mensagens.',429);
  }
  const condition=clan?'m.clan_id=? AND EXISTS(SELECT 1 FROM clan_members WHERE account_id=? AND clan_id=m.clan_id)':recipient?'((m.sender=? AND m.recipient=?) OR (m.sender=? AND m.recipient=?))':'m.recipient IS NULL AND m.clan_id IS NULL';
  const args=clan?[clan.clan_id,v.id]:recipient?[v.id,recipient,recipient,v.id]:[];
  return {messages:(await all(`SELECT m.id,m.sender,a.display_name AS name,m.body AS text,m.created_at FROM chat_messages m JOIN accounts a ON a.id=m.sender WHERE ${condition} ORDER BY m.id DESC LIMIT 60`,...args)).reverse()};
 }
 if(op==='market-list'){
  const q=String(v.q??'').toLowerCase().slice(0,100),ids=Object.values(ITEMS).filter(i=>(!v.slot||i.slot===v.slot)&&(!HERO_IDS.includes(v.hero)||!i.hero||i.hero===v.hero)&&i.name.toLowerCase().includes(q)).map(i=>i.id);
  if(!ids.length)return {listings:[],page,hasMore:false};
  const rows=await all(`SELECT l.*,i.catalog_id,i.quality,a.display_name AS seller_name FROM listings l JOIN items i ON i.id=l.item_id JOIN accounts a ON a.id=l.seller WHERE l.status='active' AND i.catalog_id IN (${ids.map(()=>'?').join(',')}) AND l.seller${v.mine==='1'?'=':'<>'}? ORDER BY l.created_at DESC,l.id DESC LIMIT 21 OFFSET ?`,...ids,v.id,offset);
  return {listings:rows.slice(0,20).map(itemView),page,hasMore:rows.length>20};
 }
 if(op==='market-sell'){
  if(!Number.isSafeInteger(v.price)||v.price<1||v.price>1000000000)fail('Informe o preço total em gold, inteiro entre 1 e 1 bilhão.');
  const quantity=v.quantity??1;if(!Number.isSafeInteger(quantity)||quantity<1||quantity>999)fail('Quantidade inválida (1–999).');
  const item=await one("SELECT * FROM items WHERE id=? AND account_id=? AND location='inventory'",v.item,v.id);if(!item)fail('Item indisponível.',409);
  if(quantity>1&&!ITEMS[item.catalog_id]?.stackable)fail('Este item não pode ser empilhado.');
  const id=crypto.randomUUID(),free="account_id=? AND hero=? AND catalog_id=? AND quality=? AND equipped=0 AND location='inventory' AND NOT EXISTS(SELECT 1 FROM listing_items li JOIN listings l ON l.id=li.listing_id WHERE li.item_id=items.id AND l.status='active')",args=[v.id,item.hero,item.catalog_id,item.quality];
  const result=await db.batch([
   stmt(`INSERT INTO listings(id,item_id,seller,price,quantity,created_at) SELECT ?,id,?,?,?,? FROM items WHERE id=? AND ${free} AND (SELECT COUNT(*) FROM items WHERE ${free})>=?`,id,v.id,v.price,quantity,Date.now(),v.item,...args,...args,quantity),
   stmt(`INSERT INTO listing_items(listing_id,item_id) SELECT ?,id FROM items WHERE ${free} AND EXISTS(SELECT 1 FROM listings WHERE id=?) ORDER BY (id=?) DESC,created_at,id LIMIT ?`,id,...args,id,v.item,quantity)
  ]);if(!result[0].meta.changes)fail('Quantidade indisponível ou itens já reservados.',409);return {ok:true};
 }
 if(op==='market-cancel'){await run("UPDATE listings SET status='cancelled' WHERE id=? AND seller=? AND status='active'",v.listing,v.id);return {ok:true};}
 if(op==='market-buy'){
  validHero(v.hero);const id=crypto.randomUUID();
  const result=await db.batch([
   stmt("INSERT INTO sales(id,listing_id,buyer,hero,created_at,item_id,seller,price,quantity) SELECT ?,l.id,?,?,?,l.item_id,l.seller,l.price,l.quantity FROM listings l JOIN items i ON i.id=l.item_id JOIN accounts a ON a.id=? WHERE l.id=? AND l.status='active' AND l.seller<>? AND i.account_id=l.seller AND i.equipped=0 AND i.location='inventory' AND a.gold>=l.price AND (SELECT COUNT(*) FROM listing_items li JOIN items unit ON unit.id=li.item_id WHERE li.listing_id=l.id AND unit.account_id=l.seller AND unit.equipped=0 AND unit.location='inventory')=l.quantity",id,v.id,v.hero,Date.now(),v.id,v.listing,v.id),
   stmt('UPDATE accounts SET gold=gold-(SELECT price FROM sales WHERE id=?) WHERE id=(SELECT buyer FROM sales WHERE id=? AND applied=0)',id,id),
   stmt("INSERT OR IGNORE INTO mail(id,account_id,subject,body,gold,created_at) SELECT 'sale:'||id,seller,'Venda concluída','Seu item foi vendido no mercado. Colete o gold abaixo.',price,created_at FROM sales WHERE id=? AND applied=0",id),
   stmt('UPDATE items SET account_id=?,hero=? WHERE id IN (SELECT li.item_id FROM listing_items li JOIN sales s ON s.listing_id=li.listing_id WHERE s.id=? AND s.applied=0)',v.id,v.hero,id),
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
  const mode=['solo','coop','pvp'].includes(v.mode)?v.mode:'coop',week=weekStart();
  if(mode==='pvp')return {week,nextReset:week+7*86400000,entries:await all("SELECT a.id,a.display_name AS name,SUM(p.kills) AS kills FROM match_players p JOIN matches m ON m.id=p.match_id JOIN accounts a ON a.id=p.account_id WHERE m.week=? AND m.mode='pvp' GROUP BY a.id HAVING SUM(p.kills)>0 ORDER BY kills DESC,a.username LIMIT 100",week)};
  const mythic=v.mythic==='1';
  const chapter=[1,2,3].includes(Number(v.chapter))?Number(v.chapter):null;
  // Team identity is the sorted set of account IDs, independent of host or order.
  const rows=await all(`WITH runs AS (SELECT m.*, (SELECT GROUP_CONCAT(account_id,',') FROM (SELECT account_id FROM match_players WHERE match_id=m.id ORDER BY account_id)) AS team,(SELECT GROUP_CONCAT(name,' + ') FROM (SELECT name FROM match_players WHERE match_id=m.id ORDER BY account_id)) AS name FROM matches m WHERE m.week=? AND m.mode=? AND m.outcome='won' AND m.mythic_level${mythic?'>0':'=0'} ${chapter?'AND m.chapter=?':''} AND NOT EXISTS(SELECT 1 FROM match_players p WHERE p.match_id=m.id AND p.outcome<>'won')), ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY team,chapter ORDER BY mythic_level DESC,duration_ms,created_at,id) AS rank FROM runs) SELECT * FROM ranked WHERE rank=1 ORDER BY mythic_level DESC,duration_ms,created_at,id LIMIT 100`,week,mode,...(chapter?[chapter]:[]));
  return {week,nextReset:week+7*86400000,entries:rows};
 }
 if(op==='admin'){
  return {accounts:await all("SELECT id,username,display_name,(SELECT GROUP_CONCAT(hero || ': ' || unlocked_chapter, ', ') FROM hero_progress WHERE account_id=accounts.id) AS hero_chapters,preferred_hero,gold,gems,created_at FROM accounts WHERE instr(username,?)>0 ORDER BY created_at DESC LIMIT 20 OFFSET ?",String(v.q??'').toLowerCase().slice(0,18),offset),sessions:await all('SELECT a.username,s.expires_at,MAX(p.last_seen) AS last_seen FROM sessions s JOIN accounts a ON a.id=s.account_id LEFT JOIN presence p ON p.session_hash=s.hash WHERE s.expires_at>? GROUP BY s.hash ORDER BY last_seen DESC LIMIT 100',Date.now()),totals:await one('SELECT (SELECT COUNT(*) FROM accounts) AS accounts,(SELECT COUNT(*) FROM sessions WHERE expires_at>?) AS sessions,(SELECT COUNT(*) FROM listings WHERE status=?) AS listings,(SELECT COUNT(*) FROM items) AS items',Date.now(),'active'),page};
 }
 return undefined;
}
