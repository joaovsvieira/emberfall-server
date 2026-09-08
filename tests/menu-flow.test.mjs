import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../dist/engine.js';
// A small scene/element facade exercises UI state transitions without a browser or renderer.
globalThis.Phaser={Scene:class{},Game:class{},Scale:{FIT:1,CENTER_BOTH:1},AUTO:0};
const elements=new Map();
function element(id){if(!elements.has(id)){const classes=new Set(['hidden']);elements.set(id,{textContent:'',disabled:false,style:{},classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k)},add(k){classes.add(k)},remove(k){classes.delete(k)},contains(k){return classes.has(k)}},focus(){},blur(){}});}return elements.get(id);}
globalThis.document={getElementById:element};globalThis.requestAnimationFrame=fn=>fn();
const {ForestScene}=await import('../dist/game.js');
const fluent=()=>new Proxy({}, {get(_target,key){return key==='scrollX'?0:()=>fluent();},set(){return true}});
function scene(){const s=new ForestScene();s.controls={reset(){}};s.cameras={main:{scrollX:0}};s.tweens={killTweensOf(){}};s.hero=fluent();s.bg={tilePositionX:0};s.fx={clear(){}};s.projectileArt={clear(){}};s.rebuildLevel=()=>{};s.selectHero=()=>{};return s;}
test('menu return resets solo, cooperative and PvP scenes immediately, including a dead peer',async()=>{
 for(const mode of ['solo','coop','pvp']){
   const s=scene();s.hub={profile:{id:'test'},setTab(){},refresh(){}};s.session=mode==='solo'?'solo':'online';s.world=new World();s.world.mode=mode==='pvp'?'pvp':'coop';s.world.status='won';s.world.players.push({...s.world.player,id:'dead-peer',hp:0});s.resultShown=true;s.paused=true;
   let resolveLeave,closeValue;s.net={active:mode!=='solo',id:'host',lobby:{host:'host'},leave(close){closeValue=close;return new Promise(r=>resolveLeave=r)}};
   const leaving=s.goToMenu();assert.equal(s.session,'menu');assert.equal(s.world.status,'ready');assert.equal(s.world.players.length,1);assert.equal(s.resultShown,false);assert.equal(s.paused,false);assert.equal(s.canControl(),false);assert.equal(element('start-screen').classList.contains('hidden'),false);assert.equal(element('modal').classList.contains('hidden'),true);assert.equal(closeValue,mode==='pvp');
   resolveLeave();await leaving;assert.equal(s.transitioning,false);
 }
});
test('chapter I victory exposes advance, restart and menu; offline online sessions cannot restart as solo',()=>{
 const s=scene();s.session='solo';s.world.status='won';s.showCampaignResult();assert.equal(s.primaryAction,'next');assert.equal(element('modal-secondary').classList.contains('hidden'),false);assert.equal(element('modal-menu').classList.contains('hidden'),false);
 let chapter;s.startGame=id=>chapter=id;s.performModalAction('next');assert.equal(chapter,2);
 s.world=new World(2);s.world.status='won';s.showCampaignResult();assert.equal(s.primaryAction,'next');s.performModalAction('next');assert.equal(chapter,3);assert.equal(element('modal-primary').textContent,'IR PARA O CAPÍTULO III');
 s.world=new World(3);s.world.status='won';s.showCampaignResult();assert.equal(s.primaryAction,'restart');assert.equal(element('modal-secondary').classList.contains('hidden'),true);
 s.session='online';s.net={connected:false};chapter=null;s.restart();assert.equal(chapter,null);
});
test('saved campaign defeat exposes restart, while a victory remains in its modal until an explicit action',()=>{
 const s=scene();s.session='online';s.net={connected:true,id:'host',lobby:{host:'host',progress:'saved',members:[{connected:true}]},command(){throw new Error('automatic transition is forbidden')}};
 s.world.status='dead';s.showCampaignResult();assert.equal(s.primaryAction,'restart');assert.equal(element('modal').classList.contains('hidden'),false);
 s.world.status='won';s.showCampaignResult();assert.equal(s.primaryAction,'next');assert.equal(element('chapter-loot').classList.contains('hidden'),false);assert.equal(element('modal').classList.contains('hidden'),false);
 s.net.lobby.progress='error';s.updateCampaignButtons();assert.equal(s.primaryAction,'retry-progress');
});
