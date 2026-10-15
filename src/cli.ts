#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanProject } from './scan.js';
import { renderReport } from './report.js';

const USAGE = `VibePreflight — visual release-surface inventory for AI-built web apps

Usage: vibepreflight [path] [--html report.html] [--json] [--ci] [--help]

  path         Directory to inspect (default: .)
  --html FILE  Write an interactive, offline HTML report
  --json       Emit machine-readable scan result (stdout only)
  --ci         Exit 1 if high-level warnings found, 2 on tool errors
  --help       Print help

No code is executed, no credentials are validated, and no data leaves the machine.
The indicator is NOT a security score or permission to deploy.`;

async function main(argv: string[]) {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); return; }
  let target = '.';
  let html: string | undefined;
  let json = false, ci = false;
  let hasPath = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--json') json = true;
    else if (arg === '--ci') ci = true;
    else if (arg === '--html') { html = argv[++i]; if (!html || html.startsWith('--')) throw new Error('--html requires an output filename.'); }
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (!hasPath) { target = arg; hasPath = true; }
    else throw new Error('Only one target directory is supported.');
  }
  const result = await scanProject(target);
  if (html) {
    const destination = path.resolve(html);
    // Never overwrite an existing HTML report or a source file silently.
    await fs.writeFile(destination, renderReport(result), { encoding:'utf8', flag:'wx', mode:0o600 });
    if (!json) console.log(`Offline HTML report: ${destination}`);
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
