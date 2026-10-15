#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { scanProject } from './scan.js';
import { renderReport } from './report.js';
import { renderCard, renderDiffCard, CARD_MARKER } from './card.js';
import { diffResults } from './diff.js';
import type { DiffResult } from './types.js';

const execFileAsync = promisify(execFile);

const USAGE = `VibePreflight — visual release-surface inventory for AI-built web apps

Usage: vibepreflight [path] [--html report.html] [--svg card.svg] [--json] [--ci] [--help]
       vibepreflight diff [path] --since <git-ref> [--json] [--svg FILE] [--ci]
       vibepreflight diff <before-dir> <after-dir> [--json] [--svg FILE] [--ci]

  path         Directory to inspect (default: .)
  --html FILE  Write an interactive, offline HTML report
  --svg FILE   Write a README-embeddable SVG summary card
  --json       Emit machine-readable result (stdout only)
  --ci         Exit 1 if high-level warnings found (or new high findings in diff), 2 on tool errors
  --help       Print help

No code is executed, no credentials are validated, and no data leaves the machine.
The indicator is NOT a security score or permission to deploy.`;

async function writeCard(destination: string, contents: string) {
  let existing: string | undefined;
  try { existing = (await fs.readFile(destination, 'utf8')).slice(0, 1024); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  if (existing !== undefined && !existing.includes(CARD_MARKER)) throw new Error(`Refusing to overwrite ${destination}: it is not a VibePreflight card.`);
  await fs.writeFile(destination, contents, { encoding:'utf8', mode:0o644 });
}

async function extractRef(repo: string, ref: string): Promise<string> {
  if (ref.startsWith('-')) throw new Error('Ref must not start with "-".');
  const tmp = await mkdtemp(path.join(tmpdir(), 'vibepreflight-'));
  try {
    const { stdout } = await execFileAsync('git', ['archive', ref], { cwd: repo, encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 });
    const archivePath = path.join(tmp, 'archive.tar');
    await fs.writeFile(archivePath, stdout);
    await execFileAsync('tar', ['-xf', archivePath, '-C', tmp]);
    await fs.unlink(archivePath);
    return tmp;
  } catch (e) {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

async function runDiff(argv: string[]) {
  let since: string | undefined;
  let beforeDir: string | undefined;
  let afterDir: string | undefined;
  let json = false, ci = false, svg: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--json') json = true;
    else if (arg === '--ci') ci = true;
    else if (arg === '--svg') { svg = argv[++i]; if (!svg || svg.startsWith('--')) throw new Error('--svg requires an output filename.'); }
    else if (arg === '--since') { since = argv[++i]; if (!since || since.startsWith('--')) throw new Error('--since requires a git ref.'); }
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }

  let beforeResult, afterResult;
  let cleanup: (() => Promise<void>) | undefined;

  if (since) {
    const repo = positional[0] || '.';
    const resolved = path.resolve(repo);
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat?.isDirectory()) throw new Error(`Not a directory: ${repo}`);
    const tmp = await extractRef(resolved, since);
    cleanup = () => rm(tmp, { recursive: true, force: true });
    try {
      beforeResult = await scanProject(tmp);
      afterResult = await scanProject(resolved);
    } finally {
      await cleanup();
    }
  } else if (positional.length === 2) {
    beforeDir = positional[0]!;
    afterDir = positional[1]!;
    for (const d of [beforeDir, afterDir]) {
      const stat = await fs.stat(d).catch(() => null);
      if (!stat?.isDirectory()) throw new Error(`Not a directory: ${d}`);
    }
    beforeResult = await scanProject(beforeDir);
    afterResult = await scanProject(afterDir);
  } else {
    throw new Error('Usage: vibepreflight diff [path] --since <ref> OR vibepreflight diff <before> <after>');
  }

  const diff: DiffResult = diffResults(beforeResult, afterResult);

  if (svg) {
    await writeCard(path.resolve(svg), renderDiffCard(diff, afterResult.project));
    if (!json) console.log(`SVG card: ${path.resolve(svg)}`);
  }

  if (json) {
    console.log(JSON.stringify({ newFindings: diff.newFindings, resolved: diff.resolvedCount, unchanged: diff.unchangedCount }, null, 2));
  } else {
    console.log(`\n  ◈  DIFF  ·  +${diff.newFindings.length} new · ${diff.resolvedCount} resolved · ${diff.unchangedCount} unchanged\n`);
    for (const f of diff.newFindings) {
      const type = f.severity === 'high' ? 'HIGH' : f.severity === 'medium' ? 'MED ' : 'INFO';
      console.log(`  [+${type}] ${f.title}\n         ${f.file}:${f.line}\n         Fix: ${f.fix}\n`);
    }
    if (!diff.newFindings.length) console.log('  No new findings.\n');
  }

  if (ci && diff.newFindings.some(f => f.severity === 'high')) process.exitCode = 1;
}

async function main(argv: string[]) {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); return; }
  if (argv[0] === 'diff') {
    await runDiff(argv.slice(1));
    return;
  }

  let target = '.';
  let html: string | undefined;
  let svg: string | undefined;
  let json = false, ci = false;
  let hasPath = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--json') json = true;
    else if (arg === '--ci') ci = true;
    else if (arg === '--html') { html = argv[++i]; if (!html || html.startsWith('--')) throw new Error('--html requires an output filename.'); }
    else if (arg === '--svg') { svg = argv[++i]; if (!svg || svg.startsWith('--')) throw new Error('--svg requires an output filename.'); }
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (!hasPath) { target = arg; hasPath = true; }
    else throw new Error('Only one target directory is supported.');
  }
  const result = await scanProject(target);
  if (html) {
    const destination = path.resolve(html);
    await fs.writeFile(destination, renderReport(result), { encoding:'utf8', flag:'wx', mode:0o600 });
    if (!json) console.log(`Offline HTML report: ${destination}`);
  }
  if (svg) {
    const destination = path.resolve(svg);
    await writeCard(destination, renderCard(result));
    if (!json) console.log(`SVG card: ${destination}`);
  }
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`\n  ◈  VIBEPREFLIGHT  ·  ${result.project}\n`);
    console.log(`  Hygiene signal ${result.signalScore}/100  ·  ${result.scannedFiles} files  ·  ${result.nodes.filter(n=>n.kind==='route').length} routes  ·  ${result.findings.length} findings\n`);
    for (const finding of result.findings) {
      const type = finding.severity === 'high' ? 'HIGH' : finding.severity === 'medium' ? 'MED ' : 'INFO';
      console.log(`  [${type}] ${finding.title}\n         ${finding.file}:${finding.line}\n         Fix: ${finding.fix}\n`);
    }
    if (!result.findings.length) console.log('  No supported heuristic findings. This is NOT a security clearance.\n');
    if (result.truncated) console.log('  WARNING: scan limits reached; some files were skipped.\n');
    console.log('  Static inventory only · No uploads · Not a security audit\n');
  }
  if (ci && (result.findings.some(f => f.severity === 'high') || result.truncated)) process.exitCode = 1;
}

main(process.argv.slice(2)).catch(e => { console.error('VibePreflight:', e instanceof Error ? e.message : String(e)); process.exitCode = 2; });
