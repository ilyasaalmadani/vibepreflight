import type { Finding, DiffResult, Result } from './types.js';

export function diffResults(before: Result, after: Result): DiffResult {
  const beforeFps = new Set(before.findings.map(f => f.fingerprint).filter(Boolean) as string[]);
  const afterFps = new Set(after.findings.map(f => f.fingerprint).filter(Boolean) as string[]);

  const newFindings: Finding[] = after.findings.filter(f => f.fingerprint && !beforeFps.has(f.fingerprint));
  const resolvedCount = before.findings.filter(f => f.fingerprint && !afterFps.has(f.fingerprint)).length;
  const unchangedCount = after.findings.filter(f => f.fingerprint && beforeFps.has(f.fingerprint)).length;

  return { newFindings, resolvedCount, unchangedCount };
}
