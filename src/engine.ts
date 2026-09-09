export type HeroId='kael'|'lyra'|'aurel'|'sylva';
export const HEROES={kael:{name:'Kael',role:'Espadachim',attack:'Combo de espada',skill1:'Corte solar',skill2:'Nova rúnica'},lyra:{name:'Lyra',role:'Maga das brasas',attack:'Bolas de fogo',skill1:'Orbe incandescente',skill2:'Explosão ígnea'},aurel:{name:'Aurel',role:'Guardião da aurora',attack:'Centelha dourada',skill1:'Égide solar',skill2:'Cura da aurora'},sylva:{name:'Sylva',role:'Arqueira do bosque',attack:'Flechas do bosque',skill1:'Flecha perfurante',skill2:'Chuva de flechas'}};
export type Action = 'jump'|'attack'|'dash'|'skill1'|'skill2';
export type Input = {left?:boolean;right?:boolean;attack?:boolean;actions?:Action[]};
export type Platform = {x:number;y:number;w:number;ground?:boolean};
export type Enemy = {id:number;kind:string;species:string;x:number;y:number;home:number;baseY:number;hp:number;maxHp:number;dir:number;timer:number;windup:number;flash:number;knock:number;phase:number;attackAnim:number;active:boolean;dead:boolean;attackX:number};
export type GameEvent = {type:string;x?:number;y?:number;value?:number;text?:string;dir?:number;kind?:string;playerId?:string};
export const LEVEL_WIDTH=4800;
export const platforms:Platform[]=[
 {x:0,y:615,w:1120,ground:true},{x:1330,y:615,w:1010,ground:true},{x:2550,y:615,w:540,ground:true},{x:3280,y:615,w:1520,ground:true},
 {x:530,y:505,w:240},{x:930,y:505,w:180},{x:1150,y:432,w:180},{x:1390,y:508,w:190},{x:1750,y:475,w:230},{x:2120,y:510,w:190},{x:2350,y:420,w:180},{x:2580,y:510,w:180},{x:2920,y:505,w:170},{x:3080,y:420,w:180},{x:3290,y:505,w:170}
];
export const CHAPTERS={
 1:{name:'Ecos da Floresta',background:'forest',terrain:'terrain',boss:'Guardião Ancestral',zones:['LIMIAR DA FLORESTA','RUÍNAS DO VÉU','SANTUÁRIO DA CHAMA'],platforms},
 2:{name:'Caldeira de Obsidiana',background:'caldera',terrain:'basalt',boss:'Arauto da Caldeira',zones:['PASSAGEM DAS CINZAS','FORJAS PARTIDAS','TRONO DE OBSIDIANA'],platforms:[
  {x:0,y:615,w:950,ground:true},{x:1250,y:615,w:940,ground:true},{x:2470,y:615,w:560,ground:true},{x:3290,y:615,w:1510,ground:true},
  {x:660,y:505,w:180},{x:1000,y:442,w:155},{x:1330,y:505,w:160},{x:1660,y:465,w:180},{x:2020,y:500,w:155},{x:2260,y:420,w:150},{x:2550,y:495,w:165},{x:2840,y:480,w:150},{x:3090,y:415,w:145},{x:3340,y:500,w:165}
 ] as Platform[]},
 3:{name:'Cidadela da Geada',background:'frosthold',terrain:'froststone',boss:'Soberano da Geada',zones:['ESCADARIA DO INVERNO','GALERIA DOS ECOS','COROA DE GELO'],platforms:[
  {x:0,y:615,w:880,ground:true},{x:1210,y:615,w:990,ground:true},{x:2510,y:615,w:520,ground:true},{x:3340,y:615,w:1460,ground:true},
  {x:650,y:495,w:160},{x:960,y:420,w:150},{x:1260,y:500,w:160},{x:1570,y:435,w:150},{x:1900,y:495,w:155},{x:2270,y:410,w:145},{x:2540,y:490,w:150},{x:2840,y:465,w:145},{x:3120,y:410,w:145},{x:3390,y:490,w:150}
 ] as Platform[]}
};
export type ChapterId=1|2|3;
export function createPlayer(id='solo',name='Kael',x=190,hero:HeroId='kael'){return {id,name,hero,skin:'default',title:'',xp:0,nextXp:100,level:1,potionUntil:0,potions:[] as {slot:number,count:number}[],x,y:615,vx:0,vy:0,dir:1,hp:100,maxHp:100,damage:100,defense:0,speed:100,attackSpeed:100,grounded:true,jumps:0,invincible:0,dash:0,dashCooldown:0,attack:0,attackCooldown:0,skill1:0,skill2:0,coyote:.1,jumpBuffer:0,hitCount:0,bestCombo:0,comboTime:0,comboStep:0,lastAttack:-10,checkpoint:190,revive:0,zone:0,shield:0,shieldTime:0};}
export type Player=ReturnType<typeof createPlayer>;
export class World {
 chapter:ChapterId;get level(){return CHAPTERS[this.chapter];}get platforms(){return this.level.platforms;}
 mode:'coop'|'pvp'='coop'; winnerId:string|null=null; predicting=false;
 status:'ready'|'playing'|'dead'|'won'='ready'; time=0; elapsed=0; kills=0; bossActive=false; events:GameEvent[]=[];
 player=createPlayer(); players:Player[]=[this.player];
 get zone(){return this.player.zone;} set zone(v:number){this.player.zone=v;}
 get hitCount(){return this.player.hitCount;} set hitCount(v:number){this.player.hitCount=v;}
 get bestCombo(){return Math.max(...this.players.map(p=>p.bestCombo),0);} set bestCombo(v:number){this.player.bestCombo=v;}
 get comboTime(){return this.player.comboTime;} set comboTime(v:number){this.player.comboTime=v;}
 get comboStep(){return this.player.comboStep;} set comboStep(v:number){this.player.comboStep=v;}
 get lastAttack(){return this.player.lastAttack;} set lastAttack(v:number){this.player.lastAttack=v;}
 get checkpoint(){return this.player.checkpoint;} set checkpoint(v:number){this.player.checkpoint=v;}

