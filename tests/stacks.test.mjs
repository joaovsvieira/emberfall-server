import test from 'node:test';
import assert from 'node:assert/strict';
import {storage,migrate} from './helpers/storage.mjs';
import {itemStacks} from '../dist/inventory.js';
import {itemDefinition} from '../server/catalog.mjs';
async function setup(t){const s=storage();migrate(s);t.after(()=>s.sqlite.close());for(const id of ['alice','bob','carol'])await s.call('register',{id,username:id,displayName:id,passwordHash:'x'});s.sqlite.prepare('UPDATE accounts SET gold=1000').run();return s;}
function units(s,catalog,n){for(let i=0;i<n;i++)s.sqlite.prepare('INSERT INTO items(id,account_id,hero,catalog_id,slot,created_at) VALUES(?,?,?,?,?,?)').run('u'+i,'alice','kael',catalog,catalog==='healing_potion'?'consumable':'material',i);}
const own=async(s,id='alice',hero='kael')=>(await s.call('game-profile',{id})).heroes.find(h=>h.id===hero).inventory;
test('only compatible free material and potion units are stacked in the backpack',()=>{
 const make=(id,catalog_id,hero='kael',quality=0)=>({id,account_id:'a',hero,catalog_id,quality,definition:itemDefinition({catalog_id,quality})});const items=[make('1','healing_potion'),make('2','healing_potion'),make('3','healing_potion','lyra'),make('4','forest_herb'),make('5','forest_herb'),make('6','kael_head_1'),make('7','kael_head_1')];const result=itemStacks(items);assert.equal(result.length,5);assert.equal(result[0].quantity,2);assert.equal(result[2].quantity,2);assert.equal(items[0].quantity,undefined);
});
test('partial potion lot reserves every unit; shortcut consumes only remaining units and stays assigned',async t=>{
 const s=await setup(t);units(s,'healing_potion',5);await s.call('market-sell',{id:'alice',item:'u0',quantity:3,price:30});await s.call('hotbar-set',{id:'alice',hero:'kael',slot:1,catalog:'healing_potion'});const listing=(await s.call('market-list',{id:'bob'})).listings[0];assert.equal(listing.quantity,3);assert.equal((await own(s)).filter(i=>i.listed).length,3);assert.equal(itemStacks((await own(s)).filter(i=>!i.listed))[0].quantity,2);
 for(let i=0;i<2;i++){s.sqlite.prepare('UPDATE potion_cooldowns SET until=0').run();assert.equal((await s.call('potion-use',{id:'alice',hero:'kael',slot:1,useId:'p'+i})).consumed,true);}s.sqlite.prepare('UPDATE potion_cooldowns SET until=0').run();assert.equal((await s.call('potion-use',{id:'alice',hero:'kael',slot:1,useId:'empty'})).consumed,false);assert.equal((await s.call('game-profile',{id:'alice'})).hotbar.length,1);
 await s.call('market-cancel',{id:'alice',listing:listing.id});assert.equal(itemStacks(await own(s))[0].quantity,3);assert.equal((await s.call('potion-use',{id:'alice',hero:'kael',slot:1,useId:'restored'})).consumed,true);
});
test('lot transfer and payment are atomic, isolated by hero and retry-safe',async t=>{
 const s=await setup(t);units(s,'forest_herb',5);await s.call('market-sell',{id:'alice',item:'u0',quantity:3,price:75});await assert.rejects(()=>s.call('market-sell',{id:'alice',item:'u1',quantity:1,price:5}));await assert.rejects(()=>s.call('market-sell',{id:'alice',item:'u4',quantity:3,price:5}));const l=(await s.call('market-list',{id:'bob'})).listings[0];const r=await Promise.allSettled(['bob','carol'].map(id=>s.call('market-buy',{id,hero:'lyra',listing:l.id})));assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal((await own(s,'bob','lyra')).length,3);assert.equal((await own(s)).length,2);assert.equal((await s.call('mail-list',{id:'alice'})).messages.find(m=>m.gold).gold,75);assert.equal((await s.call('market-history',{id:'alice'})).transactions[0].quantity,3);assert.equal((await s.call('game-profile',{id:'bob'})).gold,925);await s.call('mail-claim',{id:'alice',all:true});assert.equal((await s.call('game-profile',{id:'alice'})).gold,1075);
});
test('invalid quantities and equipment stacking are rejected without reserving items',async t=>{
 const s=await setup(t);units(s,'forest_herb',2);for(const quantity of [0,-1,1.5,1000,'2'])await assert.rejects(()=>s.call('market-sell',{id:'alice',item:'u0',quantity,price:20}));s.sqlite.prepare("UPDATE items SET catalog_id='kael_head_1',slot='head'").run();await assert.rejects(()=>s.call('market-sell',{id:'alice',item:'u0',quantity:2,price:20}));assert.equal((await s.call('market-list',{id:'alice',mine:'1'})).listings.length,0);
});
