import {createHmac,timingSafeEqual} from 'node:crypto';
const PRODUCT=Object.freeze({id:'premium-10',coins:10,amountCents:1,name:'10 cristais premium'});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const config=()=>({token:process.env.MERCADOPAGO_ACCESS_TOKEN,secret:process.env.MERCADOPAGO_WEBHOOK_SECRET,live:process.env.PIX_LIVE_MODE==='true',url:process.env.PIX_WEBHOOK_URL||'https://emberfall-server.onrender.com/payments/mercadopago/webhook'});
const ready=c=>Boolean(c.token&&c.secret&&c.url.startsWith('https://'));
export function validSignature(headers,id,secret,now=Date.now()){
 if(!secret||!/^\d+$/.test(id))return false;
 const parts=Object.fromEntries(String(headers['x-signature']??'').split(',').map(p=>p.trim().split('='))),request=String(headers['x-request-id']??'');
 const timestamp=Number(parts.ts),ms=timestamp>1e12?timestamp:timestamp*1000;
 if(!request||request.length>200||!Number.isFinite(ms)||Math.abs(now-ms)>600000||!/^[a-f0-9]{64}$/i.test(parts.v1??''))return false;
 return timingSafeEqual(createHmac('sha256',secret).update(`id:${id};request-id:${request};ts:${parts.ts};`).digest(),Buffer.from(parts.v1,'hex'));
}
export function verifiedPayment(payment,order){
 if(String(payment.external_reference)!==order.id||payment.currency_id!=='BRL'||payment.payment_method_id!=='pix'||Number(payment.transaction_amount)!==order.amount_cents/100||Boolean(payment.live_mode)!==Boolean(order.live))fail('Pagamento não corresponde à cobrança.',409);
 const updatedAt=Date.parse(payment.date_last_updated??payment.date_created);if(!Number.isFinite(updatedAt)||!/^\d+$/.test(String(payment.id)))fail('Resposta de pagamento inválida.',502);
 const status=Number(payment.transaction_amount_refunded)>0?'refunded':String(payment.status);
 if(!['pending','in_process','approved','rejected','cancelled','refunded','charged_back','in_mediation','authorized'].includes(status))fail('Status de pagamento desconhecido.',502);
 return {order:order.id,providerId:String(payment.id),amountCents:order.amount_cents,live:Boolean(payment.live_mode),status,updatedAt};
}
async function provider(path,body,key){
 const response=await fetch('https://api.mercadopago.com'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+config().token,...(body?{'Content-Type':'application/json','X-Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 let data;try{data=await response.json();}catch{fail('O provedor não respondeu. Consulte a cobrança antes de tentar novamente.',502);}
 if(!response.ok){console.error('Pix provider response',response.status,data?.cause?.map(c=>c.code));fail(response.status>=500?'Provedor temporariamente indisponível. Consulte a cobrança novamente.':'O Mercado Pago recusou gerar o Pix. Confira CPF/e-mail e a habilitação do vendedor para cobrar R$ 0,01. Nenhum valor foi alterado.',502);}return data;
}
const safeOrder=(o,p)=>({id:o.id,status:o.status,amountCents:o.amount_cents,coins:o.coins,granted:o.granted,live:Boolean(o.live),createdAt:o.created_at,qr:p?.point_of_interaction?.transaction_data?.qr_code??'',qrImage:p?.point_of_interaction?.transaction_data?.qr_code_base64??'',expiresAt:p?.date_of_expiration??null});
export function paymentRoutes(app,accounts){
 const wrap=fn=>async(req,res)=>{try{res.set('Cache-Control','no-store');await fn(req,res);}catch(e){res.status(e.status??503).json({error:e.status?e.message:'Pagamento pendente de consulta. Tente atualizar a cobrança.'});}};
 const sync=async(p,order)=>{const o=order??await accounts.store.call('payment-get',{order:p.external_reference});if(!o)fail('Cobrança desconhecida.',404);return accounts.store.call('payment-update',verifiedPayment(p,o));};
 app.get('/api/game/shop',wrap(async(req,res)=>{const c=config();res.json({product:PRODUCT,configured:ready(c),live:c.live,...await accounts.store.call('payment-list',{id:req.account.id})});}));
 app.post('/api/game/shop/checkout',wrap(async(req,res)=>{
  const c=config();if(!ready(c))fail('Pix aguardando configuração do vendedor.',503);
  const {order:orderId,email,cpf}=req.body??{};if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(orderId??''))fail('Identificador inválido.');
  if(typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||typeof cpf!=='string'||!/^\d{11}$/.test(cpf))fail('Informe seu e-mail e CPF com 11 dígitos.');
  let order=await accounts.store.call('payment-get',{order:orderId});if(order&&order.account_id!==req.account.id)fail('Cobrança indisponível.',409);
  order??=await accounts.store.call('payment-create',{id:req.account.id,order:orderId,amountCents:PRODUCT.amountCents,coins:PRODUCT.coins,live:c.live});
  if(Boolean(order.live)!==c.live)fail('Esta cobrança pertence a outro ambiente.',409);
  const p=order.provider_id?await provider('/v1/payments/'+order.provider_id):await provider('/v1/payments',{transaction_amount:order.amount_cents/100,description:PRODUCT.name,payment_method_id:'pix',external_reference:order.id,notification_url:c.url,payer:{email,identification:{type:'CPF',number:cpf}}},order.id);
  res.json(safeOrder(await sync(p,order),p));
 }));
 app.get('/api/game/shop/order/:id',wrap(async(req,res)=>{
  if(!ready(config()))fail('Pix aguardando configuração do vendedor.',503);
  const order=await accounts.store.call('payment-get',{id:req.account.id,order:req.params.id});if(!order)fail('Cobrança não encontrada.',404);
  let p;if(order.provider_id)p=await provider('/v1/payments/'+order.provider_id);else{const results=await provider('/v1/payments/search?external_reference='+encodeURIComponent(order.id));p=results.results?.find(p=>p.external_reference===order.id);}
  res.json(p?safeOrder(await sync(p,order),p):safeOrder(order));
 }));
 app.post('/payments/mercadopago/webhook',wrap(async(req,res)=>{
  const id=String(req.query['data.id']??'');if(!validSignature(req.headers,id,config().secret))return res.sendStatus(401);
  if(req.body?.type&&req.body.type!=='payment')return res.sendStatus(204);
  const p=await provider('/v1/payments/'+id),order=await accounts.store.call('payment-get',{order:p.external_reference});if(order)await sync(p,order);res.sendStatus(200);
 }));
}
