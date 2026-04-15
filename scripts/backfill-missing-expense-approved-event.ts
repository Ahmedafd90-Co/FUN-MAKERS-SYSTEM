/**
 * One-shot data backfill — restores the missing EXPENSE_APPROVED posting
 * event for the approved Expense on FMKSA-2026-001.
 *
 * Root cause: the e2e-demo seed (`packages/db/src/seed/e2e-demo.ts`) is
 * idempotent via a CostProposal anchor. On the first run it creates the
 * Expense record AND emits EXPENSE_APPROVED. Between runs, an earlier
 * cleanup pass removed the posting event but not the Expense row, and the
 * seed's idempotency guard then prevented re-emission. Today the DB has
 * 1 approved Expense (amount 12,500) on FMKSA-2026-001 but zero matching
 * EXPENSE_APPROVED events, producing a 12,500 mismatched delta on the
 * Actual Cost reconciliation row.
 *
 * Live code path is correct: `packages/core/src/procurement/expense/service.ts`
 * emits EXPENSE_APPROVED when an expense transitions to approved via the
 * service layer. The bug is seed-level, not emitter-level.
 *
 * Fix: emit the exact posting event the seed would have emitted, using
 * the same idempotency key (`e2e-demo-expense-approved-${expenseId}`) so
 * any future full seed re-run won't duplicate it.
 *
 * Narrow scope: does nothing if the event already exists, does not touch
 * any other project, does not alter the Expense record itself.
 */
import { prisma } from '@fmksa/db';

async function main() {
  const project = await prisma.project.findUnique({
    where: { code: 'FMKSA-2026-001' },
    select: { id: true, entityId: true, currencyCode: true, code: true },
  });
  if (!project) throw new Error('Project FMKSA-2026-001 not found.');

  console.log(`\n=== BACKFILL — missing EXPENSE_APPROVED on ${project.code} ===\n`);

  // Find approved expenses on this project that don't already have a posted
  // EXPENSE_APPROVED event (typically exactly one seeded row, but we handle
  // the general case without hardcoding ids).
  const approvedExpenses = await prisma.expense.findMany({
    where: {
      projectId: project.id,
      status: { in: ['approved', 'paid', 'closed'] },
    },
    select: { id: true, subtype: true, amount: true, currency: true, createdAt: true },
  });

  console.log(`Found ${approvedExpenses.length} approved Expense(s) on this project.`);

  let created = 0;
  let skipped = 0;

  for (const exp of approvedExpenses) {
    const existingEvent = await prisma.postingEvent.findFirst({
      where: {
        projectId: project.id,
        eventType: 'EXPENSE_APPROVED',
        sourceRecordType: 'expense',
        sourceRecordId: exp.id,
      },
      select: { id: true, status: true },
    });

    if (existingEvent) {
      console.log(
        `  ✓ Expense ${exp.id.slice(0, 8)} already has EXPENSE_APPROVED event ` +
          `(${existingEvent.id.slice(0, 8)}, status=${existingEvent.status}) — skipping.`,
      );
      skipped++;
      continue;
    }

    const created_ = await prisma.postingEvent.create({
      data: {
        eventType: 'EXPENSE_APPROVED',
        sourceService: 'procurement',
        sourceRecordType: 'expense',
        sourceRecordId: exp.id,
        projectId: project.id,
        entityId: project.entityId,
        idempotencyKey: `e2e-demo-expense-approved-${exp.id}`,
        payloadJson: {
          expenseId: exp.id,
          subtype: exp.subtype,
          amount: exp.amount.toFixed(2),
          currency: exp.currency,
          projectId: project.id,
        },
        status: 'posted',
        origin: 'live',
        postedAt: exp.createdAt,
      },
    });

    console.log(
      `  + Emitted EXPENSE_APPROVED for expense ${exp.id.slice(0, 8)} ` +
        `(event ${created_.id.slice(0, 8)}, amount ${exp.amount.toString()} ${exp.currency})`,
    );
    created++;
  }

  console.log(`\nDone. Created ${created} event(s), skipped ${skipped}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
