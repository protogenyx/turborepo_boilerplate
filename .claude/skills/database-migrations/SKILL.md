---
name: database-migrations
description: Database migration best practices for Prisma with PostgreSQL. Safe schema changes, zero-downtime deployments, and data protection.
origin: Prisma best practices
---

# Database Migration Patterns

Safe, reversible database schema changes for production systems using Prisma with PostgreSQL.

## 🚨 CRITICAL: NEVER Use --accept-data-loss - EVER

### Hard Rule

**NEVER** run `prisma db push --accept-data-loss` under any circumstances:
- ❌ Never in production
- ❌ Never in staging
- ❌ Never in development (if you care about the data)
- ❌ Never to "fix" migration issues
- ❌ Never on a database with real user data

```bash
# ❌ NEVER RUN THESE COMMANDS - DATA WILL BE PERMANENTLY LOST
pnpm prisma db push --accept-data-loss
pnpm prisma migrate dev --accept-data-loss
```

### Why This Flag is Dangerous

The `--accept-data-loss` flag will **permanently delete data without confirmation**:
- Columns being removed → All data in those columns is **gone forever**
- Tables being dropped → All rows in those tables are **gone forever**
- Type changes that can't be cast → Data becomes **NULL or truncated**
- No undo, no backup created automatically, no recovery path

### If Someone Suggests Using --accept-data-loss

1. **STOP** - Do not run the command
2. **Backup first** - Always create a database backup before any schema change
3. **Use proper migrations** - Follow the expand-contract pattern for breaking changes
4. **Ask for help** - If migrations are failing, there's always a safer solution

### Safe Alternatives by Environment

| Environment | Safe Command | Notes |
|-------------|--------------|-------|
| Development | `pnpm prisma migrate dev` | Interactive, prompts before destructive changes |
| Development (schema-only) | `pnpm prisma db push` | Only if you're okay wiping dev data |
| Production | `pnpm prisma migrate deploy` | Never has --accept-data-loss flag |
| Fix failed migration | `pnpm prisma migrate resolve` | Mark as applied/rolled back, don't use push |

### When You Think You Need --accept-data-loss

You're probably trying to solve one of these problems - here's the safe way:

**Problem:** Migration conflict / drift
**Solution:** `pnpm prisma migrate resolve --rolled-back <name>` or restore from backup

**Problem:** Column type change causing error
**Solution:** Expand-contract pattern (add new column, migrate data, drop old)

**Problem:** Table needs to be dropped
**Solution:** Remove all code references first, then drop in separate migration

**Problem:** Dev database is messy
**Solution:** Reset with `pnpm prisma migrate reset` (expected data loss) or recreate DB

## Core Principles

1. **Every change is a migration** — never alter production databases manually
2. **Migrations are forward-only in production** — rollbacks use new forward migrations
3. **Schema and data migrations are separate** — never mix DDL and DML in one migration
4. **Test migrations against production-sized data** — a migration that works on 100 rows may lock on 10M
5. **Migrations are immutable once deployed** — never edit a migration that has run in production

## Migration Safety Checklist

Before applying any migration:

- [ ] Migration has both UP and DOWN (or is explicitly marked irreversible)
- [ ] No full table locks on large tables (use concurrent operations)
- [ ] New columns have defaults or are nullable (never add NOT NULL without default)
- [ ] Indexes created concurrently (not inline with CREATE TABLE for existing tables)
- [ ] Data backfill is a separate migration from schema change
- [ ] Tested against a copy of production data
- [ ] Rollback plan documented
- [ ] **🚨 NEVER using --accept-data-loss flag (this is non-negotiable)**

## Prisma Migration Workflow

### Development

```bash
cd apps/api

# 1. Edit prisma/schema.prisma

# 2. Create migration (dev only - will apply to dev database)
pnpm prisma migrate dev --name add_user_avatar

# 3. Generate Prisma Client
pnpm prisma generate

# 4. Test the changes
```

### Production Deployment

```bash
cd apps/api

# 1. Deploy migrations (safe - never uses --accept-data-loss)
pnpm prisma migrate deploy

# 2. Generate Prisma Client
pnpm prisma generate

# 3. Restart application
```

### Custom SQL Migration

For operations Prisma cannot express (concurrent indexes, data backfills):

```bash
cd apps/api

# Create empty migration, then edit the SQL manually
pnpm prisma migrate dev --create-only --name add_concurrent_index
```

```sql
-- migrations/20240115_add_concurrent_index/migration.sql
-- Prisma cannot generate CONCURRENTLY, so we write it manually
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);
```

## Project Commands Reference

```bash
cd apps/api

# Database
pnpm db:generate       # Generate Prisma Client
pnpm db:push           # Push schema changes (dev only!)
pnpm db:migrate        # Run migrations (dev)
pnpm db:migrate:deploy # Deploy migrations (prod)
pnpm db:studio         # Open Prisma Studio
pnpm db:seed           # Seed database
pnpm db:seed:courses   # Seed courses
pnpm db:seed:achievements  # Seed achievements

# Security
pnpm deploy:rls        # Deploy RLS policies
```

## Safe Schema Changes

### Adding a Column Safely

```sql
-- GOOD: Nullable column, no lock
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- GOOD: Column with default (Postgres 11+ is instant, no rewrite)
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- BAD: NOT NULL without default on existing table (requires full rewrite)
ALTER TABLE users ADD COLUMN role TEXT NOT NULL;
-- This locks the table and rewrites every row
```

