import {randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual,createHash,createHmac} from 'node:crypto';
import {promisify} from 'node:util';
import {HEROES} from '../dist/engine.js';
const scrypt=promisify(scryptCallback),hash=v=>createHash('sha256').update(v).digest('hex');
const SESSION_MS=30*24*60*60*1000;
export class DataStore {
 constructor(url=process.env.ACCOUNT_DATA_URL,key=process.env.DATA_SERVICE_KEY){this.url=url;this.key=key;}
 async call(op,value){
  if(!this.url||!this.key)throw Object.assign(new Error('O serviço de contas ainda não está disponível.'),{status:503});
  const r=await fetch(this.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.key}`},body:JSON.stringify({op,value}),signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Object.assign(new Error(r.status===409?'Este usuário já está cadastrado.':'Não foi possível acessar sua conta. Tente novamente.'),{status:r.status});
  return (await r.json()).value;
 }
}
export class Accounts {
 constructor(store=new DataStore(),key=process.env.DATA_SERVICE_KEY){this.store=store;this.key=key;}
 profile(a){return {id:a.id,name:a.display_name,username:a.username,unlockedChapter:a.unlocked_chapter,preferredHero:a.preferred_hero,heroes:Object.keys(HEROES).map(id=>({id,level:1}))};}
 async credentials(username,password,register=false){
  if(typeof username!=='string'||!/^\w{3,18}$/.test(username)||typeof password!=='string'||password.length<8||password.length>128)throw Object.assign(new Error('Use um usuário de 3–18 letras, números ou _ e uma senha de 8–128 caracteres.'),{status:400});
  const normalized=username.toLowerCase();
  if(register){const salt=randomBytes(16).toString('hex'),derived=await scrypt(password,salt,64,{N:16384,r:8,p:1});return this.store.call('register',{id:randomUUID(),username:normalized,displayName:username,passwordHash:`${salt}:${derived.toString('hex')}`});}
  const account=await this.store.call('find-user',{username:normalized});const [salt,stored]=(account?.password_hash??'00000000000000000000000000000000:'+ '00'.repeat(64)).split(':');
  const derived=await scrypt(password,salt,64,{N:16384,r:8,p:1});
  if(!account||!timingSafeEqual(derived,Buffer.from(stored,'hex')))throw Object.assign(new Error('Usuário ou senha incorretos.'),{status:401});return account;
 }
 async session(token){return token?this.store.call('session',{hash:hash(token)}):null;}
 async createSession(id){const token=randomBytes(32).toString('base64url');await this.store.call('session-create',{hash:hash(token),accountId:id,expiresAt:Date.now()+SESSION_MS});return token;}
 async logout(token){if(token)await this.store.call('logout',{hash:hash(token)});}
 ticket(token){if(!this.key)throw new Error('Missing service key');const payload=Buffer.from(JSON.stringify({hash:hash(token),exp:Date.now()+60000})).toString('base64url');return payload+'.'+createHmac('sha256',this.key).update(payload).digest('base64url');}
 async authenticate(options){
  const [payload,signature]=String(options?.ticket??'').split('.');if(!payload||!signature||!this.key)throw new Error('Faça login para jogar.');
  const expected=createHmac('sha256',this.key).update(payload).digest(),given=Buffer.from(signature,'base64url');if(given.length!==expected.length||!timingSafeEqual(given,expected))throw new Error('Sessão inválida. Faça login novamente.');
  const data=JSON.parse(Buffer.from(payload,'base64url').toString());if(!Number.isFinite(data.exp)||data.exp<Date.now())throw new Error('Seu convite expirou. Tente entrar novamente.');
  const a=await this.store.call('session',{hash:data.hash});if(!a)throw new Error('Sua sessão expirou. Faça login novamente.');return this.profile(a);
 }
 async complete(ids,chapter,round){return this.store.call('complete',{ids,chapter,round});}
 async getProfile(id){const a=await this.store.call('account',{id});return a?this.profile(a):null;}
}
function tokenOf(req){const value=(req.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith('emberfall_session='));return value?.slice('emberfall_session='.length)??'';}
export function accountRoutes(app,accounts){
 const secure=process.env.NODE_ENV==='production';
 const cookie=(res,token,maxAge=SESSION_MS)=>res.cookie('emberfall_session',token,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge});
 const origins=new Set(['https://emberfall-server.onrender.com','https://emberfall-ruinas.joaovsvieira-me.chatgpt.site']);
 const attempts=new Map();let activeHashes=0;
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');const origin=req.headers.origin;if(req.method!=='GET'&&origin&&!origins.has(origin)&&!(process.env.NODE_ENV!=='production'&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)))return res.status(403).json({error:'Origem não permitida.'});if(req.method!=='GET'&&!req.is('application/json'))return res.status(415).json({error:'Envie JSON.'});next();});
 const route=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){if(!e.status)console.error('Account request failed',e.message);res.status(e.status??503).json({error:e.status?e.message:'O serviço de contas está indisponível. Tente novamente.'});}};
 for(const action of ['login','register'])app.post('/api/'+action,route(async(req,res)=>{
  const proxy=req.headers['x-emberfall-proxy']===accounts.key,ip=proxy?req.headers['x-emberfall-client-ip']:req.ip;
  const key=String(ip),now=Date.now();let entry=attempts.get(key);if(!entry||entry.until<now){entry={count:0,until:now+60000};attempts.set(key,entry);}if(++entry.count>15||activeHashes>=4)return res.status(429).json({error:'Muitas tentativas. Aguarde um minuto.'});
  if(attempts.size>5000)for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
  activeHashes++;try{const a=await accounts.credentials(req.body?.username,req.body?.password,action==='register');const previous=tokenOf(req);const token=await accounts.createSession(a.id);await accounts.logout(previous);cookie(res,token);res.json({profile:accounts.profile(a)});}finally{activeHashes--;}
 }));
 app.get('/api/me',route(async(req,res)=>{const a=await accounts.session(tokenOf(req));if(!a)return res.status(401).json({error:'Faça login para continuar.'});res.json({profile:accounts.profile(a)});}));
 app.post('/api/logout',route(async(req,res)=>{await accounts.logout(tokenOf(req));cookie(res,'',0);res.json({ok:true});}));
 app.post('/api/ticket',route(async(req,res)=>{const token=tokenOf(req),a=await accounts.session(token);if(!a)return res.status(401).json({error:'Faça login para jogar.'});res.json({ticket:accounts.ticket(token)});}));
 app.post('/api/hero',route(async(req,res)=>{const a=await accounts.session(tokenOf(req));if(!a)return res.status(401).json({error:'Faça login para continuar.'});if(!Object.hasOwn(HEROES,req.body?.hero))return res.status(400).json({error:'Herói inválido.'});await accounts.store.call('hero',{id:a.id,hero:req.body.hero});res.json({ok:true});}));
}
