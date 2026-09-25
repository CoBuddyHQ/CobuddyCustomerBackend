const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const pool = new Pool({
  connectionString: 'postgresql://cobuddy:development-secret-password-2026@localhost:5433/cobuddy_customer_db?schema=public'
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const customers = await prisma.customer.findMany({
    select: { id: true, phone: true, name: true }
  });
  const bookings = await prisma.customerBooking.findMany({
    select: {
      id: true,
      customerId: true,
      companionName: true,
      status: true,
      activityName: true,
      specialInstructions: true,
      date: true,
      time: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });
  const tokens = await prisma.customerRefreshToken.findMany({
    select: { customerId: true, deviceInfo: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('CUSTOMERS:', JSON.stringify(customers, null, 2));
  console.log('RECENT TOKENS:', JSON.stringify(tokens, null, 2));
  console.log('BOOKINGS COUNT:', bookings.length);
  console.log('BOOKINGS:', JSON.stringify(bookings.slice(0, 10), null, 2));
}

main().finally(() => pool.end());
