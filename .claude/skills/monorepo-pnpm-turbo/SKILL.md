---
name: monorepo-pnpm-turbo
description: Monorepo patterns using pnpm workspaces and Turbo for build orchestration, package management, and cross-package development.
origin: pnpm + Turbo best practices
---

# Monorepo Patterns (pnpm + Turbo)

This skill covers the monorepo architecture using pnpm workspaces for package management and Turbo for build orchestration.

## When to Use

Use this pattern for:
- **Multi-application projects** - Frontend + API + shared packages
- **Shared UI libraries** - Component libraries used across apps
- **Code reuse** - Shared utilities, types, configurations
- **Atomic deployments** - Deploy all apps together or independently
- **Consistent tooling** - Single lint, format, build setup

## Project Structure

```
my-project/
├── apps/
│   ├── web/                # Frontend React app (Vite)
│   └── api/                # Backend API (Express)
├── packages/
│   ├── ui/                 # UI component library
│   └── utils/              # Shared utilities

├── pnpm-workspace.yaml     # Workspace definition
├── turbo.json              # Turbo pipeline configuration
└── package.json            # Root package.json
```

## pnpm Workspace Configuration

### pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'

# Catalog for shared dependencies
catalog:
  react: '19.2.0'
  typescript: '~5.9.3'
  vite: '7.2.4'
  tailwindcss: '3.4.19'
  '@biomejs/biome': '1.9.4'
  
catalogs:
  # React ecosystem
  react19:
    react: '19.2.0'
    react-dom: '19.2.0'
    '@types/react': '^19.0.0'
    '@types/react-dom': '^19.0.0'
```

### Using Catalog Versions

```json
// packages/ui/package.json
{
  "dependencies": {
    "react": "catalog:",
    "@myorg/ui": "workspace:*'"}, {
  },
  "devDependencies": {
    "typescript": "catalog:"
  }
}

// Use specific catalog
{
  "dependencies": {
    "react": "catalog:react19"
  }
}
```

## Turbo Configuration

### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
```

### Pipeline Explained

| Task | Depends On | Outputs | Description |
|------|-----------|---------|-------------|
| `build` | `^build` | dist/** | Build all packages (deps first) |
| `lint` | `^build` | - | Lint after build |
| `test` | `build` | - | Test after building |
| `dev` | - | - | Development mode (no cache) |
| `clean` | - | - | Clean build artifacts |

The `^` prefix means "run this task in all workspace dependencies first".

## Root Package.json

```json
{
  "name": "my-project",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "format": "turbo run format",
    "format:fix": "turbo run format:fix",
    "test": "turbo run test",
    "clean": "turbo run clean && rm -rf node_modules",
    "typecheck": "turbo run typecheck",
    "gate:api-security": "pnpm lint && pnpm build && pnpm test && pnpm audit"
  },
  "devDependencies": {
    "turbo": "^2.3.0"
  }
}
```

## Creating a New Package

### Step 1: Create Package Directory

```bash
mkdir -p packages/my-new-package
cd packages/my-new-package
```

### Step 2: Initialize package.json

```json
{
  "name": "@ravenyx/my-new-package",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format .",
    "format:fix": "biome format --write .",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "typescript": "catalog:"
  }
}
```

### Step 3: Create tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

### Step 4: Set Up Source Files

```typescript
// packages/my-new-package/src/index.ts
export { myFunction } from './myFunction.js';
export type { MyType } from './types.js';
```

### Step 5: Install Dependencies

```bash
# From root
pnpm install

# Or add specific dependency
pnpm add -F @ravenyx/my-new-package some-dependency
```

## Inter-Package Dependencies

### Using Workspace Packages

```json
// apps/rnkup.gg/package.json
{
  "dependencies": {
    "@ravenyx/nyxui": "workspace:*",
    "@ravenyx/nyx-react": "workspace:*",
    "@ravenyx/themes": "workspace:*"
  }
}
```

The `workspace:*` protocol links to the local workspace version.

### TypeScript Path Mapping

```json
// tsconfig.base.json (at root)
{
  "compilerOptions": {
    "paths": {
      "@ravenyx/nyxui": ["./packages/nyx/src/index.ts"],
      "@ravenyx/nyx-react": ["./packages/nyx-react/src/index.ts"],
      "@ravenyx/themes": ["./packages/themes/src/index.ts"]
    }
  }
}
```

## Common Tasks

### Adding Dependencies

```bash
# Add to specific workspace
pnpm add -F @ravenyx/nyx-react react

# Add dev dependency
pnpm add -D -F @ravenyx/nyx-react @types/react

# Add from catalog
pnpm add -F @ravenyx/nyx-react "react@catalog:"

# Add to root
pnpm add -D typescript -w
```

### Running Scripts

```bash
# Run in all workspaces
turbo run build

# Run in specific workspace
pnpm -F @ravenyx/nyx-react build

# Run dev in all (parallel)
turbo run dev

# Run with filter
turbo run build --filter=rnkup.gg
```

### Cleaning

```bash
# Clean all build artifacts
turbo run clean

# Clean everything including node_modules
pnpm clean
```

## Build Order

Turbo automatically handles build order based on dependencies:

```
Build Order:
1. packages/themes       (no deps)
2. packages/nyx          (no deps)
3. packages/nyx-react    (depends on nyx, themes)
4. apps/rnkup.gg         (depends on all packages)
5. apps/rnkup.gg-api     (depends on themes)
```

## Development Workflow

### Starting Development

```bash
# Install dependencies
pnpm install

# Build all packages (one-time or after major changes)
pnpm build

# Start development (all apps)
pnpm dev

# Or start specific app
pnpm -F rnkup.gg dev
```

### Making Changes

When modifying a shared package:

```bash
# Option 1: Use watch mode
pnpm -F @ravenyx/nyx dev     # In terminal 1
pnpm -F rnkup.gg dev          # In terminal 2

# Option 2: Turbo handles rebuilds automatically
turbo run dev                 # All packages rebuild on change
```

### Before Committing

```bash
# Run all checks
pnpm lint
pnpm format
pnpm typecheck
pnpm test

# Or run security gate
pnpm gate:api-security
```

## Troubleshooting

### "Cannot find module" Errors

```bash
# Rebuild packages
pnpm build

# Or force rebuild
pnpm clean && pnpm install && pnpm build
```

### Stale Dependencies

```bash
# Remove all node_modules and reinstall
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

### Turbo Cache Issues

```bash
# Clear Turbo cache
rm -rf .turbo
rm -rf node_modules/.cache/turbo

# Run without cache
turbo run build --force
```

### Workspace Not Found

Ensure the package is in `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'tools/*'  # Add new directories here
```

## Best Practices

### DO
- ✅ Use `workspace:*` for internal dependencies
- ✅ Keep dependencies in catalog when shared
- ✅ Run `pnpm install` after modifying package.json
- ✅ Build packages before running dependent apps
- ✅ Use consistent versioning across packages

### DON'T
- ❌ Manually edit node_modules or .pnpm
- ❌ Use `npm` or `yarn` commands (stick to pnpm)
- ❌ Pin different versions of same dependency in different packages
- ❌ Forget to export types in package.json

## CI/CD Consideration

```yaml
# .github/workflows/ci.yml
name: CI

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm build
      - run: pnpm test
```

## Resources

- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Turbo Documentation](https://turbo.build/repo/docs)
- [Catalog Protocol](https://pnpm.io/catalog-protocol)
