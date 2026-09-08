// server/catalog.mjs
var HERO_IDS = ["kael", "lyra", "aurel", "sylva"];
var SLOTS = { head: "Cabe\xE7a", armor: "Armadura", weapon: "Arma", gloves: "Luvas", boots: "Botas", accessory: "Acess\xF3rio" };
var BALANCE = { version: 1, maxLevel: 100, xpBase: 100, xpGrowth: 1.18, mobXp: { goblin: 20, bat: 12, wraith: 32, boss: 150 }, chapterXp: [0, 1, 1.7, 2.6], chapterGold: [0, 80, 150, 250] };
function progression(xp = 0) {
  let level = 1, current = Math.max(0, xp);
  while (level < BALANCE.maxLevel) {
    const required = Math.round(BALANCE.xpBase * BALANCE.xpGrowth ** (level - 1));
    if (current < required) return { level, xp: current, nextXp: required, totalXp: xp };
    current -= required;
    level++;
  }
  return { level, xp: 0, nextXp: 0, totalXp: xp };
}
function killXp(kind, chapter) {
  return Math.round((BALANCE.mobXp[kind] ?? BALANCE.mobXp.goblin) * BALANCE.chapterXp[chapter]);
}
var labels = { head: "Coroa", armor: "Vestes", weapon: "Arma", gloves: "Luvas", boots: "Botas", accessory: "Talism\xE3" };
var themes = ["", "da Floresta", "de Obsidiana", "da Geada"];
var ITEMS = Object.fromEntries([1, 2, 3].flatMap((tier) => HERO_IDS.flatMap((hero) => Object.keys(SLOTS).map((slot) => {
  const id = `${hero}_${slot}_${tier}`;
  const attributes2 = slot === "head" ? { maxHp: 8 * tier, defense: 2 * tier } : slot === "armor" ? { maxHp: 15 * tier, defense: 4 * tier } : slot === "weapon" ? { damage: 6 * tier } : slot === "gloves" ? { attackSpeed: 5 * tier, damage: 2 * tier } : slot === "boots" ? { speed: 4 * tier, defense: tier } : { maxHp: 5 * tier, damage: 3 * tier };
  return [id, { id, name: `${labels[slot]} ${themes[tier]} \xB7 ${hero[0].toUpperCase() + hero.slice(1)}`, slot, hero, tier, requiredLevel: 1, attributes: attributes2 }];
}))));
function attributes(hero, xp, items = []) {
  const level = progression(xp).level;
  const result = { maxHp: 100 + (level - 1) * 4, damage: 100 + (level - 1) * 2, defense: 0, speed: 100, attackSpeed: 100 };
  for (const item of items) {
    const def = ITEMS[item.catalog_id ?? item];
    if (def?.hero !== hero) continue;
    for (const [key, value] of Object.entries(def.attributes)) result[key] += value;
  }
  result.speed = Math.min(150, result.speed);
  result.attackSpeed = Math.min(200, result.attackSpeed);
  return result;
}
function weekStart(now = Date.now()) {
  const local = new Date(now - 3 * 36e5);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() - (local.getUTCDay() + 6) % 7);
  return local.getTime() + 3 * 36e5;
}

