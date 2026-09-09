import test from 'node:test';
import {Client} from '@colyseus/sdk';
import assert from 'node:assert/strict';
import {storage,migrate} from './helpers/storage.mjs';
import {Accounts} from '../server/accounts.mjs';
import {ITEMS,killXp,attributes,progression,weekStart} from '../server/catalog.mjs';
import {World,createPlayer} from '../dist/engine.js';
import {startServer} from '../server/main.mjs';
function setup(t){const store=storage();migrate(store);t.after(()=>store.sqlite.close());return store;}
async function user(store,id){return store.call('register',{id,username:id,displayName:id,passwordHash:'unused'});}
const player=(id,hero='kael',loot='kael_head_1')=>({id,name:id,hero,loot});
function run(round,players,extra={}){return {round,players,mode:players.length>1?'coop':'solo',chapter:1,duration:120,outcome:'won',finishedAt:Date.now(),kills:[{id:1,kind:'goblin'},{id:2,kind:'boss'}],...extra};}
test('rewards are personal, retry-safe, per hero and atomic; incompatible gear remains in original inventory',async t=>{
 const s=setup(t);await user(s,'alice');await user(s,'bob');const payload=run('round1',[player('alice','kael','lyra_head_1'),player('bob')]);
 await s.call('rewards',payload);await s.call('settle',payload);await s.call('settle',payload);await s.call('rewards',payload);
 let a=await s.call('game-profile',{id:'alice'});assert.equal(a.gold,80);assert.equal(a.heroes[0].totalXp,170);assert.equal(a.heroes[1].totalXp,0);assert.equal(a.heroes[0].inventory.filter(i=>i.definition.kind==='equipment').length,1);assert.equal(a.heroes[1].inventory.length,0);
 const item=a.heroes[0].inventory[0];await assert.rejects(()=>s.call('equip',{id:'alice',hero:'kael',item:item.id,equip:true}),/classe/);await assert.rejects(()=>s.call('equip',{id:'alice',hero:'lyra',item:item.id,equip:true}),/encontrado/);
 const b=await s.call('game-profile',{id:'bob'});assert.equal(b.gold,80);assert.notEqual(item.id,b.heroes[0].inventory[0].id);
 const invalid=run('invalid',[player('alice'),player('bob','kael','missing')]);await assert.rejects(()=>s.call('settle',invalid));assert.equal((await s.call('game-profile',{id:'alice'})).gold,80);assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM matches').get().n,1);
 assert.equal(progression(100).level,2);assert.ok(killXp('boss',3)>killXp('boss',1));assert.ok(progression(170).nextXp>100);
});
test('market settlement prevents double sale, preserves gold and binds purchased item to selected hero',async t=>{
 const s=setup(t);for(const id of ['alice','bob','carol'])await user(s,id);
 for(const id of ['alice','bob','carol'])await s.call('settle',run(id,[player(id)]));
 const item=(await s.call('game-profile',{id:'alice'})).heroes[0].inventory[0];
 await s.call('equip',{id:'alice',hero:'kael',item:item.id,equip:true});await assert.rejects(()=>s.call('market-sell',{id:'alice',item:item.id,price:50}));
 await s.call('equip',{id:'alice',hero:'kael',item:item.id,equip:false});await s.call('market-sell',{id:'alice',item:item.id,price:50});await assert.rejects(()=>s.call('equip',{id:'alice',hero:'kael',item:item.id,equip:true}),/venda/);
 const listing=(await s.call('market-list',{id:'bob',slot:'head',q:'Floresta'})).listings[0];assert.ok(listing);await assert.rejects(()=>s.call('market-buy',{id:'alice',listing:listing.id,hero:'kael'}));
 const purchases=await Promise.allSettled(['bob','carol'].map(id=>s.call('market-buy',{id,listing:listing.id,hero:'lyra'})));assert.equal(purchases.filter(p=>p.status==='fulfilled').length,1);
 assert.equal(s.sqlite.prepare('SELECT (SELECT SUM(gold) FROM accounts)+(SELECT COALESCE(SUM(gold),0) FROM mail WHERE claimed=0) AS n').get().n,240);
 await s.call('mail-claim',{id:'alice',all:true});
 const buyer=(await s.call('game-profile',{id:'bob'})).heroes[1];assert.equal(buyer.inventory.length,1);assert.equal((await s.call('game-profile',{id:'alice'})).gold,130);
 // Retry original award after the item has changed owner must never mint a replacement.
 await s.call('settle',run('alice',[player('alice')]));assert.equal((await s.call('game-profile',{id:'alice'})).heroes[0].inventory.filter(i=>i.definition.kind==='equipment').length,0);
 assert.equal(s.sqlite.prepare("SELECT COUNT(*) AS n FROM items WHERE slot='head'").get().n,3);
});
test('friends, session-backed presence and private chat enforce membership and escape does not change stored text',async t=>{
 const s=setup(t);for(const id of ['alice','bob','carol'])await user(s,id);const a=new Accounts(s,'test');const token=await a.createSession('bob');const session=s.sqlite.prepare('SELECT hash FROM sessions').get().hash;
 await s.call('presence',{id:'bob',session});await s.call('friend-action',{id:'alice',target:'bob',action:'add'});await s.call('friend-action',{id:'alice',target:'bob',action:'accept'});assert.equal((await s.call('friends',{id:'alice'})).friends.length,0);
 await s.call('friend-action',{id:'bob',target:'alice',action:'accept'});let f=await s.call('friends',{id:'alice'});assert.equal(f.friends[0].online,1);
 assert.equal((await s.call('friend-search',{id:'alice',q:'bob'})).users[0].status,'accepted');await s.call('chat-send',{id:'alice',channel:'friends',target:'bob',body:'<script>alert(1)</script>'});
 assert.equal((await s.call('chat-read',{id:'bob',channel:'friends',target:'alice'})).messages.length,1);assert.equal((await s.call('chat-read',{id:'carol',channel:'global'})).messages.length,0);await assert.rejects(()=>s.call('chat-read',{id:'carol',channel:'friends',target:'alice'}),/amigos/);await assert.rejects(()=>s.call('chat-send',{id:'alice',channel:'clan',body:'oi'}));
 await a.logout(token);f=await s.call('friends',{id:'alice'});assert.equal(f.friends[0].online,0);await s.call('friend-action',{id:'bob',target:'alice',action:'remove'});await assert.rejects(()=>s.call('chat-read',{id:'alice',channel:'friends',target:'bob'}));
});
test('weekly rankings group teams independently of order, exclude incomplete groups, and retain paginated history',async t=>{
 const s=setup(t);for(const id of ['alice','bob'])await user(s,id);
 await s.call('settle',run('slow',[player('alice'),player('bob')],{duration:200}));await s.call('settle',run('fast',[player('bob'),player('alice')],{duration:90}));
 await s.call('settle',run('left',[{...player('alice'),departed:true},player('bob')],{duration:20}));
 let ranking=await s.call('ranking',{mode:'coop'});assert.equal(ranking.entries.length,1);assert.equal(ranking.entries[0].duration_ms,90000);
 await s.call('settle',run('old',[player('alice')],{finishedAt:weekStart()-1000}));assert.equal((await s.call('ranking',{mode:'solo'})).entries.length,0);
 await s.call('settle',run('duel',[player('alice'),player('bob')],{mode:'pvp',winner:'alice',reason:'forfeit'}));assert.equal((await s.call('ranking',{mode:'pvp'})).entries.length,0);
 await s.call('settle',run('duel2',[player('alice'),player('bob')],{mode:'pvp',winner:'alice',reason:'knockout'}));assert.equal((await s.call('ranking',{mode:'pvp'})).entries[0].kills,1);
 for(let i=0;i<22;i++)await s.call('settle',run('solo'+i,[player('alice')],{outcome:'dead'}));
 const history=await s.call('history',{id:'alice',mode:'solo',page:1});assert.equal(history.matches.length,20);assert.equal(history.hasMore,true);assert.equal((await s.call('history',{id:'alice',mode:'solo',page:2})).matches.length,3);
 assert.equal(new Date(weekStart(Date.parse('2026-09-07T02:59:59Z'))).toISOString(),'2026-08-31T03:00:00.000Z');assert.equal(new Date(weekStart(Date.parse('2026-09-07T03:00:00Z'))).toISOString(),'2026-09-07T03:00:00.000Z');
});
test('equipment attributes affect real combat, movement, healing limits and attack cadence',()=>{
 const w=new World();w.start();const p=w.player;Object.assign(p,attributes('kael',100,['kael_weapon_3','kael_armor_3','kael_gloves_3','kael_boots_3']));p.hp=p.maxHp;
 const e=w.enemies[0],hp=e.hp;w.hitEnemy(e,10,1);assert.equal(hp-e.hp,Math.round(10*p.damage/100));w.damagePlayer(20,p.x+50);assert.equal(p.maxHp-p.hp,Math.round(20*100/(100+p.defense)));
 p.attackCooldown=1;w.stepPlayer(.1,{});assert.ok(p.attackCooldown<.9);p.hp=p.maxHp-1;w.pickups=[{x:p.x,y:p.y-45,life:5}];w.stepPickups(.01);assert.equal(p.hp,p.maxHp);
});
test('HTTP APIs enforce authenticated identity, admin allowlist, no credential exposure and chat channel validation',async t=>{
 const s=storage();migrate(s);const a=new Accounts(s,'test'),server=await startServer(2590,{accounts:a});t.after(async()=>{await server.gracefullyShutdown(false);s.sqlite.close();delete process.env.ADMIN_ACCOUNT_IDS;});
 const base='http://127.0.0.1:2590';let cookie='';async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return r;}
 assert.equal((await api('/api/game/friends')).status,401);const login=await api('/api/register',{username:'AdminTest',password:'Password123'});cookie=login.headers.get('set-cookie').split(';')[0];const profile=(await login.json()).profile;
 assert.equal((await api('/admin')).status,403);assert.equal((await api('/admin/monitor/')).status,403);process.env.ADMIN_ACCOUNT_IDS=profile.id;
 assert.equal((await api('/admin')).status,200);assert.equal((await api('/admin/monitor/')).status,200);const admin=await (await api('/api/admin')).text();assert.ok(!admin.includes('password_hash'));assert.ok(!admin.includes('session_hash'));
 assert.equal((await api('/api/game/chat/send',{channel:'clan',body:'oi'})).status,400);assert.equal((await api('/api/game/presence',{id:'someone-else'})).status,200);
 assert.equal(s.sqlite.prepare('SELECT account_id FROM presence').get().account_id,profile.id);
 const ticket=(await (await api('/api/ticket',{})).json()).ticket;const room=await new Client(base).create('forest',{mode:'solo',chapter:1,hero:'kael',ticket});room.onMessage('*',()=>{});
 const inspect=await api('/admin/monitor/api/room?roomId='+room.roomId);assert.equal(inspect.status,200);const data=await inspect.json();assert.equal(data.state.chapter,1);assert.equal(data.metadata.mode,'solo');await room.leave();
});
