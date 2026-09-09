import {Adventure} from './adventure.js';
import {Expansion} from './expansion.js';
import {Features} from './features.js';
import {HEROES,CHAPTERS,type HeroId} from './engine.js';
const $=(id:string)=>document.getElementById(id)!;
const visible=(id:string,on:boolean)=>$(id).classList.toggle('hidden',!on);
export class Hub {
 profile:any=null;chapter=1;tab='map';authMode='login';busy=false;generation=0;heroSave=Promise.resolve();chatTab='global';friendTab='list';
 adventure!:Adventure;expansion!:Expansion;
 features!:Features;
 constructor(public scene:any){
  for(const tab of ['shop','professions','heroes','achievements','history','map','market','ranking','clan','mail','settings'])$('tab-'+tab).onclick=()=>this.setTab(tab);
  $('auth-switch').onclick=()=>{this.authMode=this.authMode==='login'?'register':'login';this.renderAuth();};
  $('auth-form').onsubmit=e=>{e.preventDefault();void this.submit();};$('auth-retry').onclick=()=>void this.refresh();
  $('settings-fullscreen').onclick=()=>$('fullscreen').click();$('settings-sound').onclick=()=>{$('sound').click();this.syncSound();};
  $('settings-logout').onclick=()=>void this.logout();
  $('account-trigger').onclick=e=>{e.stopPropagation();this.toggleAccountMenu();};$('account-settings').onclick=()=>{this.closeAccountMenu();this.setTab('settings');};$('account-logout').onclick=()=>{this.closeAccountMenu();void this.logout();};
  $('map-1').onclick=()=>this.selectChapter(1);$('map-2').onclick=()=>this.selectChapter(2);$('map-3').onclick=()=>this.selectChapter(3);
  $('start').onclick=()=>void this.playSolo();$('hero-to-map').onclick=()=>this.setTab('map');
  this.features=new Features(this);this.expansion=new Expansion(this);this.adventure=new Adventure(this);
  document.addEventListener('click',e=>{const target=e.target as HTMLElement;if(!target.closest('#account-menu'))this.closeAccountMenu();});
  this.setAuthChrome(true);
  this.scene.net.onProgress=()=>void this.refresh(false);
  this.renderAuth();visible('auth-screen',true);$('auth-status').textContent='Verificando sua sessão…';void this.refresh();
 }
 async api(path:string,value?:any){const response=await fetch('/api/'+path,{method:value===undefined?'GET':'POST',headers:value===undefined?{}:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(75000)});let data:any;try{data=await response.json();}catch{throw new Error('O servidor está despertando. Aguarde um momento e tente novamente.');}if(!response.ok)throw Object.assign(new Error(data.error??'Não foi possível concluir.'),{status:response.status});return data;}
 renderAuth(){const register=this.authMode==='register';$('auth-title').textContent=register?'Sua jornada começa aqui.':'Bem-vindo de volta.';$('auth-submit').textContent=register?'CRIAR CONTA':'ENTRAR';$('auth-switch').textContent=register?'Já tenho conta':'Criar uma conta';($('auth-password') as HTMLInputElement).autocomplete=register?'new-password':'current-password';$('auth-status').textContent='';}
 async submit(){if(this.busy)return;this.busy=true;this.generation++;for(const id of ['auth-submit','auth-switch'])($(id) as HTMLButtonElement).disabled=true;$('auth-status').textContent='Conectando… O primeiro acesso pode levar um minuto.';
  try{const data=await this.api(this.authMode,{username:($('auth-username') as HTMLInputElement).value.trim(),password:($('auth-password') as HTMLInputElement).value});($('auth-password') as HTMLInputElement).value='';this.accept(data.profile);}
  catch(e:any){$('auth-status').textContent=e.message;}finally{this.busy=false;for(const id of ['auth-submit','auth-switch'])($(id) as HTMLButtonElement).disabled=false;}
 }
 async refresh(showLogin=true){const generation=this.generation;try{const data=await this.api('me');if(generation===this.generation)this.accept(data.profile,false);}catch(e:any){if(generation!==this.generation)return;if(e.status===401){this.profile=null;this.features?.reset();this.expansion?.reset();this.setAuthChrome(true);visible('auth-screen',true);visible('start-screen',false);$('auth-status').textContent='Entre para continuar sua jornada.';}else if(showLogin){this.setAuthChrome(true);visible('auth-screen',true);visible('start-screen',false);$('auth-status').textContent=e.message;}else $('hub-status').textContent='Não foi possível atualizar seu progresso. Tente novamente ao voltar ao menu.';}}
 accept(profile:any,initial=true){const first=!this.profile;this.profile=profile;if(first||initial)this.tab='map';this.setAuthChrome(false);visible('auth-screen',false);$('account-name').textContent=profile.name;$('account-id').textContent='ID da conta: '+profile.id;($('mp-name') as HTMLInputElement).value=profile.name;($('mp-name') as HTMLInputElement).readOnly=true;
  if(first||initial)this.scene.selectHero(profile.preferredHero);this.features.accepted();this.expansion.accepted();this.renderHeroes();this.renderMap();this.renderFooter();this.adventure.accepted();if(this.scene.resultShown&&this.scene.world.mode!=='pvp')this.scene.renderLoot();if(this.scene.session==='menu'){visible('start-screen',true);if(first||initial)this.setTab(this.tab);}if(first){const invite=new URL(location.href);if(invite.searchParams.has('room')){$(invite.searchParams.get('mode')==='pvp'?'pvp':'multiplayer').click();($('mp-code') as HTMLInputElement).value=invite.searchParams.get('room')??'';}}
 }
 setTab(tab:string){if(tab!==this.tab)this.scene.menuSound();this.tab=tab;this.closeWidgets();for(const name of ['shop','professions','heroes','achievements','history','map','market','ranking','clan','mail','settings']){visible('panel-'+name,name===tab);$('tab-'+name).setAttribute('aria-selected',String(name===tab));}visible('panel-rooms',tab==='rooms');this.syncSound();this.renderHeroes();this.renderMap();this.renderFooter();this.features.open(tab);this.expansion.open(tab);this.adventure.open(tab);}
 syncSound(){$('settings-sound').textContent=$('sound').getAttribute('aria-label')==='Desativar som'?'Som: ativado':'Som: desativado';}
 heroSelected(hero:HeroId){if(!this.profile)return;this.profile.preferredHero=hero;this.renderMap();this.renderHeroes();this.renderFooter();this.heroSave=this.heroSave.catch(()=>{}).then(async()=>{try{await this.api('hero',{hero});}catch(e:any){$('hub-status').textContent='Não foi possível salvar o herói padrão: '+e.message;}});}
 renderHeroes(){if(!this.profile)return;const id=this.scene.selectedHero as HeroId,hero=HEROES[id],owned=this.profile.heroes.find((h:any)=>h.id===id);
  $('roster-name').textContent=hero.name;$('roster-role').textContent=hero.role;$('roster-level').textContent=`NÍVEL ${owned?.level??1}`;($('roster-image') as HTMLImageElement).src=this.scene.textures.get(this.scene.heroKey(id,'idle',owned?.skin)).getSourceImage().toDataURL();
  $('roster-basic').textContent=hero.attack;$('roster-q').textContent=hero.skill1;$('roster-e').textContent=hero.skill2;
  this.features?.renderInventory();this.adventure?.heroExtras();
  for(const h of Object.keys(HEROES))($('hero-'+h) as HTMLButtonElement).disabled=!this.profile.heroes.some((owned:any)=>owned.id===h);
 }
 selectChapter(id:number){this.chapter=id;this.renderMap();}
 renderMap(){if(!this.profile)return;const unlocked=this.heroProgress();
  for(let id=1;id<=3;id++){const button=$('map-'+id);button.classList.toggle('locked',id>unlocked);button.classList.toggle('selected',id===this.chapter);button.setAttribute('aria-pressed',String(id===this.chapter));$('map-state-'+id).textContent=id>unlocked?'BLOQUEADO · CONCLUA O ANTERIOR':id<unlocked?'CONCLUÍDO · JOGAR NOVAMENTE':'DISPONÍVEL';}
  const selected=CHAPTERS[this.chapter as 1|2|3];$('selected-map-name').textContent=selected.name;$('selected-map-copy').textContent=this.chapter>unlocked?'Conclua o capítulo anterior para liberar este destino.':`${selected.boss} espera por você. Escolha como entrar no mapa.`;
  for(const id of ['start','multiplayer'])($(id) as HTMLButtonElement).disabled=this.chapter>unlocked||this.scene.net.connecting;($('pvp') as HTMLButtonElement).disabled=this.scene.net.connecting;
 }
 setAuthChrome(auth:boolean){$('shell').classList.toggle('auth-active',auth);}
 toggleAccountMenu(){const open=$('account-dropdown').classList.contains('hidden');visible('account-dropdown',open);$('account-trigger').setAttribute('aria-expanded',String(open));}
 closeAccountMenu(){visible('account-dropdown',false);$('account-trigger').setAttribute('aria-expanded','false');}
 renderFooter(){if(!this.profile)return;const progress=this.heroProgress();const chapter=CHAPTERS[progress as 1|2|3];$('footer-gems').textContent=String(this.profile.gems??0);$('footer-gold').textContent=String(this.profile.gold??0);$('footer-progress').textContent=`CAPÍTULO ${['','I','II','III'][progress]} · ${chapter.name.toUpperCase()}`;const hero=this.scene.selectedHero as HeroId;const meta=HEROES[hero];$('footer-hero-name').textContent=meta.name.toUpperCase();($('footer-hero-image') as HTMLImageElement).src=this.scene.textures.get(this.scene.heroKey(hero,'idle',this.profile.heroes.find((h:any)=>h.id===hero)?.skin)).getSourceImage().toDataURL();}
 toggleWidget(which:'chat'|'friends'){const id=which==='chat'?'chat-widget':'friends-widget';const other=which==='chat'?'friends-widget':'chat-widget';const open=$(id).classList.contains('hidden');visible(other,false);visible(id,open);$('footer-chat').setAttribute('aria-expanded',String(which==='chat'&&open));$('footer-friends').setAttribute('aria-expanded',String(which==='friends'&&open));}
 closeWidgets(){visible('chat-widget',false);visible('friends-widget',false);$('footer-chat').setAttribute('aria-expanded','false');$('footer-friends').setAttribute('aria-expanded','false');}
 heroProgress(){return this.profile?.heroes.find((h:any)=>h.id===this.scene.selectedHero)?.unlockedChapter??1;}
 canPlay(){return !!this.profile&&this.chapter<=this.heroProgress()&&!this.scene.net.connecting;}
 async playSolo(){if(!this.canPlay())return;this.scene.unlockAudio();await this.heroSave;this.scene.session='online';this.scene.selectedMode='solo';visible('mp-panel',true);visible('mp-entry',false);visible('mp-lobby',false);$('mp-status').textContent='Preparando sua jornada…';await this.scene.net.connect(this.profile.name,'','solo',this.scene.selectedHero,this.chapter);}
 async logout(){if(this.busy)return;this.busy=true;this.generation++;($('settings-logout') as HTMLButtonElement).disabled=true;try{await this.heroSave;await this.api('logout',{});this.profile=null;this.features?.reset();this.expansion?.reset();this.setAuthChrome(true);this.closeWidgets();await this.scene.goToMenu();visible('start-screen',false);visible('mp-panel',false);visible('auth-screen',true);this.renderAuth();$('auth-username').focus();}catch(e:any){$('hub-status').textContent=e.message;}finally{this.busy=false;($('settings-logout') as HTMLButtonElement).disabled=false;}}
}
