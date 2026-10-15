export type Severity = 'high' | 'medium' | 'info';
export type NodeKind = 'route' | 'env' | 'deployment' | 'framework';
export interface Finding {
  id: string;
  severity: Severity;
  file: string;
  line: number;
  title: string;
  explanation: string;
  fix: string;
  /** Stable identity for diffing. Does not include line number. */
  fingerprint?: string;
}
export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  detail: string;
  file?: string;
}
export interface GraphEdge { from: string; to: string; label: string; }
export interface Result {
  schemaVersion: 1;
  project: string;
  scannedFiles: number;
  truncated: boolean;
  frameworks: string[];
  findings: Finding[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Heuristic hygiene indicator, NOT a security certification. */
  signalScore: number;
  limitations: string[];
}
export interface DiffResult {
  newFindings: Finding[];
  resolvedCount: number;
  unchangedCount: number;
}
