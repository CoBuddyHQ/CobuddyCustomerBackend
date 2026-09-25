const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://cobuddy:development-secret-password-2026@localhost:5433/cobuddy_customer_db?schema=public',
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('--- UPDATING ALL CUSTOMER BOOKINGS TO ACCEPTED ---');

  // Update booking b8167b41-47f6-45f4-9f03-ec4ec05ecb6a
  const bookings = await prisma.customerBooking.findMany({
    where: {
      OR: [
        { bookingRef: 'b8167b41-47f6-45f4-9f03-ec4ec05ecb6a' },
        { id: '64d4974d-a6ff-47d8-9201-5401f425b38e' },
        { id: '806adff4-9fe8-48dd-9502-eb6277c48c45' },
        { status: 'pending' }
      ]
    }
  });

  for (const b of bookings) {
    console.log(`Updating booking ID ${b.id} (ref: ${b.bookingRef}) from status '${b.status}' to 'accepted'...`);
    
    await prisma.customerBooking.update({
      where: { id: b.id },
      data: {
        status: 'accepted',
        acceptedAt: new Date(),
      }
    });

    const sess = await prisma.customerSession.upsert({
      where: {
        bookingId_customerId: {
          bookingId: b.id,
          customerId: b.customerId,
        }
      },
      create: {
        id: 'sess-' + Math.random().toString(36).substr(2, 9),
        bookingId: b.id,
        customerId: b.customerId,
        companionId: b.companionId,
        status: 'upcoming',
        passCode: '4829',
      },
      update: {
        status: 'upcoming',
        passCode: '4829',
      }
    });

    console.log(`Session created/updated for booking ${b.id}: ID ${sess.id}, status: ${sess.status}, passCode: ${sess.passCode}`);
  }

  console.log('\n--- ALL BOOKINGS SUCCESSFULLY UPDATED TO ACCEPTED IN DATABASE ---');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
