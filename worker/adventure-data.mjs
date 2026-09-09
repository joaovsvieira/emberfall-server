import {ITEMS,HERO_IDS,PROFESSIONS,RECIPES,SKINS,ACHIEVEMENTS,POTION,weekStart,qualityBand,itemDefinition,PROFESSION_COST} from '../server/catalog.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export async function adventureProfile(db,id){
 const all=async(sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
 const [professions,recipes,hotbar,skins,achievements,claims,unread,weeklyKeys]=await Promise.all([
  all('SELECT profession FROM professions WHERE account_id=? AND paid=1',id),all('SELECT recipe FROM recipes WHERE account_id=?',id),all('SELECT * FROM hero_hotbar WHERE account_id=?',id),all('SELECT skin FROM skins WHERE account_id=? AND paid=1',id),all('SELECT * FROM achievements WHERE account_id=?',id),all('SELECT * FROM weekly_claims WHERE account_id=? AND week=?',id,weekStart()),all('SELECT COUNT(*) AS n FROM mail WHERE account_id=? AND is_read=0',id),all("SELECT * FROM mythic_keys WHERE account_id=? AND week=? AND status='available' ORDER BY level DESC,chapter DESC",id,weekStart()-7*86400000)
 ]);
 return {professions:professions.map(x=>x.profession),recipes:recipes.map(x=>x.recipe),hotbar,skins:skins.map(x=>x.skin),achievements,weeklyClaims:claims,weeklyKeys,weeklySourceWeek:weekStart()-7*86400000,unreadMail:unread[0].n,catalog:{professions:PROFESSIONS,recipes:RECIPES,items:ITEMS,skins:SKINS,achievements:ACHIEVEMENTS}};
}
export async function adventureData(db,op,v){
 const stmt=(sql,...args)=>db.prepare(sql).bind(...args),one=(sql,...args)=>stmt(sql,...args).first(),all=async(sql,...args)=>(await stmt(sql,...args).all()).results,run=(sql,...args)=>stmt(sql,...args).run();
 const hero=()=>{if(!HERO_IDS.includes(v.hero))fail('Herói inválido.');};
 const now=Date.now(),receipt=crypto.randomUUID();
 const gate="EXISTS(SELECT 1 FROM economy_operations WHERE id=? AND applied=0)";
 const done=id=>stmt('UPDATE economy_operations SET applied=1 WHERE id=?',id);
 const owned="location='inventory' AND equipped=0 AND NOT EXISTS(SELECT 1 FROM listings l JOIN listing_items li ON li.listing_id=l.id WHERE li.item_id=items.id AND l.status='active')";
 if(op==='profession-unlock'){
  if(!PROFESSIONS[v.profession])fail('Profissão inválida.');
  const r=await db.batch([
   stmt('INSERT OR IGNORE INTO professions(account_id,profession) SELECT ?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE id=? AND gold>=?)',v.id,v.profession,v.id,PROFESSION_COST),
   stmt('UPDATE accounts SET gold=gold-? WHERE id=? AND EXISTS(SELECT 1 FROM professions WHERE account_id=? AND profession=? AND paid=0)',PROFESSION_COST,v.id,v.id,v.profession),
   stmt('UPDATE professions SET paid=1 WHERE account_id=? AND profession=? AND paid=0',v.id,v.profession),
   stmt("INSERT OR IGNORE INTO achievements(account_id,hero,achievement,created_at) SELECT ?,'account','artisan',? WHERE EXISTS(SELECT 1 FROM professions WHERE account_id=? AND paid=1)",v.id,now,v.id)
  ]);if(!r[0].meta.changes&&!await one('SELECT 1 FROM professions WHERE account_id=? AND profession=? AND paid=1',v.id,v.profession))fail('Você precisa de 100 gold.');return {ok:true};
 }
 if(op==='recipe-learn'){
  hero();const item=await one(`SELECT * FROM items WHERE id=? AND account_id=? AND hero=? AND ${owned}`,v.item,v.id,v.hero),recipe=RECIPES[ITEMS[item?.catalog_id]?.recipe];if(!recipe)fail('Receita indisponível.');
  const r=await db.batch([
   stmt(`INSERT OR IGNORE INTO recipes(account_id,recipe) SELECT ?,? WHERE EXISTS(SELECT 1 FROM professions WHERE account_id=? AND profession=? AND paid=1) AND EXISTS(SELECT 1 FROM items WHERE id=? AND account_id=? AND hero=? AND ${owned})`,v.id,recipe.id,v.id,recipe.profession,v.item,v.id,v.hero),
   // Only consume on the first learning. changes() refers to the preceding insertion in this transaction.
   stmt("UPDATE items SET location='consumed' WHERE id=? AND changes()=1",v.item)
  ]);if(!r[0].meta.changes)fail('Aprenda a profissão primeiro; receitas já aprendidas não são consumidas.');return {ok:true};
 }
 if(op==='craft'){
  hero();const recipe=RECIPES[v.recipe];if(!recipe)fail('Receita inválida.');const materials=Object.entries(recipe.materials);const requirements=materials.map(()=>`(SELECT COUNT(*) FROM items WHERE account_id=? AND hero=? AND catalog_id=? AND ${owned})>=?`).join(' AND ');
  const r=await db.batch([
   stmt(`INSERT INTO economy_operations(id,account_id,kind,created_at) SELECT ?,?,'craft',? WHERE EXISTS(SELECT 1 FROM recipes WHERE account_id=? AND recipe=?) AND EXISTS(SELECT 1 FROM professions WHERE account_id=? AND profession=? AND paid=1) AND ${requirements}`,receipt,v.id,now,v.id,recipe.id,v.id,recipe.profession,...materials.flatMap(([material,count])=>[v.id,v.hero,material,count])),
   ...materials.map(([material,count])=>stmt(`UPDATE items SET location='consumed' WHERE id IN (SELECT id FROM items WHERE account_id=? AND hero=? AND catalog_id=? AND ${owned} ORDER BY created_at,id LIMIT ?) AND ${gate}`,v.id,v.hero,material,count,receipt)),
   stmt(`INSERT INTO items(id,account_id,hero,catalog_id,slot,created_at) SELECT ?,?,?,?,'consumable',? WHERE ${gate}`,receipt,v.id,v.hero,recipe.output,now,receipt),done(receipt)
  ]);if(!r[0].meta.changes)fail('Receita não aprendida ou materiais insuficientes no inventário desse herói.');return {ok:true,item:recipe.output};
 }
 if(op==='hotbar-set'){
  hero();if(!Number.isInteger(v.slot)||v.slot<1||v.slot>5)fail('Atalho inválido.');
  if(!v.catalog){await run('DELETE FROM hero_hotbar WHERE account_id=? AND hero=? AND slot=?',v.id,v.hero,v.slot);return {ok:true};}
  if(ITEMS[v.catalog]?.kind!=='consumable')fail('Escolha um consumível.');
  const r=await run(`INSERT INTO hero_hotbar(account_id,hero,slot,catalog_id) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM items WHERE account_id=? AND hero=? AND catalog_id=? AND ${owned}) ON CONFLICT(account_id,hero,slot) DO UPDATE SET catalog_id=excluded.catalog_id`,v.id,v.hero,v.slot,v.catalog,v.id,v.hero,v.catalog);if(!r.meta.changes)fail('Poção indisponível.');return {ok:true};
 }
 // Internal RPC only. Room supplies account, hero and globally unique use ID; never expose via HTTP.
 if(op==='potion-use'){
  hero();if(typeof v.useId!=='string'||v.useId.length>150)fail('Uso inválido.');const id=v.useId;
  const r=await db.batch([
   stmt(`INSERT OR IGNORE INTO economy_operations(id,account_id,kind,created_at) SELECT ?,?,'potion',? WHERE COALESCE((SELECT until FROM potion_cooldowns WHERE account_id=? AND hero=?),0)<=? AND EXISTS(SELECT 1 FROM items WHERE account_id=? AND hero=? AND catalog_id=(SELECT catalog_id FROM hero_hotbar WHERE account_id=? AND hero=? AND slot=?) AND ${owned})`,id,v.id,now,v.id,v.hero,now,v.id,v.hero,v.id,v.hero,v.slot),
   stmt(`UPDATE items SET location='consumed' WHERE id=(SELECT id FROM items WHERE account_id=? AND hero=? AND catalog_id=(SELECT catalog_id FROM hero_hotbar WHERE account_id=? AND hero=? AND slot=?) AND ${owned} ORDER BY created_at,id LIMIT 1) AND ${gate}`,v.id,v.hero,v.id,v.hero,v.slot,id),
   stmt(`INSERT INTO potion_cooldowns(account_id,hero,until) SELECT ?,?,? WHERE ${gate} ON CONFLICT(account_id,hero) DO UPDATE SET until=excluded.until`,v.id,v.hero,now+POTION.cooldownMs,id),done(id)
  ]);return {consumed:r[0].meta.changes===1,healFraction:POTION.healFraction,cooldownUntil:now+POTION.cooldownMs};
 }
 if(op==='mail-list'){
  const page=Math.max(1,Number(v.page)||1);const rows=await all('SELECT * FROM mail WHERE account_id=? ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?',v.id,(page-1)*20);return {messages:rows.slice(0,20),page,hasMore:rows.length>20};
 }
 if(op==='mail-read'){await run('UPDATE mail SET is_read=1 WHERE account_id=? AND id=?',v.id,v.mail);return {ok:true};}
 if(op==='mail-claim'){
  const clause=v.all===true?'':' AND id=?',args=v.all===true?[]:[String(v.mail??'')];
  await db.batch([stmt(`UPDATE accounts SET gold=gold+COALESCE((SELECT SUM(gold) FROM mail WHERE account_id=? AND claimed=0${clause}),0) WHERE id=?`,v.id,...args,v.id),stmt(`UPDATE mail SET claimed=1,is_read=1 WHERE account_id=?${clause}`,v.id,...args)]);return {ok:true};
 }
 if(op==='weekly-claim'){
  hero();const claimWeek=weekStart(),week=claimWeek-7*86400000,itemId=crypto.randomUUID();const key=await one("SELECT * FROM mythic_keys WHERE account_id=? AND hero=? AND week=? AND status='available' ORDER BY level DESC,chapter DESC LIMIT 1",v.id,v.hero,week);if(!key)fail('Este herói não possui uma chave válida da semana anterior.');
  const pool=Object.values(ITEMS).filter(x=>x.hero===v.hero&&x.tier===key.chapter);const def=pool[Math.floor(Math.random()*pool.length)];
  const r=await db.batch([
   stmt("INSERT OR IGNORE INTO weekly_claims(account_id,hero,week,level,item_id,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM mythic_keys WHERE account_id=? AND hero=? AND chapter=? AND week=? AND level=? AND status='available')",v.id,v.hero,claimWeek,key.level,itemId,now,v.id,v.hero,key.chapter,week,key.level),
   stmt('INSERT OR IGNORE INTO items(id,account_id,hero,catalog_id,slot,quality,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM weekly_claims WHERE item_id=?)',itemId,v.id,v.hero,def.id,def.slot,qualityBand(key.level),now,itemId)
  ]);if(!r[0].meta.changes)fail('Resgate já realizado ou chave indisponível.',409);return {ok:true,item:itemDefinition({catalog_id:def.id,quality:qualityBand(key.level)})};
 }
 if(op==='achievement-seen'){await run('UPDATE achievements SET seen=1 WHERE account_id=?',v.id);return {ok:true};}
 if(op==='title-set'){
  hero();if(v.title!==''&&(!ACHIEVEMENTS[v.title]?.title||!await one('SELECT 1 FROM achievements WHERE account_id=? AND hero=? AND achievement=?',v.id,v.hero,v.title)))fail('Título não obtido.');
  await run("INSERT INTO hero_progress(account_id,hero,title) VALUES(?,?,?) ON CONFLICT(account_id,hero) DO UPDATE SET title=excluded.title",v.id,v.hero,v.title);return {ok:true};
 }
 if(op==='skin-buy'){
  const skin=SKINS[v.skin];if(!skin)fail('Skin inválida.');
  const r=await db.batch([stmt('INSERT OR IGNORE INTO skins(account_id,skin) SELECT ?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE id=? AND gems>=?)',v.id,skin.id,v.id,skin.price),stmt('UPDATE accounts SET gems=gems-? WHERE id=? AND EXISTS(SELECT 1 FROM skins WHERE account_id=? AND skin=? AND paid=0)',skin.price,v.id,v.id,skin.id),stmt('UPDATE skins SET paid=1 WHERE account_id=? AND skin=?',v.id,skin.id)]);
  if(!r[0].meta.changes&&!await one('SELECT 1 FROM skins WHERE account_id=? AND skin=? AND paid=1',v.id,skin.id))fail('Gemas insuficientes.');return {ok:true};
 }
 if(op==='skin-set'){
  hero();if(v.skin!=='default'&&(SKINS[v.skin]?.hero!==v.hero||!await one('SELECT 1 FROM skins WHERE account_id=? AND skin=? AND paid=1',v.id,v.skin)))fail('Skin indisponível.');
  await run('INSERT INTO hero_progress(account_id,hero,skin) VALUES(?,?,?) ON CONFLICT(account_id,hero) DO UPDATE SET skin=excluded.skin',v.id,v.hero,v.skin);return {ok:true};
 }
 if(op.startsWith('bank-')){
  const member=await one('SELECT m.*,c.owner FROM clan_members m JOIN clans c ON c.id=m.clan_id WHERE m.account_id=?',v.id);if(!member)fail('Entre em um clã.',403);const clan=member.clan_id;
  const membership='EXISTS(SELECT 1 FROM clan_members WHERE account_id=? AND clan_id=?)';
  if(op==='bank-view'){
   await db.batch([1,2,3,4].map(tab=>stmt('INSERT OR IGNORE INTO clan_bank_tabs(clan_id,tab,name,paid) SELECT ?,?,?,1 WHERE EXISTS(SELECT 1 FROM clans WHERE id=?)',clan,tab,`Aba ${tab}`,clan)));
   return {owner:member.owner===v.id,tabs:await all(`SELECT * FROM clan_bank_tabs WHERE clan_id=? AND paid=1 AND ${membership} ORDER BY tab`,clan,v.id,clan),items:(await all(`SELECT * FROM items WHERE location='bank' AND bank_clan=? AND ${membership} ORDER BY created_at DESC`,clan,v.id,clan)).map(i=>({...i,definition:itemDefinition(i)}))};
  }
  if(op==='bank-unlock'){
   const tab=Number(v.tab);if(!Number.isInteger(tab)||tab<5||tab>8||member.owner!==v.id)fail('Somente o líder pode liberar a próxima aba.',403);const cost=(tab-4)*500;
   const r=await db.batch([stmt('INSERT OR IGNORE INTO clan_bank_tabs(clan_id,tab,name) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM clans WHERE id=? AND owner=?) AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND gold>=?) AND EXISTS(SELECT 1 FROM clan_bank_tabs WHERE clan_id=? AND tab=? AND paid=1)',clan,tab,`Aba ${tab}`,clan,v.id,v.id,cost,clan,tab-1),stmt('UPDATE accounts SET gold=gold-? WHERE id=? AND EXISTS(SELECT 1 FROM clan_bank_tabs WHERE clan_id=? AND tab=? AND paid=0)',cost,v.id,clan,tab),stmt('UPDATE clan_bank_tabs SET paid=1 WHERE clan_id=? AND tab=?',clan,tab)]);
   if(!r[0].meta.changes)fail('Aba já liberada, etapa inválida ou gold insuficiente.');return {ok:true};
  }
  if(op==='bank-rename'){
   const name=String(v.name??'').normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu,'').trim();if(!name||name.length>24)fail('Use um nome de 1 a 24 caracteres.');
   const r=await run('UPDATE clan_bank_tabs SET name=? WHERE clan_id=? AND tab=? AND EXISTS(SELECT 1 FROM clans WHERE id=? AND owner=?)',name,clan,v.tab,clan,v.id);if(!r.meta.changes)fail('Somente o líder pode renomear.',403);return {ok:true};
  }
  if(op==='bank-deposit'){
   const r=await run(`UPDATE items SET location='bank',bank_clan=?,bank_tab=? WHERE id=? AND account_id=? AND ${owned} AND NOT EXISTS(SELECT 1 FROM hero_hotbar hb WHERE hb.account_id=items.account_id AND hb.hero=items.hero AND hb.catalog_id=items.catalog_id) AND ${membership} AND EXISTS(SELECT 1 FROM clan_bank_tabs WHERE clan_id=? AND tab=? AND paid=1)`,clan,v.tab,v.item,v.id,v.id,clan,clan,v.tab);if(!r.meta.changes)fail('Item ou aba indisponível.',409);return {ok:true};
  }
  if(op==='bank-withdraw'){
   hero();const r=await run(`UPDATE items SET location='inventory',account_id=?,hero=?,bank_clan=NULL,bank_tab=NULL WHERE id=? AND bank_clan=? AND location='bank' AND ${membership}`,v.id,v.hero,v.item,clan,v.id,clan);if(!r.meta.changes)fail('Item indisponível.',409);return {ok:true};
  }
 }
 return undefined;
}
