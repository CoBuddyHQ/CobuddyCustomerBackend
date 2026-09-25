const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://cobuddy:development-secret-password-2026@localhost:5433/cobuddy_customer_db?schema=public',
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const bookingRef = 'b8167b41-47f6-45f4-9f03-ec4ec05ecb6a';
  
  const booking = await prisma.customerBooking.findFirst({
    where: {
      OR: [
        { bookingRef: bookingRef },
        { id: bookingRef }
      ]
    },
    include: { sessions: true }
  });

  console.log('--- FOUND BOOKING RECORD ---');
  console.log('ID:', booking?.id);
  console.log('bookingRef:', booking?.bookingRef);
  console.log('status:', booking?.status);
  console.log('acceptedAt:', booking?.acceptedAt);
  console.log('paymentStatus:', booking?.paymentStatus);
  console.log('Sessions count:', booking?.sessions?.length);
  console.log('Sessions:', booking?.sessions);

  if (booking) {
    // Force update status to accepted
    const updated = await prisma.customerBooking.update({
      where: { id: booking.id },
      data: {
        status: 'accepted',
        acceptedAt: new Date(),
      }
    });
    console.log('\n--- UPDATED BOOKING RECORD ---');
    console.log('New status:', updated.status);
    console.log('New acceptedAt:', updated.acceptedAt);

    // Upsert session record
    const session = await prisma.customerSession.upsert({
      where: {
        bookingId_customerId: {
          bookingId: booking.id,
          customerId: booking.customerId,
        }
      },
      create: {
        id: 'sess-' + Date.now(),
        bookingId: booking.id,
        customerId: booking.customerId,
        companionId: booking.companionId,
        status: 'upcoming',
        passCode: '4829',
      },
      update: {
        status: 'upcoming',
        passCode: '4829',
      }
    });

    console.log('Session record:', session);
  }
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
