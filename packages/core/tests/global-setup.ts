/**
 * Vitest global setup — runs once before the entire test suite.
 *
 * Ensures workflow templates are in a clean state (active) before tests start.
 * This handles the case where a previous test run deactivated templates and
 * the test process exited before reactivating them.
 */
import { prisma } from '@fmksa/db';

export async function setup() {
  // Reactivate any templates that were left deactivated by a previous run
  await prisma.workflowTemplate.updateMany({
    where: { isActive: false, code: { in: ['ipa_standard', 'ipc_standard', 'rfq_standard', 'variation_standard', 'variation_with_finance', 'letter_standard', 'letter_with_sign', 'notice_standard', 'claim_standard', 'claim_with_finance', 'back_charge_standard'] } },
    data: { isActive: true },
  });
}

export async function teardown() {
  // Reactivate templates that tests may have deactivated
  await prisma.workflowTemplate.updateMany({
    where: { isActive: false, code: { in: ['ipa_standard', 'ipc_standard', 'rfq_standard', 'variation_standard', 'variation_with_finance', 'letter_standard', 'letter_with_sign', 'notice_standard', 'claim_standard', 'claim_with_finance', 'back_charge_standard'] } },
    data: { isActive: true },
  });
  await prisma.$disconnect();
}
