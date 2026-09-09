// Stable IDs are persisted. Add entries; never rename an ID already awarded.
export const HERO_IDS=['kael','lyra','aurel','sylva'];
export const SLOTS={head:'Cabeça',armor:'Armadura',weapon:'Arma',gloves:'Luvas',boots:'Botas',accessory:'Acessório'};
export const BALANCE={version:1,maxLevel:100,xpBase:100,xpGrowth:1.18,mobXp:{goblin:20,bat:12,wraith:32,boss:150,forest_dragon:45,lava_imp:24,ashwing:18,ember_mage:38,obsidian_guardian:180,frost_reaver:28,ice_wyvern:48,frost_sorcerer:44,ice_dragon:220},chapterXp:[0,1,1.7,2.6],chapterGold:[0,80,150,250]};
export function progression(xp=0){let level=1,current=Math.max(0,xp);while(level<BALANCE.maxLevel){const required=Math.round(BALANCE.xpBase*BALANCE.xpGrowth**(level-1));if(current<required)return {level,xp:current,nextXp:required,totalXp:xp};current-=required;level++;}return {level,xp:0,nextXp:0,totalXp:xp};}
export function killXp(kind,chapter){return Math.round((BALANCE.mobXp[kind]??BALANCE.mobXp.goblin)*BALANCE.chapterXp[chapter]);}
const labels={head:'Coroa',armor:'Vestes',weapon:'Arma',gloves:'Luvas',boots:'Botas',accessory:'Talismã'};
const themes=['','da Floresta','de Obsidiana','da Geada'];
export const ITEMS=Object.fromEntries([1,2,3].flatMap(tier=>HERO_IDS.flatMap(hero=>Object.keys(SLOTS).map(slot=>{
 const id=`${hero}_${slot}_${tier}`;
 const attributes=slot==='head'?{maxHp:8*tier,defense:2*tier}:slot==='armor'?{maxHp:15*tier,defense:4*tier}:slot==='weapon'?{damage:6*tier}:slot==='gloves'?{attackSpeed:5*tier,damage:2*tier}:slot==='boots'?{speed:4*tier,defense:tier}:{maxHp:5*tier,damage:3*tier};
 return [id,{id,name:`${labels[slot]} ${themes[tier]} · ${hero[0].toUpperCase()+hero.slice(1)}`,slot,hero,tier,requiredLevel:1,attributes}];
}))));
export function attributes(hero,xp,items=[]){const level=progression(xp).level;const result={maxHp:100+(level-1)*4,damage:100+(level-1)*2,defense:0,speed:100,attackSpeed:100};for(const item of items){const def=itemDefinition(typeof item==='string'?{catalog_id:item}:item);if(def?.hero!==hero)continue;for(const [key,value] of Object.entries(def.attributes))result[key]+=value;}result.speed=Math.min(150,result.speed);result.attackSpeed=Math.min(200,result.attackSpeed);return result;}
export function lootPool(chapter){return Object.values(ITEMS).filter(i=>i.tier===chapter);}
// Monday 00:00 America/Sao_Paulo (UTC-3). Archive rows instead of deleting history.
export function weekStart(now=Date.now()){const local=new Date(now-3*3600000);local.setUTCHours(0,0,0,0);local.setUTCDate(local.getUTCDate()-(local.getUTCDay()+6)%7);return local.getTime()+3*3600000;}

export const PROFESSIONS={alchemy:'Alquimia',leatherworking:'Couraria',blacksmithing:'Ferraria',jewelcrafting:'Joalheria',tailoring:'Alfaiataria',enchanting:'Encantamento'};
export const RECIPES={healing_potion:{id:'healing_potion',profession:'alchemy',name:'Poção de cura menor',output:'healing_potion',materials:{forest_herb:2}}};
Object.assign(ITEMS,{
 forest_herb:{id:'forest_herb',name:'Erva da aurora',slot:'material',kind:'material',hero:null,attributes:{}},
 recipe_healing_potion:{id:'recipe_healing_potion',name:'Receita: poção de cura menor',slot:'recipe',kind:'recipe',recipe:'healing_potion',hero:null,attributes:{}},
 healing_potion:{id:'healing_potion',name:'Poção de cura menor',slot:'consumable',kind:'consumable',hero:null,attributes:{},description:'Recupera 20% da vida máxima. Recarga compartilhada de 30 segundos.'}
});
export const POTION={healFraction:0.2,cooldownMs:30000};
export const SKINS={kael_astral:{id:'kael_astral',hero:'kael',name:'Kael · Guardião Astral',price:10}};
export const ACHIEVEMENTS={dragon_hunter:{id:'dragon_hunter',name:'Caçador de dragões',scope:'hero',target:5,description:'Derrote 5 dragões nos Ecos da Floresta.',title:true},artisan:{id:'artisan',name:'Primeiro ofício',scope:'account',target:1,description:'Aprenda sua primeira profissão.',title:false}};
export function qualityBand(level){return level>=20?3:level>=15?2:level>=10?1:0;}
export function itemDefinition(item){const def=ITEMS[item.catalog_id];if(!def)return undefined;const band=Math.max(0,Math.min(3,item.quality??0)),scale=[1,1.15,1.3,1.5][band];return {...def,kind:def.kind??'equipment',quality:band,attributes:Object.fromEntries(Object.entries(def.attributes).map(([k,v])=>[k,Math.round(v*scale)]))};}
export function heroTitle(hero,title){return title==='dragon_hunter'?(['lyra','sylva'].includes(hero)?'Caçadora de dragões':'Caçador de dragões'):'';}

export const PROFESSION_COST=100;
// Guaranteed chapter-clear drops, one instance per entry. Stable suffixes preserve retry safety.
export const CHAPTER_DROPS=[{suffix:'herb1',catalog:'forest_herb'},{suffix:'herb2',catalog:'forest_herb'},{suffix:'recipe',catalog:'recipe_healing_potion'}];
