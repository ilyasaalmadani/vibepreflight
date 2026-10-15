import fs from 'node:fs/promises';
import path from 'node:path';
import type { Result, Finding, GraphNode, GraphEdge, Severity } from './types.js';

const SKIP = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.turbo', '.cache', '.vercel', '.wrangler', 'vendor', '.output']);
const FILE_LIMIT = 1800;
const BYTE_LIMIT = 500 * 1024;
const SCAN_BUDGET = 10 * 1024 * 1024;
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.toml', '.yaml', '.yml']);
const SENSITIVE = /(?:SECRET|PRIVATE(?:_KEY)?|PASSWORD|API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SERVICE_ROLE)/i;
const CLIENT_PREFIX = /\b(?:NEXT_PUBLIC_|VITE_|PUBLIC_)[A-Z][A-Z0-9_]*\b/g;
const ENV_REF = /\b(?:process\.env\.|import\.meta\.env\.)([A-Z][A-Z0-9_]*)\b/g;

const normalize = (p: string) => p.split(path.sep).join('/');
const lineAt = (s: string, index: number) => s.slice(0, index).split('\n').length;
const nodeId = (kind: string, name: string) => `${kind}:${name}`;

export async function scanProject(root: string): Promise<Result> {
  const resolved = path.resolve(root);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) throw new Error('Scan target must be a directory.');
  const files: string[] = [];
  const stack = [resolved];
  let truncated = false;
  while (stack.length) {
    const dir = stack.pop()!;
    let entries = await fs.readdir(dir, { withFileTypes: true });
    entries = entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name) && !entry.name.startsWith('.')) stack.push(full);
      } else if (entry.isFile() && (TEXT_EXT.has(path.extname(entry.name)) || ['.env.example', '.gitignore'].includes(entry.name))) {
        if (files.length >= FILE_LIMIT) { truncated = true; break; }
        files.push(full);
      }
    }
    if (truncated) break;
  }
  files.sort();
  const findings: Finding[] = [];
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const frameworks = new Set<string>();
  const knownNodes = new Set<string>();
  const envUses = new Map<string, { file: string; line: number }>();
  const envExamples = new Set<string>();
  const routes = new Set<string>();
  let total = 0;
  let examined = 0;
  let hasEnvExample = false;
  const addNode = (node: GraphNode) => { if (!knownNodes.has(node.id)) { knownNodes.add(node.id); nodes.push(node); } };
  const addFinding = (id: string, severity: Severity, file: string, line: number, title: string, explanation: string, fix: string) => {
    if (findings.some(f => f.id === id && f.file === file && f.line === line)) return;
    findings.push({ id, severity, file, line, title, explanation, fix });
  };

  for (const file of files) {
    const rel = normalize(path.relative(resolved, file));
    let size: number;
    try { size = (await fs.stat(file)).size; } catch { continue; }
    if (size > BYTE_LIMIT) { truncated = true; continue; }
    if (total + size > SCAN_BUDGET) { truncated = true; break; }
    total += size;
    let contents: string;
    try { contents = await fs.readFile(file, 'utf8'); } catch { continue; }
    if (contents.includes('\0')) continue;
    examined++;

    if (rel === 'package.json') {
      try {
        const pkg = JSON.parse(contents) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string,string> };
        if (pkg.dependencies?.next || pkg.devDependencies?.next) frameworks.add('Next.js');
        if (pkg.dependencies?.vite || pkg.devDependencies?.vite) frameworks.add('Vite');
        if (pkg.dependencies?.['@cloudflare/workers-types'] || pkg.devDependencies?.['wrangler']) frameworks.add('Cloudflare Workers');
        if (pkg.scripts?.build) addNode({id: nodeId('deployment','build'),kind:'deployment',label:'npm run build',detail:'Build script declared in package.json',file:rel});
        if (pkg.scripts?.deploy) addNode({id: nodeId('deployment','deploy'),kind:'deployment',label:'npm run deploy',detail:'Deploy script declared in package.json',file:rel});
      } catch { addFinding('INVALID_PACKAGE_JSON', 'medium', rel, 1, 'package.json cannot be parsed', 'Release tooling may fail to read this manifest.', 'Fix the JSON syntax and rerun the scan.'); }
    }
    if (/^(wrangler\.(?:toml|json)|wrangler\.jsonc)$/.test(rel)) {
      frameworks.add('Cloudflare Workers');
      addNode({id:nodeId('deployment','cloudflare'),kind:'deployment',label:'Cloudflare Worker',detail:'Worker deployment configuration detected',file:rel});
    }
    if (rel === '.env.example') {
      hasEnvExample = true;
      for (const line of contents.split('\n')) {
        const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/);
        if (match?.[1]) envExamples.add(match[1]);
      }
    }

    if (/^(?:src\/)?app\/.+\/(?:page|route)\.(?:ts|tsx|js|jsx)$/.test(rel) || /^(?:src\/)?app\/(?:page|route)\.(?:ts|tsx|js|jsx)$/.test(rel)) {
      frameworks.add('Next.js');
      const route = rel.replace(/^(?:src\/)?app\//, '').replace(/\/(?:page|route)\.(?:ts|tsx|js|jsx)$/, '').replace(/^(?:page|route)\.(?:ts|tsx|js|jsx)$/, '').replace(/\([^/]+\)\//g, '');
      const display = '/' + route.replace(/\[(.+?)\]/g, ':$1');
      routes.add(display);
      addNode({id:nodeId('route',rel),kind:'route',label:display,detail:rel.includes('/route.') ? 'Route handler' : 'Page',file:rel});
    }
    if (/^(?:src\/)?pages\/.+\.(?:ts|tsx|js|jsx)$/.test(rel) && !rel.match(/\/(?:_app|_document|_error)\./)) {
      frameworks.add('Next.js');
      const url = '/' + rel.replace(/^(?:src\/)?pages\//,'').replace(/\.(?:tsx?|jsx?)$/, '').replace(/\/index$/, '').replace(/^index$/, '').replace(/\[(.+?)\]/g, ':$1');
      routes.add(url);
      addNode({id:nodeId('route',rel),kind:'route',label:url,detail:'Pages Router entrypoint',file:rel});
    }
    if (!/\.(?:tsx?|jsx?|mjs|cjs)$/.test(rel)) continue;
    const clientComponent = /(^|\n)\s*['"]use client['"]\s*;?/.test(contents.slice(0, 350));
    const refs = [...contents.matchAll(ENV_REF)];
    for (const m of refs) {
      const variable = m[1]!;
      if (variable === 'NODE_ENV' || variable === 'MODE' || variable === 'DEV' || variable === 'PROD' || variable === 'SSR' || variable === 'BASE_URL') continue;
      const line = lineAt(contents, m.index);
      if (!envUses.has(variable)) envUses.set(variable, {file:rel,line});
      const eid = nodeId('env', variable);
      addNode({id:eid,kind:'env',label:variable,detail:'Environment variable referenced in source',file:rel});
      if (knownNodes.has(nodeId('route',rel))) edges.push({from:nodeId('route',rel),to:eid,label:'reads'});
      if (clientComponent && m[0].startsWith('process.env.') && !variable.startsWith('NEXT_PUBLIC_')) {
        addFinding('CLIENT_ENV_BOUNDARY','medium',rel,line,'Server-only env referenced by a client component',`The client component references ${variable}. It may be unavailable in the browser; this is not proof of an exposure.`, 'Move the access to a server component/API handler, and only pass non-sensitive values to the client.');
      }
    }
    for (const m of contents.matchAll(CLIENT_PREFIX)) {
      const variable = m[0];
      if (!SENSITIVE.test(variable)) continue;
      const line = lineAt(contents, m.index);
      addFinding('PUBLIC_ENV_NAMING','high',rel,line,'Sensitive-looking name has a public env prefix', `${variable} appears to be designated client-visible. This is a name-based warning, not confirmation that a credential leaked.`, 'Verify whether the value is intended to be public. Keep private credentials server-side; use a clearly public key only when the provider documents it as safe.');
    }
  }
  if (envUses.size && !hasEnvExample) {
    const first = [...envUses.values()][0]!;
    addFinding('MISSING_ENV_EXAMPLE','medium', first.file, first.line, 'No .env.example found', 'The repo references environment variables but lacks a discoverable example template.', 'Add a .env.example containing variable names and empty or obviously fake values only. Never include real credentials.');
  } else if (hasEnvExample) {
    for (const [name, ref] of envUses) {
      if (name.startsWith('NEXT_PUBLIC_') && !envExamples.has(name)) {
        addFinding('UNDOCUMENTED_PUBLIC_ENV','info',ref.file,ref.line,'Public env var missing from .env.example',`${name} is referenced but is not documented in the example template.`, 'Add the variable name to .env.example with a safe placeholder.');
      }
    }
  }
  for (const framework of frameworks) addNode({id:nodeId('framework',framework),kind:'framework',label:framework,detail:'Detected from project files'});
  findings.sort((a,b) => ({high:0,medium:1,info:2}[a.severity] - {high:0,medium:1,info:2}[b.severity]) || a.file.localeCompare(b.file) || a.line-b.line);
  const score = Math.max(0, 100 - findings.reduce((s,f)=> s + (f.severity==='high'?25:f.severity==='medium'?10:2),0));
  return {
    schemaVersion:1, project:path.basename(resolved), scannedFiles:examined, truncated, frameworks:[...frameworks].sort(),
    findings, nodes:nodes.slice(0, 300), edges:edges.slice(0, 500), signalScore:score,
    limitations:[
      'Signal score measures only implemented heuristics; it is not a security score or approval to deploy.',
      'Static filenames and regex cannot establish authentication, exploitability, or real credential exposure.',
      'Only local source files are inspected. No dependency, git-history, runtime, or infrastructure security audit is performed.',
      ...(truncated?['Scan limits were reached; some files were not inspected.']:[])
    ]
  };
}
