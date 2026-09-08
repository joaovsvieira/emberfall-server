import {storage,migrate} from './helpers/storage.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Accounts} from '../server/accounts.mjs';
import worker,{dataOperation} from '../worker/index.mjs';
import {startServer} from '../server/main.mjs';
import {Client} from '@colyseus/sdk';
import {matchMaker} from '@colyseus/core';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+7000;while(Date.now()<end){if(fn())return;await delay(20);}assert.fail(label);}
test('data API rejects public access and proxy paths cannot forward credentials to another host',async t=>{
 const env={DATA_SERVICE_KEY:'only-server',GAME_SERVER_URL:'https://game.example'};
 assert.equal((await worker.fetch(new Request('https://site.example/internal/data',{method:'POST',body:'{}'}),env)).status,401);
 const previous=globalThis.fetch;let target;globalThis.fetch=async request=>{target=request;return new Response('ok');};t.after(()=>globalThis.fetch=previous);
 await worker.fetch(new Request('https://site.example//untrusted.example/collect'),env);assert.equal(new URL(target.url).origin,'https://game.example');assert.equal(target.headers.get('x-emberfall-proxy'),'only-server');
});
test('accounts keep hashed passwords, revocable sessions and per-user chapter unlocks after reopening storage',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'emberfall-accounts-')),file=join(dir,'test.sqlite');let store=storage(file);migrate(store);t.after(()=>{store.sqlite.close();rmSync(dir,{recursive:true});});let auth=new Accounts(store,'test-secret');
 const a=await auth.credentials('Aventureiro','Password123',true),b=await auth.credentials('OutraConta','Password123',true);assert.notEqual(a.password_hash,'Password123');assert.equal(auth.profile(a).unlockedChapter,1);assert.equal(auth.profile(a).heroes.length,4);
 await assert.rejects(()=>auth.credentials('aventureiro','Password123',true),/cadastrado/);await assert.rejects(()=>auth.credentials('Aventureiro','errada123'),/incorretos/);assert.equal((await auth.credentials('AVENTUREIRO','Password123')).id,a.id);
 const token=await auth.createSession(a.id);assert.equal((await auth.session(token)).id,a.id);const ticket=auth.ticket(token);assert.equal((await auth.authenticate({ticket})).id,a.id);await assert.rejects(()=>auth.authenticate({ticket:ticket+'wrong'}));
 await auth.complete([a.id],2,'forged-skip');assert.equal((await auth.getProfile(a.id)).unlockedChapter,1);await auth.complete([a.id],1,'round1');await auth.complete([a.id],1,'round1');assert.equal((await auth.getProfile(a.id)).unlockedChapter,2);assert.equal((await auth.getProfile(b.id)).unlockedChapter,1);assert.equal(store.sqlite.prepare('SELECT COUNT(*) AS n FROM completions').get().n,1);
 store.sqlite.close();store=storage(file);auth=new Accounts(store,'test-secret');assert.equal((await auth.session(token)).unlocked_chapter,2);await auth.logout(token);assert.equal(await auth.session(token),null);await assert.rejects(()=>auth.authenticate({ticket}),/expirou/);
});
test('HTTP login and actual rooms enforce identity, chapter locks, solo victory and chosen PvP map',{timeout:26000},async t=>{
 const store=storage();migrate(store);const auth=new Accounts(store,'integration-secret'),server=await startServer(2581,{accounts:auth}),rooms=[];
 t.after(async()=>{for(const r of rooms)try{await Promise.race([r.leave(),delay(100)])}catch{}await server.gracefullyShutdown(false);store.sqlite.close();});
 const url='http://127.0.0.1:2581';let cookie='';async function api(path,data,session=cookie,origin){const r=await fetch(url+'/api/'+path,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(session?{Cookie:session}:{}),...(origin?{Origin:origin}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')};}
 assert.equal((await api('me')).status,401);let r=await api('register',{username:'TestHero',password:'Password123'});assert.equal(r.status,200);assert.match(r.cookie,/HttpOnly/i);assert.match(r.cookie,/SameSite=Lax/i);cookie=r.cookie.split(';')[0];const id=r.body.profile.id;
 assert.equal((await api('me')).body.profile.id,id);assert.equal((await api('hero',{hero:'sylva'})).status,200);assert.equal((await api('me')).body.profile.preferredHero,'sylva');assert.equal((await api('hero',{hero:'not-real'})).status,400);assert.equal((await api('hero',{hero:'kael'},cookie,'https://evil.invalid')).status,403);
 const ticket=(await api('ticket',{})).body.ticket;await assert.rejects(()=>new Client(url).create('forest',{mode:'solo',chapter:1,hero:'kael'}));await assert.rejects(()=>new Client(url).create('forest',{mode:'solo',chapter:2,hero:'kael',ticket}));
 function observe(c){const s={};c.onMessage('snapshot',v=>s.snapshot=v);c.onMessage('lobby',v=>s.lobby=v);for(const kind of ['events','notice','progress-saved'])c.onMessage(kind,()=>{});c.send('sync');return s;}
 const roomClient=await new Client(url).create('forest',{mode:'solo',chapter:1,hero:'sylva',ticket,name:'FORGED_NAME'});rooms.push(roomClient);const state=observe(roomClient),room=matchMaker.getLocalRoomById(roomClient.roomId);assert.equal(room.maxClients,1);roomClient.send('ready',true);await until(()=>state.lobby?.members[0].ready,'ready');roomClient.send('start');await until(()=>room.world.status==='playing','solo starts');assert.equal(room.world.players[0].name,'TestHero');
 const complete=auth.complete.bind(auth);let rejectSave=true;auth.complete=(...args)=>rejectSave?Promise.reject(new Error('Test storage outage')):complete(...args);
 room.world.bossActive=true;room.world.hitEnemy(room.world.enemies.at(-1),99999,1);await until(()=>room.progress==='error','surface save failure');roomClient.send('next-chapter');await delay(80);assert.equal(room.chapter,1);assert.equal((await api('me')).body.profile.unlockedChapter,1);rejectSave=false;roomClient.send('retry-progress');await until(()=>room.progress==='saved','persist victory');assert.equal((await api('me')).body.profile.heroes.find(h=>h.id==='sylva').unlockedChapter,2);assert.equal((await api('me')).body.profile.heroes.find(h=>h.id==='kael').unlockedChapter,1);roomClient.send('next-chapter');await until(()=>room.chapter===2,'advance solo');
 const guest=await api('register',{username:'GuestHero',password:'Password123'},'');const guestCookie=guest.cookie.split(';')[0];const guestTicket=(await api('ticket',{},guestCookie)).body.ticket;
 const duel=await new Client(url).create('forest',{mode:'pvp',chapter:2,hero:'sylva',ticket});rooms.push(duel);observe(duel);await assert.rejects(()=>new Client(url).create('forest',{mode:'pvp',chapter:2,hero:'kael',ticket:guestTicket}));
 // Guest may enter the locked PvP map without gaining progress.
 const b=await new Client(url).joinById(duel.roomId,{hero:'kael',ticket:guestTicket});rooms.push(b);observe(b);const d=matchMaker.getLocalRoomById(duel.roomId);d.beginRound();assert.equal(d.world.chapter,2);assert.equal(d.world.mode,'pvp');assert.equal(d.world.enemies.length,0);assert.equal(d.world.hazards.length,0);
 await api('logout',{});assert.equal((await api('me')).status,401);await assert.rejects(()=>new Client(url).create('forest',{mode:'solo',ticket}));
});