// worker/expansion-data.mjs
var fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
async function expansionData(db, op, v) {
  const stmt = (sql, ...args) => db.prepare(sql).bind(...args), one = (sql, ...args) => stmt(sql, ...args).first(), all = async (sql, ...args) => (await stmt(sql, ...args).all()).results, run = (sql, ...args) => stmt(sql, ...args).run();
  const page = Math.max(1, Math.min(1e4, Number(v.page) || 1)), offset = (page - 1) * 20;
  if (op === "key-activate") {
    if (!HERO_IDS.includes(v.hero) || ![1, 2, 3].includes(v.chapter) || typeof v.round !== "string") fail("Chave inv\xE1lida.");
    const week = weekStart();
    await run("UPDATE mythic_keys SET status='active',run_id=?,resolved=0 WHERE account_id=? AND hero=? AND chapter=? AND week=? AND status='available'", v.round, v.id, v.hero, v.chapter, week);
    const key = await one("SELECT * FROM mythic_keys WHERE run_id=? AND account_id=? AND hero=? AND chapter=? AND week=? AND status='active'", v.round, v.id, v.hero, v.chapter, week);
    if (!key) fail("Chave indispon\xEDvel, j\xE1 usada ou expirada.", 409);
    return key;
  }
  if (op === "key-resolve") {
    const success = v.success === true, upgrade = Number(v.upgrade);
    if (success && (!Number.isInteger(upgrade) || upgrade < 0 || upgrade > 3)) fail("Resultado inv\xE1lido.");
    await run("UPDATE mythic_keys SET status=?,level=MIN(100,level+?),resolved=1 WHERE run_id=? AND resolved=0", success ? "available" : "broken", success ? upgrade : 0, v.round);
    return { ok: true };
  }
  if (op === "market-history") {
    const side = v.side === "buy" ? "buyer" : v.side === "sell" ? "seller" : null;
    const rows = await all(`SELECT s.*,i.catalog_id,b.display_name AS buyer_name,a.display_name AS seller_name FROM sales s JOIN items i ON i.id=s.item_id JOIN accounts b ON b.id=s.buyer JOIN accounts a ON a.id=s.seller WHERE s.applied=1 AND ${side ? "s." + side + "=?" : "(s.buyer=? OR s.seller=?)"} ORDER BY s.created_at DESC,s.id DESC LIMIT 21 OFFSET ?`, v.id, ...side ? [] : [v.id], offset);
    return { transactions: rows.slice(0, 20).map((s) => ({ ...s, definition: ITEMS[s.catalog_id] })), page, hasMore: rows.length > 20 };
  }
  if (op === "payment-create") {
    if (!Number.isSafeInteger(v.amountCents) || v.amountCents < 1 || v.coins !== 10) fail("Produto inv\xE1lido.");
    const r = await run("INSERT OR IGNORE INTO payment_orders(id,account_id,amount_cents,coins,live,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM payment_orders WHERE account_id=? AND created_at>?)<10", v.order, v.id, v.amountCents, v.coins, v.live ? 1 : 0, Date.now(), v.id, Date.now() - 36e5);
    const order = await one("SELECT * FROM payment_orders WHERE id=? AND account_id=?", v.order, v.id);
    if (!order) fail("Limite de cobran\xE7as por hora atingido.", 429);
    return order;
  }
  if (op === "payment-get") return one("SELECT * FROM payment_orders WHERE id=?" + (v.id ? " AND account_id=?" : ""), v.order, ...v.id ? [v.id] : []);
  if (op === "payment-list") return { orders: await all("SELECT id,amount_cents,coins,status,granted,live,created_at FROM payment_orders WHERE account_id=? ORDER BY created_at DESC LIMIT 20", v.id) };
  if (op === "payment-update") {
    const order = await one("SELECT * FROM payment_orders WHERE id=?", v.order);
    if (!order) fail("Cobran\xE7a n\xE3o encontrada.", 404);
    if (order.provider_id && order.provider_id !== v.providerId) fail("Pagamento divergente.", 409);
    if (order.amount_cents !== v.amountCents || Boolean(order.live) !== v.live) fail("Valor ou ambiente divergente.", 409);
    const granted = v.live && v.status === "approved" ? order.coins : 0;
    const current = "updated_at<=? AND (status NOT IN ('refunded','charged_back') OR ? IN ('refunded','charged_back'))";
    await db.batch([
      stmt(`UPDATE accounts SET gems=gems+?-COALESCE((SELECT granted FROM payment_orders WHERE id=?),0) WHERE id=? AND EXISTS(SELECT 1 FROM payment_orders WHERE id=? AND ${current})`, granted, v.order, order.account_id, v.order, v.updatedAt, v.status),
      stmt(`UPDATE payment_orders SET provider_id=?,status=?,granted=?,updated_at=? WHERE id=? AND ${current}`, v.providerId, v.status, granted, v.updatedAt, v.order, v.updatedAt, v.status)
    ]);
    return one("SELECT * FROM payment_orders WHERE id=?", v.order);
  }
  if (!op.startsWith("clan-")) return void 0;
  const mine = await one("SELECT m.*,c.owner,c.name FROM clan_members m JOIN clans c ON c.id=m.clan_id WHERE m.account_id=?", v.id);
  if (op === "clan-view") {
    if (!mine) return { clan: null, clans: await all("SELECT c.id,c.name,COUNT(m.account_id) AS members,EXISTS(SELECT 1 FROM clan_requests r WHERE r.clan_id=c.id AND r.account_id=? AND r.kind=?) AS applied FROM clans c LEFT JOIN clan_members m ON m.clan_id=c.id WHERE instr(c.name_key,?)>0 GROUP BY c.id ORDER BY c.name_key LIMIT 21 OFFSET ?", v.id, "apply", String(v.q ?? "").normalize("NFKC").toLowerCase().slice(0, 32), offset), invites: await all("SELECT c.id,c.name FROM clan_requests r JOIN clans c ON c.id=r.clan_id WHERE r.account_id=? AND r.kind='invite'", v.id), page };
    return { clan: mine, members: await all("SELECT m.account_id AS id,m.role,a.display_name AS name,a.username,EXISTS(SELECT 1 FROM presence p JOIN sessions s ON s.hash=p.session_hash WHERE p.account_id=m.account_id AND p.last_seen>? AND s.expires_at>?) AS online FROM clan_members m JOIN accounts a ON a.id=m.account_id WHERE m.clan_id=? ORDER BY m.role,a.username", Date.now() - 75e3, Date.now(), mine.clan_id), applications: mine.role === "admin" ? await all("SELECT a.id,a.display_name AS name FROM clan_requests r JOIN accounts a ON a.id=r.account_id WHERE r.clan_id=? AND r.kind='apply'", mine.clan_id) : [] };
  }
  if (op === "clan-create") {
    const name = String(v.name ?? "").normalize("NFKC").trim();
    if (!/^[\p{L}\p{N} _-]{3,32}$/u.test(name)) fail("Use de 3 a 32 letras, n\xFAmeros, espa\xE7os, _ ou -.");
    if (mine) fail("Voc\xEA j\xE1 pertence a um cl\xE3.");
    const id = crypto.randomUUID();
    const result = await db.batch([
      stmt("INSERT INTO clans(id,name,name_key,owner,created_at) SELECT ?,?,?,id,? FROM accounts WHERE id=? AND gold>=1000 AND NOT EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)", id, name, name.toLowerCase(), Date.now(), v.id, v.id),
      stmt("UPDATE accounts SET gold=gold-1000 WHERE id=? AND EXISTS(SELECT 1 FROM clans WHERE id=? AND paid=0)", v.id, id),
      stmt("INSERT INTO clan_members(account_id,clan_id,role,joined_at) SELECT owner,id,'admin',created_at FROM clans WHERE id=? AND paid=0", id),
      stmt("UPDATE clans SET paid=1 WHERE id=?", id),
      stmt("DELETE FROM clan_requests WHERE account_id=? AND EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)", v.id, v.id)
    ]);
    if (!result[0].meta.changes) fail("Voc\xEA precisa de 1.000 gold e n\xE3o pode pertencer a outro cl\xE3.", 409);
    return { ok: true };
  }
  const clan = mine?.clan_id ?? String(v.clan ?? "");
  if (op === "clan-apply") {
    if (mine) fail("Voc\xEA j\xE1 pertence a um cl\xE3.");
    if (!await one("SELECT id FROM clans WHERE id=?", clan)) fail("Cl\xE3 n\xE3o encontrado.", 404);
    await run("INSERT OR IGNORE INTO clan_requests(clan_id,account_id,kind,created_at) SELECT ?,?,'apply',? WHERE NOT EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)", clan, v.id, Date.now(), v.id);
    return { ok: true };
  }
  if (op === "clan-accept-invite") {
    if (mine) fail("Voc\xEA j\xE1 pertence a um cl\xE3.");
    const result = await db.batch([stmt("INSERT INTO clan_members(account_id,clan_id,role,joined_at) SELECT account_id,clan_id,'member',? FROM clan_requests WHERE clan_id=? AND account_id=? AND kind='invite' AND NOT EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)", Date.now(), clan, v.id, v.id), stmt("DELETE FROM clan_requests WHERE account_id=? AND EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)", v.id, v.id)]);
    if (!result[0].meta.changes) fail("Convite indispon\xEDvel.", 409);
    return { ok: true };
  }
  if (!mine) fail("Entre em um cl\xE3 primeiro.", 403);
  if (op === "clan-leave") {
    if (mine.owner === v.id) fail("O fundador precisa excluir o cl\xE3.");
    await run("DELETE FROM clan_members WHERE account_id=? AND clan_id=?", v.id, clan);
    return { ok: true };
  }
  if (mine.role !== "admin") fail("Somente administradores podem gerenciar o cl\xE3.", 403);
  const auth = "EXISTS(SELECT 1 FROM clan_members auth WHERE auth.account_id=? AND auth.clan_id=? AND auth.role='admin')", a = [v.id, clan];
  if (op === "clan-invite") {
    const target = await one("SELECT id FROM accounts WHERE username=?", String(v.username ?? "").trim().toLowerCase());
    if (!target) fail("Jogador n\xE3o encontrado.", 404);
    const r = await run(`INSERT OR IGNORE INTO clan_requests(clan_id,account_id,kind,created_at) SELECT ?,?,'invite',? WHERE ${auth} AND NOT EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)`, clan, target.id, Date.now(), ...a, target.id);
    if (!r.meta.changes) fail("Jogador j\xE1 possui cl\xE3 ou convite.", 409);
    return { ok: true };
  }
  if (op === "clan-approve") {
    const result = await db.batch([stmt(`INSERT INTO clan_members(account_id,clan_id,role,joined_at) SELECT account_id,clan_id,'member',? FROM clan_requests WHERE clan_id=? AND account_id=? AND kind='apply' AND ${auth} AND NOT EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)`, Date.now(), clan, v.target, ...a, v.target), stmt("DELETE FROM clan_requests WHERE account_id=? AND EXISTS(SELECT 1 FROM clan_members WHERE account_id=?)", v.target, v.target)]);
    if (!result[0].meta.changes) fail("Solicita\xE7\xE3o indispon\xEDvel.", 409);
    return { ok: true };
  }
  if (op === "clan-reject") {
    await run(`DELETE FROM clan_requests WHERE clan_id=? AND account_id=? AND ${auth}`, clan, v.target, ...a);
    return { ok: true };
  }
  if (op === "clan-kick") {
    await run(`DELETE FROM clan_members WHERE account_id=? AND clan_id=? AND account_id<>(SELECT owner FROM clans WHERE id=?) AND ${auth} AND (role='member' OR EXISTS(SELECT 1 FROM clans WHERE id=? AND owner=?))`, v.target, clan, clan, ...a, clan, v.id);
    return { ok: true };
  }
  if (op === "clan-role") {
    if (!["admin", "member"].includes(v.role)) fail("Cargo inv\xE1lido.");
    await run("UPDATE clan_members SET role=? WHERE account_id=? AND clan_id=? AND account_id<>? AND EXISTS(SELECT 1 FROM clans WHERE id=? AND owner=?)", v.role, v.target, clan, v.id, clan, v.id);
    return { ok: true };
  }
  if (op === "clan-delete") {
    if (mine.owner !== v.id) fail("Somente o fundador pode excluir o cl\xE3.", 403);
    await db.batch([stmt("DELETE FROM chat_messages WHERE clan_id=? AND EXISTS(SELECT 1 FROM clans WHERE id=? AND owner=?)", clan, clan, v.id), stmt("DELETE FROM clans WHERE id=? AND owner=?", clan, v.id)]);
    return { ok: true };
  }
  fail("A\xE7\xE3o inv\xE1lida.");
}

