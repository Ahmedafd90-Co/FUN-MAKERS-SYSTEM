import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const userId = 'c21a00a8-cd48-4304-b818-4c2bd6e6e4a0';
const projectId = 'a70336f4-5df3-418f-850f-d7bf1ce903e7';

async function main() {
  const proj = await p.project.findUnique({ where: { id: projectId }, select: { entityId: true } });
  console.log('Project entity:', proj.entityId);

  // Create vendors
  const vendor = await p.vendor.create({
    data: {
      entityId: proj.entityId,
      vendorCode: 'VND-001',
      name: 'Al-Rajhi Construction Materials',
      contactName: 'Faisal Al-Rajhi',
      contactEmail: 'faisal@alrajhi-materials.sa',
      contactPhone: '+966-11-555-0001',
      city: 'Riyadh',
      country: 'SA',
      status: 'active',
      createdBy: userId,
    }
  });
  console.log('Vendor created:', vendor.id);

  const vendor2 = await p.vendor.create({
    data: {
      entityId: proj.entityId,
      vendorCode: 'VND-002',
      name: 'Saudi Steel & Pipes Co.',
      contactName: 'Mohammed Al-Harbi',
      contactEmail: 'mohammed@saudisteel.sa',
      contactPhone: '+966-11-555-0002',
      city: 'Jeddah',
      country: 'SA',
      status: 'active',
      createdBy: userId,
    }
  });
  console.log('Vendor2 created:', vendor2.id);

  // Link vendors to project
  await p.projectVendor.createMany({
    data: [
      { projectId, vendorId: vendor.id, addedBy: userId },
      { projectId, vendorId: vendor2.id, addedBy: userId },
    ]
  });
  console.log('Vendors linked to project');

  // Create RFQ
  const rfq = await p.$queryRaw`
    INSERT INTO rfqs (id, project_id, rfq_number, title, description, currency, status, created_by, created_at, updated_at)
    VALUES (gen_random_uuid(), ${projectId}, 'FMKSA-DEMO-001-RFQ-001', 'Steel reinforcement bars for foundation', 'Supply of 16mm and 20mm rebar for Phase 1 foundation works', 'SAR', 'draft', ${userId}, NOW(), NOW())
    RETURNING id, rfq_number
  `;
  console.log('RFQ created:', JSON.stringify(rfq));
  const rfqId = rfq[0].id;

  // Link vendors to RFQ
  await p.$executeRaw`
    INSERT INTO rfq_vendors (id, rfq_id, vendor_id, status, invited_at, created_at, updated_at)
    VALUES
      (gen_random_uuid(), ${rfqId}, ${vendor.id}, 'invited', NOW(), NOW(), NOW()),
      (gen_random_uuid(), ${rfqId}, ${vendor2.id}, 'invited', NOW(), NOW(), NOW())
  `;
  console.log('RFQ vendors linked');

  // Add RFQ items
  await p.$executeRaw`
    INSERT INTO rfq_items (id, rfq_id, description, quantity, unit, sort_order, created_at, updated_at)
    VALUES
      (gen_random_uuid(), ${rfqId}, 'Rebar 16mm Grade 60 - 12m lengths', 500, 'TON', 1, NOW(), NOW()),
      (gen_random_uuid(), ${rfqId}, 'Rebar 20mm Grade 60 - 12m lengths', 300, 'TON', 2, NOW(), NOW())
  `;
  console.log('RFQ items added');

  // Create a quotation for vendor 1
  const quot = await p.$queryRaw`
    INSERT INTO quotations (id, project_id, rfq_id, vendor_id, total_amount, currency, received_date, valid_until, payment_terms, delivery_terms, status, created_by, created_at, updated_at)
    VALUES (gen_random_uuid(), ${projectId}, ${rfqId}, ${vendor.id}, 875000.00, 'SAR', NOW(), NOW() + INTERVAL '30 days', 'Net 30', 'FOB Riyadh', 'received', ${userId}, NOW(), NOW())
    RETURNING id
  `;
  console.log('Quotation created:', JSON.stringify(quot));
  const quotId = quot[0].id;

  // Add quotation line items
  await p.$executeRaw`
    INSERT INTO quotation_line_items (id, quotation_id, description, quantity, unit, unit_price, total_price, sort_order, created_at, updated_at)
    VALUES
      (gen_random_uuid(), ${quotId}, 'Rebar 16mm Grade 60 - 12m lengths', 500, 'TON', 1050.00, 525000.00, 1, NOW(), NOW()),
      (gen_random_uuid(), ${quotId}, 'Rebar 20mm Grade 60 - 12m lengths', 300, 'TON', 1166.67, 350000.00, 2, NOW(), NOW())
  `;
  console.log('Quotation line items added');

  // Create a second quotation for vendor 2
  const quot2 = await p.$queryRaw`
    INSERT INTO quotations (id, project_id, rfq_id, vendor_id, total_amount, currency, received_date, valid_until, payment_terms, delivery_terms, status, created_by, created_at, updated_at)
    VALUES (gen_random_uuid(), ${projectId}, ${rfqId}, ${vendor2.id}, 920000.00, 'SAR', NOW(), NOW() + INTERVAL '45 days', 'Net 45', 'DDP Riyadh', 'received', ${userId}, NOW(), NOW())
    RETURNING id
  `;
  console.log('Quotation2 created:', JSON.stringify(quot2));

  console.log('\n=== SUMMARY ===');
  console.log('RFQ ID:', rfqId);
  console.log('Quotation 1 ID:', quotId);
  console.log('Quotation 2 ID:', quot2[0].id);
  console.log('Vendor 1 ID:', vendor.id);
  console.log('Vendor 2 ID:', vendor2.id);

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
