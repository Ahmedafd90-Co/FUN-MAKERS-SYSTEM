/**
 * Hard sentinel-leakage check on FMKSA-2026-001 commercial demo surface.
 * Any non-zero on user-facing fields means demo is NOT safe for walkthrough.
 */
import { prisma } from '@fmksa/db';

async function main() {
  const project = await prisma.project.findUnique({
    where: { code: 'FMKSA-2026-001' },
    select: { id: true, code: true },
  });
  if (!project) throw new Error('Project not found');

  const pid = project.id;

  // Count any commercial row with literal sentinel markers in user-visible fields.
  const [
    ipaSeedBy,
    ipaDemoDesc,
    ipaE2eDesc,
    ipcSeedBy,
    varSeedBy,
    invSeedBy,
    colSeedBy,
  ] = await Promise.all([
    prisma.ipa.count({ where: { projectId: pid, createdBy: 'seed' } }),
    prisma.ipa.count({ where: { projectId: pid, description: 'DEMO_SEED' } }),
    prisma.ipa.count({
      where: { projectId: pid, description: { contains: 'E2E_DEMO_SEED' } },
    }),
    prisma.ipc.count({ where: { projectId: pid, createdBy: 'seed' } }),
    prisma.variation.count({ where: { projectId: pid, createdBy: 'seed' } }),
    prisma.taxInvoice.count({ where: { projectId: pid, createdBy: 'seed' } }),
    prisma.invoiceCollection.count({
      where: { taxInvoice: { projectId: pid }, recordedBy: 'seed' },
    }),
  ]);

  // Per-event-type counts on the posting ledger (project-scoped).
  const eventTypes = [
    'IPA_APPROVED',
    'IPC_SIGNED',
    'TAX_INVOICE_ISSUED',
    'VARIATION_APPROVED_INTERNAL',
    'VARIATION_APPROVED_CLIENT',
    'PO_COMMITTED',
    'SUPPLIER_INVOICE_APPROVED',
    'EXPENSE_APPROVED',
  ];
  const eventCounts: Record<string, number> = {};
  for (const et of eventTypes) {
    eventCounts[et] = await prisma.postingEvent.count({
      where: { projectId: pid, eventType: et },
    });
  }

  console.log('\n=== SENTINEL LEAKAGE CHECK — FMKSA-2026-001 ===\n');
  console.log('User-facing sentinel rows (target: zero on each):');
  console.log(`  IPAs with createdBy='seed':                    ${ipaSeedBy}`);
  console.log(`  IPAs with description='DEMO_SEED':             ${ipaDemoDesc}`);
  console.log(`  IPAs with description contains E2E_DEMO_SEED:  ${ipaE2eDesc}`);
  console.log(`  IPCs with createdBy='seed':                    ${ipcSeedBy}`);
  console.log(`  Variations with createdBy='seed':              ${varSeedBy}`);
  console.log(`  Tax Invoices with createdBy='seed':            ${invSeedBy}`);
  console.log(`  Invoice Collections with recordedBy='seed':    ${colSeedBy}`);

  console.log('\nPosting-event counts (project-scoped):');
  for (const et of eventTypes) {
    console.log(`  ${et.padEnd(32)} ${eventCounts[et]}`);
  }

  const anyUserFacing =
    ipaSeedBy + ipaDemoDesc + ipcSeedBy + varSeedBy + invSeedBy + colSeedBy;
  console.log(
    `\nTotal user-facing sentinel leakage on commercial demo slice: ${anyUserFacing}`,
  );
  console.log(
    `Imported historical IPA E2E_DEMO_SEED marker (internal description, not user-facing primary label): ${ipaE2eDesc}`,
  );

  await prisma.$disconnect();

  if (anyUserFacing > 0) {
    console.error(
      '\n✗ Sentinel leakage detected — commercial demo is NOT safe for walkthrough.',
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
