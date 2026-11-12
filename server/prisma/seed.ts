import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const defaultPrisma = new PrismaClient();

export async function seed(client: PrismaClient = defaultPrisma): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const saltRounds = 10;

  if (isProduction) {
    const prodAdminPassword = process.env.SEED_ADMIN_PASSWORD;
    const prodAdminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@whatsss.local';

    // 1. Provision or verify production administrator
    if (!prodAdminPassword || prodAdminPassword.length < 12) {
      console.warn(
        'Production environment detected: Demo accounts are strictly disabled. ' +
        'To provision an initial administrator, configure SEED_ADMIN_PASSWORD (min 12 chars). Skipping seeding.'
      );
      if (process.env.SEED_DEMO_DATA !== 'true') {
        return;
      }
    } else {
      // Case 2: Check if an administrator account already exists (role === 'ADMIN')
      const existingAdmin = await client.user.findFirst({
        where: { role: 'ADMIN' }
      });

      if (existingAdmin) {
        console.log(
          'Production administrator account already exists. Preserving existing credentials and role without mutation.'
        );
      } else {
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
      }
    }

    // 2. Demo user provisioning in production (only when explicitly enabled via SEED_DEMO_DATA=true)
    if (process.env.SEED_DEMO_DATA === 'true') {
      const demoPassword = process.env.SEED_DEMO_PASSWORD;
      const demoEmail = process.env.SEED_DEMO_EMAIL || 'user_demo@whatsss.local';

      if (!demoPassword || demoPassword.length < 12) {
        console.warn(
          'SEED_DEMO_DATA is true but SEED_DEMO_PASSWORD is missing or shorter than 12 characters. Skipping demo user seeding.'
        );
        return;
      }

      const existingDemoUser = await client.user.findUnique({
        where: { username: 'user_demo' }
      });

      let demoUser = existingDemoUser;

      if (!existingDemoUser) {
        const demoHash = await bcrypt.hash(demoPassword, saltRounds);
        demoUser = await client.user.create({
          data: {
            username: 'user_demo',
            email: demoEmail,
            password_hash: demoHash,
            role: 'USER',
            is_active: true
          }
        });
        console.log('Production demo user (user_demo) provisioned securely.');
      } else {
        console.log('Production demo user (user_demo) already exists. Preserving existing credentials.');
      }

      if (demoUser) {
        const standardAccounts = [
          { name: 'Checking Bank', type: 'CASH' as const },
          { name: 'Visa Credit Card', type: 'LOAN_TAKEN' as const },
          { name: 'Salary', type: 'INCOME' as const },
          { name: 'Dining', type: 'EXPENSE' as const },
          { name: 'Grocery', type: 'EXPENSE' as const }
        ];

        for (const acc of standardAccounts) {
          await client.account.upsert({
            where: {
              user_id_name: {
                user_id: demoUser.id,
                name: acc.name
              }
            },
            update: {},
            create: {
              user_id: demoUser.id,
              name: acc.name,
              type: acc.type,
              opening_balance: 0.00,
              is_opening_locked: false
            }
          });
        }
      }
    }

    return;
  }

  // Development and Test seeding with well-known test fixtures
  const demoPassword = 'Password123!';
  const passwordHash = await bcrypt.hash(demoPassword, saltRounds);

  // Seed user_demo (USER)
  const userDemo = await client.user.upsert({
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
  const userOther = await client.user.upsert({
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
  const adminDemo = await client.user.upsert({
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

  // Seed standard financial accounts for all demo users (user_demo, user_other, admin_demo)
  // In accordance with WP-02 and Issue #3 backlog specifications.
  // Note: While admin_demo has seeded baseline accounts in the database, API access to
  // financial endpoints remains strictly blocked with 403 Forbidden under BR-10.
  const standardAccounts = [
    { name: 'Checking Bank', type: 'CASH' as const },
    { name: 'Visa Credit Card', type: 'LOAN_TAKEN' as const },
    { name: 'Salary', type: 'INCOME' as const },
    { name: 'Dining', type: 'EXPENSE' as const },
    { name: 'Grocery', type: 'EXPENSE' as const }
  ];

  for (const user of [userDemo, userOther, adminDemo]) {
    for (const acc of standardAccounts) {
      await client.account.upsert({
        where: {
          user_id_name: {
            user_id: user.id,
            name: acc.name
          }
        },
        update: {},
        create: {
          user_id: user.id,
          name: acc.name,
          type: acc.type,
          opening_balance: 0.00,
          is_opening_locked: false
        }
      });
    }
  }

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
