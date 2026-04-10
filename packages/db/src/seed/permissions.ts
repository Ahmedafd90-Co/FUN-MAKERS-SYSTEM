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
 * Filled by Ahmed Al-Dossary on 2026-04-10 (Pause #1).
 * 47 permission codes across 14 resources.
 * Additional permissions can be added in later modules.
 */

export type PermissionDef = {
  code: string;
  description: string;
  resource: string;
  action: string;
};

export const PERMISSIONS: PermissionDef[] = [
  // --- Project ---
  { code: 'project.view', description: 'View assigned project workspaces and project-level data', resource: 'project', action: 'view' },
  { code: 'project.create', description: 'Create new projects', resource: 'project', action: 'create' },
  { code: 'project.edit', description: 'Edit project master data and settings', resource: 'project', action: 'edit' },
  { code: 'project.archive', description: 'Archive or deactivate projects', resource: 'project', action: 'archive' },

  // --- Document ---
  { code: 'document.view', description: 'View project documents and document metadata', resource: 'document', action: 'view' },
  { code: 'document.upload', description: 'Upload new documents and attachments', resource: 'document', action: 'upload' },
  { code: 'document.sign', description: 'Apply internal digital signature to authorized documents', resource: 'document', action: 'sign' },
  { code: 'document.supersede', description: 'Supersede a current document version with a new version', resource: 'document', action: 'supersede' },

  // --- Workflow ---
  { code: 'workflow.view', description: 'View workflow templates, instances, and actions', resource: 'workflow', action: 'view' },
  { code: 'workflow.start', description: 'Start workflow instances on records', resource: 'workflow', action: 'start' },
  { code: 'workflow.approve', description: 'Approve workflow steps assigned to the user', resource: 'workflow', action: 'approve' },
  { code: 'workflow.reject', description: 'Reject workflow steps with comment', resource: 'workflow', action: 'reject' },
  { code: 'workflow.return', description: 'Return workflow steps for correction with comment', resource: 'workflow', action: 'return' },
  { code: 'workflow.override', description: 'Force-progress, reopen, or remediate workflow under controlled override', resource: 'workflow', action: 'override' },

  // --- Posting ---
  { code: 'posting.view', description: 'View posting events and posting status', resource: 'posting', action: 'view' },
  { code: 'posting.retry', description: 'Retry failed posting events from the exception queue', resource: 'posting', action: 'retry' },
  { code: 'posting.resolve', description: 'Resolve posting exceptions with resolution note', resource: 'posting', action: 'resolve' },

  // --- Audit ---
  { code: 'audit.view', description: 'View audit logs', resource: 'audit', action: 'view' },
  { code: 'audit.export', description: 'Export audit logs and audit reports', resource: 'audit', action: 'export' },

  // --- User ---
  { code: 'user.view', description: 'View users and user profile records', resource: 'user', action: 'view' },
  { code: 'user.create', description: 'Create new users', resource: 'user', action: 'create' },
  { code: 'user.edit', description: 'Edit user records and assignments', resource: 'user', action: 'edit' },
  { code: 'user.admin', description: 'Activate, deactivate, reset password, and administer user access', resource: 'user', action: 'admin' },

  // --- Role ---
  { code: 'role.view', description: 'View roles and role-permission structures', resource: 'role', action: 'view' },
  { code: 'role.edit', description: 'Create or edit roles and role-permission mappings', resource: 'role', action: 'edit' },

  // --- Entity ---
  { code: 'entity.view', description: 'View entities and entity hierarchy', resource: 'entity', action: 'view' },
  { code: 'entity.edit', description: 'Create or edit entities and entity structure', resource: 'entity', action: 'edit' },

  // --- Reference Data ---
  { code: 'reference_data.view', description: 'View reference data and application dictionaries', resource: 'reference_data', action: 'view' },
  { code: 'reference_data.edit', description: 'Create or edit reference data, settings, and dictionaries', resource: 'reference_data', action: 'edit' },

  // --- Notification ---
  { code: 'notification.view', description: 'View notifications and notification templates', resource: 'notification', action: 'view' },
  { code: 'notification.edit', description: 'Manage notification templates and notification settings', resource: 'notification', action: 'edit' },

  // --- System ---
  { code: 'system.health', description: 'View system health, jobs, queue status, and background processing state', resource: 'system', action: 'health' },
  { code: 'system.admin', description: 'Administer global system configuration and sensitive platform controls', resource: 'system', action: 'admin' },

  // --- Override ---
  { code: 'override.execute', description: 'Execute controlled override actions with mandatory reason and audit logging', resource: 'override', action: 'execute' },

  // --- Cross-Project ---
  { code: 'cross_project.read', description: 'Read approved data across multiple projects where authorized', resource: 'cross_project', action: 'read' },

  // --- Screen-level access ---
  { code: 'screen.admin_users', description: 'Access the Admin Users screen', resource: 'screen', action: 'admin_users' },
  { code: 'screen.admin_roles_permissions', description: 'Access the Admin Roles and Permissions screen', resource: 'screen', action: 'admin_roles_permissions' },
  { code: 'screen.admin_project_assignments', description: 'Access the Admin Project Assignments screen', resource: 'screen', action: 'admin_project_assignments' },
  { code: 'screen.admin_entities', description: 'Access the Admin Entities screen', resource: 'screen', action: 'admin_entities' },
  { code: 'screen.admin_workflow_templates', description: 'Access the Admin Workflow Templates screen', resource: 'screen', action: 'admin_workflow_templates' },
  { code: 'screen.admin_reference_data', description: 'Access the Admin Reference Data screen', resource: 'screen', action: 'admin_reference_data' },
  { code: 'screen.admin_notification_templates', description: 'Access the Admin Notification Templates screen', resource: 'screen', action: 'admin_notification_templates' },
  { code: 'screen.admin_audit_log', description: 'Access the Admin Audit Log screen', resource: 'screen', action: 'admin_audit_log' },
  { code: 'screen.admin_posting_exceptions', description: 'Access the Admin Posting Exceptions screen', resource: 'screen', action: 'admin_posting_exceptions' },
  { code: 'screen.admin_system_health', description: 'Access the Admin System Health and Jobs screen', resource: 'screen', action: 'admin_system_health' },
  { code: 'screen.admin_override_log', description: 'Access the Admin Override Log screen', resource: 'screen', action: 'admin_override_log' },
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