### Adding an Index Without Downtime

```sql
-- BAD: Blocks writes on large tables
CREATE INDEX idx_users_email ON users (email);

-- GOOD: Non-blocking, allows concurrent writes
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);

-- Note: CONCURRENTLY cannot run inside a transaction block
-- Most migration tools need special handling for this
```

### Renaming a Column (Zero-Downtime)

Never rename directly in production. Use the expand-contract pattern:

```sql
-- Step 1: Add new column (migration 001)
ALTER TABLE users ADD COLUMN display_name TEXT;

-- Step 2: Backfill data (migration 002, data migration)
UPDATE users SET display_name = username WHERE display_name IS NULL;

-- Step 3: Update application code to read/write both columns
-- Deploy application changes

-- Step 4: Stop writing to old column, drop it (migration 003)
ALTER TABLE users DROP COLUMN username;
```

### Removing a Column Safely

```sql
-- Step 1: Remove all application references to the column
-- Step 2: Deploy application without the column reference
-- Step 3: Drop column in next migration
ALTER TABLE orders DROP COLUMN legacy_status;
```

## Large Data Migrations

```sql
-- BAD: Updates all rows in one transaction (locks table)
UPDATE users SET normalized_email = LOWER(email);

-- GOOD: Batch update with progress
DO $$
DECLARE
  batch_size INT := 10000;
  rows_updated INT;
BEGIN
  LOOP
    UPDATE users
    SET normalized_email = LOWER(email)
    WHERE id IN (
      SELECT id FROM users
      WHERE normalized_email IS NULL
      LIMIT batch_size
      FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RAISE NOTICE 'Updated % rows', rows_updated;
    EXIT WHEN rows_updated = 0;
    COMMIT;
  END LOOP;
END $$;
```

## Zero-Downtime Migration Strategy

For critical production changes, follow the expand-contract pattern:

```
Phase 1: EXPAND
  - Add new column/table (nullable or with default)
  - Deploy: app writes to BOTH old and new
  - Backfill existing data

Phase 2: MIGRATE
  - Deploy: app reads from NEW, writes to BOTH
  - Verify data consistency

Phase 3: CONTRACT
  - Deploy: app only uses NEW
  - Drop old column/table in separate migration
```

### Timeline Example

```
Day 1: Migration adds new_status column (nullable)
Day 1: Deploy app v2 — writes to both status and new_status
Day 2: Run backfill migration for existing rows
Day 3: Deploy app v3 — reads from new_status only
Day 7: Migration drops old status column
```

## Prisma Schema Patterns

### Model Definition

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  avatarUrl String?  @map("avatar_url")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([email])
  @@map("users")
}
```

### Handling Enum Changes

```prisma
// Step 1: Add new enum value
enum CourseStatus {
  draft
  published
  archived
  scheduled  // New value
}

// Step 2: Deploy code that handles new value
// Step 3: Migrate data if needed
// Step 4: Remove old value (only if no data uses it)
```

## Backup Before Migrations

```bash
# Always backup before production migrations
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Or use Prisma's shadow database for testing
pnpm prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --shadow-database-url $SHADOW_URL
```

## Emergency Rollback

If a migration fails in production:

```bash
cd apps/api

# 1. Check migration status
pnpm prisma migrate status

# 2. Mark migration as rolled back (if partially applied)
pnpm prisma migrate resolve --rolled-back migration_name

# 3. Or mark as applied (if manually fixed)
pnpm prisma migrate resolve --applied migration_name

# 4. NEVER run db push --accept-data-loss to fix issues
```

## Anti-Patterns

| Anti-Pattern | Why It Fails | Better Approach |
|-------------|-------------|-----------------|
| `--accept-data-loss` in production | **Permanent, irreversible data loss** | Use expand-contract pattern |
| `--accept-data-loss` in development | Data loss, even "just dev" wastes time | `pnpm prisma migrate reset` or recreate DB |
| `--accept-data-loss` to fix errors | Masking the problem, will bite later | `pnpm prisma migrate resolve` or restore backup |
| Manual SQL in production | No audit trail, unrepeatable | Always use migration files |
| Editing deployed migrations | Causes drift between environments | Create new migration instead |
| NOT NULL without default | Locks table, rewrites all rows | Add nullable, backfill, then add constraint |
| Inline index on large table | Blocks writes during build | CREATE INDEX CONCURRENTLY |
| Schema + data in one migration | Hard to rollback, long transactions | Separate migrations |
| Dropping column before removing code | Application errors on missing column | Remove code first, drop column next deploy |

### The --accept-data-loss Rule

> **There is no valid use case for `--accept-data-loss` in a production codebase.**

If you think you need it, you don't. Here's what to do instead:

| Situation | Wrong Approach | Right Approach |
|-----------|---------------|----------------|
| "The migration keeps failing" | Use `--accept-data-loss` | Debug the migration, fix the issue |
| "I need to drop this column" | Use `--accept-data-loss` | Remove code refs first, then normal migration |
| "The schema is out of sync" | Use `--accept-data-loss` | `pnpm migrate resolve` or restore from backup |
| "It's just dev data" | Use `--accept-data-loss` | `pnpm migrate reset` if you don't care about data |
| "I changed my mind on the column type" | Use `--accept-data-loss` | Expand-contract pattern |

**Remember**: Data loss is permanent. Always have backups, always test migrations, **never use --accept-data-loss**.
