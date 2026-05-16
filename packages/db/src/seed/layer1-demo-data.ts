/**
 * PIC-33 — populate Layer 1 (ProjectParticipants + PrimeContracts) for the
 * four demo projects. Without this, Participants and Prime Contract tabs render
 * empty on the demo walkthrough.
 *
 * Pattern:
 *   - 4 external "client" entities (one per project) representing the
 *     contracting party on the other side of the Prime Contract.
 *   - 1 shared consultant/engineer entity referenced as the `design` role
 *     across all 4 projects.
 *   - For each project: 4 participants (prime + client + design + sub) and
 *     1 PrimeContract in 'active' state pegged to project.contractValue
 *     (falling back to a representative value if unset).
 *
 * Idempotent: all writes are upserts keyed on stable codes.
 *
 * Seeded entities use the EntityType most appropriate for an external party
 * (`operating_unit` is neutral; the schema has no `client` type — see
 * EntityType enum).
 */
import type { PrismaClient, ProjectParticipantRole } from '@prisma/client';

// ---------------------------------------------------------------------------
// External entity registry (clients + design consultant)
// ---------------------------------------------------------------------------

const CLIENT_ENTITIES: Array<{ projectCode: string; entityCode: string; name: string }> = [
  { projectCode: 'FMKSA-2026-001', entityCode: 'CLIENT-RCU', name: 'Royal Commission for AlUla' },
  { projectCode: 'FMKSA-2026-002', entityCode: 'CLIENT-GEA', name: 'General Entertainment Authority' },
  { projectCode: 'FMKSA-2026-003', entityCode: 'CLIENT-JDC', name: 'Jeddah Development Co.' },
  { projectCode: 'FMKSA-DEMO-001', entityCode: 'CLIENT-DEMO', name: 'Demo Client Sponsor' },
];

const DESIGN_ENTITY = {
  code: 'CONSULT-DAR',
  name: 'Dar Al-Handasah Consultants',
};

const SUB_ENTITY = {
  code: 'SUB-AVENG',
  name: 'Aveng Construction Services',
};

// Fallback PrimeContract values for projects whose contractValue is null.
// Cleaner to keep Al Yamamah's seeded 25M and supply representative numbers
// for the others rather than mutating projects.
const FALLBACK_CONTRACT_VALUES: Record<string, number> = {
  'FMKSA-2026-002': 18_500_000,
  'FMKSA-2026-003': 12_750_000,
  'FMKSA-DEMO-001': 5_000_000,
};

// ---------------------------------------------------------------------------
// Seed entrypoint
// ---------------------------------------------------------------------------

export async function seedLayer1DemoData(prisma: PrismaClient) {
  console.log('  Seeding Layer 1 demo data (participants + prime contracts)...');

  // Resolve the actor for createdBy. Layer 1 FK requires a real user.
  // Match the master-admin seed (packages/db/src/seed/master-admin.ts MASTER_ADMIN_EMAIL).
  const seedActor = await prisma.user.findFirst({
    where: { email: 'ahmedafd90@gmail.com' },
    select: { id: true },
  });
  if (!seedActor) {
    console.warn('  ⚠ Layer 1 demo data skipped: master_admin user not found (run master-admin seed first).');
    return;
  }
  const actorId = seedActor.id;

  // Resolve the FMKSA-OPS entity — it plays the prime_contractor role on every
  // demo project (Pico Play's primary delivery entity).
  const opsEntity = await prisma.entity.findUnique({ where: { code: 'FMKSA-OPS' } });
  if (!opsEntity) {
    console.warn('  ⚠ Layer 1 demo data skipped: FMKSA-OPS entity not found.');
    return;
  }

  // 1. Upsert shared external entities (design + sub).
  const designEntity = await prisma.entity.upsert({
    where: { code: DESIGN_ENTITY.code },
    create: { code: DESIGN_ENTITY.code, name: DESIGN_ENTITY.name, type: 'operating_unit', status: 'active' },
    update: { name: DESIGN_ENTITY.name, status: 'active' },
  });
  const subEntity = await prisma.entity.upsert({
    where: { code: SUB_ENTITY.code },
    create: { code: SUB_ENTITY.code, name: SUB_ENTITY.name, type: 'operating_unit', status: 'active' },
    update: { name: SUB_ENTITY.name, status: 'active' },
  });

  let participantsCreated = 0;
  let primeContractsCreated = 0;

  for (const client of CLIENT_ENTITIES) {
    const project = await prisma.project.findUnique({ where: { code: client.projectCode } });
    if (!project) continue;

    // 2. Upsert the per-project client entity.
    const clientEntity = await prisma.entity.upsert({
      where: { code: client.entityCode },
      create: { code: client.entityCode, name: client.name, type: 'operating_unit', status: 'active' },
      update: { name: client.name, status: 'active' },
    });

    // 3. Upsert the four participants per project: prime, client, design, sub.
    const participants: Array<{ entityId: string; role: ProjectParticipantRole; isPrime: boolean }> = [
      { entityId: opsEntity.id, role: 'prime_contractor', isPrime: true },
      { entityId: clientEntity.id, role: 'management', isPrime: false },
      { entityId: designEntity.id, role: 'design', isPrime: false },
      { entityId: subEntity.id, role: 'sub_contractor', isPrime: false },
    ];

    for (const p of participants) {
      const existing = await prisma.projectParticipant.findUnique({
        where: { project_entity_unique: { projectId: project.id, entityId: p.entityId } },
      });
      if (existing) continue;
      await prisma.projectParticipant.create({
        data: {
          projectId: project.id,
          entityId: p.entityId,
          role: p.role,
          isPrime: p.isPrime,
          createdBy: actorId,
        },
      });
      participantsCreated++;
    }

    // 4. Upsert the PrimeContract (1:1 with project).
    const existingPC = await prisma.primeContract.findUnique({ where: { projectId: project.id } });
    if (!existingPC) {
      const contractValue =
        project.contractValue?.toString() != null
          ? project.contractValue
          : FALLBACK_CONTRACT_VALUES[client.projectCode] ?? 1_000_000;

      const signedDate = project.startDate
        ? new Date(project.startDate.getTime() - 45 * 24 * 60 * 60 * 1000)
        : new Date('2025-12-01');
      const effectiveDate = project.startDate ?? new Date('2026-01-15');

      await prisma.primeContract.create({
        data: {
          projectId: project.id,
          contractingEntityId: opsEntity.id, // Pico Play's contracting entity
          clientName: client.name,
          clientReference: `${client.entityCode}-${project.code}`,
          contractValue,
          contractCurrency: project.currencyCode ?? 'SAR',
          signedDate,
          effectiveDate,
          expectedCompletionDate: project.endDate,
          status: 'active',
          createdBy: actorId,
        },
      });
      primeContractsCreated++;

      // Sync Project.primeContractId pointer for the denormalized cache.
      const newlyCreated = await prisma.primeContract.findUnique({
        where: { projectId: project.id },
        select: { id: true },
      });
      if (newlyCreated) {
        await prisma.project.update({
          where: { id: project.id },
          data: { primeContractId: newlyCreated.id },
        });
      }
    }
  }

  console.log(
    `  ✓ Layer 1 demo data: ${participantsCreated} ProjectParticipants and ${primeContractsCreated} PrimeContracts seeded across ${CLIENT_ENTITIES.length} demo projects.`,
  );
}
