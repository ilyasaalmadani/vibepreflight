# ◇ VibePreflight

### Know what you are about to ship.

**A local-first, zero-runtime-dependency release-surface visualizer for AI-built web apps.**

VibePreflight statically maps your application's routes, environment-variable references, and deployment signals into a self-contained, interactive HTML report. Designed for developers shipping prototypes, AI-generated applications, and internal tools.

> **Scope:** release-surface inventory and lightweight documentation heuristics. **Not** vulnerability scanning, penetration testing, credential verification, or a security certification.

## Quick start

Requires Node.js **20+**. Clone the repository, then:

```bash
npm install --ignore-scripts
npm run check
node dist/cli.js ./examples/unsafe-next --html ./preflight.html
```

Open `preflight.html` locally. No remote service, telemetry, API keys, or account required. The report is written only if the output path does **not** already exist.

You can also use:

```bash
node dist/cli.js /path/to/project --json
node dist/cli.js /path/to/project --ci
node dist/cli.js /path/to/project --svg card.svg
node dist/cli.js --help
```

`--ci` exits with status **1** for high-priority heuristic signals or truncated scans; **2** for tool errors. The indicator score is a heuristic hygiene signal, **not** a security score.

## Diff an AI coding session

See which findings an AI coding session introduced, resolved or left unchanged.

```bash
# Compare the working tree against a git ref
node dist/cli.js diff . --since main

# Compare two folders
node dist/cli.js diff ./before ./after

# JSON output or an SVG card for the PR description
node dist/cli.js diff . --since HEAD~1 --json
node dist/cli.js diff . --since main --svg diff-card.svg
```

<img src="media/diff-card.svg" width="640" alt="VibePreflight diff card: new, resolved and unchanged findings">

Findings are matched by a stable fingerprint (rule + file + evidence such as the variable name), not by count or line number. Swapping one flagged variable for another shows up as one new and one resolved; a line shift alone is not new. `--since` reads the ref with `git archive` into a temporary folder and never runs project code.

`--ci` exits 1 only when there are **new** high-severity findings. This is still a heuristic inventory, **not** a security audit.

## README card

Put your release surface on your README. One command writes a static SVG card (no scripts, no external requests):

```bash
node dist/cli.js . --svg vibepreflight.svg
```

```markdown
![VibePreflight](vibepreflight.svg)
```

<img src="media/card.svg" width="640" alt="VibePreflight card for the unsafe-next example: hygiene signal 55/100, 3 findings">

Rerunning regenerates the card in place. VibePreflight only overwrites a file that is itself a VibePreflight card.

## Example report

![VibePreflight report for the unsafe-next example: 3 findings, routes and env references mapped](media/report.png)

Generated from `examples/unsafe-next` with `node dist/cli.js examples/unsafe-next --html preflight.html`. The values in the example are placeholders; only variable names are read.

## What you get

- **Interactive graph:** maps Next.js App/Pages routes, environment references, detected frameworks, and deployment entrypoints.
- **Offline dashboard:** single responsive HTML report with filterable SVG graph, focused node details, accessible keyboard selection, and actionable findings.
- **Review prompts:** public-prefixed, sensitive-looking variable names, server-only environment references from client components, missing or incomplete `.env.example`, and invalid `package.json`.
- **Portable outputs:** machine-readable JSON, CLI output, and stable exit codes for CI.
- **Safety boundaries:** ignores symlinks, common generated folders, large files, and non-text content; limits resource use and does not execute inspected code.

## Sample workflow

```text
Your app source
   │
   ├── Next.js routes ────────┐
   ├── process.env variables ├──► VibePreflight scanner
   ├── deployment scripts ────┘             │
   │                                        ├── structured JSON
   └── stays on your machine                └── offline interactive HTML
```

## What makes it different?

Most tools ask whether an application is secure. **VibePreflight asks a narrower question: can you quickly understand the surface you are about to deploy?** It is a lightweight map and review aid rather than an exhaustive security scanner. Its goal is to make pre-deploy conversations and configuration handoffs easier.

## Limitations

This is **not** a full parser; heuristic string matching can have false positives/negatives. Source comments or string literals may resemble environment-variable references. It does not prove a credential was exposed. It does **not** test authorization, dependencies, vulnerabilities, infrastructures, production runtime, or actual deployability. It must not be used to approve a release.

Supported first: Next.js route conventions and selected Vite/Cloudflare signals. Other frameworks require contributions.

## Contributing

PRs are welcome for route patterns, improved static analysis precision, docs, UX, accessibility, and fixtures. Please include a test and a concise example. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Roadmap

- Improve AST-based extraction with opt-in parser integrations.
- Add more routing conventions and fixtures.
- Optional safe compare mode for changes between local scan outputs.
- More graph keyboard navigation and high-contrast modes.

## License

[MIT](LICENSE). Maintained by [ilyasaalmadani](https://github.com/ilyasaalmadani).

**Important:** VibePreflight is an informational visualization tool, deliberately distinct from specialized commercial release-security audit products.
