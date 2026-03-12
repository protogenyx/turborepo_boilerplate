# Turbo Monorepo Boilerplate - Claude Code Workflow Guide

> **Note:** This file contains **workflow patterns** for working with this boilerplate. Adjust for your specific project needs.

## Workflow Principles

### 1. Plan First

* Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
* If something goes sideways, STOP and re-plan immediately
* Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

* Use subagents liberally to keep main context window clean
* Offload research, exploration, and parallel analysis to subagents
* For complex problems, throw more compute at it via subagents
* One task per subagent for focused execution

### 3. Verification Before Done

* Never mark a task complete without proving it works
* Run tests, check logs, demonstrate correctness
* Ask yourself: "Would a staff engineer approve this?"

### 4. Minimal Impact

* Make every change as simple as possible
* Changes should only touch what's necessary
* Avoid introducing bugs through scope creep

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Track Progress**: Mark items complete as you go
3. **Document Results**: Add review section to `tasks/todo.md`

## Available Skills

Skills are located in `.claude/skills/` and provide patterns for common tasks:

- **monorepo-pnpm-turbo** - pnpm workspaces and Turbo orchestration
- **coding-standards** - TypeScript, Biome formatting, naming conventions
- **frontend-patterns** - React, hooks, state management, performance
- **backend-patterns** - Express.js, services, middleware, validation
- **tdd-workflow** - Test-driven development
- **e2e-testing** - Playwright patterns
- **docker-patterns** - Docker and Docker Compose patterns
- **deployment-patterns** - CI/CD, production readiness

## Project Structure

```
apps/
  └── (your applications here)

packages/
  └── (your shared packages here)
```

## Tech Stack (Default)

- **Package Manager**: pnpm with workspace catalogs
- **Build Tool**: Turbo
- **Language**: TypeScript
- **Linting/Formatting**: Biome

## Command Quick Reference

```bash
# Root commands (pnpm)
pnpm dev                    # Start all apps in dev mode
pnpm build                  # Build all packages and apps
pnpm lint                   # Lint all projects (Biome)
pnpm lint:fix               # Fix lint issues
pnpm format                 # Check formatting
pnpm format:fix             # Fix formatting
pnpm check                  # Lint + format check
pnpm check:fix              # Fix lint + format
```

## Adding New Apps/Packages

1. Create directory in `apps/` or `packages/`
2. Add `package.json` with appropriate name
3. For apps: add to `pnpm-workspace.yaml` if needed
4. Run `pnpm install` to update workspace

## Customization

This is a boilerplate - adapt it to your project's needs:
- Update this file with your specific tech stack
- Add/remove skills based on your requirements
- Modify the workflow to match your team practices
