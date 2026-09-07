import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {matchMaker} from '@colyseus/core';
import {startServer} from '../server/main.mjs';
import {World,createPlayer} from '../dist/engine.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+6500;while(Date.now()<end){if(fn())return;await delay(25)}assert.fail(label);}
test('Lyra fires ranged projectiles without melee damage or friendly fire',()=>{
 const w=new World();w.player=createPlayer('mage','Lyra',430,'lyra');w.players=[w.player,createPlayer('friend','Kael',560)];w.start();
 const target=w.enemies[0],hp=target.hp;w.action('attack');assert.equal(target.hp,hp);assert.equal(w.projectiles[0].kind,'fireball');
 for(let i=0;i<35;i++)w.updateCoop(1/60);assert.equal(target.hp,hp-18);assert.equal(w.players[1].hp,100);
 const duel=new World();duel.mode='pvp';duel.enemies=[];duel.players=[createPlayer('mage','Lyra',4100,'lyra'),createPlayer('fighter','Kael',4480)];duel.player=duel.players[0];duel.start();duel.action('attack');for(let i=0;i<50;i++)duel.updateCoop(1/60);assert.equal(duel.players[1].hp,89);assert.equal(duel.players[0].hp,100);
});
test('chapter II has stronger enemies, timed vents and traversable new platforms',()=>{
 const w=new World(2),first=new World();assert.notDeepEqual(w.platforms,first.platforms);assert.ok(w.enemies.length>first.enemies.length);assert.ok(w.enemies.at(-1).hp>first.enemies.at(-1).hp);
 w.start();w.player.x=1810;w.time=3.5;w.stepHazards();assert.equal(w.player.hp,100);w.time=4.5;w.stepHazards();assert.equal(w.player.hp,82);
 w.player.invincible=0;w.player.y=450;w.stepHazards();assert.equal(w.player.hp,82);
 const travel=new World(2);travel.enemies=[];travel.player.invincible=1000;travel.start();let nextJump=0,second=0;
 for(let i=0;i<120*40;i++){const p=travel.player,actions=[];if(p.grounded&&travel.time>nextJump){actions.push('jump');second=travel.time+.3;nextJump=travel.time+.9;}if(!p.grounded&&p.jumps===1&&travel.time>second){actions.push('jump');second=Infinity;}if(!p.grounded&&p.jumps===2&&p.vy>30&&p.dashCooldown<=0)actions.push('dash');travel.update(1/120,{right:true,actions});if(p.x>4500)break;}
 assert.ok(travel.player.x>4500,`Only reached ${travel.player.x}`);assert.equal(travel.player.hp,100);
});
test('cooperative chapters retain heroes, require boss completion, and pause for teammate menu exit',{timeout:22000},async t=>{
 const server=await startServer(2577),rooms=[];t.after(async()=>{for(const r of rooms)try{await Promise.race([r.leave(),delay(200)])}catch{}await server.gracefullyShutdown(false)});
 function observe(r){const s={};r.onMessage('lobby',v=>s.lobby=v);r.onMessage('snapshot',v=>s.snapshot=v);r.onMessage('party-left',v=>s.departed=v);r.onMessage('events',()=>{});r.onMessage('notice',()=>{});r.send('sync');return s;}
 const a=await new Client('http://127.0.0.1:2577').create('forest',{name:'Lyra Player',hero:'lyra'});rooms.push(a);const sa=observe(a);
 const b=await new Client('http://127.0.0.1:2577').joinById(a.roomId,{name:'Kael Player',hero:'kael'});rooms.push(b);const sb=observe(b);
 await until(()=>sa.lobby?.members.length===2,'join');a.send('ready',true);b.send('ready',true);await until(()=>sa.lobby.members.every(m=>m.ready),'ready');a.send('start');await until(()=>sa.snapshot?.status==='playing','start');
 const room=matchMaker.getLocalRoomById(a.roomId);assert.deepEqual(room.world.players.map(p=>p.hero),['lyra','kael']);a.send('next-chapter');await delay(100);assert.equal(room.chapter,1);
 room.world.bossActive=true;room.world.hitEnemy(room.world.enemies.at(-1),9999,1);await until(()=>sa.snapshot.status==='won','chapter I won');
 b.send('next-chapter');await delay(100);assert.equal(room.chapter,1);a.send('next-chapter');await until(()=>sa.snapshot.chapter===2&&sb.snapshot.chapter===2,'chapter transition');
 assert.deepEqual(room.world.players.map(p=>p.hero),['lyra','kael']);assert.ok(room.world.players.every(p=>p.hp===100));assert.equal(room.world.kills,0);
 await until(()=>room.world.status==='playing','chapter II start');await a.leave();await until(()=>sb.departed==='Lyra Player','departure message');assert.equal(room.host,b.sessionId);assert.equal(room.isPaused(),true);const time=room.world.time;await delay(100);assert.equal(room.world.time,time);
 b.send('pause',false);await until(()=>room.world.time>time,'continue alone');assert.equal(room.world.players.length,1);assert.equal(room.world.players[0].hero,'kael');
 room.world.bossActive=true;room.world.hitEnemy(room.world.enemies.at(-1),9999,1);await until(()=>sb.snapshot.status==='won','chapter II won');b.send('next-chapter');await until(()=>room.chapter===3,'advance to chapter III alone');assert.equal(room.world.players[0].hero,'kael');await until(()=>room.world.status==='playing','chapter III start');room.world.bossActive=true;room.world.hitEnemy(room.world.enemies.at(-1),99999,1);await until(()=>sb.snapshot.status==='won','chapter III won');b.send('next-chapter');await delay(100);assert.equal(room.chapter,3);assert.equal(room.round,3);b.send('restart');await until(()=>room.round===4,'restart chapter III alone');assert.equal(room.chapter,3);
});
