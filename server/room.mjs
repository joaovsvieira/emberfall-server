import {Room, ServerError} from '@colyseus/core';
import {randomInt,randomUUID} from 'node:crypto';
import {World, createPlayer, HEROES, CHAPTER_COUNT} from '../dist/engine.js';

import {lootPool,attributes,heroPower,CHAPTER_IDS,ITEMS,progression,heroTitle,itemDefinition} from './catalog.mjs';
import {mythicRules,mythicUpgrade} from './mythic.mjs';
import {weekStart} from './catalog.mjs';
const codes=new Set();
export const publicRooms=new Map();
export function availableRooms(chapter,unlocked=1){return [...publicRooms.values()].filter(r=>r.visible&&r.mode==='coop'&&r.stage==='lobby'&&r.members.size<r.maxClients&&r.chapter<=unlocked&&(!chapter||r.chapter===chapter)).map(r=>{const l=r.lobby();return {code:r.roomId,chapter:r.chapter,host:r.members.get(r.host)?.name??'Aventureiro',players:r.members.size,maxPlayers:r.maxClients,mythicLevel:l.useKey&&l.key?.status==='available'?l.key.level:0};});}
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
  if(['left','right','down','attack'].some(k=>v[k]!==undefined&&typeof v[k]!=='boolean'))return null;
  if(v.actions!==undefined&&(!Array.isArray(v.actions)||v.actions.length>5||v.actions.some(a=>!['jump','attack','dash','skill1','skill2'].includes(a))))return null;
  return {seq:packet.seq,input:{left:v.left===true,right:v.right===true,down:v.down===true,attack:v.attack===true,actions:[...new Set(v.actions??[])]}};
}
export class ForestRoom extends Room {
  maxClients=2;maxMessagesPerSecond=120;
  mode='coop';chapter=1;scores=new Map();result=null;scoredRound=0;closing=false;
  participants=[];rewardCache=new Map();settlement=null;xpPending=false;xpSavedCount=0;finishedAt=0;
  roomCreatedAt=randomUUID();progress='idle';progressRound=0;progressIds=[];progressRetries=0;accounts=null;
  visible=false;creatorAccountId='';useKey=false;mythic=null;preparing=false;
  members=new Map();world=new World();host='';stage='lobby';round=0;tick=0;accumulator=0;countdownAt=0;
  async onCreate(options={}){
    if(options.mode!==undefined&&!['solo','coop','pvp'].includes(options.mode))throw new ServerError(400,'Modo inválido.');
    this.mode=options.mode??'coop';this.maxClients=this.mode==='solo'?1:this.mode==='pvp'?2:4;
    this.chapter=Number(options.chapter??1);if(!CHAPTER_IDS.includes(this.chapter))throw new ServerError(400,'Capítulo inválido.');
    let creator;try{creator=await this.accounts.authenticate(options);}catch(e){throw new ServerError(401,e.message);}this.creatorAccountId=creator.id;const hero=creator.heroes.find(h=>h.id===(options.hero??'kael'));if((hero?.unlockedChapter??creator.unlockedChapter??1)<this.chapter)throw new ServerError(403,'Este herói precisa liberar o capítulo para criar a sala.');
    if(codes.size>=MAX_ROOMS)throw new ServerError(503,'Todas as salas estão ocupadas. Tente novamente em instantes.');
    let code;do{code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}while(codes.has(code));
    this.roomId=code;codes.add(code);publicRooms.set(code,this);await this.setPrivate(true);
    this.world.players=[];
    this.onMessage('input',(client,packet)=>{const m=this.members.get(client.sessionId);if(!m)return;const value=validateInput(packet,m.lastSeq);if(!value)return;m.lastSeq=value.seq;m.lastSeen=Date.now();if(this.stage!=='playing'||this.isPaused()){m.ack=m.lastSeq;m.queue=[];m.input={};return;}if(m.queue.length>=6){m.ack=m.queue.shift().seq;}m.queue.push(value);});
    this.onMessage('visibility',(client,value)=>{if(client.sessionId===this.host&&this.stage==='lobby'&&this.mode==='coop'&&typeof value==='boolean'){this.visible=value;this.sendLobby();}});
    this.onMessage('kick',(client,id)=>{if(client.sessionId!==this.host||this.stage!=='lobby'||id===this.host)return;const target=this.clients.find(c=>c.sessionId===id);if(target){target.send('notice','O líder removeu você da sala.');target.leave(4000);}});
    this.onMessage('potion',(client,slot)=>void this.usePotion(client,slot));
    this.onMessage('ready',(client,value)=>{const m=this.members.get(client.sessionId);if(m&&this.stage==='lobby'&&typeof value==='boolean'){m.ready=value;this.sendLobby();}});
    this.onMessage('start',(client)=>{if(client.sessionId!==this.host||this.stage!=='lobby')return;if(this.members.size<(this.mode==='solo'||(this.mode==='coop'&&this.round>0)?1:2)||[...this.members.values()].some(m=>!m.ready||!m.connected)){client.send('notice','Todos na sala precisam estar prontos (PvE: mínimo de dois).');return;}void this.prepareRound(client);});
    this.onMessage('key',(client,value)=>{if(client.sessionId===this.host&&this.stage==='lobby'&&typeof value==='boolean'&&this.mode!=='pvp'){this.useKey=value;for(const m of this.members.values())m.ready=false;this.sendLobby();}});
    this.onMessage('pause',(client,value)=>{const m=this.members.get(client.sessionId);if(m&&typeof value==='boolean'){m.paused=value;this.clearInputs();this.sendLobby();}});
    this.onMessage('restart',(client)=>{if(client.sessionId!==this.host||this.stage!=='playing'||!['dead','won'].includes(this.world.status)||this.progress==='saving'||this.progress==='error')return;if((this.mode==='pvp'&&this.members.size<2)||[...this.members.values()].some(m=>!m.connected)){client.send('notice','Volte ao menu para criar uma nova sala com seu companheiro.');return;}if(this.mode==='pvp')this.beginRound();else this.returnLobby();});
    this.onMessage('next-chapter',(client)=>{if(client.sessionId!==this.host||this.mode==='pvp'||this.chapter>=CHAPTER_COUNT||this.world.status!=='won'||this.stage!=='playing'||this.progress!=='saved'||[...this.members.values()].some(m=>!m.connected||m.unlockedChapter<this.chapter+1))return;this.returnLobby(this.chapter+1);});
    this.onMessage('retry-progress',()=>{if(this.progress==='error')void this.saveProgress();});
    this.onMessage('close',(client)=>{if(client.sessionId===this.host){
      if(this.mode==='pvp'&&this.world.status==='playing'){this.world.winnerId=[...this.members.keys()].find(id=>id!==client.sessionId)??null;this.world.status='won';this.recordResult('forfeit');}
      if(this.mode!=='pvp'&&this.stage==='playing'&&this.world.status==='playing'){for(const p of this.participants)p.departed=true;this.world.status='dead';this.recordResult('left');}
      this.closing=true;this.stage='ended';this.clearInputs();this.broadcast('session-ended',this.snapshot());this.disconnect();
    }});
    this.onMessage('sync',(client)=>{client.send('lobby',this.lobby());client.send('snapshot',this.snapshot());if(this.rewardCache.has(client.sessionId))client.send('rewards',this.rewardCache.get(client.sessionId));});
    this.onMessage('ping',(client,value)=>{if(typeof value==='number'&&Number.isFinite(value))client.send('pong',value);});
    this.setSimulationInterval(delta=>this.advance(delta),1000/60);
    this.clock.setTimeout(()=>{if(this.stage==='lobby')this.disconnect();},10*60*1000);

  }
  async onAuth(_client,options){
    const hero=options?.hero??'kael';if(!Object.hasOwn(HEROES,hero))throw new ServerError(400,'Herói inválido.');
    let account;try{account=await this.accounts.authenticate(options);}catch(e){throw new ServerError(401,e.message);}
    const unlocked=account.heroes.find(h=>h.id===hero)?.unlockedChapter??account.unlockedChapter??1;
    if(unlocked<this.chapter&&(this.mode!=='pvp'||account.id===this.creatorAccountId))throw new ServerError(403,'Conclua o capítulo anterior para entrar neste mapa.');
    if(!account.heroes.some(h=>h.id===hero))throw new ServerError(403,'Você ainda não possui este herói.');
    if([...this.members.values()].some(m=>m.accountId===account.id))throw new ServerError(409,'Sua conta já está nesta sala.');
    const h=account.heroes.find(h=>h.id===hero);const potions=(account.hotbar??[]).filter(b=>b.hero===hero).map(b=>({slot:b.slot,count:(h.inventory??[]).filter(i=>i.catalog_id===b.catalog_id&&!i.listed&&!i.equipped).length}));
    return {skin:h.skin??'default',title:heroTitle(hero,h.title),xp:h.xp??0,nextXp:h.nextXp??100,level:h.level??1,potions,name:account.name,hero,accountId:account.id,keys:account.heroes.find(h=>h.id===hero)?.keys??[],unlockedChapter:unlocked,stats:account.heroes.find(h=>h.id===hero)?.attributes??attributes(hero,0)};
  }
  onJoin(client,_options,auth){
    if(this.stage!=='lobby')throw new ServerError(409,'Esta partida já começou.');
    if(!this.host)this.host=client.sessionId;
    const index=this.members.size;
    if([...this.members.values()].some(m=>m.accountId===auth.accountId))throw new ServerError(409,'Sua conta já está nesta sala.');
    this.members.set(client.sessionId,{id:client.sessionId,skin:auth.skin??'default',title:auth.title??'',xp:auth.xp??0,nextXp:auth.nextXp??100,level:auth.level??1,potions:auth.potions??[],name:auth.name,hero:auth.hero,accountId:auth.accountId,unlockedChapter:auth.unlockedChapter,stats:auth.stats,keys:auth.keys??[],ready:false,connected:true,paused:false,index,lastSeq:0,ack:0,queue:[],input:{},lastSeen:Date.now()});
    this.scores.set(client.sessionId,{id:client.sessionId,skin:auth.skin??'default',title:auth.title??'',xp:auth.xp??0,nextXp:auth.nextXp??100,level:auth.level??1,potions:auth.potions??[],name:auth.name,wins:0});
    this.sendLobby();
  }
  onDrop(client){this.clearInputs();const m=this.members.get(client.sessionId);if(m){m.connected=false;m.input={};m.queue=[];m.ack=m.lastSeq;}this.allowReconnection(client,25);this.sendLobby();}
  onReconnect(client){if(this.rewardCache.has(client.sessionId))client.send('rewards',this.rewardCache.get(client.sessionId));const m=this.members.get(client.sessionId);if(m){m.connected=true;m.lastSeen=Date.now();m.input={};m.queue=[];}client.send('snapshot',this.snapshot());this.sendLobby();}
  onLeave(client){
    if(this.closing){this.members.delete(client.sessionId);return;}
    const departed=this.members.get(client.sessionId);
    if(this.stage==='playing'&&this.world.status==='playing'){const p=this.participants.find(p=>p.id===departed?.accountId);if(p){p.departed=true;p.earnedKills=this.deadEnemies();}}
    if(this.mode==='pvp'&&!this.closing&&this.stage==='playing'&&this.world.status==='playing'){
      this.world.winnerId=[...this.members.keys()].find(id=>id!==client.sessionId)??null;this.world.status='won';this.recordResult('forfeit');
    }
    if(this.mode!=='pvp'&&this.stage==='playing'&&this.world.status==='playing'&&this.members.size===1){this.world.status='dead';this.recordResult('left');}
    this.members.delete(client.sessionId);if(this.round===0)this.scores.delete(client.sessionId);this.world.players=this.world.players.filter(p=>p.id!==client.sessionId);
    if(this.host===client.sessionId)this.host=this.members.keys().next().value??'';
    if(this.world.players.length)this.world.player=this.world.players[0];
    if(this.stage==='countdown'){if(this.mythic){this.world.status='dead';this.stage='playing';this.recordResult('left');}else this.returnLobby();}
    if(this.mode==='coop'&&this.members.size&&this.stage==='playing'&&this.world.status==='playing'){for(const m of this.members.values())m.paused=true;this.clearInputs();}
    this.sendLobby();
    if(this.mode==='coop'&&this.members.size&&this.stage==='playing')this.broadcast('party-left',departed?.name??'Seu companheiro');
    if(this.members.size&&this.stage==='playing'){this.broadcast('snapshot',this.snapshot());this.broadcast('notice',this.mode==='pvp'?'Seu adversário saiu. O placar permanece até encerrar a sala.':'Seu companheiro saiu da sala.');}
  }
  async getInspectData(){return {roomId:this.roomId,maxClients:this.maxClients,metadata:{mode:this.mode,chapter:this.chapter,progress:this.progress},locked:this.locked,clients:this.clients.map(c=>({sessionId:c.sessionId,elapsedTime:this.clock.elapsedTime-c._joinedAt})),state:this.snapshot(),stateSize:Buffer.byteLength(JSON.stringify(this.snapshot()))};}
  onDispose(){codes.delete(this.roomId);publicRooms.delete(this.roomId);if(this.mythic&&!this.settlement)void this.accounts.store.call('key-resolve',{round:this.mythic.round,success:false}).catch(()=>{});}
  clearInputs(){for(const m of this.members.values()){m.input={};m.queue=[];m.ack=m.lastSeq;}}
  isPaused(){return [...this.members.values()].some(m=>m.paused||!m.connected);}
  lobby(){const host=this.members.get(this.host);const key=host?.keys?.find(k=>k.chapter===this.chapter&&k.week===weekStart());return {visible:this.visible,useKey:this.useKey,key:key??null,mythic:this.mythicView(),preparing:this.preparing,progress:this.progress,maxPlayers:this.maxClients,chapter:this.chapter,mode:this.mode,scores:[...this.scores.values()],result:this.result,code:this.roomId,host:this.host,stage:this.stage,round:this.round,countdown:this.stage==='countdown'?Math.max(0,Math.ceil((this.countdownAt-Date.now())/1000)):0,paused:this.isPaused(),members:[...this.members.values()].map(({id,name,hero,ready,connected,paused,index,stats})=>({id,name,hero,ready,connected,paused,index,power:heroPower(stats??attributes(hero,0))}))};}
  sendLobby(){this.broadcast('lobby',this.lobby());}
  returnLobby(chapter=this.chapter){this.chapter=chapter;this.stage='lobby';this.world.status='ready';this.mythic=null;this.useKey=false;this.unlock();for(const m of this.members.values())m.ready=false;this.sendLobby();}
  async prepareRound(client){
    if(this.preparing)return;this.preparing=true;this.stage='preparing';this.sendLobby();let key=null;
    try{
      const host=this.members.get(this.host);if(!host)throw new Error('Anfitrião indisponível.');
      if(this.useKey&&this.mode!=='pvp')key=await this.accounts.store.call('key-activate',{id:host.accountId,hero:host.hero,chapter:this.chapter,round:`${this.roomId}:${this.roomCreatedAt}:${this.round+1}`});
      if(this.closing||!this.members.has(host.id)||[...this.members.values()].some(m=>!m.connected)||this.members.size<(this.mode==='solo'||this.mode==='coop'&&this.round>0?1:2))throw new Error('A sala mudou. Prepare-se novamente.');
      this.mythic=key?{round:key.run_id,owner:host.accountId,hero:host.hero,level:key.level,...mythicRules(this.chapter,key.level),startedAt:0,deadline:0,total:0}:null;this.beginRound();
    }catch(e){if(key)await this.accounts.store.call('key-resolve',{round:key.run_id,success:false}).catch(()=>{});this.returnLobby();client.send('notice',e.message);}finally{this.preparing=false;this.sendLobby();}
  }
  mythicView(){if(!this.mythic)return null;const m=this.mythic,elapsed=m.startedAt?Math.max(0,(this.finishedAt||Date.now())-m.startedAt):0;const kills=this.world.enemies.filter(e=>e.kind!=='boss'&&e.dead).length;return {...m,remainingMs:Math.max(0,m.limitMs-elapsed),killed:kills,upgrade:mythicUpgrade(elapsed,m.limitMs,kills,m.total),elapsedMs:elapsed};}
  beginRound(chapter=this.chapter){
    this.rewardCache.clear();this.settlement=null;this.xpSavedCount=0;this.finishedAt=0;this.participants=[...this.members.values()].map(m=>({id:m.accountId,sessionId:m.id,hero:m.hero,name:m.name,loot:lootPool(chapter)[randomInt(lootPool(chapter).length)].id}));
    this.chapter=chapter;this.lock();this.world=new World(this.chapter);this.world.mode=this.mode==='pvp'?'pvp':'coop';this.result=null;this.progress='idle';this.progressRetries=0;this.accumulator=0;this.round++;this.progressIds=[...this.members.values()].map(m=>m.accountId);this.world.players=[...this.members.values()].map((m,i)=>{m.input={};m.queue=[];m.ack=m.lastSeq;m.paused=false;const p=createPlayer(m.id,m.name,this.mode==='pvp'?3980+i*640:190+i*85,m.hero);Object.assign(p,m.stats??attributes(m.hero,0),{skin:m.skin,title:m.title,xp:m.xp,nextXp:m.nextXp,level:m.level,potions:m.potions,potionUntil:m.potionUntil??0});p.power=heroPower(m.stats??attributes(m.hero,0));p.hp=p.maxHp;if(this.mode==='pvp'){p.dir=i===0?1:-1;p.checkpoint=p.x;p.zone=2;}return p;});
    this.world.player=this.world.players[0];
    if(this.mode==='pvp')this.world.enemies=[];
    for(const e of this.world.enemies){e.hp=e.maxHp=Math.round(e.maxHp*(this.mythic?.hp??1)*(1+(this.world.players.length-1)*(e.kind==='boss'?.65:.35)));}
    this.world.enemyDamageScale=this.mythic?.damage??1;if(this.mythic)this.mythic.total=this.world.enemies.filter(e=>e.kind!=='boss').length;
    this.stage='countdown';this.countdownAt=Date.now()+3000;this.sendLobby();this.broadcast('snapshot',this.snapshot());
  }
  deadEnemies(){return this.world.enemies.filter(e=>e.dead).map(e=>({id:e.id,kind:e.species??e.kind}));}
  payload(reason='knockout'){return {mythic:this.mythicView(),round:`${this.roomId}:${this.roomCreatedAt}:${this.round}`,chapter:this.chapter,mode:this.mode,duration:this.mythic?this.mythicView().elapsedMs/1000:this.world.elapsed,outcome:this.world.status,finishedAt:this.finishedAt||Date.now(),reason,winner:this.members.get(this.world.winnerId)?.accountId,players:this.participants.map(p=>({...p})),kills:this.deadEnemies()};}
  async flushXp(){
    if(!this.accounts?.store||this.mode==='pvp'||this.xpPending)return;
    const payload=this.payload(),count=payload.kills.length,round=this.round;if(count===this.xpSavedCount)return;
    this.xpPending=true;try{const result=await this.accounts.store.call('rewards',payload);if(this.round===round){this.xpSavedCount=count;this.broadcast('hero-progress',{});for(const m of this.members.values()){const h=result.heroes?.find(h=>h.account_id===m.accountId&&h.hero===m.hero);if(h){const xp=progression(h.xp);Object.assign(m,{xp:xp.xp,nextXp:xp.nextXp,level:xp.level});const p=this.world.players.find(p=>p.id===m.id);if(p)Object.assign(p,{xp:xp.xp,nextXp:xp.nextXp,level:xp.level});}}}}catch(e){console.error('XP persistence pending',e.message);}finally{this.xpPending=false;}
  }
  async usePotion(client,slot){
    const m=this.members.get(client.sessionId),p=this.world.players.find(p=>p.id===client.sessionId),world=this.world;
    if(!m||!p||m.potionPending||!Number.isInteger(slot)||slot<1||slot>5||this.stage!=='playing'||world.status!=='playing'||this.isPaused()||p.hp<=0||p.hp>=p.maxHp||(m.potionUntil??0)>Date.now())return;
    m.potionPending=true;try{const result=await this.accounts.store.call('potion-use',{id:m.accountId,hero:m.hero,slot,useId:randomUUID()});if(result.consumed){m.potionUntil=result.cooldownUntil;if(this.world===world){p.potionUntil=result.cooldownUntil;for(const entry of p.potions)entry.count=Math.max(0,entry.count-1);if(p.hp>0&&world.status==='playing'){const healed=Math.min(p.maxHp-p.hp,Math.round(p.maxHp*result.healFraction));p.hp+=healed;world.events.push({type:'heal',playerId:p.id,x:p.x,y:p.y-90,value:healed});}}}else client.send('notice','Poção indisponível ou ainda em recarga.');}catch{client.send('notice','Não foi possível usar a poção. Tente novamente.');}finally{m.potionPending=false;}
  }
  recordResult(reason='knockout'){
    if(!['won','dead'].includes(this.world.status)||this.progressRound===this.round||this.round===0)return;
    if(this.mythic&&this.mythic.startedAt&&Date.now()>=this.mythic.deadline){this.world.status='dead';reason='timeout';}
    this.progressRound=this.round;this.finishedAt=Date.now();
    if(this.mode==='pvp'&&this.world.status==='won'){
      this.scoredRound=this.round;const winnerId=this.world.winnerId,winner=this.scores.get(winnerId);if(winner)winner.wins++;
      this.result={winnerId,reason,round:this.round};
    }
    this.settlement=this.payload(reason);void this.saveProgress();this.sendLobby();
  }
  async saveProgress(){
    if(this.progress==='saving'||this.progress==='saved'||!this.settlement)return;
    this.progress='saving';this.sendLobby();const round=this.round,chapter=this.chapter,payload=this.settlement;
    try{
      if(payload.mythic)await this.accounts.store.call('key-resolve',{round:payload.mythic.round,success:payload.outcome==='won'&&payload.mythic.upgrade!==null&&payload.players.some(p=>p.id===payload.mythic.owner&&!p.departed),upgrade:payload.mythic.upgrade??0});
      const result=this.accounts.store?await this.accounts.complete(payload.players.filter(p=>!p.departed).map(p=>p.id),chapter,payload.round,payload):{rewards:[]};
      if(this.round!==round)return;
      for(const m of this.members.values()){
        if(this.mode!=='pvp'&&payload.outcome==='won')m.unlockedChapter=Math.max(m.unlockedChapter,Math.min(CHAPTER_COUNT,chapter+1));
        const reward=result.rewards.find(r=>r.account_id===m.accountId);if(reward){reward.item=itemDefinition(reward)??null;this.rewardCache.set(m.id,reward);this.clients.find(c=>c.sessionId===m.id)?.send('rewards',reward);}
        // Refresh equipment and levels before the next chapter/rematch.
        if(this.accounts.getProfile){const profile=await this.accounts.getProfile(m.accountId);const hero=profile?.heroes.find(h=>h.id===m.hero);m.stats=hero?.attributes??m.stats;m.keys=hero?.keys??[];m.unlockedChapter=hero?.unlockedChapter??m.unlockedChapter;if(hero){m.xp=hero.xp;m.nextXp=hero.nextXp;m.level=hero.level;m.potions=(profile.hotbar??[]).filter(b=>b.hero===m.hero).map(b=>({slot:b.slot,count:hero.inventory.filter(i=>i.catalog_id===b.catalog_id&&!i.listed).length}));}}
      }
      this.progress='saved';this.broadcast('progress-saved',{chapter});
    }catch(e){console.error('Progress save failed',e.message);this.progress='error';if(this.progressRetries++<2)this.clock.setTimeout(()=>void this.saveProgress(),2000);}
    this.sendLobby();
  }
  advance(delta){
    this.tick++;
    if(this.stage==='countdown'&&Date.now()>=this.countdownAt&&!this.isPaused()){this.stage='playing';this.world.start();if(this.mythic){this.mythic.startedAt=Date.now();this.mythic.deadline=Date.now()+this.mythic.limitMs;}this.sendLobby();}
    if(this.stage==='playing'&&this.world.status==='playing'&&this.mythic&&Date.now()>=this.mythic.deadline){this.world.status='dead';this.recordResult('timeout');}
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
    if(this.tick%60===0){this.sendLobby();if(this.world.status==='playing')void this.flushXp();}
  }
  snapshot(){const w=this.world;return {mythic:this.mythicView(),progress:this.progress,maxPlayers:this.maxClients,chapter:this.chapter,mode:this.mode,scores:[...this.scores.values()],result:this.result,winnerId:w.winnerId,round:this.round,stage:this.stage,paused:this.isPaused(),status:w.status,time:w.time,elapsed:w.elapsed,kills:w.kills,bossActive:w.bossActive,players:w.players.map(p=>({...p})),enemies:w.enemies.map(e=>({...e})),projectiles:w.projectiles.map(({hits,...s})=>s),pickups:w.pickups.map(p=>({...p})),acks:Object.fromEntries([...this.members].map(([id,m])=>[id,m.ack]))};}
}
