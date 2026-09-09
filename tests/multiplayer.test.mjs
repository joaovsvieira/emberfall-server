import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {CloseCode} from '@colyseus/shared-types';
import {matchMaker} from '@colyseus/core';
import {startTestServer as startServer} from './helpers/server.mjs';
import {World,createPlayer} from '../dist/engine.js';
import {validateInput,cleanName} from '../server/room.mjs';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,message,timeout=6000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await delay(25);}assert.fail(message);}
function observe(room){room.reconnection.minUptime=0;room.reconnection.maxDelay=2000;const state={snapshot:null,lobby:null,events:[],dropped:false,reconnected:false};room.onMessage('snapshot',s=>state.snapshot=s);room.onMessage('lobby',s=>state.lobby=s);room.onMessage('events',e=>state.events.push(...e));room.onMessage('notice',()=>{});room.onMessage('pong',()=>{});room.onDrop(()=>state.dropped=true);room.onReconnect(()=>state.reconnected=true);room.send('sync');return state;}

test('input validation strips untrusted authority fields and rejects replay',()=>{
  const clean=validateInput({seq:1,input:{left:true,actions:['jump','jump'],x:4000,hp:999,damage:999}},0);
  assert.deepEqual(clean,{seq:1,input:{left:true,right:false,attack:false,actions:['jump']}});
  assert.equal(validateInput({seq:1,input:{}},1),null);
  assert.equal(validateInput({seq:2,input:{left:'yes'}},1),null);
  assert.equal(validateInput({seq:2,input:{actions:['teleport']}},1),null);
  assert.throws(()=>cleanName('x'));assert.equal(cleanName('<Kael>'),'Kael');
});
test('coop uses one enemy simulation, independent cooldowns and shared kills',()=>{
  const w=new World();w.players=[createPlayer('one','One',680),createPlayer('two','Two',730)];w.player=w.players[0];w.start();
  w.updateCoop(1/60,{one:{actions:['skill2']}});assert.equal(w.enemies[0].dead,true);assert.equal(w.kills,1);assert.equal(w.players[1].skill2,0);assert.equal(w.players[0].skill2,10);
  const time=w.time;w.updateCoop(1/60,{});assert.ok(Math.abs(w.time-time-1/60)<1e-9);
});
test('all downed companions respawn with infinite chapter lives',()=>{
  const w=new World();w.players=[createPlayer('one','One',190),createPlayer('two','Two',240)];w.player=w.players[0];w.enemies=[];w.start();w.damagePlayer(100,0);assert.equal(w.status,'playing');
  for(let i=0;i<190;i++)w.updateCoop(1/60,{});assert.equal(w.players[0].hp,100);
  w.players[0].invincible=0;w.damagePlayer(100,0);w.player=w.players[1];w.damagePlayer(100,0);assert.equal(w.status,'playing');for(let i=0;i<190;i++)w.updateCoop(1/60,{});assert.ok(w.players.every(p=>p.hp===p.maxHp));
});
test('boss gate waits for both living players',()=>{
  const w=new World();w.players=[createPlayer('one','One',3950),createPlayer('two','Two',2000)];w.player=w.players[0];w.start();w.updateCoop(1/60,{});assert.equal(w.bossActive,false);w.players[1].x=3900;w.updateCoop(1/60,{});assert.equal(w.bossActive,true);
});
test('two real WebSocket clients share lobby, movement, combat, reconnection and victory',{timeout:25000},async t=>{
  const server=await startServer(2575);const rooms=[];
  t.after(async()=>{for(const room of rooms){try{await Promise.race([room.leave(),delay(500)]);}catch{}}await Promise.race([server.gracefullyShutdown(false),delay(1000)]);});
  const a=await new Client('http://127.0.0.1:2575').create('forest',{name:'João'});rooms.push(a);const sa=observe(a);
  assert.match(a.roomId,/^[A-Z2-9]{6}$/);
  const b=await new Client('http://127.0.0.1:2575').joinById(a.roomId,{name:'Companheiro'});rooms.push(b);const sb=observe(b);
  await until(()=>sa.lobby?.members.length===2&&sb.lobby?.members.length===2,'Both clients must receive the lobby');
  a.send('start');await delay(80);assert.equal(sa.lobby.stage,'lobby');
  a.send('ready',true);b.send('ready',true);await until(()=>sa.lobby.members.every(m=>m.ready),'Both players ready');
  b.send('start');await delay(80);assert.equal(sa.lobby.stage,'lobby');a.send('start');await until(()=>sa.snapshot?.status==='playing'&&sb.snapshot?.status==='playing','Countdown must lead to playing');
  let seq=0;for(let i=0;i<24;i++){a.send('input',{seq:++seq,input:{right:true,actions:i===2?['jump']:[]}});await delay(1000/60);}
  a.send('input',{seq:++seq,input:{}});await until(()=>sa.snapshot.acks[a.sessionId]===seq,'Input acknowledged');
  const pa=sa.snapshot.players.find(p=>p.id===a.sessionId),pb=sb.snapshot.players.find(p=>p.id===a.sessionId);assert.ok(pa.x>245);assert.ok(Math.abs(pa.x-pb.x)<15);assert.equal(sb.snapshot.players.find(p=>p.id===b.sessionId).x,275);
  const room=matchMaker.getLocalRoomById(a.roomId);room.world.players[0].x=700;room.world.players[0].y=615;room.world.players[0].vy=0;room.world.players[0].grounded=true;
  a.send('input',{seq:++seq,input:{actions:['skill2']}});await until(()=>sa.snapshot.kills===1&&sb.snapshot.kills===1,'Both see same enemy death');
  a.send('pause',true);await until(()=>sb.snapshot.paused,'Remote pause shared');const before=room.world.time;await delay(130);assert.equal(room.world.time,before);a.send('pause',false);
  b.connection.close(CloseCode.MAY_TRY_RECONNECT);await until(()=>sb.dropped,'Transport drop detected');await until(()=>sb.reconnected,'SDK reconnects',8000);await until(()=>sa.lobby.members.every(m=>m.connected),'Seat preserved after reconnect');assert.equal(room.members.size,2);
  for(const p of room.world.players){p.x=4300;p.y=615;p.hp=100;p.invincible=5;}room.world.bossActive=true;const boss=room.world.enemies.at(-1);boss.x=4390;boss.hp=20;
  a.send('input',{seq:++seq,input:{attack:true}});await until(()=>sa.snapshot.status==='won'&&sb.snapshot.status==='won','Victory shared');
  a.send('restart');await until(()=>room.stage==='lobby','restart lobby');a.send('ready',true);b.send('ready',true);await until(()=>[...room.members.values()].every(m=>m.ready),'restart ready');a.send('start');await until(()=>sa.lobby.round===2&&sb.lobby.round===2,'Host can restart same room');assert.equal(a.roomId,b.roomId);
});
