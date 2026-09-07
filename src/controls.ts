import type {Action, Input} from './engine.js';

const bindings:Record<string,Action>={Space:'jump',KeyW:'jump',ArrowUp:'jump',ShiftLeft:'dash',ShiftRight:'dash',KeyK:'dash',KeyQ:'skill1',KeyU:'skill1',KeyE:'skill2',KeyI:'skill2'};
const movement=new Set(['KeyA','KeyD','ArrowLeft','ArrowRight']);
export function isEditing(target:any){return !!target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');}

// No global Phaser captures: menus and form fields keep native keyboard behavior.
export class GameControls {
 down=new Set<string>();actions:Action[]=[];mouse=false;enabled=false;
 constructor(private active:()=>boolean,private pause:()=>void,keys:EventTarget,surface:EventTarget){
   keys.addEventListener('keydown',((e:KeyboardEvent)=>{
     if(!this.active()||isEditing(e.target))return;
     if(e.code==='Escape'){e.preventDefault();if(!e.repeat){this.reset();this.pause();}return;}
     if(!bindings[e.code]&&!movement.has(e.code))return;
     if(e.repeat&&!this.down.has(e.code))return;
     e.preventDefault();this.down.add(e.code);
     if(!e.repeat&&bindings[e.code])this.actions.push(bindings[e.code]);
   }) as EventListener);
   keys.addEventListener('keyup',((e:KeyboardEvent)=>this.down.delete(e.code)) as EventListener);
   keys.addEventListener('pointerup',((e:PointerEvent)=>{if(e.button===0)this.mouse=false;}) as EventListener);
   keys.addEventListener('pointercancel',()=>this.reset());
   keys.addEventListener('blur',()=>this.reset());
   surface.addEventListener('pointerdown',((e:PointerEvent)=>{
     if(e.button!==0||e.pointerType==='touch'||!this.active())return;
     e.preventDefault();this.mouse=true;this.actions.push('attack');
   }) as EventListener);
 }
 reset(){this.down.clear();this.actions=[];this.mouse=false;}
 sync(){const enabled=this.active();if(!enabled)this.reset();this.enabled=enabled;return enabled;}
 sample():Input{if(!this.active()){this.reset();return {};}
   return {left:this.down.has('KeyA')||this.down.has('ArrowLeft'),right:this.down.has('KeyD')||this.down.has('ArrowRight'),attack:this.mouse,actions:[...new Set(this.actions.splice(0))]};
 }
}
