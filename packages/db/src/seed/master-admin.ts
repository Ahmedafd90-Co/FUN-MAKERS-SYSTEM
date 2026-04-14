import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const MASTER_ADMIN_EMAIL = 'ahmedafd90@gmail.com';
const MASTER_ADMIN_NAME = 'Ahmed Al-Dossary';
const DEFAULT_PASSWORD = 'ChangeMe!Demo2026';
const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Demo team — realistic users across different roles
// ---------------------------------------------------------------------------

const DEMO_USERS = [
  { email: 'khalid.rashid@fmksa.demo', name: 'Khalid Al-Rashid', roleCode: 'project_manager' },
  { email: 'sara.fahad@fmksa.demo', name: 'Sara Al-Fahad', roleCode: 'qs_commercial' },
  { email: 'omar.hassan@fmksa.demo', name: 'Omar Hassan', roleCode: 'procurement' },
  { email: 'fatima.zahrani@fmksa.demo', name: 'Fatima Al-Zahrani', roleCode: 'finance' },
] as const;

// Project codes where demo users get assigned
const DEMO_PROJECT_CODES = ['FMKSA-2026-001', 'FMKSA-2026-002', 'FMKSA-2026-003', 'FMKSA-DEMO-001'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureUserRole(
  prisma: PrismaClient,
  userId: string,
  roleId: string,
  assignedBy: string,
) {
  const existing = await prisma.userRole.findFirst({
    where: { userId, roleId, effectiveTo: null },
  });
  if (!existing) {
    await prisma.userRole.create({
      data: {
        userId,
        roleId,
        effectiveFrom: new Date(),
        assignedBy,
        assignedAt: new Date(),
      },
    });
  }
}

async function ensureProjectAssignment(
  prisma: PrismaClient,
  projectId: string,
  userId: string,
  roleId: string,
  assignedBy: string,
) {
  const existing = await prisma.projectAssignment.findFirst({
    where: { projectId, userId, roleId, revokedAt: null },
  });
  if (!existing) {
    await prisma.projectAssignment.create({
      data: {
        projectId,
        userId,
        roleId,
        effectiveFrom: new Date(),
        assignedBy,
        assignedAt: new Date(),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Main seed
// ---------------------------------------------------------------------------

export async function seedMasterAdmin(prisma: PrismaClient) {
  console.log('  Seeding Master Admin + demo users...');

  // Resolve password — same for all demo users
  const password = process.env.SEED_MASTER_ADMIN_PASSWORD || DEFAULT_PASSWORD;
  if (!process.env.SEED_MASTER_ADMIN_PASSWORD) {
    console.warn(
      '  ⚠ SEED_MASTER_ADMIN_PASSWORD not set — using default password. Change it before deploying!',
    );
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // ---- Master Admin ----
  const admin = await prisma.user.upsert({
    where: { email: MASTER_ADMIN_EMAIL },
    create: {
      email: MASTER_ADMIN_EMAIL,
      name: MASTER_ADMIN_NAME,
      passwordHash,
      status: 'active',
    },
    update: {
      name: MASTER_ADMIN_NAME,
      status: 'active',
    },
  });

  const adminRole = await prisma.role.findUnique({ where: { code: 'master_admin' } });
  if (!adminRole) {
    throw new Error('Role master_admin not found. Run roles seed first.');
  }
  await ensureUserRole(prisma, admin.id, adminRole.id, admin.id);

  // ---- Load all demo projects ----
  const projects = await prisma.project.findMany({
    where: { code: { in: DEMO_PROJECT_CODES } },
  });
  if (projects.length === 0) {
    throw new Error('No demo projects found. Run sample-project seed first.');
  }

  // Assign admin to all projects
  for (const project of projects) {
    await ensureProjectAssignment(prisma, project.id, admin.id, adminRole.id, admin.id);
  }

  // ---- Demo Users ----
  for (const demoUser of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      create: {
        email: demoUser.email,
        name: demoUser.name,
        passwordHash,
        status: 'active',
      },
      update: {
        name: demoUser.name,
        status: 'active',
      },
    });

    const role = await prisma.role.findUnique({ where: { code: demoUser.roleCode } });
    if (!role) {
      console.warn(`  ⚠ Role ${demoUser.roleCode} not found — skipping ${demoUser.name}`);
      continue;
    }

    await ensureUserRole(prisma, user.id, role.id, admin.id);

    // Assign to all demo projects
    for (const project of projects) {
      await ensureProjectAssignment(prisma, project.id, user.id, role.id, admin.id);
    }
  }

  console.log(`  ✓ Master Admin seeded (${MASTER_ADMIN_EMAIL})`);
  console.log(`  ✓ ${DEMO_USERS.length} demo users seeded across ${projects.length} projects`);
}
