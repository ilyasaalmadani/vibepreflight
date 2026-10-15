# Workflows

## Local inspection
```sh
npm install --ignore-scripts
npm run build
node dist/cli.js /path/to/project --html report.html
```

## CI inspection
```sh
node dist/cli.js /path/to/project --ci
```

CI returns code 1 for high-level review signals or scanning truncation. This is **not** a deploy gate or an assurance of security.

## JSON
```sh
node dist/cli.js /path/to/project --json > inventory.json
```

Do not commit inventories from proprietary projects without review; path and environment-variable names may be sensitive.
