import { PrismaClient } from '@prisma/client';
import { validateEnv } from '@config/env.schema';
import { assertNonProduction } from '@common/utils/environment.util';
import { seedSyntheticBaseline } from './seed-synthetic';

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  assertNonProduction('seed:synthetic', env.NODE_ENV);

  const prisma = new PrismaClient();
  try {
    const summary = await seedSyntheticBaseline(prisma, env.NODE_ENV);
    process.stdout.write(
      `${JSON.stringify({ event: 'synthetic_seed_completed', environment: env.NODE_ENV, summary })}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
