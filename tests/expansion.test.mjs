import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {matchMaker} from '@colyseus/core';
import {startTestServer as startServer} from './helpers/server.mjs';
import {World,createPlayer} from '../dist/engine.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+6500;while(Date.now()<end){if(fn())return;await delay(20)}assert.fail(label);}
function party(mode='coop'){const w=new World();w.mode=mode;w.enemies=[];w.players=[createPlayer('support','Aurel',4000,'aurel'),createPlayer('archer','Sylva',4130,'sylva'),createPlayer('mage','Lyra',4280,'lyra'),createPlayer('sword','Kael',4460,'kael')];w.player=w.players[0];w.start();return w;}
test('Aurel area healing respects range, cap, cooldown, downed allies and PvP opposition',()=>{
 const w=party();w.players.forEach(p=>p.hp=50);w.players[1].hp=90;w.players[2].hp=0;w.action('skill2');assert.deepEqual(w.players.map(p=>p.hp),[85,100,0,50]);assert.equal(w.player.skill2,12);w.action('skill2');assert.equal(w.player.hp,85);
 w.player.skill2=0;w.players[2].hp=10;w.action('skill2');assert.equal(w.players[2].hp,45);
 const pvp=party('pvp');pvp.players=pvp.players.slice(0,2);pvp.players.forEach(p=>p.hp=50);pvp.action('skill2');assert.deepEqual(pvp.players.map(p=>p.hp),[72,50]);
 const predicted=party();predicted.predicting=true;predicted.player.hp=50;predicted.action('skill2');assert.equal(predicted.player.hp,50);
});
test('Aurel shield absorbs only its capacity, expires, resets and blocks repeat casts',()=>{
 const w=party();w.action('skill1');assert.equal(w.player.shield,40);w.damagePlayer(25,3900);assert.equal(w.player.hp,100);assert.equal(w.player.shield,15);w.action('skill1');assert.equal(w.player.shield,15);w.player.invincible=0;w.damagePlayer(30,3900);assert.equal(w.player.hp,85);assert.equal(w.player.shield,0);
 w.player.skill1=0;w.action('skill1');w.player.shieldTime=.01;w.stepPlayer(.02);assert.equal(w.player.shield,0);assert.equal(createPlayer('new','Aurel',190,'aurel').shield,0);
 w.player.attackCooldown=0;w.action('attack');assert.equal(w.projectiles.at(-1).kind,'light');const n=w.projectiles.length;w.action('attack');assert.equal(w.projectiles.length,n);
});
test('Sylva arrows hit at range, pierce multiple targets, rain damages and never hits allies',()=>{
 function setup(){const w=new World();w.player=createPlayer('archer','Sylva',430,'sylva');w.players=[w.player,createPlayer('friend','Aurel',540,'aurel')];w.enemies=w.enemies.slice(0,2);for(const [i,e] of w.enemies.entries()){e.x=700+i*180;e.hp=e.maxHp=150;}w.start();return w;}
 const w=setup();w.action('attack');for(let i=0;i<45;i++)w.stepProjectiles(1/60);assert.deepEqual(w.enemies.map(e=>e.hp),[129,150]);assert.equal(w.players[1].hp,100);
 w.player=w.players[0];w.action('skill1');for(let i=0;i<60;i++)w.stepProjectiles(1/60);assert.deepEqual(w.enemies.map(e=>e.hp),[74,95]);
 const rain=setup();rain.action('skill2');for(let i=0;i<60;i++)rain.stepProjectiles(1/60);assert.ok(rain.enemies[0].hp<150);assert.equal(rain.players[1].hp,100);assert.equal(rain.player.skill2,11);
 const duel=party('pvp');duel.players=duel.players.slice(0,2);duel.player=duel.players[1];duel.player.dir=-1;duel.action('attack');for(let i=0;i<40;i++)duel.stepProjectiles(1/60);assert.equal(duel.players[0].hp,88);assert.equal(duel.players[1].hp,100);
});
test('chapter III has stronger enemies, a seven-shot boss, ice hazards and traversable terrain',()=>{
 const w=new World(3),second=new World(2);assert.equal(w.chapter,3);assert.notDeepEqual(w.platforms,second.platforms);assert.ok(w.enemies.length>second.enemies.length);assert.ok(w.enemies.at(-1).hp>second.enemies.at(-1).hp);assert.ok(w.hazards.length>second.hazards.length);
 w.start();w.player.x=1480;w.time=2.6;w.stepHazards();assert.equal(w.player.hp,100);w.time=3.6;w.stepHazards();assert.equal(w.player.hp,76);
 w.player.x=4300;w.bossActive=true;const boss=w.enemies.at(-1);w.enemies=[boss];boss.phase=1;boss.windup=.01;w.stepEnemies(.02);assert.equal(w.projectiles.length,7);
 const travel=new World(3);travel.enemies=[];travel.player.invincible=1000;travel.start();let jumpAt=0;
 // Jump near each actual platform edge, then use the airborne jump and dash to cross the gap.
 for(let i=0;i<120*40;i++){const p=travel.player,actions=[];const floor=travel.platforms.find(b=>Math.abs(b.y-p.y)<1&&p.x>b.x&&p.x<b.x+b.w);if(p.grounded&&floor&&floor.x+floor.w-p.x<100){actions.push('jump');jumpAt=travel.time;}if(!p.grounded&&p.jumps===1&&travel.time-jumpAt>.38)actions.push('jump');if(!p.grounded&&p.jumps===2&&p.vy>50&&p.dashCooldown<=0)actions.push('dash');travel.update(1/120,{right:true,actions});if(p.x>4500)break;}
 assert.ok(travel.player.x>4500,`Only reached ${travel.player.x}`);assert.equal(travel.player.hp,100);
});
test('four real clients require all present ready, share support actions, and preserve party through chapters',{timeout:22000},async t=>{
 const server=await startServer(2579),clients=[];t.after(async()=>{for(const c of clients)try{await Promise.race([c.leave(),delay(150)])}catch{}await server.gracefullyShutdown(false)});
 function watch(c){const s={};c.onMessage('lobby',v=>s.lobby=v);c.onMessage('snapshot',v=>s.snapshot=v);for(const kind of ['events','notice','party-left'])c.onMessage(kind,()=>{});c.send('sync');return s;}
 const url='http://127.0.0.1:2579';const a=await new Client(url).create('forest',{name:'Aurel',hero:'aurel'});clients.push(a);const states=[watch(a)],room=matchMaker.getLocalRoomById(a.roomId);assert.equal(room.maxClients,4);a.send('ready',true);a.send('start');await delay(80);assert.equal(room.stage,'lobby');
 for(const hero of ['sylva','lyra','kael']){const c=await new Client(url).joinById(a.roomId,{name:hero,hero});clients.push(c);states.push(watch(c));}
 await until(()=>states.every(s=>s.lobby?.members.length===4),'four visible members');await assert.rejects(()=>new Client(url).joinById(a.roomId,{name:'Fifth'}));
 clients[1].send('ready',true);a.send('start');await delay(80);assert.equal(room.stage,'lobby');clients[2].send('ready',true);clients[3].send('ready',true);await until(()=>[...room.members.values()].every(m=>m.ready),'all ready');clients[2].send('start');await delay(80);assert.equal(room.stage,'lobby');a.send('start');await until(()=>states.every(s=>s.snapshot?.status==='playing'),'four playing');
 assert.deepEqual(room.world.players.map(p=>p.hero),['aurel','sylva','lyra','kael']);assert.equal(room.world.enemies.at(-1).maxHp,1416);
 room.world.enemies.forEach(e=>e.active=false);room.world.players.forEach((p,i)=>{p.x=190+i*60;p.hp=50;p.invincible=10;});a.send('input',{seq:1,input:{actions:['skill2','skill1']}});await until(()=>states.every(s=>s.snapshot.players.every(p=>p.hp===85)&&s.snapshot.players[0].shield===40),'server healing and shield shared');
 room.world.players.forEach(p=>p.x=3950);room.world.players[3].x=3000;room.world.updateCoop(1/60);assert.equal(room.world.bossActive,false);room.world.players[3].x=3900;room.world.updateCoop(1/60);assert.equal(room.world.bossActive,true);
 room.world.hitEnemy(room.world.enemies.at(-1),99999,1);await until(()=>states[0].snapshot.status==='won','won');a.send('next-chapter');await until(()=>states.every(s=>s.snapshot.chapter===2),'chapter II all clients');await until(()=>room.world.status==='playing','chapter II playing');room.world.bossActive=true;room.world.hitEnemy(room.world.enemies.at(-1),99999,1);await until(()=>states[0].snapshot.status==='won','won II');a.send('next-chapter');await until(()=>states.every(s=>s.snapshot.chapter===3),'chapter III all clients');assert.deepEqual(room.world.players.map(p=>p.hero),['aurel','sylva','lyra','kael']);assert.ok(room.world.players.every(p=>p.hp===100&&p.shield===0));
 await until(()=>room.world.status==='playing','chapter III playing');await clients[3].leave();await until(()=>room.members.size===3&&room.isPaused(),'departure pauses remaining three');assert.equal(room.world.players.length,3);clients[0].send('pause',false);clients[1].send('pause',false);await delay(80);assert.equal(room.isPaused(),true);clients[2].send('pause',false);await until(()=>!room.isPaused(),'all three resume');
});
