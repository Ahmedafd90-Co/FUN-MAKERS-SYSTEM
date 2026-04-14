import type { PrismaClient } from '@prisma/client';

/**
 * Removes orphaned test data left behind by interrupted vitest runs.
 *
 * Uses a whitelist approach: anything NOT matching known seed codes is test data.
 * Runs in a single transaction with session_replication_role = replica to
 * bypass FK constraints (Prisma generates non-deferrable FKs).
 */
export async function cleanTestData(prisma: PrismaClient) {
  console.log('  Cleaning orphaned test data...');

  const SEED_PROJECT_CODES = ['FMKSA-2026-001', 'FMKSA-2026-002', 'FMKSA-2026-003', 'FMKSA-DEMO-001'];
  const SEED_ENTITY_CODES = ['PICOPLAY-KSA', 'FMKSA-OPS', 'FMKSA-RUH', 'FMKSA-JED'];
  const SEED_USER_EMAILS = [
    'ahmedafd90@gmail.com',
    'khalid.rashid@fmksa.demo',
    'sara.fahad@fmksa.demo',
    'omar.hassan@fmksa.demo',
    'fatima.zahrani@fmksa.demo',
  ];

  const testProjects = await prisma.project.findMany({
    where: { code: { notIn: SEED_PROJECT_CODES } },
    select: { id: true },
  });
  const testEntities = await prisma.entity.findMany({
    where: { code: { notIn: SEED_ENTITY_CODES } },
    select: { id: true },
  });
  const testUsers = await prisma.user.findMany({
    where: { email: { notIn: SEED_USER_EMAILS } },
    select: { id: true },
  });

  const pIds = testProjects.map((p) => p.id);
  const eIds = testEntities.map((e) => e.id);
  const uIds = testUsers.map((u) => u.id);

  // --- Junk roles & workflow templates (test harness artifacts) ---
  // These are NOT whitelist-based — they match specific junk patterns that
  // automated tests create. Safe to run even on a fresh seed.
  const junkRoleCount = await prisma.role.count({
    where: { isSystem: false },
  });
  const junkTemplateCount = await prisma.workflowTemplate.count({
    where: {
      OR: [
        { code: { startsWith: 'AC-TPL-' } },
        { code: { startsWith: 'wf-eh-' } },
        { code: '1234' },
      ],
    },
  });

  if (pIds.length === 0 && eIds.length === 0 && uIds.length === 0 && junkRoleCount === 0 && junkTemplateCount === 0) {
    console.log('  ✓ No orphaned test data found');
    return;
  }

  const pList = pIds.length > 0 ? pIds.map((id) => `'${id}'`).join(',') : "'__none__'";
  const eList = eIds.length > 0 ? eIds.map((id) => `'${id}'`).join(',') : "'__none__'";
  const uList = uIds.length > 0 ? uIds.map((id) => `'${id}'`).join(',') : "'__none__'";

  // All table names verified against information_schema.tables.
  // session_replication_role = replica disables ALL triggers (including FK checks)
  // within this transaction, so order doesn't matter. No try-catch needed.
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET session_replication_role = 'replica'");

      // --- Project-scoped records ---
      await tx.$executeRawUnsafe(`DELETE FROM workflow_actions WHERE instance_id IN (SELECT id FROM workflow_instances WHERE project_id IN (${pList}))`);
      await tx.$executeRawUnsafe(`DELETE FROM workflow_instances WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM posting_exceptions WHERE event_id IN (SELECT id FROM posting_events WHERE project_id IN (${pList}))`);
      await tx.$executeRawUnsafe(`DELETE FROM posting_events WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM document_signatures WHERE version_id IN (SELECT dv.id FROM document_versions dv JOIN documents d ON dv.document_id = d.id WHERE d.project_id IN (${pList}))`);
      await tx.$executeRawUnsafe(`DELETE FROM document_versions WHERE document_id IN (SELECT id FROM documents WHERE project_id IN (${pList}))`);
      await tx.$executeRawUnsafe(`DELETE FROM documents WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM override_logs WHERE audit_log_id IN (SELECT id FROM audit_logs WHERE project_id IN (${pList}))`);
      await tx.$executeRawUnsafe(`DELETE FROM audit_logs WHERE project_id IN (${pList})`);
      // Commercial
      await tx.$executeRawUnsafe(`DELETE FROM ipcs WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM ipas WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM variations WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM cost_proposals WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM tax_invoices WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM correspondences WHERE project_id IN (${pList})`);
      // Procurement
      await tx.$executeRawUnsafe(`DELETE FROM quotation_line_items WHERE quotation_id IN (SELECT q.id FROM quotations q JOIN rfqs r ON q.rfq_id = r.id WHERE r.project_id IN (${pList}))`);
      await tx.$executeRawUnsafe(`DELETE FROM quotations WHERE rfq_id IN (SELECT id FROM rfqs WHERE project_id IN (${pList}))`);
      await tx.$executeRawUnsafe(`DELETE FROM rfq_items WHERE rfq_id IN (SELECT id FROM rfqs WHERE project_id IN (${pList}))`);
      await tx.$executeRawUnsafe(`DELETE FROM rfq_vendors WHERE rfq_id IN (SELECT id FROM rfqs WHERE project_id IN (${pList}))`);
      await tx.$executeRawUnsafe(`DELETE FROM rfqs WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM purchase_order_items WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE project_id IN (${pList}))`);
      await tx.$executeRawUnsafe(`DELETE FROM purchase_orders WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM supplier_invoices WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM credit_notes WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM framework_agreement_items WHERE framework_agreement_id IN (SELECT id FROM framework_agreements WHERE project_id IN (${pList}))`);
      await tx.$executeRawUnsafe(`DELETE FROM framework_agreements WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM vendor_contracts WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM project_vendors WHERE project_id IN (${pList})`);
      // Infrastructure
      await tx.$executeRawUnsafe(`DELETE FROM notifications WHERE user_id IN (${uList})`);
      await tx.$executeRawUnsafe(`DELETE FROM project_assignments WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM project_settings WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM screen_permissions WHERE project_id IN (${pList})`);
      await tx.$executeRawUnsafe(`DELETE FROM reference_counters WHERE project_id IN (${pList})`);
      // Projects
      await tx.$executeRawUnsafe(`DELETE FROM projects WHERE id IN (${pList})`);

      // --- Entities ---
      await tx.$executeRawUnsafe(`DELETE FROM procurement_categories WHERE entity_id IN (${eList})`);
      await tx.$executeRawUnsafe(`DELETE FROM item_catalogs WHERE entity_id IN (${eList})`);
      await tx.$executeRawUnsafe(`DELETE FROM vendors WHERE entity_id IN (${eList})`);
      await tx.$executeRawUnsafe(`DELETE FROM entities WHERE id IN (${eList})`);

      // --- Users ---
      await tx.$executeRawUnsafe(`DELETE FROM user_roles WHERE user_id IN (${uList})`);
      await tx.$executeRawUnsafe(`DELETE FROM user_sessions WHERE user_id IN (${uList})`);
      await tx.$executeRawUnsafe(`DELETE FROM notification_preferences WHERE user_id IN (${uList})`);
      await tx.$executeRawUnsafe(`DELETE FROM audit_logs WHERE actor_user_id IN (${uList})`);
      await tx.$executeRawUnsafe(`DELETE FROM users WHERE id IN (${uList})`);

      // --- Junk roles (test harness artifacts, is_system = false) ---
      await tx.$executeRawUnsafe(`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE is_system = false)`);
      await tx.$executeRawUnsafe(`DELETE FROM roles WHERE is_system = false`);

      // --- Junk workflow templates (test artifacts: AC-TPL-*, wf-eh-*, manual "1234") ---
      await tx.$executeRawUnsafe(`DELETE FROM workflow_steps WHERE template_id IN (SELECT id FROM workflow_templates WHERE code LIKE 'AC-TPL-%' OR code LIKE 'wf-eh-%' OR code = '1234')`);
      await tx.$executeRawUnsafe(`DELETE FROM workflow_templates WHERE code LIKE 'AC-TPL-%' OR code LIKE 'wf-eh-%' OR code = '1234'`);

      // Re-enable FK checks
      await tx.$executeRawUnsafe("SET session_replication_role = 'origin'");
    },
    { timeout: 30000 },
  );

  const parts: string[] = [];
  if (pIds.length > 0) parts.push(`${pIds.length} projects`);
  if (eIds.length > 0) parts.push(`${eIds.length} entities`);
  if (uIds.length > 0) parts.push(`${uIds.length} users`);
  if (junkRoleCount > 0) parts.push(`${junkRoleCount} junk roles`);
  if (junkTemplateCount > 0) parts.push(`${junkTemplateCount} junk templates`);
  console.log(`  ✓ Removed test data (${parts.join(', ')})`);
}
