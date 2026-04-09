# Fun Makers KSA

Internal operations platform for Pico Play construction and project delivery in the Kingdom of Saudi Arabia. Fun Makers KSA is a pnpm + Turborepo monorepo containing the shared core platform (Module 1) and the eventual domain modules (commercial, procurement, materials, contracts, budget, cashflow, reports, PMO KPIs) that power Pico Play's end-to-end project lifecycle — from handover through closeout — with role-based access, approval workflows, document versioning, auditability, and the posting service that keeps operational records in lockstep with downstream finance.

## Quick start

> Full setup instructions will land with the developer experience and infrastructure work in Group 1.1-D. For now, this section is intentionally a placeholder.

```
pnpm install
pnpm dev
```

## Repository layout

```
apps/                 Next.js application (added in Group 1.1-B)
packages/
  config/             Shared TS / ESLint / Prettier / Tailwind config
  core/               Domain services (auth, access-control, workflow, ...)
  db/                 Prisma schema + client
  contracts/          Shared Zod schemas and types
  jobs/               BullMQ worker process
  ui/                 Shared UI kit (added in Group 1.1-B)
infra/cdk/            AWS CDK infrastructure (added in Group 1.1-C)
docs/superpowers/     Spec and implementation plan
```

## Documentation

- Module 1 design spec: `docs/superpowers/specs/2026-04-09-module-1-shared-core-platform-design.md`
- Module 1 implementation plan: `docs/superpowers/plans/2026-04-09-module-1-implementation-plan.md`
