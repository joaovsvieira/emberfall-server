import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World,createPlayer,CHAPTERS} from '../dist/engine.js';
import {heroPower,attributes,lootPool,killXp,weekStart} from '../server/catalog.mjs';
import {ForestRoom,validateInput} from '../server/room.mjs';
import {storage,migrate} from './helpers/storage.mjs';
async function setup(t){const s=storage();migrate(s);t.after(()=>s.sqlite.close());await s.call('register',{id:'alice',username:'alice',displayName:'Alice',passwordHash:'x'});return s;}
test('hotbar reserves the whole potion stack, blocks listing and returns remaining units when cleared',async t=>{
 const s=await setup(t);for(let i=0;i<3;i++)s.sqlite.prepare("INSERT INTO items(id,account_id,hero,catalog_id,slot,created_at) VALUES(?,'alice','kael','healing_potion','consumable',0)").run('p'+i);
 const inventory=async()=>(await s.call('game-profile',{id:'alice'})).heroes.find(h=>h.id==='kael').inventory;
 await s.call('hotbar-set',{id:'alice',hero:'kael',slot:1,catalog:'healing_potion'});assert.equal((await inventory()).filter(i=>!i.hotbar).length,0);await assert.rejects(()=>s.call('market-sell',{id:'alice',item:'p0',quantity:1,price:1}),/reservados/);
 assert.equal((await s.call('potion-use',{id:'alice',hero:'kael',slot:1,useId:'drink'})).consumed,true);await s.call('hotbar-set',{id:'alice',hero:'kael',slot:1,catalog:''});assert.equal((await inventory()).filter(i=>!i.hotbar).length,2);
 await s.call('market-sell',{id:'alice',item:'p1',quantity:2,price:5});assert.equal((await inventory()).filter(i=>i.listed).length,2);
});
test('weekly chest ignores current and older weeks, selects best previous valid key and isolates heroes',async t=>{
 const s=await setup(t),week=weekStart(),insert=s.sqlite.prepare("INSERT INTO mythic_keys(account_id,hero,chapter,week,level,status) VALUES('alice',?,?,?,?,?)");
 insert.run('kael',1,week,50,'available');insert.run('kael',1,week-14*86400000,70,'available');await assert.rejects(()=>s.call('weekly-claim',{id:'alice',hero:'kael'}));
 insert.run('kael',1,week-7*86400000,11,'available');insert.run('kael',2,week-7*86400000,16,'available');insert.run('kael',3,week-7*86400000,25,'broken');
 const p=await s.call('game-profile',{id:'alice'});assert.deepEqual(p.weeklyKeys.map(k=>k.level),[16,11]);const attempts=await Promise.allSettled([1,2].map(()=>s.call('weekly-claim',{id:'alice',hero:'kael'})));assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);const claim=s.sqlite.prepare('SELECT * FROM weekly_claims').get();assert.equal(claim.level,16);assert.equal(claim.week,week);assert.equal(s.sqlite.prepare('SELECT quality FROM items WHERE id=?').get(claim.item_id).quality,2);await assert.rejects(()=>s.call('weekly-claim',{id:'alice',hero:'lyra'}));
});
test('S drops through suspended platforms to solid floor, never through ground and validates network input',()=>{
 const w=new World();w.enemies=[];w.start();const p=w.player;p.x=600;p.y=505;p.grounded=true;w.update(1/60,{down:true});assert.equal(p.dropping,true);for(let i=0;i<80;i++)w.update(1/60,{});assert.equal(p.y,615);assert.equal(p.grounded,true);assert.equal(p.dropping,false);for(let i=0;i<60;i++)w.update(1/60,{down:true});assert.equal(p.y,615);
 assert.equal(validateInput({seq:1,input:{down:true,power:99999}},0).input.down,true);assert.equal(validateInput({seq:1,input:{down:1}},0),null);
});
test('Nyxar is ranged normally, melee for 15 seconds, cannot extend transformation and respects PvP/coop',()=>{
 const w=new World();w.player=createPlayer('n','Nyxar',600,'nyxar');w.players=[w.player];w.enemies=w.enemies.slice(0,1);const e=w.enemies[0];e.x=900;e.hp=e.maxHp=500;w.start();w.action('attack');assert.equal(e.hp,500);for(let i=0;i<40;i++)w.stepProjectiles(1/60);assert.equal(e.hp,477);
 w.action('skill2');assert.equal(w.player.demonTime,15);assert.equal(w.player.skill2,40);w.player.demonTime=10;w.action('skill2');assert.equal(w.player.demonTime,10);w.player.attackCooldown=0;e.x=w.player.x+100;w.action('attack');assert.equal(e.hp,441);assert.equal(w.projectiles.length,0);
 w.enemies=[];for(let i=0;i<601;i++)w.stepPlayer(1/60,{});assert.equal(w.player.demonTime,0);w.player.attackCooldown=0;w.action('attack');assert.equal(w.projectiles[0].kind,'void');w.action('skill1');assert.equal(w.projectiles.at(-1).kind,'rift');assert.equal(w.projectiles.at(-1).pierce,true);
 const duel=new World();duel.mode='pvp';duel.enemies=[];duel.players=[createPlayer('n','Nyxar',4200,'nyxar'),createPlayer('k','Kael',4300)];duel.player=duel.players[0];duel.start();duel.action('skill2');duel.action('attack');assert.equal(duel.players[1].hp,82);duel.mode='coop';duel.player.attackCooldown=0;duel.players[1].invincible=0;duel.action('attack');assert.equal(duel.players[1].hp,82);
});
test('new chapters have stronger bosses, themed species, complete loot/XP and traversable paths',()=>{
 let last=new World(3);for(const chapter of [4,5,6]){const w=new World(chapter);assert.equal(w.chapter,chapter);assert.ok(w.enemies.at(-1).hp>last.enemies.at(-1).hp);assert.ok(w.enemies.length>last.enemies.length);assert.ok(w.enemies.every(e=>killXp(e.species,chapter)>0));assert.ok(lootPool(chapter).some(i=>i.hero==='nyxar'));assert.notEqual(w.level.background,last.level.background);
 const travel=new World(chapter);travel.enemies=[];travel.player.invincible=1000;travel.start();let jumpAt=0;
 for(let i=0;i<120*45;i++){const p=travel.player,actions=[],floor=travel.platforms.find(b=>Math.abs(b.y-p.y)<1&&p.x>b.x&&p.x<b.x+b.w);if(p.grounded&&floor&&floor.x+floor.w-p.x<100){actions.push('jump');jumpAt=travel.time;}if(!p.grounded&&p.jumps===1&&travel.time-jumpAt>.38)actions.push('jump');if(!p.grounded&&p.jumps===2&&p.vy>50&&p.dashCooldown<=0)actions.push('dash');travel.update(1/120,{right:true,actions});if(p.x>4500)break;}assert.ok(travel.player.x>4500,`Chapter ${chapter}: reached ${travel.player.x}`);assert.equal(travel.player.hp,100);last=w;}
});
test('new campaign unlocks and rewards stay per hero, power matches server stats and lobby',async t=>{
 const s=await setup(t);for(const chapter of [1,2,3,4,5,6])await s.call('settle',{round:'clear-'+chapter,chapter,mode:'solo',duration:60,outcome:'won',finishedAt:Date.now(),players:[{id:'alice',hero:'nyxar',name:'Alice',loot:'nyxar_weapon_'+chapter}],kills:[{id:1,kind:new World(chapter).enemies.at(-1).species}]});
 let p=await s.call('game-profile',{id:'alice'});assert.equal(p.heroes.find(h=>h.id==='nyxar').unlockedChapter,6);assert.equal(p.heroes.find(h=>h.id==='kael').unlockedChapter,1);assert.equal(p.heroes.find(h=>h.id==='nyxar').keys.length,6);
 const h=p.heroes.find(h=>h.id==='nyxar'),item=h.inventory.find(i=>i.catalog_id==='nyxar_weapon_6');await s.call('equip',{id:'alice',hero:'nyxar',item:item.id,equip:true});p=await s.call('game-profile',{id:'alice'});const equipped=p.heroes.find(h=>h.id==='nyxar');assert.ok(equipped.power>h.power);assert.equal(equipped.power,heroPower(equipped.attributes));assert.equal(heroPower(attributes('kael',0)),1000);
 const room=new ForestRoom();room.members.set('host',{hero:'nyxar',stats:equipped.attributes});assert.equal(room.lobby().members[0].power,equipped.power);room.clock.clear();
 // Regression: legacy chapter III winners gain IV without unlocking it for other heroes.
 s.sqlite.prepare("UPDATE hero_progress SET unlocked_chapter=3 WHERE hero='nyxar'").run();s.sqlite.exec(readFileSync(new URL('../drizzle/0007_campaign_continuation.sql',import.meta.url),'utf8'));assert.equal(s.sqlite.prepare("SELECT unlocked_chapter FROM hero_progress WHERE hero='nyxar'").get().unlocked_chapter,4);
});
