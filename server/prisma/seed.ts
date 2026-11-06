import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export async function seed(): Promise<void> {
  const saltRounds = 10;
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

  console.log('Seeding completed successfully.');
}

if (process.argv[1]?.includes('seed')) {
  seed()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
