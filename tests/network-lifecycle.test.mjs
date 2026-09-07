import test from 'node:test';
import assert from 'node:assert/strict';
import {Multiplayer} from '../dist/network.js';
test('late packets and disconnect callbacks from a departed room cannot mutate the next session',async t=>{
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch;
 globalThis.window={EMBERFALL_MULTIPLAYER_URL:'https://test.invalid'};globalThis.fetch=async()=>({ok:true,json:async()=>({modes:['coop','pvp']})});
 t.after(()=>{globalThis.window=previousWindow;globalThis.fetch=previousFetch;});
 function fakeRoom(id){return {sessionId:id,reconnection:{},handlers:{},sent:[],onMessage(type,fn){this.handlers[type]=fn;},onDrop(fn){this.drop=fn;},onReconnect(fn){this.reconnect=fn;},onLeave(fn){this.left=fn;},onError(fn){this.error=fn;},send(...args){this.sent.push(args)},async leave(){this.left?.();}};}
 const old=fakeRoom('old'),fresh=fakeRoom('new');let count=0;
 const net=new Multiplayer(()=>({create:async()=>count++===0?old:fresh}));let states=[],snapshots=0;net.onConnection=s=>states.push(s);net.onSnapshot=()=>snapshots++;
 await net.connect('Name','','pvp','lyra');await net.leave(true);assert.equal(net.active,false);assert.ok(old.sent.some(([type])=>type==='close'));
 await net.connect('Name','','coop','kael');const before=states.length;
 old.handlers.snapshot({players:[],round:1,mode:'pvp'});old.handlers.lobby({code:'OLD'});old.drop();old.reconnect();old.left();old.error(1,'stale');old.handlers['session-ended']({players:[]});
 assert.equal(net.room,fresh);assert.equal(net.id,'new');assert.equal(net.connected,true);assert.equal(net.lobby,null);assert.equal(snapshots,0);assert.equal(states.length,before);
 fresh.handlers.snapshot({players:[],round:1});assert.equal(snapshots,1);await net.leave();
});
