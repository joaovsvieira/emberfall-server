import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {dataOperation} from '../../worker/index.mjs';
export function storage(filename=':memory:'){
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys=ON');
 const adapter={prepare(sql){return {bind(...args){return {first:async()=>sqlite.prepare(sql).get(...args)??null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:()=>({meta:{changes:sqlite.prepare(sql).run(...args).changes}})}}}},async batch(queries){sqlite.exec('BEGIN');try{const result=queries.map(q=>q.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 return {sqlite,async call(op,v){try{return await dataOperation(adapter,op,v);}catch(e){if(e.status)throw e;if(/UNIQUE constraint/.test(e.message))throw Object.assign(new Error('Este usuário já está cadastrado ou operação já realizada.'),{status:409});if(/item_unavailable|purchase_unavailable/.test(e.message))throw Object.assign(new Error(e.message),{status:409});throw e;}}};
}
export function migrate(store){for(const file of readdirSync(new URL('../../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())store.sqlite.exec(readFileSync(new URL('../../drizzle/'+file,import.meta.url),'utf8'));}