// worker/game-data.mjs
var fail2 = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
async function gameData(db, op, v) {
  const extra = await expansionData(db, op, v);
  if (extra !== void 0) return extra;
  const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
  const one = (sql, ...args) => stmt(sql, ...args).first();
  const all = async (sql, ...args) => (await stmt(sql, ...args).all()).results;
  const run = (sql, ...args) => stmt(sql, ...args).run();
  const pair = (a, b) => [a, b].sort();
  const validHero = (hero) => {
    if (!HERO_IDS.includes(hero)) fail2("Her\xF3i inv\xE1lido.");
  };
  const related = async (a, b) => {
    const [x, y] = pair(a, b);
    return one("SELECT * FROM friendships WHERE a=? AND b=?", x, y);
  };
  const itemView = (i) => ({ ...i, definition: ITEMS[i.catalog_id] });
  const page = Math.max(1, Math.min(1e4, Number(v.page) || 1)), offset = (page - 1) * 20;
  if (op === "game-profile") {
    const [heroes, items, account] = await Promise.all([all("SELECT * FROM hero_progress WHERE account_id=?", v.id), all("SELECT i.*,EXISTS(SELECT 1 FROM listings l WHERE l.item_id=i.id AND l.status=?) AS listed FROM items i WHERE account_id=? ORDER BY created_at DESC", "active", v.id), one("SELECT gold,gems FROM accounts WHERE id=?", v.id)]);
    const keys = await all("SELECT * FROM mythic_keys WHERE account_id=? AND week=?", v.id, weekStart());
    const clan = await one("SELECT clan_id,role FROM clan_members WHERE account_id=?", v.id);
    return { gems: account?.gems ?? 0, clan, gold: account?.gold ?? 0, heroes: HERO_IDS.map((id) => {
      const xp = heroes.find((h) => h.hero === id)?.xp ?? 0;
      const inventory = items.filter((i) => i.hero === id);
      return { id, unlockedChapter: heroes.find((h) => h.hero === id)?.unlocked_chapter ?? 1, keys: keys.filter((k) => k.hero === id), ...progression(xp), attributes: attributes(id, xp, inventory.filter((i) => i.equipped)), inventory: inventory.map(itemView) };
    }) };
  }
  if (op === "equip") {
    validHero(v.hero);
    if (typeof v.equip !== "boolean") fail2("A\xE7\xE3o inv\xE1lida.");
    const item = await one("SELECT * FROM items WHERE id=? AND account_id=? AND hero=?", v.item, v.id, v.hero), def = ITEMS[item?.catalog_id];
    if (!item || !def) fail2("Item n\xE3o encontrado.", 404);
    if (v.equip) {
      if (def.hero !== v.hero) fail2("Este item pertence a outra classe.");
      const h = await one("SELECT xp FROM hero_progress WHERE account_id=? AND hero=?", v.id, v.hero);
      if (progression(h?.xp ?? 0).level < def.requiredLevel) fail2("N\xEDvel insuficiente.");
    }
    if (await one("SELECT id FROM listings WHERE item_id=? AND status='active'", v.item)) fail2("Cancele a venda antes de equipar.");
    const condition = "EXISTS(SELECT 1 FROM items target WHERE target.id=? AND target.account_id=? AND target.hero=? AND NOT EXISTS(SELECT 1 FROM listings l WHERE l.item_id=target.id AND l.status='active'))";
    await db.batch([stmt(`UPDATE items SET equipped=0 WHERE account_id=? AND hero=? AND slot=? AND ${condition}`, v.id, v.hero, item.slot, v.item, v.id, v.hero), stmt(`UPDATE items SET equipped=? WHERE id=? AND account_id=? AND hero=? AND NOT EXISTS(SELECT 1 FROM listings WHERE item_id=items.id AND status='active')`, v.equip ? 1 : 0, v.item, v.id, v.hero)]);
    return { ok: true };
  }
  if (op === "rewards" || op === "settle") {
    let applyRewards = function(q, p) {
      q.push(stmt("INSERT INTO hero_progress(account_id,hero,xp) SELECT ?,?,SUM(xp) FROM reward_events WHERE account_id=? AND hero=? AND round_id=? AND applied=0 HAVING COUNT(*)>0 ON CONFLICT(account_id,hero) DO UPDATE SET xp=xp+excluded.xp", p.id, p.hero, p.id, p.hero, v.round));
      q.push(stmt("UPDATE accounts SET gold=gold+COALESCE((SELECT SUM(gold) FROM reward_events WHERE account_id=? AND hero=? AND round_id=? AND applied=0),0) WHERE id=?", p.id, p.hero, v.round, p.id));
      q.push(stmt("UPDATE reward_events SET applied=1 WHERE account_id=? AND hero=? AND round_id=? AND applied=0", p.id, p.hero, v.round));
    };
    if (![1, 2, 3].includes(v.chapter) || !["solo", "coop", "pvp"].includes(v.mode) || !Array.isArray(v.players) || !v.players.length || v.players.length > 4 || !Array.isArray(v.kills) || v.kills.length > 100) fail2("Partida inv\xE1lida.");
    const now = v.finishedAt ?? Date.now(), queries = [];
    if (op === "settle") queries.push(stmt("INSERT OR IGNORE INTO matches(id,mode,chapter,duration_ms,outcome,week,created_at,mythic_level) VALUES(?,?,?,?,?,?,?,?)", v.round, v.mode, v.chapter, Math.max(0, Math.round(v.duration * 1e3)), v.outcome, weekStart(now), now, v.mythic?.level ?? 0));
    for (const p of v.players) {
      validHero(p.hero);
      if (v.mode !== "pvp") {
        const kills = p.earnedKills ?? v.kills;
        for (let offset2 = 0; offset2 < kills.length; offset2 += 12) {
          const batch = kills.slice(offset2, offset2 + 12);
          queries.push(stmt("INSERT OR IGNORE INTO reward_events(id,account_id,hero,xp,gold,created_at,round_id) VALUES " + batch.map(() => "(?,?,?,?,0,?,?)").join(","), ...batch.flatMap((k) => [`${v.round}:${p.id}:mob:${k.id}`, p.id, p.hero, killXp(k.kind, v.chapter), now, v.round])));
        }
      }
      if (op !== "settle") {
        applyRewards(queries, p);
        continue;
      }
      const won = v.mode !== "pvp" && v.outcome === "won" && !p.departed, gold = won ? BALANCE.chapterGold[v.chapter] : 0;
      let itemId = null;
      if (won) {
        const def = ITEMS[p.loot];
        if (!def || def.tier !== v.chapter) fail2("Loot inv\xE1lido.");
        itemId = `${v.round}:${p.id}:item`;
        queries.push(stmt("INSERT OR IGNORE INTO reward_events(id,account_id,hero,xp,gold,created_at,round_id) VALUES(?,?,?,0,?,?,?)", `${v.round}:${p.id}:clear`, p.id, p.hero, gold, now, v.round));
        queries.push(stmt("INSERT OR IGNORE INTO items(id,account_id,hero,catalog_id,slot,equipped,created_at) VALUES(?,?,?,?,?,0,?)", itemId, p.id, p.hero, def.id, def.slot, now));
        queries.push(stmt("INSERT OR IGNORE INTO completions(id,account_id,chapter,created_at) VALUES(?,?,?,?)", `${v.round}:${p.id}`, p.id, v.chapter, now));
        queries.push(stmt("INSERT INTO hero_progress(account_id,hero,unlocked_chapter) VALUES(?,?,?) ON CONFLICT(account_id,hero) DO UPDATE SET unlocked_chapter=MAX(unlocked_chapter,excluded.unlocked_chapter)", p.id, p.hero, Math.min(3, v.chapter + 1)));
        if (!v.mythic) queries.push(stmt("INSERT OR IGNORE INTO mythic_keys(account_id,hero,chapter,week) VALUES(?,?,?,?)", p.id, p.hero, v.chapter, weekStart(now)));
      }
      const outcome = p.departed ? "left" : v.mode === "pvp" ? p.id === v.winner ? "won" : "lost" : v.outcome;
      queries.push(stmt("INSERT OR IGNORE INTO match_players(match_id,account_id,hero,name,kills,outcome,gold,item_id) VALUES(?,?,?,?,?,?,?,?)", v.round, p.id, p.hero, p.name, v.mode === "pvp" ? p.id === v.winner && v.reason === "knockout" ? 1 : 0 : v.kills.length, outcome, gold, itemId));
    }
    if (op === "settle") for (const p of v.players) applyRewards(queries, p);
    await db.batch(queries);
    if (op === "rewards") return { ok: true };
    return { rewards: await all("SELECT p.account_id,p.gold,i.catalog_id FROM match_players p LEFT JOIN items i ON i.id=p.item_id WHERE p.match_id=?", v.round) };
  }
  if (op === "presence") {
    await run("INSERT INTO presence(account_id,session_hash,last_seen) VALUES(?,?,?) ON CONFLICT(account_id,session_hash) DO UPDATE SET last_seen=excluded.last_seen", v.id, v.session, Date.now());
    return { ok: true };
  }
  if (op === "friends") {
    const rows = await all("SELECT f.*,a.id,a.username,a.display_name AS name,EXISTS(SELECT 1 FROM presence p JOIN sessions s ON s.hash=p.session_hash WHERE p.account_id=a.id AND p.last_seen>? AND s.expires_at>?) AS online FROM friendships f JOIN accounts a ON a.id=CASE WHEN f.a=? THEN f.b ELSE f.a END WHERE f.a=? OR f.b=? ORDER BY f.status,a.username", Date.now() - 75e3, Date.now(), v.id, v.id, v.id);
    return { friends: rows.filter((r) => r.status === "accepted"), incoming: rows.filter((r) => r.status === "pending" && r.requester !== v.id), outgoing: rows.filter((r) => r.status === "pending" && r.requester === v.id) };
  }
  if (op === "friend-search") {
    const q = String(v.q ?? "").toLowerCase().trim();
    if (q.length < 3) return { users: [] };
    return { users: await all("SELECT a.id,a.username,a.display_name AS name,f.status,f.requester FROM accounts a LEFT JOIN friendships f ON f.a=MIN(a.id,?) AND f.b=MAX(a.id,?) WHERE a.id<>? AND instr(a.username,?)>0 ORDER BY a.username LIMIT 20", v.id, v.id, v.id, q.slice(0, 18)) };
  }
  if (op === "friend-action") {
    if (v.id === v.target) fail2("Escolha outro jogador.");
    const [a, b] = pair(v.id, String(v.target ?? ""));
    if (!await one("SELECT id FROM accounts WHERE id=?", v.target)) fail2("Jogador n\xE3o encontrado.", 404);
    if (v.action === "add") await run("INSERT OR IGNORE INTO friendships(a,b,requester,status,created_at) VALUES(?,?,?,'pending',?)", a, b, v.id, Date.now());
    else if (v.action === "accept") await run("UPDATE friendships SET status='accepted' WHERE a=? AND b=? AND requester<>? AND status='pending'", a, b, v.id);
    else if (["remove", "reject", "cancel"].includes(v.action)) await run("DELETE FROM friendships WHERE a=? AND b=?", a, b);
    else fail2("A\xE7\xE3o inv\xE1lida.");
    return { ok: true };
  }
  if (op === "chat-read" || op === "chat-send") {
    const clan = v.channel === "clan" ? await one("SELECT clan_id FROM clan_members WHERE account_id=?", v.id) : null;
    if (v.channel === "clan" && !clan) fail2("Entre em um cl\xE3 para conversar.");
    if (!["global", "friends", "clan"].includes(v.channel)) fail2("Canal inv\xE1lido.");
    const recipient = v.channel === "friends" ? String(v.target ?? "") : null;
    if (recipient && (await related(v.id, recipient))?.status !== "accepted") fail2("Adicione este jogador aos amigos para conversar.", 403);
    if (v.channel === "friends" && !recipient) fail2("Selecione um amigo.");
    if (op === "chat-send") {
      const body = String(v.body ?? "").normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
      if (!body || body.length > 500) fail2("Envie de 1 a 500 caracteres.");
      const recent = await one("SELECT COUNT(*) AS n FROM chat_messages WHERE sender=? AND created_at>?", v.id, Date.now() - 1e4);
      if (recent.n >= 5) fail2("Aguarde um momento antes de enviar mais mensagens.", 429);
      const inserted = await run("INSERT INTO chat_messages(sender,recipient,clan_id,body,created_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM chat_messages WHERE sender=? AND created_at>?)<5 AND (? IS NULL OR EXISTS(SELECT 1 FROM clan_members WHERE account_id=? AND clan_id=?))", v.id, recipient, clan?.clan_id ?? null, body, Date.now(), v.id, Date.now() - 1e4, clan?.clan_id ?? null, v.id, clan?.clan_id ?? null);
      if (inserted.meta.changes === 0) fail2("Aguarde um momento antes de enviar mais mensagens.", 429);
    }
    const condition = clan ? "m.clan_id=? AND EXISTS(SELECT 1 FROM clan_members WHERE account_id=? AND clan_id=m.clan_id)" : recipient ? "((m.sender=? AND m.recipient=?) OR (m.sender=? AND m.recipient=?))" : "m.recipient IS NULL AND m.clan_id IS NULL";
    const args = clan ? [clan.clan_id, v.id] : recipient ? [v.id, recipient, recipient, v.id] : [];
    return { messages: (await all(`SELECT m.id,m.sender,a.display_name AS name,m.body AS text,m.created_at FROM chat_messages m JOIN accounts a ON a.id=m.sender WHERE ${condition} ORDER BY m.id DESC LIMIT 60`, ...args)).reverse() };
  }
  if (op === "market-list") {
    const q = String(v.q ?? "").toLowerCase().slice(0, 100), ids = Object.values(ITEMS).filter((i) => (!v.slot || i.slot === v.slot) && i.name.toLowerCase().includes(q)).map((i) => i.id);
    if (!ids.length) return { listings: [], page, hasMore: false };
    const rows = await all(`SELECT l.*,i.catalog_id,a.display_name AS seller_name FROM listings l JOIN items i ON i.id=l.item_id JOIN accounts a ON a.id=l.seller WHERE l.status='active' AND i.catalog_id IN (${ids.map(() => "?").join(",")}) ${v.mine ? "AND l.seller=?" : ""} ORDER BY l.created_at DESC,l.id DESC LIMIT 21 OFFSET ?`, ...ids, ...v.mine ? [v.id] : [], offset);
    return { listings: rows.slice(0, 20).map(itemView), page, hasMore: rows.length > 20 };
  }
  if (op === "market-sell") {
    if (!Number.isSafeInteger(v.price) || v.price < 1 || v.price > 1e9) fail2("Informe um pre\xE7o inteiro entre 1 e 1 bilh\xE3o.");
    const result = await run("INSERT INTO listings(id,item_id,seller,price,created_at) SELECT ?,id,?,?,? FROM items WHERE id=? AND account_id=? AND equipped=0", crypto.randomUUID(), v.id, v.price, Date.now(), v.item, v.id);
    if (result.meta.changes === 0) fail2("Este item n\xE3o est\xE1 dispon\xEDvel para venda.", 409);
    return { ok: true };
  }
  if (op === "market-cancel") {
    await run("UPDATE listings SET status='cancelled' WHERE id=? AND seller=? AND status='active'", v.listing, v.id);
    return { ok: true };
  }
  if (op === "market-buy") {
    validHero(v.hero);
    const id = crypto.randomUUID();
    const result = await db.batch([
      stmt("INSERT INTO sales(id,listing_id,buyer,hero,created_at,item_id,seller,price) SELECT ?,l.id,?,?,?,l.item_id,l.seller,l.price FROM listings l JOIN items i ON i.id=l.item_id JOIN accounts a ON a.id=? WHERE l.id=? AND l.status='active' AND l.seller<>? AND i.account_id=l.seller AND i.equipped=0 AND a.gold>=l.price", id, v.id, v.hero, Date.now(), v.id, v.listing, v.id),
      stmt("UPDATE accounts SET gold=gold-(SELECT price FROM sales WHERE id=?) WHERE id=(SELECT buyer FROM sales WHERE id=? AND applied=0)", id, id),
      stmt("UPDATE accounts SET gold=gold+(SELECT price FROM sales WHERE id=?) WHERE id=(SELECT seller FROM sales WHERE id=? AND applied=0)", id, id),
      stmt("UPDATE items SET account_id=?,hero=? WHERE id=(SELECT item_id FROM sales WHERE id=? AND applied=0)", v.id, v.hero, id),
      stmt("UPDATE listings SET status='sold' WHERE id=(SELECT listing_id FROM sales WHERE id=? AND applied=0)", id),
      stmt("UPDATE sales SET applied=1 WHERE id=? AND applied=0", id)
    ]);
    if (result[0].meta.changes === 0) fail2("Item vendido, saldo insuficiente ou compra inv\xE1lida.", 409);
    return { ok: true };
  }
  if (op === "history") {
    const modes = ["solo", "coop", "pvp"], mode = modes.includes(v.mode) ? v.mode : null;
    const rows = await all(`SELECT m.*,p.hero,p.outcome AS player_outcome,p.gold,p.kills,p.item_id FROM match_players p JOIN matches m ON m.id=p.match_id WHERE p.account_id=? ${mode ? "AND m.mode=?" : ""} ORDER BY m.created_at DESC,m.id DESC LIMIT 21 OFFSET ?`, v.id, ...mode ? [mode] : [], offset);
    return { matches: rows.slice(0, 20), page, hasMore: rows.length > 20 };
  }
  if (op === "ranking") {
    const mode = ["solo", "coop", "pvp"].includes(v.mode) ? v.mode : "solo", week = weekStart();
    if (mode === "pvp") return { week, nextReset: week + 7 * 864e5, entries: await all("SELECT a.id,a.display_name AS name,SUM(p.kills) AS kills FROM match_players p JOIN matches m ON m.id=p.match_id JOIN accounts a ON a.id=p.account_id WHERE m.week=? AND m.mode='pvp' GROUP BY a.id HAVING SUM(p.kills)>0 ORDER BY kills DESC,a.username LIMIT 100", week) };
    const mythic = v.mythic === "1";
    const chapter = [1, 2, 3].includes(Number(v.chapter)) ? Number(v.chapter) : null;
    const rows = await all(`WITH runs AS (SELECT m.*, (SELECT GROUP_CONCAT(account_id,',') FROM (SELECT account_id FROM match_players WHERE match_id=m.id ORDER BY account_id)) AS team,(SELECT GROUP_CONCAT(name,' + ') FROM (SELECT name FROM match_players WHERE match_id=m.id ORDER BY account_id)) AS name FROM matches m WHERE m.week=? AND m.mode=? AND m.outcome='won' AND m.mythic_level${mythic ? ">0" : "=0"} ${chapter ? "AND m.chapter=?" : ""} AND NOT EXISTS(SELECT 1 FROM match_players p WHERE p.match_id=m.id AND p.outcome<>'won')), ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY team,chapter ORDER BY mythic_level DESC,duration_ms,created_at,id) AS rank FROM runs) SELECT * FROM ranked WHERE rank=1 ORDER BY mythic_level DESC,duration_ms,created_at,id LIMIT 100`, week, mode, ...chapter ? [chapter] : []);
    return { week, nextReset: week + 7 * 864e5, entries: rows };
  }
  if (op === "admin") {
    return { accounts: await all("SELECT id,username,display_name,(SELECT GROUP_CONCAT(hero || ': ' || unlocked_chapter, ', ') FROM hero_progress WHERE account_id=accounts.id) AS hero_chapters,preferred_hero,gold,gems,created_at FROM accounts WHERE instr(username,?)>0 ORDER BY created_at DESC LIMIT 20 OFFSET ?", String(v.q ?? "").toLowerCase().slice(0, 18), offset), sessions: await all("SELECT a.username,s.expires_at,MAX(p.last_seen) AS last_seen FROM sessions s JOIN accounts a ON a.id=s.account_id LEFT JOIN presence p ON p.session_hash=s.hash WHERE s.expires_at>? GROUP BY s.hash ORDER BY last_seen DESC LIMIT 100", Date.now()), totals: await one("SELECT (SELECT COUNT(*) FROM accounts) AS accounts,(SELECT COUNT(*) FROM sessions WHERE expires_at>?) AS sessions,(SELECT COUNT(*) FROM listings WHERE status=?) AS listings,(SELECT COUNT(*) FROM items) AS items", Date.now(), "active"), page };
  }
  return void 0;
}

