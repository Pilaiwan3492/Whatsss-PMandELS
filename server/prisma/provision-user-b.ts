import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { STANDARD_ACCOUNTS, isPlaceholderPassword, provisionDemoAccounts } from './seed.js';

const defaultPrisma = new PrismaClient();

export interface ProvisionUserBResult {
  userId: string;
  username: string;
  created: boolean;
  accountNames: string[];
}

/**
 * Safely verifies or provisions the secondary UAT user (`user_other`, Role: `USER`)
 * and its 5 isolated standard financial accounts (`Checking Bank`, `Visa Credit Card`,
 * `Salary`, `Dining`, `Grocery`) without mutating existing users (`user_demo`, `admin`)
 * or existing financial records.
 */
export async function provisionUserB(
  client: PrismaClient = defaultPrisma,
  env: NodeJS.ProcessEnv = process.env
): Promise<ProvisionUserBResult> {
  const targetUsername = 'user_other';
  const targetEmail = env.UAT_USER_B_EMAIL || 'user_other@whatsss.local';
  const rawPassword = env.UAT_USER_B_PASSWORD || env.SEED_DEMO_PASSWORD;
  const saltRounds = 10;

  return client.$transaction(async (tx) => {
    // Step 1: Check whether User B (`user_other`) already exists
    const existingByUsername = await tx.user.findUnique({
      where: { username: targetUsername }
    });

    let userB = existingByUsername;
    let created = false;

    if (existingByUsername) {
      if (existingByUsername.role !== 'USER') {
        throw new Error(
          `FATAL: User "${targetUsername}" already exists with non-USER role "${existingByUsername.role}". Refusing to provision financial accounts.`
        );
      }
      if (!existingByUsername.is_active) {
        throw new Error(
          `FATAL: User "${targetUsername}" exists but is inactive (is_active=false).`
        );
      }
    } else {
      // Check unique constraint on email before creating User B
      const emailConflict = await tx.user.findUnique({
        where: { email: targetEmail }
      });
      if (emailConflict && emailConflict.username !== targetUsername) {
        throw new Error(
          `FATAL: Email "${targetEmail}" is already in use by user "${emailConflict.username}". Cannot provision "${targetUsername}".`
        );
      }

      // Step 2 & 3: Validate password from environment/Secret Manager and hash with bcrypt
      if (!rawPassword || rawPassword.length < 12) {
        throw new Error(
          'FATAL: UAT_USER_B_PASSWORD (or SEED_DEMO_PASSWORD) must be provided with at least 12 characters to create user_other.'
        );
      }
      if (isPlaceholderPassword(rawPassword)) {
        throw new Error(
          'FATAL: Provided password for user_other contains an insecure template placeholder. Configure a real secret value.'
        );
      }

      const passwordHash = await bcrypt.hash(rawPassword, saltRounds);
      userB = await tx.user.create({
        data: {
          username: targetUsername,
          email: targetEmail,
          password_hash: passwordHash,
          role: 'USER',
          is_active: true
        }
      });
      created = true;
    }

    if (!userB) {
      throw new Error('FATAL: Unable to resolve or create user_other.');
    }

    // Step 4: Provision the 5 standard financial accounts for User B via provisionDemoAccounts
    await provisionDemoAccounts(tx as unknown as PrismaClient, {
      id: userB.id,
      role: userB.role,
      username: userB.username
    });

    // Step 5: Verify all 5 standard accounts exist and belong strictly to User B
    const userBAccounts = await tx.account.findMany({
      where: { user_id: userB.id },
      orderBy: { name: 'asc' }
    });

    const expectedNames = STANDARD_ACCOUNTS.map((a) => a.name);
    for (const expectedName of expectedNames) {
      const matches = userBAccounts.filter(
        (acc) => acc.name === expectedName && acc.user_id === userB!.id
      );
      if (matches.length !== 1) {
        throw new Error(
          `FATAL: Account verification failed for "${targetUsername}": expected exactly 1 "${expectedName}" account owned by User B, found ${matches.length}.`
        );
      }
    }

    return {
      userId: userB.id,
      username: userB.username,
      created,
      accountNames: userBAccounts.map((a) => a.name)
    };
  });
}

if (process.argv[1]?.includes('provision-user-b')) {
  provisionUserB()
    .then((res) => {
      console.log(
        `[UAT Provisioning] User "${res.username}" (${res.created ? 'created' : 'verified existing'}) with ${res.accountNames.length} isolated accounts: ${res.accountNames.join(', ')}`
      );
    })
    .catch((err) => {
      console.error('[UAT Provisioning Error]:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    })
    .finally(async () => {
      await defaultPrisma.$disconnect();
    });
}
