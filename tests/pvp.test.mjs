import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {CloseCode} from '@colyseus/shared-types';
import {matchMaker} from '@colyseus/core';
import {startServer} from '../server/main.mjs';
import {World,createPlayer} from '../dist/engine.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await delay(25)}assert.fail(label);}
function arena(){const w=new World();w.mode='pvp';w.enemies=[];w.players=[createPlayer('a','Alpha',4200),createPlayer('b','Beta',4290)];w.player=w.players[0];w.players[1].dir=-1;w.start();return w;}
test('PvP melee, solar, nova, dash immunity and terminal defeat are authoritative',()=>{
 const melee=arena();melee.action('attack');assert.equal(melee.players[1].hp,86);assert.equal(melee.players[0].hp,100);melee.action('attack');assert.equal(melee.players[1].hp,86);
 const solar=arena();solar.action('skill1');for(let i=0;i<15;i++)solar.updateCoop(1/60);assert.equal(solar.players[1].hp,74);assert.equal(solar.players[0].hp,100);
 const nova=arena();nova.action('skill2');assert.equal(nova.players[1].hp,68);assert.equal(nova.players[0].hp,100);
 const immune=arena();immune.player=immune.players[1];immune.action('dash');immune.player=immune.players[0];immune.action('attack');assert.equal(immune.players[1].hp,100);
 const terminal=arena();terminal.players[1].hp=14;terminal.action('attack');assert.equal(terminal.status,'won');assert.equal(terminal.winnerId,'a');for(let i=0;i<240;i++)terminal.updateCoop(1/60);assert.equal(terminal.players[1].hp,0);assert.equal(terminal.bossActive,false);assert.equal(terminal.events.filter(e=>e.type==='won').length,1);
 const prediction=arena();prediction.predicting=true;prediction.action('attack');assert.equal(prediction.players[1].hp,100);
 const coop=arena();coop.mode='coop';coop.action('attack');coop.action('skill2');assert.equal(coop.players[1].hp,100);
});
test('PvP rooms retain scores through rematches/reconnection, reject guest restart, count forfeit, and close',{timeout:25000},async t=>{
 const server=await startServer(2576),rooms=[];
 t.after(async()=>{for(const r of rooms)try{await Promise.race([r.leave(),delay(300)])}catch{}await server.gracefullyShutdown(false)});
 const a=await new Client('http://127.0.0.1:2576').create('forest',{name:'Alpha',mode:'pvp'});rooms.push(a);
 function observe(r){const s={};r.onMessage('snapshot',v=>s.snapshot=v);r.onMessage('lobby',v=>s.lobby=v);for(const type of ['events','notice'])r.onMessage(type,()=>{});r.reconnection.minUptime=0;r.reconnection.maxDelay=300;r.onReconnect(()=>s.reconnected=true);r.onLeave(()=>s.left=true);r.send('sync');return s;}
 const sa=observe(a),b=await new Client('http://127.0.0.1:2576').joinById(a.roomId,{name:'Beta',mode:'coop'});rooms.push(b);const sb=observe(b);
 await until(()=>sa.lobby?.members.length===2,'lobby');assert.equal(sa.lobby.mode,'pvp');
 a.send('ready',true);b.send('ready',true);await until(()=>sa.lobby.members.every(m=>m.ready),'ready');a.send('start');await until(()=>sa.snapshot?.status==='playing','start');
 const room=matchMaker.getLocalRoomById(a.roomId);assert.equal(room.world.enemies.length,0);assert.equal(room.world.pickups.length,0);assert.equal(room.world.players[0].dir,1);assert.equal(room.world.players[1].dir,-1);assert.ok(room.world.players[1].x-room.world.players[0].x>600);
 a.send('pause',true);await until(()=>sb.snapshot?.paused,'pause');const time=room.world.time;a.send('input',{seq:1,input:{attack:true,actions:['skill2']}});await delay(150);assert.equal(room.world.time,time);assert.equal(room.world.players[1].hp,100);a.send('pause',false);await until(()=>!sb.snapshot.paused,'resume');
 room.world.players[0].x=4200;room.world.players[1].x=4290;room.world.players[1].hp=14;
 a.send('input',{seq:2,input:{attack:true}});await until(()=>sa.snapshot.result&&sb.snapshot.result,'result');assert.equal(sa.snapshot.result.winnerId,a.sessionId);assert.deepEqual(sa.snapshot.scores.map(p=>p.wins),[1,0]);
 await delay(150);assert.deepEqual(room.snapshot().scores.map(p=>p.wins),[1,0]);b.send('restart');await delay(100);assert.equal(room.round,1);
 a.send('restart');await until(()=>room.round===2,'rematch');assert.deepEqual(room.snapshot().scores.map(p=>p.wins),[1,0]);assert.ok(room.world.players.every(p=>p.hp===100));assert.equal(room.world.enemies.length,0);
 b.connection.close(CloseCode.MAY_TRY_RECONNECT);await until(()=>sb.reconnected,'reconnect');assert.deepEqual(room.snapshot().scores.map(p=>p.wins),[1,0]);
 await until(()=>room.world.status==='playing','second round');await b.leave();await until(()=>sa.snapshot.result?.reason==='forfeit','forfeit');assert.deepEqual(sa.snapshot.scores.map(p=>p.wins),[2,0]);a.send('restart');await delay(100);assert.equal(room.round,2);
 a.send('close');await until(()=>sa.left,'room close');await until(()=>!matchMaker.getLocalRoomById(a.roomId),'room disposed');
});
