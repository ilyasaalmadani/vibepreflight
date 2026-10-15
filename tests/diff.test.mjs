import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanProject } from '../dist/scan.js';
import { diffResults } from '../dist/diff.js';
import { renderDiffCard } from '../dist/card.js';

const make = async () => fs.mkdtemp(path.join(os.tmpdir(),'vpf-diff-'));
const put = async (root,name,content) => { const p=path.join(root,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,content); };
const cli = path.resolve('dist/cli.js');

test('finding swap: one resolved, one new', async t => {
  const before = await make(), after = await make();
  t.after(() => Promise.all([fs.rm(before,{recursive:true,force:true}), fs.rm(after,{recursive:true,force:true})]));
  await put(before, 'src/app/page.tsx', `'use client';\nconst x = process.env.STRIPE_SECRET_KEY;`);
  await put(after, 'src/app/page.tsx', `'use client';\nconst y = process.env.OPENAI_API_KEY;`);
  const b = await scanProject(before);
  const a = await scanProject(after);
  const d = diffResults(b, a);
  assert.equal(d.newFindings.length, 1);
  assert.equal(d.resolvedCount, 1);
});

test('line shift produces zero new findings', async t => {
  const root = await make();
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  await put(root, 'src/app/page.tsx', `'use client';\nconst x = process.env.SECRET_TOKEN;`);
  const before = await scanProject(root);
  const content = `'use client';\n\n\n\n\n\n\n\n\n\nconst x = process.env.SECRET_TOKEN;`;
  await put(root, 'src/app/page.tsx', content);
  const after = await scanProject(root);
  const d = diffResults(before, after);
  assert.equal(d.newFindings.length, 0);
});

test('missing before directory exits 2', async () => {
  const after = await make();
  const p = spawnSync(process.execPath, [cli, 'diff', '/nonexistent-dir-xyz', after], { encoding: 'utf8' });
  assert.equal(p.status, 2);
  assert.match(p.stderr, /Not a directory/);
  await fs.rm(after, { recursive: true, force: true });
});

test('--since mode detects new findings by ID', async t => {
  const repo = await make();
  t.after(() => fs.rm(repo,{recursive:true,force:true}));
  spawnSync('git', ['init'], { cwd: repo });
  spawnSync('git', ['config', 'user.email', 't@example.com'], { cwd: repo });
  spawnSync('git', ['config', 'user.name', 'test'], { cwd: repo });
  await put(repo, 'src/app/page.tsx', 'export default 1;');
  spawnSync('git', ['add', '.'], { cwd: repo });
  spawnSync('git', ['commit', '-m', 'first'], { cwd: repo });
  await put(repo, 'src/app/page.tsx', `'use client';\nconst x = process.env.SECRET_KEY;`);
  spawnSync('git', ['add', '.'], { cwd: repo });
  spawnSync('git', ['commit', '-m', 'second'], { cwd: repo });
  const p = spawnSync(process.execPath, [cli, 'diff', repo, '--since', 'HEAD~1', '--json'], { encoding: 'utf8' });
  assert.equal(p.status, 0);
  const data = JSON.parse(p.stdout);
  const ids = data.newFindings.map(f => f.id);
  assert.ok(ids.includes('CLIENT_ENV_BOUNDARY'));
  assert.ok(ids.includes('MISSING_ENV_EXAMPLE'));
});

test('binary file in git archive does not crash --since', async t => {
  const repo = await make();
  t.after(() => fs.rm(repo,{recursive:true,force:true}));
  spawnSync('git', ['init'], { cwd: repo });
  spawnSync('git', ['config', 'user.email', 't@example.com'], { cwd: repo });
  spawnSync('git', ['config', 'user.name', 'test'], { cwd: repo });
  await put(repo, 'src/app/page.tsx', 'export default 1;');
  await fs.writeFile(path.join(repo, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  spawnSync('git', ['add', '.'], { cwd: repo });
  spawnSync('git', ['commit', '-m', 'first'], { cwd: repo });
  await put(repo, 'src/app/page.tsx', 'export default 2;');
  spawnSync('git', ['add', '.'], { cwd: repo });
  spawnSync('git', ['commit', '-m', 'second'], { cwd: repo });
  const p = spawnSync(process.execPath, [cli, 'diff', repo, '--since', 'HEAD~1'], { encoding: 'utf8' });
  assert.equal(p.status, 0);
});

test('ref starting with - is rejected', async t => {
  const repo = await make();
  t.after(() => fs.rm(repo,{recursive:true,force:true}));
  spawnSync('git', ['init'], { cwd: repo });
  const p = spawnSync(process.execPath, [cli, 'diff', repo, '--since', '--output=x'], { encoding: 'utf8' });
  assert.equal(p.status, 2);
});

test('--ci exits 1 only on new high findings', async t => {
  const before = await make(), after = await make();
  t.after(() => Promise.all([fs.rm(before,{recursive:true,force:true}), fs.rm(after,{recursive:true,force:true})]));
  await put(before, 'src/app/page.tsx', `const x = 'NEXT_PUBLIC_SECRET_KEY';`);
  await put(after, 'src/app/page.tsx', `const x = 'NEXT_PUBLIC_SECRET_KEY';\nconst y = 'NEXT_PUBLIC_API_KEY';`);
  const p = spawnSync(process.execPath, [cli, 'diff', before, after, '--ci'], { encoding: 'utf8' });
  assert.equal(p.status, 1);
});

test('--ci exits 0 when high already existed and no new high', async t => {
  const before = await make(), after = await make();
  t.after(() => Promise.all([fs.rm(before,{recursive:true,force:true}), fs.rm(after,{recursive:true,force:true})]));
  await put(before, 'src/app/page.tsx', `const x = 'NEXT_PUBLIC_SECRET_KEY';`);
  await put(after, 'src/app/page.tsx', `const x = 'NEXT_PUBLIC_SECRET_KEY';`);
  const p = spawnSync(process.execPath, [cli, 'diff', before, after, '--ci'], { encoding: 'utf8' });
  assert.equal(p.status, 0);
});

test('diff card escapes filename and has no script/foreignObject/href', () => {
  const diff = {
    newFindings: [{ id: 'X', severity: 'medium', file: 'src/<b>bad</b>.tsx', line: 1, title: 'test', explanation: '', fix: '', fingerprint: 'abc' }],
    resolvedCount: 0,
    unchangedCount: 0
  };
  const svg = renderDiffCard(diff, 'proj');
  assert.ok(!svg.includes('<script'));
  assert.ok(!svg.includes('foreignObject'));
  assert.ok(!svg.includes('href='));
  assert.ok(!svg.includes('<b>'));
  assert.ok(svg.includes('&lt;b&gt;bad&lt;/b&gt;'));
  assert.ok(svg.includes('<!-- vibepreflight-card -->'));
});
