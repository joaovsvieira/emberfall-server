import fs from 'node:fs';
import ts from 'typescript';
import {build} from 'esbuild';
for (const name of ['engine','controls','game','network','hub','features','expansion','adventure','inventory']) {
  const result=ts.transpileModule(fs.readFileSync(`src/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2022},reportDiagnostics:true});
  if(result.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error)) throw new Error(`Invalid TypeScript: ${name}`);
  fs.writeFileSync(`dist/${name}.js`,result.outputText);
}
await build({stdin:{contents:'export { Client } from "@colyseus/sdk";',resolveDir:process.cwd()},outfile:'dist/assets/colyseus.js',bundle:true,format:'esm',platform:'browser',target:'es2020',minify:true});
console.log('Game, shared simulation and multiplayer SDK built.');
await build({entryPoints:['worker/index.mjs'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022'});