 enemies:Enemy[]=[]; projectiles:{x:number;y:number;vx:number;vy:number;life:number;friendly:boolean;owner?:string;kind?:string;damage?:number;pvpDamage?:number;pierce?:boolean;hits:Set<number|string>}[]=[]; pickups:{x:number;y:number;life:number}[]=[];
 constructor(chapter:ChapterId=1){
   this.chapter=chapter===3?3:chapter===2?2:1;
   const specs:[string,number,number][]=[['goblin',760,615],['goblin',1030,615],['bat',1480,492],['goblin',1630,615],['wraith',1900,490],['goblin',2190,615],['bat',2690,450],['wraith',2850,505],['goblin',3460,615],['bat',3640,460],['boss',4390,615]];
   if(this.chapter===2)specs.splice(0,specs.length,['goblin',660,615],['bat',840,470],['wraith',1330,495],['goblin',1550,615],['bat',1710,450],['wraith',1940,480],['goblin',2130,615],['bat',2300,460],['goblin',2590,615],['wraith',2810,490],['bat',3010,440],['wraith',3370,470],['goblin',3500,615],['bat',3670,460],['boss',4390,615]);
   if(this.chapter===3)specs.splice(0,specs.length,['goblin',590,615],['bat',780,445],['wraith',1260,480],['goblin',1430,615],['bat',1590,435],['wraith',1740,475],['goblin',1930,615],['bat',2110,440],['wraith',2290,455],['goblin',2570,615],['bat',2680,425],['wraith',2860,470],['bat',3100,430],['wraith',3360,450],['goblin',3460,615],['goblin',3600,615],['bat',3750,450],['boss',4390,615]);
   this.enemies=specs.map(([kind,x,y],id)=>({id,kind,species:this.chapter===2?({goblin:'lava_imp',bat:'ashwing',wraith:'ember_mage',boss:'obsidian_guardian'}[kind]??kind):this.chapter===3?({goblin:'frost_reaver',bat:'ice_wyvern',wraith:'frost_sorcerer',boss:'ice_dragon'}[kind]??kind):kind==='bat'?'forest_dragon':kind,x,y,home:x,baseY:y,hp:kind==='boss'?480:kind==='bat'?34:kind==='wraith'?65:52,maxHp:kind==='boss'?480:kind==='bat'?34:kind==='wraith'?65:52,dir:-1,timer:1.1+id*.13,windup:0,flash:0,knock:0,phase:0,attackAnim:0,active:false,dead:false,attackX:x}));
   if(this.chapter>1)for(const e of this.enemies){e.hp=e.maxHp=Math.round(e.maxHp*(this.chapter===3?(e.kind==='boss'?2.15:1.75):(e.kind==='boss'?1.5:1.35)));e.timer*=this.chapter===3?.65:.8;}
 }
 emit(type:string,extra:Partial<GameEvent>={}){this.events.push({type,playerId:this.player.id,...extra});}
 start(){this.status='playing';this.emit('toast',{text:'A / D para mover · W / ↑ / Espaço para pulo duplo · clique esquerdo para atacar'});}
 enemyDamageScale=1;
 damagePlayer(amount:number,sourceX:number){const p=this.player;if(p.invincible>0||this.status!=='playing')return;amount=Math.max(1,Math.round(amount*(this.mode==='pvp'?1:this.enemyDamageScale)*100/(100+p.defense)));const absorbed=Math.min(p.shield,amount);p.shield-=absorbed;amount-=absorbed;if(absorbed)this.emit('blocked',{x:p.x,y:p.y-85,value:absorbed});p.hp=Math.max(0,p.hp-amount);p.invincible=this.mode==='pvp'?.22:1.15;p.vx=(p.x>=sourceX?1:-1)*240;this.hitCount=0;this.emit('hurt',{x:p.x,y:p.y-65,value:amount});if(p.hp<=0){p.vx=0;p.vy=0;p.y=this.platforms.filter(b=>p.x>b.x&&p.x<b.x+b.w&&b.y>=p.y).sort((a,b)=>a.y-b.y)[0]?.y??615;if(this.mode==='pvp'){this.winnerId=this.players.find(q=>q.id!==p.id&&q.hp>0)?.id??null;this.status='won';this.emit('won');return;}p.revive=0;this.emit('downed');}}
 hitOpponent(target:Player,damage:number){
   const attacker=this.player;if(this.mode!=='pvp'||this.predicting||target.id===attacker.id||target.hp<=0||target.invincible>0||this.status!=='playing')return;
   this.player=target;this.damagePlayer(Math.round(damage*attacker.damage/100),attacker.x);this.player=attacker;
   attacker.hitCount++;attacker.comboTime=2.5;attacker.bestCombo=Math.max(attacker.bestCombo,attacker.hitCount);
 }
 hitEnemy(e:Enemy,damage:number,dir:number){if(e.dead||(e.kind==='boss'&&!this.bossActive))return;damage=Math.round(damage*this.player.damage/100);e.hp=Math.max(0,e.hp-damage);e.flash=.16;e.knock=dir*(e.kind==='boss'?60:210);this.hitCount++;this.comboTime=2.5;this.bestCombo=Math.max(this.bestCombo,this.hitCount);this.emit('hit',{x:e.x,y:e.y-(e.kind==='boss'?140:60),value:damage,kind:e.kind});if(e.hp<=0){e.dead=true;this.kills++;this.emit('kill',{x:e.x,y:e.y-40,kind:e.kind});if(e.kind==='boss'){this.status='won';this.emit('won');}else this.pickups.push({x:e.x,y:e.y-40,life:30});}}
 action(action:Action){if(this.status!=='playing'||this.player.hp<=0)return;const p=this.player;
   if(action==='jump'){p.jumpBuffer=.13;this.tryJump();}
   if(action==='dash'&&p.dashCooldown<=0){p.dash=.19;p.dashCooldown=.85;p.invincible=Math.max(p.invincible,.25);this.emit('dash',{x:p.x,y:p.y-40,dir:p.dir});}
   if(p.hero==='aurel'){
     if(action==='attack'&&p.attackCooldown<=0){p.attack=.28;p.attackCooldown=.48;this.castBolt('light',20,12,610,1.05);return;}
     if(action==='skill1'&&p.skill1<=0){p.skill1=9;p.attack=.3;p.shield=this.mode==='pvp'?22:40;p.shieldTime=5;this.emit('shield',{x:p.x,y:p.y-55});return;}
     if(action==='skill2'&&p.skill2<=0){p.skill2=12;p.attack=.45;this.emit('healingWave',{x:p.x,y:p.y-45});if(!this.predicting)for(const ally of this.players){if(ally.hp<=0||(this.mode==='pvp'&&ally.id!==p.id)||Math.hypot(ally.x-p.x,ally.y-p.y)>300)continue;const healed=Math.min(this.mode==='pvp'?22:35,ally.maxHp-ally.hp);ally.hp+=healed;if(healed)this.emit('heal',{playerId:ally.id,x:ally.x,y:ally.y-95,value:healed});}return;}
   }
   if(p.hero==='sylva'){
     if(action==='attack'&&p.attackCooldown<=0){p.attack=.23;p.attackCooldown=.34;this.castBolt('arrow',21,12,900,1);return;}
     if(action==='skill1'&&p.skill1<=0){p.skill1=5;p.attack=.35;this.castBolt('piercingArrow',55,25,1050,1.05,true);return;}
     if(action==='skill2'&&p.skill2<=0){p.skill2=11;p.attack=.4;const center=Math.max(60,Math.min(4740,p.x+p.dir*240));for(let i=-2;i<=2;i++)this.projectiles.push({x:center+i*62,y:p.y-350-Math.abs(i)*35,vx:0,vy:650,life:.85,friendly:true,owner:p.id,kind:'rainArrow',damage:25,pvpDamage:9,pierce:false,hits:new Set()});this.emit('arrowRain',{x:center,y:p.y-45});return;}
   }
   if(action==='attack'&&p.hero==='lyra'&&p.attackCooldown<=0){this.comboStep=this.time-this.lastAttack<.9?(this.comboStep%3)+1:1;this.lastAttack=this.time;p.attack=.27;p.attackCooldown=this.comboStep===3?.48:.36;this.castFire(this.comboStep===3?26:18,this.comboStep===3?14:11);return;}
   if(action==='skill1'&&p.hero==='lyra'&&p.skill1<=0){p.skill1=5;p.attack=.4;this.castFire(48,24,true);return;}
   if(action==='attack'&&p.hero==='kael'&&p.attackCooldown<=0){this.comboStep=this.time-this.lastAttack<.72?(this.comboStep%3)+1:1;this.lastAttack=this.time;p.attack=.24;p.attackCooldown=this.comboStep===3?.4:.27;this.emit('slash',{x:p.x,y:p.y-54,dir:p.dir,value:this.comboStep});for(const e of this.enemies){if(e.dead)continue;const dx=e.x-p.x,dy=Math.abs((e.y-(e.kind==='boss'?105:45))-(p.y-55));if(dx*p.dir>-35&&Math.abs(dx)<(e.kind==='boss'?175:135)&&dy<115)this.hitEnemy(e,[0,22,26,38][this.comboStep],p.dir);}for(const target of this.players){const dx=target.x-p.x;if(dx*p.dir>-35&&Math.abs(dx)<135&&Math.abs(target.y-p.y)<115)this.hitOpponent(target,[0,14,18,24][this.comboStep]);}}
   if(action==='skill1'&&p.hero==='kael'&&p.skill1<=0){p.skill1=5;p.attack=.4;this.projectiles.push({x:p.x+p.dir*50,y:p.y-60,vx:p.dir*760,vy:0,life:.9,friendly:true,owner:p.id,hits:new Set()});this.emit('solar',{x:p.x,y:p.y-60,dir:p.dir});}
   if(action==='skill2'&&(p.hero==='kael'||p.hero==='lyra')&&p.skill2<=0){p.skill2=10;p.attack=.45;p.invincible=Math.max(p.invincible,.5);this.emit(p.hero==='lyra'?'inferno':'nova',{x:p.x,y:p.y-45});for(const e of this.enemies){if(!e.dead&&Math.hypot(e.x-p.x,e.y-p.y)<285)this.hitEnemy(e,p.hero==='lyra'?64:76,e.x>p.x?1:-1);}for(const target of this.players)if(Math.hypot(target.x-p.x,target.y-p.y)<285)this.hitOpponent(target,p.hero==='lyra'?28:32);}
 }
 castBolt(kind:string,damage:number,pvpDamage:number,speed:number,life:number,pierce=false){const p=this.player;this.projectiles.push({x:p.x+p.dir*42,y:p.y-62,vx:p.dir*speed,vy:0,life,friendly:true,owner:p.id,kind,damage,pvpDamage,pierce,hits:new Set()});this.emit(kind==='light'?'lightBolt':'arrow',{x:p.x+p.dir*42,y:p.y-62,dir:p.dir});}
 castFire(damage:number,pvpDamage:number,charged=false){const p=this.player;this.projectiles.push({x:p.x+p.dir*42,y:p.y-62,vx:p.dir*(charged?720:640),vy:0,life:charged?1.2:1,friendly:true,owner:p.id,kind:charged?'inferno':'fireball',damage,pvpDamage,pierce:charged,hits:new Set()});this.emit('fireball',{x:p.x+p.dir*42,y:p.y-62,dir:p.dir,value:charged?2:1});}
 tryJump(){const p=this.player;if(p.jumpBuffer>0&&(p.grounded||p.coyote>0||p.jumps<2)){if(!p.grounded&&p.coyote<=0&&p.jumps===0)p.jumps=1;if(p.jumps>=2)return;p.vy=p.jumps===0?-580:-545;p.jumps++;p.grounded=false;p.coyote=0;p.jumpBuffer=0;this.emit('jump',{x:p.x,y:p.y,value:p.jumps});}}
 update(dt:number,input:Input={}){this.updateCoop(dt,{[this.player.id]:input});}
 updateCoop(dt:number,inputs:Record<string,Input>={}){
   if(this.status!=='playing')return;dt=Math.min(dt,.034);this.time+=dt;this.elapsed+=dt;const selected=this.player;
   for(const p of this.players){if(this.status!=='playing')break;this.player=p;this.stepPlayer(dt,inputs[p.id]??{});}
   if(this.status==='playing'){this.stepEnemies(dt);this.stepProjectiles(dt);this.stepPickups(dt);this.stepHazards();}
   if(this.mode!=='pvp')for(const p of this.players){if(p.hp>0)continue;p.revive+=dt;if(p.revive>=3){this.player=p;p.hp=p.maxHp;p.x=this.bossActive?3980:p.checkpoint;p.y=430;p.vx=p.vy=0;p.jumps=0;p.jumpBuffer=0;p.attack=0;p.dash=0;p.invincible=2;p.revive=0;this.emit('revived',{x:p.x,y:p.y-90});}}
   this.player=selected;
 }
 stepPlayer(dt:number,input:Input={}){const p=this.player;if(p.hp<=0)return;
   for(const key of ['invincible','dash','dashCooldown','attack','attackCooldown','skill1','skill2','jumpBuffer','coyote','shieldTime'] as const)p[key]=Math.max(0,p[key]-dt*(key==='attackCooldown'?p.attackSpeed/100:1));
   if(p.shieldTime<=0)p.shield=0;
   this.comboTime-=dt;if(this.comboTime<=0)this.hitCount=0;
   for(const a of input.actions??[])this.action(a);if(input.attack)this.action('attack');
   const move=(input.right?1:0)-(input.left?1:0);if(move&&p.dash<=0)p.dir=move;
   if(p.dash>0){p.vx=p.dir*850;p.vy=0;}else{p.vx+=(move*290*p.speed/100-p.vx)*Math.min(1,dt*(p.grounded?18:9));p.vy+=1510*dt;}
   const oldY=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;p.x=Math.max(this.mode==='pvp'||this.bossActive?3850:24,Math.min(LEVEL_WIDTH-50,p.x));p.grounded=false;
   if(p.vy>=0)for(const b of this.platforms){if(p.x+17>b.x&&p.x-17<b.x+b.w&&oldY<=b.y+2&&p.y>=b.y){p.y=b.y;p.vy=0;p.grounded=true;p.jumps=0;p.coyote=.1;break;}}
   if(p.jumpBuffer>0)this.tryJump();
   if(p.y>850){p.invincible=0;this.damagePlayer(this.chapter===3?30:this.chapter===2?24:16,p.x);p.x=this.checkpoint;p.y=p.hp>0?430:615;p.vy=0;p.vx=0;p.jumps=0;this.emit('toast',{text:'Cuidado com os abismos. Use o pulo duplo e o dash.'});}
   if(this.mode==='pvp'){p.zone=2;return;}
   if(!this.bossActive&&p.grounded&&p.x>2000&&p.x<2250)this.checkpoint=2030;
   if(!this.bossActive&&p.grounded&&p.x>3350&&p.x<3650)this.checkpoint=3390;
   const zone=p.x<1600?0:p.x<3800?1:2;if(zone!==this.zone){this.zone=zone;this.emit('zone',{value:zone});}
   if(p.x>3890&&!this.bossActive&&this.players.filter(p=>p.hp>0).every(p=>p.x>3780)){this.bossActive=true;for(const member of this.players){member.checkpoint=3930;member.hp=member.hp>0?Math.min(member.maxHp,member.hp+35):0;}this.emit('boss');this.emit('toast',{text:`${this.level.boss} · Pule sobre as ondas e use o dash para esquivar.`});}
 }
 stepEnemies(dt:number){
   for(const e of this.enemies){if(e.dead)continue;const target=this.players.filter(p=>p.hp>0).sort((a,b)=>Math.abs(a.x-e.x)-Math.abs(b.x-e.x))[0];if(!target)continue;this.player=target;const p=target;e.attackAnim=Math.max(0,e.attackAnim-dt);e.flash=Math.max(0,e.flash-dt);e.knock*=Math.max(0,1-dt*10);e.x+=e.knock*dt;const dx=p.x-e.x,dy=Math.abs(p.y-e.y);e.active=e.kind==='boss'?this.bossActive:Math.abs(dx)<660;if(!e.active)continue;e.dir=dx>=0?1:-1;e.timer-=dt*(this.chapter===3?1.45:this.chapter===2?1.25:1);
     if(e.windup>0){e.windup-=dt;if(e.windup<=0){e.attackAnim=.3;if(e.kind==='boss'){if(e.phase%2===0){this.emit('slam',{x:e.attackX,y:615});for(const member of this.players){if(member.hp>0&&Math.abs(member.x-e.attackX)<145&&member.y>470){this.player=member;this.damagePlayer(this.chapter===3?38:this.chapter===2?32:24,e.x);}}this.player=p;for(const dir of [-1,1])this.projectiles.push({x:e.attackX,y:594,vx:dir*(this.chapter===3?455:this.chapter===2?390:310),vy:0,life:2.1,friendly:false,hits:new Set()});}else{for(let n=this.chapter===3?-3:this.chapter===2?-2:-1;n<=(this.chapter===3?3:this.chapter===2?2:1);n++){const angle=Math.atan2(p.y-55-(e.y-140),p.x-e.x)+n*.26;this.projectiles.push({x:e.x,y:e.y-140,vx:Math.cos(angle)*310,vy:Math.sin(angle)*310,life:2.8,friendly:false,hits:new Set()});}this.emit('enemyShot',{x:e.x,y:e.y-140});}e.timer=e.hp<e.maxHp*.46?1.0:1.65;e.phase++;}else{if(Math.abs(dx)<105&&dy<110)this.damagePlayer((e.kind==='bat'?9:13)*(this.chapter===3?1.55:this.chapter===2?1.3:1),e.x);this.emit('enemySwipe',{x:e.x+e.dir*35,y:e.y-35,dir:e.dir});e.timer=1.25;}}
     }else if(e.kind==='boss'){if(e.timer<=0){e.windup=this.chapter===3?.6:this.chapter===2?.7:.85;e.attackX=p.x;this.emit('warning',{x:e.attackX,y:615,value:.85,kind:e.phase%2===0?'slam':'shot'});}else if(Math.abs(dx)>175)e.x+=e.dir*50*dt;e.x=Math.max(3980,Math.min(4650,e.x));
     }else if(e.kind==='wraith'){e.y=e.baseY+Math.sin(this.time*2+e.id)*18;if(Math.abs(dx)<500&&e.timer<=0){const angle=Math.atan2(p.y-50-e.y,p.x-e.x);this.projectiles.push({x:e.x,y:e.y-35,vx:Math.cos(angle)*235,vy:Math.sin(angle)*235,life:3,friendly:false,hits:new Set()});e.timer=2.6;e.attackAnim=.3;this.emit('enemyShot',{x:e.x,y:e.y-35});}
     }else{if(e.kind==='bat'){e.y+=(Math.max(380,p.y-40)-e.y)*dt*1.5; if(Math.abs(dx)>60)e.x+=e.dir*(this.chapter===3?165:this.chapter===2?140:115)*dt;}else if(Math.abs(dx)>64){const next=e.x+e.dir*(this.chapter===3?120:this.chapter===2?100:78)*dt;const ground=this.platforms.find(b=>b.ground&&next>b.x+28&&next<b.x+b.w-28);if(ground)e.x=next;}if(Math.abs(dx)<90&&dy<105&&e.timer<=0){e.windup=.42;this.emit('warning',{x:e.x,y:e.y-80,value:.42,kind:'melee'});}}
   }
 }
 stepProjectiles(dt:number){
   for(const s of this.projectiles){s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;if(s.friendly){this.player=this.players.find(p=>p.id===s.owner)??this.players[0];if(!this.player)continue;if(this.mode==='pvp')for(const target of this.players){if(target.id!==s.owner&&target.hp>0&&!s.hits.has(target.id)&&Math.abs(s.x-target.x)<45&&Math.abs(s.y-(target.y-50))<65){s.hits.add(target.id);this.hitOpponent(target,s.pvpDamage??26);if(s.kind&&!s.pierce){s.life=0;break;}}}if(s.life>0)for(const e of this.enemies){if(!e.dead&&!s.hits.has(e.id)&&Math.abs(s.x-e.x)<(e.kind==='boss'?100:55)&&Math.abs(s.y-(e.y-(e.kind==='boss'?100:40)))<110){s.hits.add(e.id);this.hitEnemy(e,s.damage??58,Math.sign(s.vx));if(s.kind&&!s.pierce){s.life=0;break;}}}}else for(const p of this.players){if(p.hp>0&&Math.abs(s.x-p.x)<25&&Math.abs(s.y-(p.y-45))<48){this.player=p;this.damagePlayer(this.chapter===3?20:this.chapter===2?16:12,s.x);s.life=0;break;}}}
   this.projectiles=this.projectiles.filter(s=>s.life>0);
 }
 get hazards(){return this.mode==='pvp'?[]:this.chapter===3?[{x:1480,offset:0},{x:1980,offset:1},{x:2690,offset:2},{x:3520,offset:3},{x:4160,offset:1.5},{x:4550,offset:3.5}]:this.chapter===2?[{x:1810,offset:0},{x:2720,offset:1.7},{x:3520,offset:3.2}]:[];}
 hazardState(offset:number){const cycle=this.chapter===3?4.2:5,phase=(this.time+offset)%cycle;return phase>=cycle-.8?'active':phase>=cycle-1.8?'warning':'idle';}
 stepHazards(){if(this.predicting||this.status!=='playing')return;for(const h of this.hazards){if(this.hazardState(h.offset)!=='active')continue;for(const p of this.players){if(p.hp>0&&Math.abs(p.x-h.x)<55&&p.y>480){this.player=p;this.damagePlayer(this.chapter===3?24:18,h.x);}}}}
 stepPickups(dt:number){
   for(const h of this.pickups){h.life-=dt;const p=this.players.filter(p=>p.hp>0).sort((a,b)=>Math.hypot(a.x-h.x,a.y-h.y)-Math.hypot(b.x-h.x,b.y-h.y))[0];if(!p)continue;this.player=p;if(Math.hypot(h.x-p.x,h.y-(p.y-45))<160){h.x+=(p.x-h.x)*dt*6;h.y+=(p.y-45-h.y)*dt*6;}if(Math.hypot(h.x-p.x,h.y-(p.y-45))<35){p.hp=Math.min(p.maxHp,p.hp+12);h.life=0;this.emit('heal',{x:p.x,y:p.y-95,value:12});}}
   this.pickups=this.pickups.filter(h=>h.life>0);
 }
}
