// Stable IDs are persisted. Add entries; never rename an ID already awarded.
export const HERO_IDS=['kael','lyra','aurel','sylva'];
export const SLOTS={head:'Cabeça',armor:'Armadura',weapon:'Arma',gloves:'Luvas',boots:'Botas',accessory:'Acessório'};
export const BALANCE={version:1,maxLevel:100,xpBase:100,xpGrowth:1.18,mobXp:{goblin:20,bat:12,wraith:32,boss:150},chapterXp:[0,1,1.7,2.6],chapterGold:[0,80,150,250]};
export function progression(xp=0){let level=1,current=Math.max(0,xp);while(level<BALANCE.maxLevel){const required=Math.round(BALANCE.xpBase*BALANCE.xpGrowth**(level-1));if(current<required)return {level,xp:current,nextXp:required,totalXp:xp};current-=required;level++;}return {level,xp:0,nextXp:0,totalXp:xp};}
export function killXp(kind,chapter){return Math.round((BALANCE.mobXp[kind]??BALANCE.mobXp.goblin)*BALANCE.chapterXp[chapter]);}
const labels={head:'Coroa',armor:'Vestes',weapon:'Arma',gloves:'Luvas',boots:'Botas',accessory:'Talismã'};
const themes=['','da Floresta','de Obsidiana','da Geada'];
export const ITEMS=Object.fromEntries([1,2,3].flatMap(tier=>HERO_IDS.flatMap(hero=>Object.keys(SLOTS).map(slot=>{
 const id=`${hero}_${slot}_${tier}`;
 const attributes=slot==='head'?{maxHp:8*tier,defense:2*tier}:slot==='armor'?{maxHp:15*tier,defense:4*tier}:slot==='weapon'?{damage:6*tier}:slot==='gloves'?{attackSpeed:5*tier,damage:2*tier}:slot==='boots'?{speed:4*tier,defense:tier}:{maxHp:5*tier,damage:3*tier};
 return [id,{id,name:`${labels[slot]} ${themes[tier]} · ${hero[0].toUpperCase()+hero.slice(1)}`,slot,hero,tier,requiredLevel:1,attributes}];
}))));
export function attributes(hero,xp,items=[]){const level=progression(xp).level;const result={maxHp:100+(level-1)*4,damage:100+(level-1)*2,defense:0,speed:100,attackSpeed:100};for(const item of items){const def=ITEMS[item.catalog_id??item];if(def?.hero!==hero)continue;for(const [key,value] of Object.entries(def.attributes))result[key]+=value;}result.speed=Math.min(150,result.speed);result.attackSpeed=Math.min(200,result.attackSpeed);return result;}
export function lootPool(chapter){return Object.values(ITEMS).filter(i=>i.tier===chapter);}
// Monday 00:00 America/Sao_Paulo (UTC-3). Archive rows instead of deleting history.
export function weekStart(now=Date.now()){const local=new Date(now-3*3600000);local.setUTCHours(0,0,0,0);local.setUTCDate(local.getUTCDate()-(local.getUTCDay()+6)%7);return local.getTime()+3*3600000;}
