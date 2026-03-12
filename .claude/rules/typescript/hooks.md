---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript Hooks

> This file extends [common/hooks.md](../common/hooks.md) with TypeScript/JavaScript specific content.

## PostToolUse Hooks

Configure in `~/.claude/settings.json`:

- **Biome**: Auto-format JS/TS files after edit (project uses Biome, not Prettier)
- **TypeScript check**: Run `tsc` after editing `.ts`/`.tsx` files
- **console.log warning**: Warn about `console.log` in edited files

**Note**: This project uses Biome for linting/formatting (configured in `biome.json`), not Prettier/ESLint.

## Stop Hooks

- **console.log audit**: Check all modified files for `console.log` before session ends
