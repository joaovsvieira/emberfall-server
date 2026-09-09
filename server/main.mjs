import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {paymentRoutes} from './payments.mjs';
import {featureRoutes} from './features.mjs';
import {ForestRoom} from './room.mjs';
import {Accounts,accountRoutes} from './accounts.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
export async function startServer(port=Number(process.env.PORT)||2567,{accounts=new Accounts()}={}){
  const attempts=new Map();
  const server=new Server({
    transport:new WebSocketTransport({maxPayload:4096,pingInterval:10000,pingMaxRetries:2}),greet:false,
    express:app=>{
      app.disable('x-powered-by');app.set('trust proxy',1);
      app.use(express.json({limit:'8kb'}));
      accountRoutes(app,accounts);featureRoutes(app,accounts);paymentRoutes(app,accounts);
      app.use('/server',(_req,res)=>res.sendStatus(404));
      app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Access-Control-Allow-Origin','*');if(req.path.startsWith('/matchmake/')){const now=Date.now(),key=req.ip;const entry=attempts.get(key);if(!entry||entry.until<now){attempts.set(key,{count:1,until:now+60000});}else if(++entry.count>30)return res.status(429).json({error:'Muitas tentativas. Aguarde um minuto.'});if(attempts.size>10000)for(const [ip,e] of attempts)if(e.until<now)attempts.delete(ip);}next();});
      app.get('/health',(_req,res)=>res.json({ok:true,game:'emberfall',protocol:1,modes:['solo','coop','pvp'],accounts:true,heroes:['kael','lyra','aurel','sylva'],chapters:3,maxCoopPlayers:4,release:'0.10.1'}));
      // Same-origin hosting requires no configuration or credentials in the game.
      app.get('/multiplayer-config.js',(req,res)=>res.type('application/javascript').set('Cache-Control','no-store').send(req.headers['x-emberfall-proxy']===accounts.key&&accounts.key?'window.EMBERFALL_MULTIPLAYER_URL = "https://emberfall-server.onrender.com";':'window.EMBERFALL_MULTIPLAYER_URL = location.origin;'));
      app.use(express.static(root,{index:'index.html',maxAge:0,dotfiles:'deny'}));
    }
  });
  server.define('forest',class extends ForestRoom {accounts=accounts;});
  await server.listen(port,'0.0.0.0');
  return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await startServer();console.log(`Emberfall multiplayer listening on port ${Number(process.env.PORT)||2567}`);}
