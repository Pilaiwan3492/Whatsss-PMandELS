import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const defaultPrisma = new PrismaClient();

export async function seed(client: PrismaClient = defaultPrisma): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const saltRounds = 10;

  if (isProduction) {
    const prodAdminPassword = process.env.SEED_ADMIN_PASSWORD;
    const prodAdminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@whatsss.local';

    // Case 4: No SEED_ADMIN_PASSWORD or password < 12 chars
    if (!prodAdminPassword || prodAdminPassword.length < 12) {
      console.warn(
        'Production environment detected: Demo accounts are strictly disabled. ' +
        'To provision an initial administrator, configure SEED_ADMIN_PASSWORD (min 12 chars). Skipping seeding.'
      );
      return;
    }

    // Case 2: Check if an administrator account already exists (role === 'ADMIN')
    const existingAdmin = await client.user.findFirst({
      where: { role: 'ADMIN' }
    });

    if (existingAdmin) {
      console.log(
        'Production administrator account already exists. Preserving existing credentials and role without mutation.'
      );
      return;
    }

    // Case 3: Check if username "admin" is already taken by a non-ADMIN account
    const usernameConflict = await client.user.findUnique({
      where: { username: 'admin' }
    });

    if (usernameConflict) {
      throw new Error(
        'FATAL: Username "admin" already exists with non-ADMIN role. ' +
        'Cannot provision production administrator due to username conflict.'
      );
    }

    // Case 1: No admin exists and username "admin" is available -> provision initial admin
    const adminHash = await bcrypt.hash(prodAdminPassword, saltRounds);
    await client.user.create({
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
  await client.user.upsert({
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
  await client.user.upsert({
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

  // NOTE: Hardcoded demo credentials are for local development/testing environments only.
  // Production admin account provisioning must be configured using environment secrets.
  // Seed admin_demo (ADMIN)
  await client.user.upsert({
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
      await defaultPrisma.$disconnect();
    });
}
