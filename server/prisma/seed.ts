import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export async function seed(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const saltRounds = 10;

  if (isProduction) {
    const prodAdminPassword = process.env.SEED_ADMIN_PASSWORD;
    const prodAdminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@whatsss.local';

    if (!prodAdminPassword || prodAdminPassword.length < 12) {
      console.warn(
        'Production environment detected: Demo accounts are strictly disabled. ' +
        'To provision an initial administrator, configure SEED_ADMIN_PASSWORD (min 12 chars). Skipping seeding.'
      );
      return;
    }

    // Check if an administrator account already exists to prevent unexpected credential/role resets on re-deploy
    const existingAdmin = await prisma.user.findFirst({
      where: {
        OR: [
          { username: 'admin' },
          { role: 'ADMIN' }
        ]
      }
    });

    if (existingAdmin) {
      console.log(
        'Production administrator account already exists. Preserving existing credentials and role without mutation.'
      );
      return;
    }

    const adminHash = await bcrypt.hash(prodAdminPassword, saltRounds);
    await prisma.user.create({
      data: {
        username: 'admin',
        email: prodAdminEmail,
        password_hash: adminHash,
        role: 'ADMIN',
        is_active: true
      }
    });

    console.log('Production initial administrator account provisioned securely.');
    return;
  }

  // Development and Test seeding with well-known test fixtures
  const demoPassword = 'Password123!';
  const passwordHash = await bcrypt.hash(demoPassword, saltRounds);

  // Seed user_demo (USER)
  await prisma.user.upsert({
    where: { username: 'user_demo' },
    update: { password_hash: passwordHash, role: 'USER', is_active: true },
    create: {
      username: 'user_demo',
      email: 'user_demo@whatsss.local',
      password_hash: passwordHash,
      role: 'USER',
      is_active: true
    }
  });

  // Seed user_other (USER)
  await prisma.user.upsert({
    where: { username: 'user_other' },
    update: { password_hash: passwordHash, role: 'USER', is_active: true },
    create: {
      username: 'user_other',
      email: 'user_other@whatsss.local',
      password_hash: passwordHash,
      role: 'USER',
      is_active: true
    }
  });

  // Seed admin_demo (ADMIN)
  await prisma.user.upsert({
    where: { username: 'admin_demo' },
    update: { password_hash: passwordHash, role: 'ADMIN', is_active: true },
    create: {
      username: 'admin_demo',
      email: 'admin_demo@whatsss.local',
      password_hash: passwordHash,
      role: 'ADMIN',
      is_active: true
    }
  });

  console.log('Development seeding completed successfully.');
}

if (process.argv[1]?.includes('seed')) {
  seed()
    .catch((e) => {
      console.error('Seeding error occurred:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
