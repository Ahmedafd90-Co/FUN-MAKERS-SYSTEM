import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  const rows: any[] = await p.$queryRaw`
    SELECT wt.code AS template, ws.order_index, ws.name, ws.outcome_type
    FROM workflow_steps ws
    JOIN workflow_templates wt ON ws.template_id = wt.id
    ORDER BY wt.code, ws.order_index
  `;

  console.log('TEMPLATE                     IDX  STEP NAME                        OUTCOME');
  console.log('─'.repeat(95));
  for (const r of rows) {
    console.log(
      `${r.template.padEnd(28)} ${String(r.order_index).padStart(3)}  ${r.name.padEnd(32)} ${r.outcome_type}`,
    );
  }

  // Summary
  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.outcome_type] = (counts[r.outcome_type] ?? 0) + 1;
  }
  console.log('\nSummary:', counts);
  console.log(`Total steps: ${rows.length}`);

  await p.$disconnect();
}

main();
