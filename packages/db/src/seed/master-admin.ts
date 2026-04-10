import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const MASTER_ADMIN_EMAIL = 'ahmedafd90@gmail.com';
const MASTER_ADMIN_NAME = 'Ahmed Al-Dossary';
const DEFAULT_PASSWORD = 'ChangeMe!Demo2026';
const BCRYPT_ROUNDS = 12;

export async function seedMasterAdmin(prisma: PrismaClient) {
  console.log('  Seeding Master Admin user...');

  // Resolve password
  const password = process.env.SEED_MASTER_ADMIN_PASSWORD || DEFAULT_PASSWORD;
  if (!process.env.SEED_MASTER_ADMIN_PASSWORD) {
    console.warn(
      '  ⚠ SEED_MASTER_ADMIN_PASSWORD not set — using default password. Change it before deploying!',
    );
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Upsert user
  const user = await prisma.user.upsert({
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

  // Look up the master_admin role
  const role = await prisma.role.findUnique({ where: { code: 'master_admin' } });
  if (!role) {
    throw new Error('Role master_admin not found. Run roles seed first.');
  }

  // Upsert UserRole — use a stable lookup to avoid duplicates
  const existingUserRole = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: role.id, effectiveTo: null },
  });
  if (!existingUserRole) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
        effectiveFrom: new Date(),
        assignedBy: user.id,
        assignedAt: new Date(),
      },
    });
  }

  // Look up the demo project
  const project = await prisma.project.findUnique({ where: { code: 'FMKSA-DEMO-001' } });
  if (!project) {
    throw new Error('Project FMKSA-DEMO-001 not found. Run sample-project seed first.');
  }

  // Upsert ProjectAssignment — avoid duplicates
  const existingAssignment = await prisma.projectAssignment.findFirst({
    where: { projectId: project.id, userId: user.id, roleId: role.id, revokedAt: null },
  });
  if (!existingAssignment) {
    await prisma.projectAssignment.create({
      data: {
        projectId: project.id,
        userId: user.id,
        roleId: role.id,
        effectiveFrom: new Date(),
        assignedBy: user.id,
        assignedAt: new Date(),
      },
    });
  }

  console.log(`  ✓ Master Admin seeded (${MASTER_ADMIN_EMAIL})`);
}
