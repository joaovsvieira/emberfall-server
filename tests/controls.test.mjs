import test from 'node:test';
import assert from 'node:assert/strict';
import {GameControls,isEditing} from '../dist/controls.js';

function event(type,props={}){const e=new Event(type,{cancelable:true});Object.assign(e,props);return e;}
test('menus and pause preserve typing, movement and mouse do not leak into a resumed game',()=>{
 const keys=new EventTarget(),canvas=new EventTarget();let active=false,pauses=0;
 const controls=new GameControls(()=>active,()=>{active=false;pauses++},keys,canvas);
 for(const code of ['KeyA','KeyD','KeyW','KeyF','KeyQ','KeyE','KeyK','KeyU','KeyI','Space','ArrowUp','Escape']){
   const e=event('keydown',{code});keys.dispatchEvent(e);assert.equal(e.defaultPrevented,false,code);
 }
 canvas.dispatchEvent(event('pointerdown',{button:0,pointerType:'mouse'}));assert.deepEqual(controls.sample(),{});
 active=true;controls.sync();keys.dispatchEvent(event('keydown',{code:'KeyW'}));assert.deepEqual(controls.sample().actions,['jump']);
 keys.dispatchEvent(event('keydown',{code:'KeyF'}));assert.deepEqual(controls.sample().actions,[]);
 canvas.dispatchEvent(event('pointerdown',{button:2,pointerType:'mouse'}));assert.equal(controls.sample().attack,false);
 canvas.dispatchEvent(event('pointerdown',{button:0,pointerType:'mouse'}));assert.equal(controls.sample().attack,true);
 keys.dispatchEvent(event('pointerup',{button:0}));assert.equal(controls.sample().attack,false);
 keys.dispatchEvent(event('keydown',{code:'KeyD'}));keys.dispatchEvent(event('keydown',{code:'Escape'}));assert.equal(pauses,1);
 controls.sync();keys.dispatchEvent(event('keydown',{code:'KeyQ'}));keys.dispatchEvent(event('keydown',{code:'Escape'}));assert.equal(pauses,1);
 active=true;controls.sync();assert.deepEqual(controls.sample(),{left:false,right:false,down:false,attack:false,actions:[]});
 assert.equal(isEditing({closest:()=>({tagName:'INPUT'})}),true);
 const typed=event('keydown',{code:'KeyW'});Object.defineProperty(typed,'target',{value:{closest:()=>({})}});keys.dispatchEvent(typed);
 assert.equal(typed.defaultPrevented,false);assert.deepEqual(controls.sample().actions,[]);
});

test('potion shortcuts are single presses and inactive in menus, pause and editable fields',()=>{
 const keys=new EventTarget();let active=false,used=[];new GameControls(()=>active,()=>{},keys,new EventTarget(),slot=>used.push(slot));
 keys.dispatchEvent(event('keydown',{code:'Digit1'}));assert.deepEqual(used,[]);active=true;keys.dispatchEvent(event('keydown',{code:'Digit1'}));keys.dispatchEvent(event('keydown',{code:'Digit1',repeat:true}));assert.deepEqual(used,[1]);
 const typed=event('keydown',{code:'Digit2'});Object.defineProperty(typed,'target',{value:{closest:()=>({})}});keys.dispatchEvent(typed);assert.equal(typed.defaultPrevented,false);assert.deepEqual(used,[1]);active=false;keys.dispatchEvent(event('keydown',{code:'Digit3'}));assert.deepEqual(used,[1]);
});
