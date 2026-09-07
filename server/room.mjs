import {Room, ServerError} from '@colyseus/core';
import {randomInt,randomUUID} from 'node:crypto';
import {World, createPlayer, HEROES} from '../dist/engine.js';

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
  mode='coop';chapter=1;scores=new Map();result=null;scoredRound=0;closing=false;
  roomCreatedAt=randomUUID();progress='idle';progressRound=0;progressIds=[];progressRetries=0;accounts=null;
  members=new Map();world=new World();host='';stage='lobby';round=0;tick=0;accumulator=0;countdownAt=0;
  async onCreate(options={}){
    if(options.mode!==undefined&&!['solo','coop','pvp'].includes(options.mode))throw new ServerError(400,'Modo inválido.');
    this.mode=options.mode??'coop';this.maxClients=this.mode==='solo'?1:this.mode==='pvp'?2:4;
    this.chapter=Number(options.chapter??1);if(![1,2,3].includes(this.chapter))throw new ServerError(400,'Capítulo inválido.');
    if(codes.size>=MAX_ROOMS)throw new ServerError(503,'Todas as salas estão ocupadas. Tente novamente em instantes.');
    let code;do{code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}while(codes.has(code));
    this.roomId=code;codes.add(code);await this.setPrivate(true);
    this.world.players=[];
    this.onMessage('input',(client,packet)=>{const m=this.members.get(client.sessionId);if(!m)return;const value=validateInput(packet,m.lastSeq);if(!value)return;m.lastSeq=value.seq;m.lastSeen=Date.now();if(this.stage!=='playing'||this.isPaused()){m.ack=m.lastSeq;m.queue=[];m.input={};return;}if(m.queue.length>=6){m.ack=m.queue.shift().seq;}m.queue.push(value);});
    this.onMessage('ready',(client,value)=>{const m=this.members.get(client.sessionId);if(m&&this.stage==='lobby'&&typeof value==='boolean'){m.ready=value;this.sendLobby();}});
    this.onMessage('start',(client)=>{if(client.sessionId!==this.host||this.stage!=='lobby')return;if(this.members.size<(this.mode==='solo'?1:2)||[...this.members.values()].some(m=>!m.ready||!m.connected)){client.send('notice','Todos na sala precisam estar prontos (PvE: mínimo de dois).');return;}this.beginRound();});
    this.onMessage('pause',(client,value)=>{const m=this.members.get(client.sessionId);if(m&&typeof value==='boolean'){m.paused=value;this.clearInputs();this.sendLobby();}});
    this.onMessage('restart',(client)=>{if(client.sessionId!==this.host||this.stage!=='playing'||!['dead','won'].includes(this.world.status)||this.progress==='saving'||this.progress==='error')return;if((this.mode==='pvp'&&this.members.size<2)||[...this.members.values()].some(m=>!m.connected)){client.send('notice','Volte ao menu para criar uma nova sala com seu companheiro.');return;}this.beginRound();});
    this.onMessage('next-chapter',(client)=>{if(client.sessionId!==this.host||this.mode==='pvp'||this.chapter>=3||this.world.status!=='won'||this.stage!=='playing'||this.progress!=='saved'||[...this.members.values()].some(m=>!m.connected||m.unlockedChapter<this.chapter+1))return;this.beginRound(this.chapter+1);});
    this.onMessage('retry-progress',()=>{if(this.progress==='error')void this.saveProgress();});
    this.onMessage('close',(client)=>{if(client.sessionId===this.host){
      if(this.mode==='pvp'&&this.world.status==='playing'){this.world.winnerId=[...this.members.keys()].find(id=>id!==client.sessionId)??null;this.world.status='won';this.recordResult('forfeit');}
      this.closing=true;this.stage='ended';this.clearInputs();this.broadcast('session-ended',this.snapshot());this.disconnect();
    }});
    this.onMessage('sync',(client)=>{client.send('lobby',this.lobby());client.send('snapshot',this.snapshot());});
    this.onMessage('ping',(client,value)=>{if(typeof value==='number'&&Number.isFinite(value))client.send('pong',value);});
    this.setSimulationInterval(delta=>this.advance(delta),1000/60);
    this.clock.setTimeout(()=>{if(this.stage==='lobby')this.disconnect();},10*60*1000);
    if(this.mode!=='pvp')this.clock.setTimeout(()=>this.disconnect(),2*60*60*1000);
  }
  async onAuth(_client,options){
    const hero=options?.hero??'kael';if(!Object.hasOwn(HEROES,hero))throw new ServerError(400,'Herói inválido.');
    let account;try{account=await this.accounts.authenticate(options);}catch(e){throw new ServerError(401,e.message);}
    if(account.unlockedChapter<this.chapter)throw new ServerError(403,'Conclua o capítulo anterior para entrar neste mapa.');
    if(!account.heroes.some(h=>h.id===hero))throw new ServerError(403,'Você ainda não possui este herói.');
    if([...this.members.values()].some(m=>m.accountId===account.id))throw new ServerError(409,'Sua conta já está nesta sala.');
    return {name:account.name,hero,accountId:account.id,unlockedChapter:account.unlockedChapter};
  }
  onJoin(client,_options,auth){
    if(this.stage!=='lobby')throw new ServerError(409,'Esta partida já começou.');
    if(!this.host)this.host=client.sessionId;
    const index=this.members.size;
    if([...this.members.values()].some(m=>m.accountId===auth.accountId))throw new ServerError(409,'Sua conta já está nesta sala.');
    this.members.set(client.sessionId,{id:client.sessionId,name:auth.name,hero:auth.hero,accountId:auth.accountId,unlockedChapter:auth.unlockedChapter,ready:false,connected:true,paused:false,index,lastSeq:0,ack:0,queue:[],input:{},lastSeen:Date.now()});
    this.scores.set(client.sessionId,{id:client.sessionId,name:auth.name,wins:0});
    this.sendLobby();
  }
  onDrop(client){this.clearInputs();const m=this.members.get(client.sessionId);if(m){m.connected=false;m.input={};m.queue=[];m.ack=m.lastSeq;}this.allowReconnection(client,25);this.sendLobby();}
  onReconnect(client){const m=this.members.get(client.sessionId);if(m){m.connected=true;m.lastSeen=Date.now();m.input={};m.queue=[];}client.send('snapshot',this.snapshot());this.sendLobby();}
  onLeave(client){
    if(this.closing){this.members.delete(client.sessionId);return;}
    const departed=this.members.get(client.sessionId);
    if(this.mode==='pvp'&&!this.closing&&this.stage==='playing'&&this.world.status==='playing'){
      this.world.winnerId=[...this.members.keys()].find(id=>id!==client.sessionId)??null;this.world.status='won';this.recordResult('forfeit');
    }
    this.members.delete(client.sessionId);if(this.round===0)this.scores.delete(client.sessionId);this.world.players=this.world.players.filter(p=>p.id!==client.sessionId);
    if(this.host===client.sessionId)this.host=this.members.keys().next().value??'';
    if(this.world.players.length){this.world.player=this.world.players[0];if(this.world.status==='playing'&&this.world.players.every(p=>p.hp<=0)){this.world.status='dead';this.world.emit('dead');}}
    if(this.stage==='countdown'){this.stage='lobby';this.world.status='ready';this.unlock();for(const m of this.members.values())m.ready=false;}
    if(this.mode==='coop'&&this.members.size&&this.stage==='playing'&&this.world.status==='playing'){for(const m of this.members.values())m.paused=true;this.clearInputs();}
    this.sendLobby();
    if(this.mode==='coop'&&this.members.size&&this.stage==='playing')this.broadcast('party-left',departed?.name??'Seu companheiro');
    if(this.members.size&&this.stage==='playing'){this.broadcast('snapshot',this.snapshot());this.broadcast('notice',this.mode==='pvp'?'Seu adversário saiu. O placar permanece até encerrar a sala.':'Seu companheiro saiu da sala.');}
  }
  onDispose(){codes.delete(this.roomId);}
  clearInputs(){for(const m of this.members.values()){m.input={};m.queue=[];m.ack=m.lastSeq;}}
  isPaused(){return [...this.members.values()].some(m=>m.paused||!m.connected);}
  lobby(){return {progress:this.progress,maxPlayers:this.maxClients,chapter:this.chapter,mode:this.mode,scores:[...this.scores.values()],result:this.result,code:this.roomId,host:this.host,stage:this.stage,round:this.round,countdown:this.stage==='countdown'?Math.max(0,Math.ceil((this.countdownAt-Date.now())/1000)):0,paused:this.isPaused(),members:[...this.members.values()].map(({id,name,hero,ready,connected,paused,index})=>({id,name,hero,ready,connected,paused,index}))};}
  sendLobby(){this.broadcast('lobby',this.lobby());}
  beginRound(chapter=this.chapter){
    this.chapter=chapter;this.lock();this.world=new World(this.chapter);this.world.mode=this.mode==='pvp'?'pvp':'coop';this.result=null;this.progress='idle';this.progressRetries=0;this.accumulator=0;this.round++;this.progressIds=[...this.members.values()].map(m=>m.accountId);this.world.players=[...this.members.values()].map((m,i)=>{m.input={};m.queue=[];m.ack=m.lastSeq;m.paused=false;const p=createPlayer(m.id,m.name,this.mode==='pvp'?3980+i*640:190+i*85,m.hero);if(this.mode==='pvp'){p.dir=i===0?1:-1;p.checkpoint=p.x;p.zone=2;}return p;});
    this.world.player=this.world.players[0];
    if(this.mode==='pvp')this.world.enemies=[];
    for(const e of this.world.enemies){e.hp=e.maxHp=Math.round(e.maxHp*(1+(this.world.players.length-1)*(e.kind==='boss'?.65:.35)));}
    this.stage='countdown';this.countdownAt=Date.now()+3000;this.sendLobby();this.broadcast('snapshot',this.snapshot());
  }
  recordResult(reason='knockout'){
    if(this.mode!=='pvp'&&this.world.status==='won'&&this.progressRound!==this.round){this.progressRound=this.round;void this.saveProgress();}
    if(this.mode!=='pvp'||this.world.status!=='won'||this.scoredRound===this.round)return;
    this.scoredRound=this.round;const winnerId=this.world.winnerId;const winner=this.scores.get(winnerId);if(winner)winner.wins++;
    this.result={winnerId,reason,round:this.round};this.sendLobby();
  }
  async saveProgress(){
    if(this.progress==='saving'||this.progress==='saved'||this.mode==='pvp'||this.world.status!=='won')return;
    this.progress='saving';this.sendLobby();const round=this.round,chapter=this.chapter;
    const ids=this.progressIds.filter(id=>[...this.members.values()].some(m=>m.accountId===id&&m.connected));
    try{await this.accounts.complete(ids,chapter,`${this.roomId}:${this.roomCreatedAt}:${round}`);if(this.round!==round)return;this.progress='saved';for(const m of this.members.values())if(ids.includes(m.accountId))m.unlockedChapter=Math.max(m.unlockedChapter,Math.min(3,chapter+1));this.broadcast('progress-saved',{chapter});}
    catch(e){console.error('Progress save failed',e.message);this.progress='error';if(this.progressRetries++<2)this.clock.setTimeout(()=>void this.saveProgress(),2000);}
    this.sendLobby();
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
    this.recordResult();
    if(this.tick%3===0){this.broadcast('snapshot',this.snapshot());const events=this.world.events.splice(0);if(events.length)this.broadcast('events',events);}
    if(this.tick%60===0)this.sendLobby();
  }
  snapshot(){const w=this.world;return {progress:this.progress,maxPlayers:this.maxClients,chapter:this.chapter,mode:this.mode,scores:[...this.scores.values()],result:this.result,winnerId:w.winnerId,round:this.round,stage:this.stage,paused:this.isPaused(),status:w.status,time:w.time,elapsed:w.elapsed,kills:w.kills,bossActive:w.bossActive,players:w.players.map(p=>({...p})),enemies:w.enemies.map(e=>({...e})),projectiles:w.projectiles.map(({hits,...s})=>s),pickups:w.pickups.map(p=>({...p})),acks:Object.fromEntries([...this.members].map(([id,m])=>[id,m.ack]))};}
}