// worker/index.mjs
var json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function dataOperation(db, op, v) {
  const one = (sql, ...args) => db.prepare(sql).bind(...args).first();
  const run = (sql, ...args) => db.prepare(sql).bind(...args).run();
  if (op === "find-user") return one("SELECT * FROM accounts WHERE username = ?", v.username);
  if (op === "account") return one("SELECT * FROM accounts WHERE id = ?", v.id);
  if (op === "register") {
    await run("INSERT INTO accounts (id,username,display_name,password_hash,created_at) VALUES (?,?,?,?,?)", v.id, v.username, v.displayName, v.passwordHash, Date.now());
    return one("SELECT * FROM accounts WHERE id = ?", v.id);
  }
  if (op === "session-create") {
    await db.batch([db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()), db.prepare("INSERT INTO sessions (hash,account_id,expires_at) VALUES (?,?,?)").bind(v.hash, v.accountId, v.expiresAt)]);
    return { ok: true };
  }
  if (op === "session") return one("SELECT a.* FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.hash=? AND s.expires_at>?", v.hash, Date.now());
  if (op === "logout") {
    await run("DELETE FROM sessions WHERE hash=?", v.hash);
    return { ok: true };
  }
  if (op === "hero") {
    await run("UPDATE accounts SET preferred_hero=? WHERE id=?", v.hero, v.id);
    return { ok: true };
  }
  if (op === "complete") {
    if (![1, 2, 3].includes(v.chapter) || !Array.isArray(v.ids) || v.ids.length > 4) throw new Error("Invalid completion");
    const statements = [];
    for (const id of new Set(v.ids)) {
      statements.push(db.prepare("INSERT OR IGNORE INTO completions (id,account_id,chapter,created_at) SELECT ?,id,?,? FROM accounts WHERE id=? AND unlocked_chapter>=?").bind(`${v.round}:${id}`, v.chapter, Date.now(), id, v.chapter));
      statements.push(db.prepare("UPDATE accounts SET unlocked_chapter=MAX(unlocked_chapter,?) WHERE id=? AND unlocked_chapter>=?").bind(Math.min(3, v.chapter + 1), id, v.chapter));
    }
    await db.batch(statements);
    return { ok: true };
  }
  const result = await gameData(db, op, v);
  if (result !== void 0) return result;
  throw new Error("Unknown operation");
}
var index_default = { async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/internal/data") {
    if (!env.DATA_SERVICE_KEY || request.headers.get("Authorization") !== `Bearer ${env.DATA_SERVICE_KEY}`) return json({ error: "Unauthorized" }, 401);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    try {
      const body = await request.text();
      if (body.length > 6e4) return json({ error: "Payload too large" }, 413);
      const { op, value } = JSON.parse(body);
      return json({ value: await dataOperation(env.DB, op, value) });
    } catch (e) {
      console.error("Database operation failed", e?.message);
      return json({ error: e.status ? e.message : /purchase_unavailable/.test(e?.message ?? "") ? "Item vendido, saldo insuficiente ou compra inv\xE1lida." : /item_unavailable/.test(e?.message ?? "") ? "Este item n\xE3o est\xE1 dispon\xEDvel para venda." : /UNIQUE constraint/i.test(e?.message ?? "") ? "Opera\xE7\xE3o j\xE1 realizada ou registro existente." : "storage_unavailable" }, e.status ?? (/constraint|unavailable/.test(e?.message ?? "") ? 409 : 503));
    }
  }
  const target = new URL(env.GAME_SERVER_URL || "https://emberfall-server.onrender.com");
  target.pathname = url.pathname;
  target.search = url.search;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("authorization");
  headers.delete("x-emberfall-proxy");
  headers.set("x-emberfall-proxy", env.DATA_SERVICE_KEY || "");
  headers.set("x-emberfall-client-ip", request.headers.get("CF-Connecting-IP") || "unknown");
  try {
    return await fetch(new Request(target, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? void 0 : request.body, redirect: "manual" }));
  } catch {
    return json({ error: "O servidor est\xE1 despertando. Tente novamente em instantes." }, 503);
  }
} };
export {
  dataOperation,
  index_default as default
};
