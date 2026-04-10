# Database Migrations

## Overview

FMKSA uses Prisma Migrate for schema management. All migrations are in `packages/db/prisma/migrations/`. The database is PostgreSQL 16.

## Current Migrations

| Migration | Description |
|-----------|-------------|
| `20260410003049_init_module_1` | Full Module 1 schema: 30 models covering auth, RBAC, entities, projects, workflow, documents, posting, audit, notifications |
| `20260410100000_add_notification_idempotency` | Adds unique constraint for notification deduplication |

## Running Migrations

```bash
# Apply pending migrations (development)
pnpm db:migrate

# Apply migrations in CI/production (no interactive prompts)
DATABASE_URL=... pnpm --filter @fmksa/db exec prisma migrate deploy

# Reset database (destroys all data)
DATABASE_URL=... pnpm --filter @fmksa/db exec prisma migrate reset

# After reset, re-seed:
pnpm db:seed
```

## Seeding

The seed script (`packages/db/src/seed/index.ts`) is idempotent and creates:

- **Master admin user** (ahmedafd90@gmail.com)
- **14 roles** with permission mappings (master_admin through pmo_analyst)
- **Permissions** for all Module 1 operations
- **Screen permissions** mapping roles to UI screens
- **Reference data**: countries (SA, AE, BH, etc.), currencies (SAR, USD, EUR, etc.)
- **Notification templates** for all workflow and system events

Run with: `pnpm db:seed`

## Schema Conventions

- All tables use UUID primary keys (`@id @default(uuid())`)
- Timestamps: `createdAt` and `updatedAt` with `@default(now())` / `@updatedAt`
- Soft deletes: `status` field on mutable records, not row deletion
- Immutable records: `AuditLog`, `OverrideLog`, `WorkflowAction`, `DocumentSignature` — protected by Prisma middleware that blocks delete/update
- Signed document versions: `DocumentVersion` records with signatures cannot be modified (only supersession fields)
- Foreign keys use `onDelete: Restrict` by default
- Indexes on frequently queried columns (projectId + createdAt, resourceType + resourceId, etc.)

## Adding a New Migration

1. Edit `packages/db/prisma/schema.prisma`
2. Run `pnpm --filter @fmksa/db exec prisma migrate dev --name describe_change`
3. Regenerate client: `pnpm --filter @fmksa/db generate`
4. Update seed if new reference data is needed
5. Commit both the migration SQL and updated schema

## Production Deployment

Migrations run via `prisma migrate deploy` in the CDK compute stack's init container. This is a non-interactive command that applies pending migrations in order. Never use `prisma migrate dev` in production.
