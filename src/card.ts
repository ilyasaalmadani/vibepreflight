import type { Result, Severity } from './types.js';

// Marker that lets the CLI safely regenerate a card it wrote earlier.
export const CARD_MARKER = '<!-- vibepreflight-card -->';

const WIDTH = 720;
const ROW = 44;
const MAX_ROWS = 5;

const xml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s);
const tone: Record<Severity, { bg: string; fg: string; label: string }> = {
  high: { bg: '#502635', fg: '#ff9fac', label: 'HIGH' },
  medium: { bg: '#4b391d', fg: '#f9d08e', label: 'MED' },
  info: { bg: '#1f374c', fg: '#9dd0fb', label: 'INFO' },
};
const scoreColor = (score: number) => (score >= 80 ? '#7ddbb4' : score >= 50 ? '#f9d08e' : '#ff9fac');

/** Render a README-embeddable SVG summary card. Static markup only: no scripts, no external resources. */
export function renderCard(result: Result): string {
  const shown = result.findings.slice(0, MAX_ROWS);
  const extra = result.findings.length - shown.length;
  const listTop = 150;
  const rows = shown.length || 1;
  const height = listTop + rows * ROW + (extra > 0 ? 26 : 0) + 52;
  const routes = result.nodes.filter(n => n.kind === 'route').length;
  const envs = result.nodes.filter(n => n.kind === 'env').length;
  const stats = `${result.scannedFiles} files · ${routes} routes · ${envs} env vars · ${result.findings.length} findings`;

  const findingRows = shown.length
    ? shown.map((f, i) => {
        const y = listTop + i * ROW;
        const t = tone[f.severity];
        return `<g transform="translate(28 ${y})">`
          + `<rect width="46" height="20" rx="5" fill="${t.bg}"/>`
          + `<text x="23" y="14" text-anchor="middle" font-size="10" font-weight="800" fill="${t.fg}">${t.label}</text>`
          + `<text x="58" y="14" font-size="14" font-weight="600" fill="#edf2ff">${xml(clip(f.title, 70))}</text>`
          + `<text x="58" y="33" font-size="12" fill="#92a3bd">${xml(clip(`${f.file}:${f.line}`, 80))}</text>`
          + `</g>`;
      }).join('')
    : `<text x="28" y="${listTop + 14}" font-size="14" fill="#92a3bd">No supported heuristic findings. This is not a security clearance.</text>`;
  const more = extra > 0
    ? `<text x="28" y="${listTop + rows * ROW + 12}" font-size="12" fill="#92a3bd">+${extra} more in the full report</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="VibePreflight: ${xml(result.project)}, hygiene signal ${result.signalScore} of 100, ${result.findings.length} findings">
${CARD_MARKER}
<title>VibePreflight · ${xml(result.project)} · ${result.signalScore}/100</title>
<g font-family="Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Arial,sans-serif">
<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="16" fill="#0b1220" stroke="#26394e"/>
<text x="28" y="40" font-size="12" font-weight="800" letter-spacing="2" fill="#8ddcf2">◇ VIBEPREFLIGHT</text>
<text x="28" y="74" font-size="24" font-weight="800" fill="#edf2ff">${xml(clip(result.project, 34))}</text>
<text x="28" y="102" font-size="13" fill="#a3b3ce">${xml(stats)}</text>
<text x="${WIDTH - 28}" y="78" text-anchor="end" font-size="44" font-weight="800" fill="${scoreColor(result.signalScore)}">${result.signalScore}<tspan font-size="18" fill="#92a3bd">/100</tspan></text>
<text x="${WIDTH - 28}" y="102" text-anchor="end" font-size="12" fill="#92a3bd">hygiene signal</text>
<line x1="28" y1="126" x2="${WIDTH - 28}" y2="126" stroke="#26394e"/>
${findingRows}${more}
<text x="28" y="${height - 22}" font-size="11" fill="#7086a1">Static local inventory · no uploads · not a security audit</text>
</g>
</svg>
`;
}
