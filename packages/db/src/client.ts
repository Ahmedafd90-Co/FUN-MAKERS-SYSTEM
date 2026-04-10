import { PrismaClient } from '@prisma/client';
import { signedImmutabilityExtension } from './middleware/signed-immutability';
import { noDeleteOnImmutableExtension } from './middleware/no-delete-on-immutable';

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })
    .$extends(signedImmutabilityExtension)
    .$extends(noDeleteOnImmutableExtension);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
