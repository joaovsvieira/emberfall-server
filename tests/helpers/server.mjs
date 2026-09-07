import {randomUUID} from 'node:crypto';
import {startServer} from '../../server/main.mjs';
export function startTestServer(port){return startServer(port,{accounts:{key:'test-only',async authenticate(options){return {id:randomUUID(),name:options.name,unlockedChapter:3,heroes:['kael','lyra','aurel','sylva'].map(id=>({id,level:1}))};},async complete(){}}});}
