import type { PrismaClient } from '@prisma/client';

const ROLES = [
  { code: 'master_admin', name: 'Master Admin', description: 'Full platform control, overrides, system administration' },
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
