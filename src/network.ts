import {Client} from './assets/colyseus.js';
import {World,type Input,type GameEvent,type HeroId} from './engine.js';
declare global{interface Window{EMBERFALL_MULTIPLAYER_URL?:string;}}
export class Multiplayer {
 rewards:any=null;onRewards:(v:any)=>void=()=>{};
 sessionId='';room:any=null;client:any=null;snapshot:any=null;lobby:any=null;connected=false;connecting=false;ping=0;seq=0;pending:{seq:number;input:Input}[]=[];predictor=new World();round=-1;leaving=false;lastPing=0;generation=0;
 onPartyLeft:(name:string)=>void=()=>{};onSessionEnd:(s:any)=>void=()=>{};
 onProgress:()=>void=()=>{};
 onLobby:(s:any)=>void=()=>{};onSnapshot:(s:any)=>void=()=>{};onEvents:(e:GameEvent[])=>void=()=>{};onConnection:(s:string)=>void=()=>{};onNotice:(s:string)=>void=()=>{};
 constructor(private makeClient:(url:string)=>any=(url)=>new Client(url),private ticketProvider=async()=>{const response=await fetch('/api/ticket',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const data=await response.json();if(!response.ok)throw new Error(data.error??'Faça login para jogar.');return data.ticket;}){}
 get configured(){return !!window.EMBERFALL_MULTIPLAYER_URL;}
 get id(){return this.sessionId;}
 get active(){return !!this.room;}
 get canSimulate(){return this.connected&&this.snapshot?.stage==='playing'&&!this.snapshot?.paused&&this.snapshot?.status==='playing';}
 async connect(name:string,code='',mode:'solo'|'coop'|'pvp'='coop',hero:HeroId='kael',chapter=1){
   if(this.connecting||this.room)return;this.connecting=true;this.leaving=false;const generation=++this.generation;this.onConnection('connecting');
   try{
     const endpoint=window.EMBERFALL_MULTIPLAYER_URL;if(!endpoint)throw new Error('O modo cooperativo ainda está sendo preparado. Você já pode jogar a jornada solo.');
     const url=new URL(endpoint);if(!['http:','https:'].includes(url.protocol))throw new Error('Endereço do servidor inválido.');
     const response=await fetch(new URL('/health',url),{signal:AbortSignal.timeout(75000)});if(!response.ok)throw new Error('O servidor está despertando. Tente novamente em instantes.');
     const health=await response.json();if(!code&&mode==='pvp'&&!health.modes?.includes('pvp'))throw new Error('O servidor está recebendo o modo PvP. Tente novamente em instantes.');
     if(generation!==this.generation)return;
     const ticket=await this.ticketProvider();if(generation!==this.generation)return;
     this.client=this.makeClient(url.origin);const room=code?await this.client.joinById(code.toUpperCase(),{name,hero,ticket}):await this.client.create('forest',{name,mode,hero,chapter,ticket});
     if(generation!==this.generation){await room.leave();return;}
     room.reconnection.minUptime=0;room.reconnection.maxDelay=2000;this.room=room;this.sessionId=room.sessionId;this.connected=true;this.seq=0;this.pending=[];this.round=-1;
     const current=()=>generation===this.generation&&this.room===room&&!this.leaving;
     room.onMessage('rewards',(v:any)=>{if(current()){this.rewards=v;this.onRewards(v);}});
     room.onMessage('progress-saved',()=>{if(current())this.onProgress();});
     room.onMessage('party-left',(name:string)=>{if(current())this.onPartyLeft(name);});
     room.onMessage('session-ended',(s:any)=>{if(current()){this.receive(s);this.onSessionEnd(s);}});
     room.onMessage('lobby',(value:any)=>{if(!current())return;this.lobby=value;this.onLobby(value);});
     room.onMessage('snapshot',(value:any)=>{if(current())this.receive(value);});
     room.onMessage('events',(events:GameEvent[])=>{if(current())this.onEvents(events.filter(e=>!(e.playerId===this.id&&['jump','dash','slash','solar','nova','fireball','inferno','arrow','lightBolt','shield','healingWave','arrowRain'].includes(e.type))));});
     room.onMessage('notice',(value:string)=>{if(current())this.onNotice(value);});
     room.onMessage('pong',(value:number)=>{if(current())this.ping=Math.round(performance.now()-value);});
     room.onDrop(()=>{if(!current())return;this.connected=false;this.pending=[];this.onConnection('reconnecting');});
     room.onReconnect(()=>{if(!current())return;this.connected=true;this.pending=[];room.send('sync');this.onConnection('connected');});
     room.onLeave(()=>{if(!current())return;this.connected=false;this.room=null;this.pending=[];if(!this.leaving)this.onConnection('disconnected');});
     room.onError((_code:number,message:string)=>{if(current())this.onNotice(message||'Não foi possível manter a conexão.');});
     room.send('sync');this.onConnection('connected');
   }catch(error:any){if(generation===this.generation){this.onConnection('error');let message=error?.message??'';if(/locked|full/i.test(message))message='A sala está cheia ou a partida já começou.';else if(/not found|not exist|invalid room/i.test(message))message='Sala não encontrada. Confira o código de 6 caracteres.';else if(/fetch|network|timeout|aborted/i.test(message))message='Não foi possível conectar. O servidor pode estar despertando; tente novamente.';this.onNotice(message||'Não foi possível entrar na sala.');}}finally{if(generation===this.generation)this.connecting=false;}
 }
 receive(s:any){
   if(!Array.isArray(s.players))return;this.snapshot=s;
   if(s.paused)this.pending=[];
   if(s.round!==this.round){this.round=s.round;this.rewards=null;this.pending=[];}
   const ack=s.acks?.[this.id]??0;this.pending=this.pending.filter(p=>p.seq>ack);
   const own=s.players.find((p:any)=>p.id===this.id);
   if(own){this.predictor=new World(s.chapter??1);this.predictor.mode=s.mode??'coop';this.predictor.predicting=true;this.predictor.status=s.status;this.predictor.players=s.players.map((p:any)=>({...p}));this.predictor.player=this.predictor.players.find(p=>p.id===this.id)!;this.predictor.time=s.time;this.predictor.bossActive=s.bossActive;this.predictor.enemies=[];for(const packet of this.pending)this.predict(packet.input,false);}
   this.onSnapshot(s);
 }
 predict(input:Input,emit:boolean){if(!this.predictor.player)return;this.predictor.time+=1/60;this.predictor.stepPlayer(1/60,input);const events=this.predictor.events.splice(0);this.predictor.projectiles=[];if(emit)this.onEvents(events.filter(e=>['jump','dash','slash','solar','nova','fireball','inferno','arrow','lightBolt','shield','healingWave','arrowRain'].includes(e.type)));}
 step(input:Input){
   if(!this.room||!this.connected)return;
   if(performance.now()-this.lastPing>1500){this.lastPing=performance.now();this.room.send('ping',this.lastPing);}
   if(!this.canSimulate)return;
   // Inputs have no coordinates, damage, health or elapsed time supplied by the client.
   const packet={seq:++this.seq,input:{left:!!input.left,right:!!input.right,attack:!!input.attack,actions:[...(input.actions??[])]}};
   this.pending.push(packet);if(this.pending.length>120)this.pending.shift();this.room.send('input',packet);this.predict(packet.input,true);
 }
 command(type:string,value?:any){if(this.room&&this.connected)this.room.send(type,value);}
 async leave(closeRoom=false){this.leaving=true;this.generation++;this.connecting=false;const room=this.room;if(closeRoom&&room&&this.connected)room.send('close');this.sessionId='';this.room=null;this.connected=false;this.pending=[];this.snapshot=null;this.lobby=null;this.rewards=null;if(room){try{await Promise.race([room.leave(),new Promise(resolve=>setTimeout(resolve,1500))]);}catch{}}}
}
