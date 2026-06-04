import type { PrismaClient } from '@prisma/client';

const ROLES = [
  // PIC-98 PR-1 (F4): platform-admin role (formerly known by its pre-F4 role
  // code; renamed in-place by the 20260603120000 migration per PD ruling
  // 71de0038). The role still holds the `system.admin` permission
  // (unchanged) which is the platform-admin marker — `isPlatformAdmin(ctx)`
  // checks `permissions.includes('system.admin')`, so F3 D3 (platform-admin
  // cross-org bypass) survives by construction. F4 PR-3a will introduce a
  // new `tenant_admin` role with a curated subset (no system.admin, no
  // posting.*, etc.) — the PIC-92 invariant test (retargeted to
  // platform_admin in this same PR) is the guardrail that catches
  // tenant_admin accidentally gaining posting.*.
  { code: 'platform_admin', name: 'Platform Admin', description: 'Full platform control, overrides, system administration; Fun Makers operator level (cross-tenant)' },
  // PIC-98 PR-3a (F4) — tenant_admin: org-scoped administrator within ONE
  // tenant. Manages own-org users (user.view/create/edit/admin), assigns own-
  // org roles (role.view), and operates ALL sellable modules (commercial,
  // procurement, budget, documents, drawings, layer1). Does NOT hold
  // system.admin (so `isPlatformAdmin(ctx)` returns FALSE → chokepoint
  // org-bypass does NOT fire; F3 D3 platform-admin bypass survives by
  // construction). Does NOT hold posting.* — the PIC-92 retargeted invariant
  // test (seed-coverage.test.ts) is the guardrail. Does NOT hold
  // reference_data.*, workflow.* (templates), notification.* (templates),
  // health.*, override.execute, screen.admin_* — those stay platform-only
  // per PD ruling a0748f23. Curated grants in seed/role-permissions.ts.
  { code: 'tenant_admin', name: 'Tenant Admin', description: 'Org-scoped administrator within one tenant; manages own-org users + roles, operates all sellable modules. CANNOT cross orgs; CANNOT reach platform-only surfaces (posting, reference-data, workflow templates, etc.)' },
  { code: 'project_director', name: 'Project Director', description: 'Project approvals, signatures, cross-project transfer approval' },
  { code: 'project_manager', name: 'Project Manager', description: 'Project operations, same-project reallocation only' },
  { code: 'site_team', name: 'Site Team', description: 'Raises material requests, uploads site documents' },
  { code: 'design', name: 'Design', description: 'Uploads and reviews shop drawings and technical items' },
  { code: 'qa_qc', name: 'QA/QC', description: 'Reviews and approves quality and technical items' },
  { code: 'contracts_manager', name: 'Contracts Manager', description: 'Controls commercial and client-facing workflows' },
  { code: 'qs_commercial', name: 'QS / Commercial', description: 'Drafts and operates commercial records' },
  { code: 'procurement', name: 'Procurement', description: 'Controls procurement and vendor-facing workflows' },
  { code: 'finance', name: 'Finance', description: 'Validates payment and financial aspects' },
  { code: 'cost_controller', name: 'Cost Controller', description: 'Operates cost data, budget tracking' },
  { code: 'document_controller', name: 'Document Controller', description: 'Manages document library and version control' },
  { code: 'pmo', name: 'PMO', description: 'KPI and reporting visibility, portfolio rollups' },
  { code: 'executive_approver', name: 'Executive Approver', description: 'High-authority approvals as configured' },
  // ── QA / smoke-test fixtures (PIC-25) ──
  // These roles exist solely to back the matching `view.only@fmksa.demo` and
  // `no.perm@fmksa.demo` users. They let manual QA exercise permission-gated
  // UI without granting view/no-perm rights to a real user. Layer 1 endpoint
  // calls return 403 for `no_perm_demo`; Layer 1 surfaces are visible but
  // read-only for `view_only_demo`.
  { code: 'view_only_demo', name: 'View-Only (Demo QA)', description: 'QA fixture: view-only access across all modules; no mutation rights' },
  { code: 'no_perm_demo', name: 'No-Permission (Demo QA)', description: 'QA fixture: authenticated only; zero permission grants' },
];

export async function seedRoles(prisma: PrismaClient) {
  console.log('  Seeding roles...');
  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { code: r.code },
      create: { code: r.code, name: r.name, description: r.description, isSystem: true },
      update: { name: r.name, description: r.description },
    });
  }
  console.log(`  ✓ ${ROLES.length} roles seeded`);
}
