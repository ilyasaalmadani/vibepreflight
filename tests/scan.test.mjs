import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanProject } from '../dist/scan.js';
import { renderReport } from '../dist/report.js';

const make = async () => fs.mkdtemp(path.join(os.tmpdir(),'vpf-'));
const put = async (root,name,content) => { const p=path.join(root,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,content); };

test('basic scan detects useful boundaries, route, and correct line', async t => {
  const root=await make();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await put(root,'package.json',JSON.stringify({dependencies:{next:'15.1.0'},scripts:{build:'next build'}}));
  await put(root,'src/app/api/items/route.ts','export const GET = () => Response.json({ ok: true });');
  await put(root,'src/app/dashboard/page.tsx',`'use client';\nconst x = 1;\nconst y=process.env.PRIVATE_TOKEN;\nexport default function Page(){return x+y;}`);
  await put(root,'src/app/page.tsx',`const s = 'NEXT_PUBLIC_OPENAI_API_KEY';`);
  const result=await scanProject(root);
  assert.ok(result.frameworks.includes('Next.js'));
  assert.equal(result.nodes.filter(n=>n.kind==='route').length,3);
  assert.ok(result.nodes.find(n=>n.label==='/api/items'));
  assert.equal(result.findings.find(f=>f.id==='CLIENT_ENV_BOUNDARY')?.line,3);
  assert.ok(result.findings.some(f=>f.id==='PUBLIC_ENV_NAMING'));
  assert.ok(result.findings.some(f=>f.id==='MISSING_ENV_EXAMPLE'));
  assert.ok(result.signalScore<100);
});

test('do not flag public names without risky cues and document env vars', async t=> {
  const root=await make();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await put(root,'.env.example','NEXT_PUBLIC_ANALYTICS_ID=\n');
  await put(root,'src/app/page.tsx','const a=process.env.NEXT_PUBLIC_ANALYTICS_ID;');
  const r=await scanProject(root);
  assert.equal(r.findings.length,0);
});

test('symlinks outside project are not followed',async t=>{
  const root=await make(),outside=await make();t.after(()=>Promise.all([fs.rm(root,{recursive:true,force:true}),fs.rm(outside,{recursive:true,force:true})]));
  await put(outside,'outside.ts','const leak = "NEXT_PUBLIC_SECRET_TOKEN";');
  await fs.symlink(outside,path.join(root,'external'),'dir');
  assert.equal((await scanProject(root)).scannedFiles,0);
});

test('skips generated output and oversized files',async t=>{
  const root=await make();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await put(root,'node_modules/x/index.ts','NEXT_PUBLIC_PASSWORD');
  await put(root,'dist/index.js','NEXT_PUBLIC_PASSWORD');
  await put(root,'big.js','a'.repeat(600000));
  await put(root,'valid.ts','const a = 1;');
  const r=await scanProject(root);
  assert.equal(r.scannedFiles,1);
  assert.equal(r.truncated,true);
  assert.equal(r.findings.length,0);
});

test('HTML report escapes attacker-controlled node labels',async t=>{
  const root=await make();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await put(root,'src/app/<script>alert(9)</script>/page.tsx','export default 1');
  const r=await scanProject(root),html=renderReport(r);
  assert.ok(!html.includes('<script>alert(9)</script>'));
  assert.ok(html.includes('\\u003cscript\\u003ealert(9)'));
  assert.match(html,/Content-Security-Policy/);
});

test('CLI JSON and CI exit code', async t=>{
  const root=await make();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await put(root,'src/app/page.tsx',`export const x='NEXT_PUBLIC_OPENAI_API_KEY';`);
  const cli=path.resolve('dist/cli.js');
  let p=spawnSync(process.execPath,[cli,root,'--json'],{encoding:'utf8'});
  assert.equal(p.status,0);
  assert.equal(JSON.parse(p.stdout).findings[0].id,'PUBLIC_ENV_NAMING');
  p=spawnSync(process.execPath,[cli,root,'--ci'],{encoding:'utf8'});
  assert.equal(p.status,1);
  p=spawnSync(process.execPath,[cli,root,'--unknown'],{encoding:'utf8'});
  assert.equal(p.status,2);
});

test('report cannot overwrite existing file',async t=>{
  const root=await make();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const output=path.join(root,'report.html');
  await fs.writeFile(output,'IMPORTANT');
  const cli=path.resolve('dist/cli.js');
  const p=spawnSync(process.execPath,[cli,root,'--html',output],{encoding:'utf8'});
  assert.equal(p.status,2);
  assert.equal(await fs.readFile(output,'utf8'),'IMPORTANT');
});

test('demo fixture keeps triggering its documented heuristics', async () => {
  const r = await scanProject(path.resolve('examples/unsafe-next'));
  const ids = r.findings.map(f => f.id).sort();
  assert.deepEqual(ids, ['CLIENT_ENV_BOUNDARY', 'MISSING_ENV_EXAMPLE', 'PUBLIC_ENV_NAMING']);
  assert.equal(r.nodes.filter(n => n.kind === 'route').length, 3);
  assert.ok(r.signalScore < 100);
});

test('SVG card is static, escaped, and only overwrites its own output', async t => {
  const { renderCard, CARD_MARKER } = await import('../dist/card.js');
  const root = await make(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await put(root, 'src/app/<b>x</b>/page.tsx', `'use client';\nconst k = process.env.NEXT_PUBLIC_SECRET_TOKEN;`);
  const card = renderCard(await scanProject(root));
  assert.ok(card.includes(CARD_MARKER));
  assert.ok(!/<script|<foreignObject|href=/i.test(card));
  assert.ok(!card.includes('<b>x</b>'));

  const cli = path.resolve('dist/cli.js');
  const out = path.join(root, 'card.svg');
  assert.equal(spawnSync(process.execPath, [cli, root, '--svg', out]).status, 0);
  assert.equal(spawnSync(process.execPath, [cli, root, '--svg', out]).status, 0);
  const foreign = path.join(root, 'logo.svg');
  await fs.writeFile(foreign, '<svg>mine</svg>');
  assert.equal(spawnSync(process.execPath, [cli, root, '--svg', foreign]).status, 2);
  assert.equal(await fs.readFile(foreign, 'utf8'), '<svg>mine</svg>');
});
