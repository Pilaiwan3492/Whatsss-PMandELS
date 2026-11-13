import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const defaultPrisma = new PrismaClient();

export const STANDARD_ACCOUNTS = [
  { name: 'Checking Bank', type: 'CASH' as const },
  { name: 'Visa Credit Card', type: 'LOAN_TAKEN' as const },
  { name: 'Salary', type: 'INCOME' as const },
  { name: 'Dining', type: 'EXPENSE' as const },
  { name: 'Grocery', type: 'EXPENSE' as const }
];

/**
 * Provisions the standard baseline financial accounts for a user.
 * Strictly enforces that financial accounts may ONLY be provisioned for users with role 'USER'.
 * Under BR-10, administrators and non-USER accounts must never possess or execute financial transactions.
 */
export async function seedStandardAccountsForUser(
  client: PrismaClient,
  user: { id: string; role: string; username?: string }
): Promise<void> {
  if (user.role !== 'USER') {
    throw new Error(
      `FATAL: Cannot create financial accounts for user "${user.username || user.id}" with non-USER role "${user.role}".`
    );
  }

  for (const acc of STANDARD_ACCOUNTS) {
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

export function isPlaceholderPassword(val: string): boolean {
  const lower = val.toLowerCase();
  return (
    lower.includes('replace_with') ||
    lower.includes('placeholder') ||
    lower.includes('changeme') ||
    lower.includes('adminsecurepassword123!') ||
    lower.includes('demosecurepassword123!')
  );
}

export async function seed(client: PrismaClient = defaultPrisma): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const saltRounds = 10;

  if (isProduction) {
    const prodAdminPassword = process.env.SEED_ADMIN_PASSWORD;
    const prodAdminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@whatsss.local';

    // 1. Provision or verify production administrator
    if (!prodAdminPassword || prodAdminPassword.length < 12) {
      if (process.env.SEED_DEMO_DATA === 'true') {
        console.warn(
          'Production environment: SEED_ADMIN_PASSWORD is missing or shorter than 12 characters. ' +
          'To provision an initial administrator, configure SEED_ADMIN_PASSWORD (min 12 chars). Skipping administrator seeding.'
        );
      } else {
        console.warn(
          'Production environment detected: To provision an initial administrator, configure SEED_ADMIN_PASSWORD (min 12 chars). ' +
          'Demo accounts are disabled by default (enable via SEED_DEMO_DATA=true). Skipping seeding.'
        );
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
        if (isPlaceholderPassword(prodAdminPassword)) {
          throw new Error(
            'FATAL: SEED_ADMIN_PASSWORD contains an insecure template placeholder from .env.example. ' +
            'You must configure a real, unique administrator password of at least 12 characters in production.'
          );
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

        // Check if admin email is already in use by another user
        const emailConflict = await client.user.findUnique({
          where: { email: prodAdminEmail }
        });

        if (emailConflict && emailConflict.username !== 'admin') {
          throw new Error(
            `FATAL: Email "${prodAdminEmail}" is already in use by user "${emailConflict.username}". ` +
            'Cannot provision production administrator due to email conflict.'
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

      if (isPlaceholderPassword(demoPassword)) {
        throw new Error(
          'FATAL: SEED_DEMO_PASSWORD contains an insecure template placeholder from .env.example. ' +
          'You must configure a real, unique demo user password of at least 12 characters in production.'
        );
      }

      // Check whether user_demo already exists
      const existingDemoUser = await client.user.findUnique({
        where: { username: 'user_demo' }
      });

      let demoUser = existingDemoUser;

      if (!existingDemoUser) {
        // Check for email collision with other registered users
        const emailConflict = await client.user.findUnique({
          where: { email: demoEmail }
        });

        if (emailConflict && emailConflict.username !== 'user_demo') {
          throw new Error(
            `FATAL: Email "${demoEmail}" is already in use by user "${emailConflict.username}". Cannot provision demo user.`
          );
        }

        // Provision initial user_demo with role USER
        const demoHash = await bcrypt.hash(demoPassword, saltRounds);
        const createdDemo = await client.user.create({
          data: {
            username: 'user_demo',
            email: demoEmail,
            password_hash: demoHash,
            role: 'USER',
            is_active: true
          }
        });
        demoUser = { role: 'USER' as const, ...createdDemo };
        console.log('Production demo user (user_demo) provisioned securely.');
      } else {
        // Enforce role integrity on existing user_demo
        if (existingDemoUser.role !== 'USER') {
          throw new Error(
            `FATAL: User "user_demo" already exists with non-USER role "${existingDemoUser.role}". Cannot provision financial demo accounts.`
          );
        }
        console.log('Production demo user (user_demo) already exists. Preserving existing credentials.');
      }

      // Provision standard financial accounts ONLY for validated USER accounts
      if (demoUser && demoUser.role === 'USER') {
        await seedStandardAccountsForUser(client as any, demoUser);
      }
    }

    return;
  }

  // Development and Test seeding with well-known test fixtures
  const devPassword = 'Password123!';
  const devHash = await bcrypt.hash(devPassword, saltRounds);

  // 1. Seed or verify user_demo
  let userDemo: any = null;
  if (client.user?.findUnique) {
    const existingDemo = await client.user.findUnique({
      where: { username: 'user_demo' }
    });

    if (!existingDemo) {
      const emailConflict = await client.user.findUnique({
        where: { email: 'user_demo@whatsss.local' }
      });
      if (emailConflict && emailConflict.username !== 'user_demo') {
        throw new Error(
          `FATAL: Email "user_demo@whatsss.local" is already in use by user "${emailConflict.username}". Cannot provision demo user.`
        );
      }
      userDemo = await client.user.create({
        data: {
          username: 'user_demo',
          email: 'user_demo@whatsss.local',
          password_hash: devHash,
          role: 'USER',
          is_active: true
        }
      });
    } else {
      if (existingDemo.role !== 'USER') {
        throw new Error(
          `FATAL: User "user_demo" already exists with non-USER role "${existingDemo.role}". Cannot provision financial demo accounts.`
        );
      }
      userDemo = existingDemo;
    }
  } else if (client.user?.upsert) {
    userDemo = await client.user.upsert({
      where: { username: 'user_demo' },
      update: {},
      create: {
        username: 'user_demo',
        email: 'user_demo@whatsss.local',
        password_hash: devHash,
        role: 'USER',
        is_active: true
      }
    });
    if (userDemo && userDemo.role !== 'USER') {
      throw new Error(
        `FATAL: User "user_demo" already exists with non-USER role "${userDemo.role}". Cannot provision financial demo accounts.`
      );
    }
  }

  // 2. Seed or verify user_other (USER)
  let userOther: any = null;
  if (client.user?.findUnique) {
    const existingOther = await client.user.findUnique({
      where: { username: 'user_other' }
    });

    if (existingOther && existingOther.role !== 'USER') {
      throw new Error(
        `FATAL: User "user_other" already exists with non-USER role "${existingOther.role}".`
      );
    }

    if (!existingOther) {
      const emailConflict = await client.user.findUnique({
        where: { email: 'user_other@whatsss.local' }
      });
      if (emailConflict && emailConflict.username !== 'user_other') {
        throw new Error(
          `FATAL: Email "user_other@whatsss.local" is already in use by user "${emailConflict.username}". Cannot provision user_other.`
        );
      }
      userOther = await client.user.create({
        data: {
          username: 'user_other',
          email: 'user_other@whatsss.local',
          password_hash: devHash,
          role: 'USER',
          is_active: true
        }
      });
    } else {
      userOther = existingOther;
    }
  } else if (client.user?.upsert) {
    userOther = await client.user.upsert({
      where: { username: 'user_other' },
      update: {},
      create: {
        username: 'user_other',
        email: 'user_other@whatsss.local',
        password_hash: devHash,
        role: 'USER',
        is_active: true
      }
    });
    if (userOther && userOther.role !== 'USER') {
      throw new Error(
        `FATAL: User "user_other" already exists with non-USER role "${userOther.role}".`
      );
    }
  }

  // 3. Seed or verify admin_demo (ADMIN)
  let adminDemo: any = null;
  if (client.user?.findUnique) {
    const existingAdminDemo = await client.user.findUnique({
      where: { username: 'admin_demo' }
    });

    if (existingAdminDemo && existingAdminDemo.role !== 'ADMIN') {
      throw new Error(
        `FATAL: User "admin_demo" already exists with non-ADMIN role "${existingAdminDemo.role}".`
      );
    }

    if (!existingAdminDemo) {
      const emailConflict = await client.user.findUnique({
        where: { email: 'admin_demo@whatsss.local' }
      });
      if (emailConflict && emailConflict.username !== 'admin_demo') {
        throw new Error(
          `FATAL: Email "admin_demo@whatsss.local" is already in use by user "${emailConflict.username}". Cannot provision admin_demo.`
        );
      }
      adminDemo = await client.user.create({
        data: {
          username: 'admin_demo',
          email: 'admin_demo@whatsss.local',
          password_hash: devHash,
          role: 'ADMIN',
          is_active: true
        }
      });
    } else {
      adminDemo = existingAdminDemo;
    }
  } else if (client.user?.upsert) {
    adminDemo = await client.user.upsert({
      where: { username: 'admin_demo' },
      update: {},
      create: {
        username: 'admin_demo',
        email: 'admin_demo@whatsss.local',
        password_hash: devHash,
        role: 'ADMIN',
        is_active: true
      }
    });
    if (adminDemo && adminDemo.role !== 'ADMIN') {
      throw new Error(
        `FATAL: User "admin_demo" already exists with non-ADMIN role "${adminDemo.role}".`
      );
    }
  }

  // 4. Seed standard financial accounts ONLY for USER role demo users (userDemo, userOther)
  // Under BR-10, admin_demo (ADMIN) must not receive standard financial accounts during seeding.
  for (const user of [userDemo, userOther]) {
    if (user) {
      await seedStandardAccountsForUser(client, user);
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
