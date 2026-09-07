import {Room, ServerError} from '@colyseus/core';
import {randomInt} from 'node:crypto';
import {World, createPlayer} from '../dist/engine.js';

const codes=new Set();
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS=32;
export function cleanName(value){
  if(typeof value!=='string')throw new ServerError(400,'Informe seu apelido.');
  const name=value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}<>]/gu,'').trim();
  if(name.length<2||name.length>18)throw new ServerError(400,'Use um apelido de 2 a 18 caracteres.');
  return name;
}
export function validateInput(packet,lastSeq){
  if(!packet||typeof packet!=='object'||!Number.isSafeInteger(packet.seq)||packet.seq<=lastSeq||packet.seq>lastSeq+240)return null;
  const v=packet.input;if(!v||typeof v!=='object')return null;
  if(['left','right','attack'].some(k=>v[k]!==undefined&&typeof v[k]!=='boolean'))return null;
  if(v.actions!==undefined&&(!Array.isArray(v.actions)||v.actions.length>5||v.actions.some(a=>!['jump','attack','dash','skill1','skill2'].includes(a))))return null;
  return {seq:packet.seq,input:{left:v.left===true,right:v.right===true,attack:v.attack===true,actions:[...new Set(v.actions??[])]}};
}
export class ForestRoom extends Room {
  maxClients=2;maxMessagesPerSecond=120;
  mode='coop';scores=new Map();result=null;scoredRound=0;closing=false;
  members=new Map();world=new World();host='';stage='lobby';round=0;tick=0;accumulator=0;countdownAt=0;
  async onCreate(options={}){
    if(options.mode!==undefined&&!['coop','pvp'].includes(options.mode))throw new ServerError(400,'Modo inválido.');
    this.mode=options.mode??'coop';
    if(codes.size>=MAX_ROOMS)throw new ServerError(503,'Todas as salas estão ocupadas. Tente novamente em instantes.');
    let code;do{code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}while(codes.has(code));
    this.roomId=code;codes.add(code);await this.setPrivate(true);
    this.world.players=[];
    this.onMessage('input',(client,packet)=>{const m=this.members.get(client.sessionId);if(!m)return;const value=validateInput(packet,m.lastSeq);if(!value)return;m.lastSeq=value.seq;m.lastSeen=Date.now();if(this.stage!=='playing'||this.isPaused()){m.ack=m.lastSeq;m.queue=[];m.input={};return;}if(m.queue.length>=6){m.ack=m.queue.shift().seq;}m.queue.push(value);});
    this.onMessage('ready',(client,value)=>{const m=this.members.get(client.sessionId);if(m&&this.stage==='lobby'&&typeof value==='boolean'){m.ready=value;this.sendLobby();}});
    this.onMessage('start',(client)=>{if(client.sessionId!==this.host||this.stage!=='lobby')return;if(this.members.size!==2||[...this.members.values()].some(m=>!m.ready||!m.connected)){client.send('notice','Os dois jogadores precisam estar prontos.');return;}this.beginRound();});
    this.onMessage('pause',(client,value)=>{const m=this.members.get(client.sessionId);if(m&&typeof value==='boolean'){m.paused=value;this.clearInputs();this.sendLobby();}});
    this.onMessage('restart',(client)=>{if(client.sessionId!==this.host||this.stage!=='playing'||!['dead','won'].includes(this.world.status))return;if(this.members.size<2||[...this.members.values()].some(m=>!m.connected)){client.send('notice','Volte ao menu para criar uma nova sala com seu companheiro.');return;}this.beginRound();});
    this.onMessage('close',(client)=>{if(client.sessionId===this.host){this.closing=true;this.disconnect();}});
    this.onMessage('sync',(client)=>{client.send('lobby',this.lobby());client.send('snapshot',this.snapshot());});
    this.onMessage('ping',(client,value)=>{if(typeof value==='number'&&Number.isFinite(value))client.send('pong',value);});
    this.setSimulationInterval(delta=>this.advance(delta),1000/60);
    this.clock.setTimeout(()=>{if(this.stage==='lobby')this.disconnect();},10*60*1000);
    if(this.mode!=='pvp')this.clock.setTimeout(()=>this.disconnect(),2*60*60*1000);
  }
  onAuth(_client,options){return {name:cleanName(options?.name)};}
  onJoin(client,_options,auth){
    if(this.stage!=='lobby')throw new ServerError(409,'Esta partida já começou.');
    if(!this.host)this.host=client.sessionId;
    const index=this.members.size;
    this.members.set(client.sessionId,{id:client.sessionId,name:auth.name,ready:false,connected:true,paused:false,index,lastSeq:0,ack:0,queue:[],input:{},lastSeen:Date.now()});
    this.scores.set(client.sessionId,{id:client.sessionId,name:auth.name,wins:0});
    this.sendLobby();
  }
  onDrop(client){this.clearInputs();const m=this.members.get(client.sessionId);if(m){m.connected=false;m.input={};m.queue=[];m.ack=m.lastSeq;}this.allowReconnection(client,25);this.sendLobby();}
  onReconnect(client){const m=this.members.get(client.sessionId);if(m){m.connected=true;m.lastSeen=Date.now();m.input={};m.queue=[];}client.send('snapshot',this.snapshot());this.sendLobby();}
  onLeave(client){
    if(this.mode==='pvp'&&!this.closing&&this.stage==='playing'&&this.world.status==='playing'){
      this.world.winnerId=[...this.members.keys()].find(id=>id!==client.sessionId)??null;this.world.status='won';this.recordResult('forfeit');
    }
    this.members.delete(client.sessionId);if(this.round===0)this.scores.delete(client.sessionId);this.world.players=this.world.players.filter(p=>p.id!==client.sessionId);
    if(this.host===client.sessionId)this.host=this.members.keys().next().value??'';
    if(this.world.players.length){this.world.player=this.world.players[0];if(this.world.status==='playing'&&this.world.players.every(p=>p.hp<=0)){this.world.status='dead';this.world.emit('dead');}}
    if(this.stage==='countdown'){this.stage='lobby';this.world.status='ready';this.unlock();for(const m of this.members.values())m.ready=false;}
    this.sendLobby();
    if(this.members.size&&this.stage==='playing'){this.broadcast('snapshot',this.snapshot());this.broadcast('notice',this.mode==='pvp'?'Seu adversário saiu. O placar permanece até encerrar a sala.':'Seu companheiro saiu. Você pode concluir a fase ou voltar ao menu.');}
  }
  onDispose(){codes.delete(this.roomId);}
  clearInputs(){for(const m of this.members.values()){m.input={};m.queue=[];m.ack=m.lastSeq;}}
  isPaused(){return [...this.members.values()].some(m=>m.paused||!m.connected);}
  lobby(){return {mode:this.mode,scores:[...this.scores.values()],result:this.result,code:this.roomId,host:this.host,stage:this.stage,round:this.round,countdown:this.stage==='countdown'?Math.max(0,Math.ceil((this.countdownAt-Date.now())/1000)):0,paused:this.isPaused(),members:[...this.members.values()].map(({id,name,ready,connected,paused,index})=>({id,name,ready,connected,paused,index}))};}
  sendLobby(){this.broadcast('lobby',this.lobby());}
  beginRound(){
    this.lock();this.world=new World();this.world.mode=this.mode;this.result=null;this.accumulator=0;this.round++;this.world.players=[...this.members.values()].map((m,i)=>{m.input={};m.queue=[];m.ack=m.lastSeq;m.paused=false;const p=createPlayer(m.id,m.name,this.mode==='pvp'?3980+i*640:190+i*85);if(this.mode==='pvp'){p.dir=i===0?1:-1;p.checkpoint=p.x;p.zone=2;}return p;});
    this.world.player=this.world.players[0];
    if(this.mode==='pvp')this.world.enemies=[];
    for(const e of this.world.enemies){e.hp=e.maxHp=Math.round(e.maxHp*(e.kind==='boss'?1.65:1.35));}
    this.stage='countdown';this.countdownAt=Date.now()+3000;this.sendLobby();this.broadcast('snapshot',this.snapshot());
  }
  recordResult(reason='knockout'){
    if(this.mode!=='pvp'||this.world.status!=='won'||this.scoredRound===this.round)return;
    this.scoredRound=this.round;const winnerId=this.world.winnerId;const winner=this.scores.get(winnerId);if(winner)winner.wins++;
    this.result={winnerId,reason,round:this.round};this.sendLobby();
  }
  advance(delta){
    this.tick++;
    if(this.stage==='countdown'&&Date.now()>=this.countdownAt&&!this.isPaused()){this.stage='playing';this.world.start();this.sendLobby();}
    if(this.stage==='playing'&&!this.isPaused()&&this.world.status==='playing'){
      this.accumulator+=Math.min(delta,100);
      let count=0;while(this.accumulator>=1000/60&&count++<6){
        const inputs={};for(const m of this.members.values()){
          const packet=m.queue.shift();if(packet){m.input=packet.input;m.ack=packet.seq;}else m.input={...m.input,actions:[]};
          if(Date.now()-m.lastSeen>350)m.input={};inputs[m.id]=m.input;
        }
        this.world.updateCoop(1/60,inputs);this.accumulator-=1000/60;this.recordResult();if(this.world.status!=='playing'){this.accumulator=0;break;}
      }
    }else this.accumulator=0;
    if(this.tick%3===0){this.broadcast('snapshot',this.snapshot());const events=this.world.events.splice(0);if(events.length)this.broadcast('events',events);}
    if(this.tick%60===0)this.sendLobby();
  }
  snapshot(){const w=this.world;return {mode:this.mode,scores:[...this.scores.values()],result:this.result,winnerId:w.winnerId,round:this.round,stage:this.stage,paused:this.isPaused(),status:w.status,time:w.time,elapsed:w.elapsed,kills:w.kills,bossActive:w.bossActive,players:w.players.map(p=>({...p})),enemies:w.enemies.map(e=>({...e})),projectiles:w.projectiles.map(({hits,...s})=>s),pickups:w.pickups.map(p=>({...p})),acks:Object.fromEntries([...this.members].map(([id,m])=>[id,m.ack]))};}
}
