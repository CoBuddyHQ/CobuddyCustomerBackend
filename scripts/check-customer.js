const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const pool = new Pool({
  connectionString: 'postgresql://cobuddy:development-secret-password-2026@localhost:5433/cobuddy_customer_db?schema=public'
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const customers = await prisma.customer.findMany({
    take: 10,
    select: { id: true, phone: true, name: true, kycStatus: true, isOnboardingComplete: true }
  });
  console.log(JSON.stringify(customers, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
