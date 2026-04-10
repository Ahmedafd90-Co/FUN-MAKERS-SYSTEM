import type { PrismaClient } from '@prisma/client';

/**
 * Permission codes for Pico Play Fun Makers KSA.
 *
 * Format: <resource>.<action>
 * Resources: project, document, workflow, posting, audit, user, role, entity,
 *            reference_data, notification, system, override
 * Actions:   view, edit, create, approve, sign, delete, override, admin
 *
 * These permissions are assigned to roles in role-permissions.ts.
 * The 14 business roles are:
 *   1. Master Admin        — full access; only role with override.*
 *   2. Project Director    — project approvals, cross-project transfer approval
 *   3. Project Manager     — project operations, same-project reallocation only
 *   4. Site Team           — raises material requests, uploads site docs
 *   5. Design              — uploads/reviews shop drawings and technical items
 *   6. QA/QC              — reviews/approves quality items
 *   7. Contracts Manager   — controls commercial workflows
 *   8. QS / Commercial     — drafts and operates commercial records
 *   9. Procurement         — controls procurement workflows
 *  10. Finance             — validates payment aspects
 *  11. Cost Controller     — operates cost data
 *  12. Document Controller — manages document library
 *  13. PMO                — read-only KPI rollups
 *  14. Executive Approver  — high-authority approvals
 *
 * // TODO(ahmed): Fill the PERMISSIONS array below.
 * // List the permission codes you want for Module 1.
 * // One example is provided. Add the rest (typically 20-40 codes).
 * // You can always add more in later modules.
 */

export type PermissionDef = {
  code: string;
  description: string;
  resource: string;
  action: string;
};

export const PERMISSIONS: PermissionDef[] = [
  // Example — copy this pattern:
  { code: 'project.view', description: 'View project workspace and metadata', resource: 'project', action: 'view' },

  // TODO(ahmed): Add the rest of the permission codes here.
  // Suggested minimum set for Module 1:
  //
  // project.edit          — Edit project metadata and settings
  // project.create        — Create new projects (Master Admin only)
  // project.archive       — Archive a project
  //
  // document.view         — View documents in assigned projects
  // document.upload       — Upload new documents
  // document.sign         — Sign a document version
  // document.supersede    — Upload a new version superseding a signed one
  //
  // workflow.view         — View workflow instances and history
  // workflow.start        — Start a workflow instance
  // workflow.approve      — Approve a workflow step assigned to you
  // workflow.reject       — Reject a workflow step
  // workflow.return       — Return a workflow step for correction
  // workflow.override     — Force-progress a workflow (Master Admin only)
  //
  // posting.view          — View posting events and exceptions
  // posting.retry         — Retry a failed posting event
  // posting.resolve       — Resolve a posting exception with a note
  //
  // audit.view            — View audit logs
  // audit.export          — Export audit logs
  //
  // user.view             — View user profiles
  // user.edit             — Edit user profiles
  // user.create           — Create new users
  // user.admin            — Activate/deactivate/reset users
  //
  // role.view             — View roles and permissions
  // role.edit             — Edit role-permission assignments
  //
  // entity.view           — View entities
  // entity.edit           — Edit entities
  //
  // reference_data.view   — View reference data (countries, currencies, etc.)
  // reference_data.edit   — Edit app settings and status dictionaries
  //
  // notification.view     — View notification templates
  // notification.edit     — Edit notification templates
  //
  // system.health         — View system health and job queues
  // system.admin          — Full system administration
  //
  // override.execute      — Execute override actions (Master Admin only)
  // cross_project.read    — Read data across projects (PMO, Master Admin)
  //
  // screen.admin_users    — Access Admin > Users screen
  // screen.admin_roles    — Access Admin > Roles screen
  // screen.admin_entities — Access Admin > Entities screen
  // ... (add screen-level codes as needed)
];

export async function seedPermissions(prisma: PrismaClient) {
  console.log('  Seeding permissions...');
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, description: p.description, resource: p.resource, action: p.action },
      update: { description: p.description, resource: p.resource, action: p.action },
    });
  }
  console.log(`  ✓ ${PERMISSIONS.length} permissions seeded`);
}
