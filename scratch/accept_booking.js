const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://cobuddy:development-secret-password-2026@localhost:5433/cobuddy_customer_db?schema=public',
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const bookingId = '64d4974d-a6ff-47d8-9201-5401f425b38e';
  
  const booking = await prisma.customerBooking.findUnique({
    where: { id: bookingId }
  });

  if (!booking) {
    console.log('Booking not found!');
    return;
  }

  console.log('Current booking status:', booking.status);

  const updatedBooking = await prisma.customerBooking.update({
    where: { id: bookingId },
    data: {
      status: 'accepted',
      acceptedAt: new Date(),
    }
  });

  console.log('Updated booking status:', updatedBooking.status);

  const session = await prisma.customerSession.upsert({
    where: {
      bookingId_customerId: {
        bookingId,
        customerId: booking.customerId,
      }
    },
    create: {
      id: 'sess-' + Date.now(),
      bookingId,
      customerId: booking.customerId,
      companionId: booking.companionId,
      status: 'upcoming',
      passCode: '4829',
    },
    update: {
      status: 'upcoming',
    }
  });

  console.log('Created/Updated session ID:', session.id, 'PassCode:', session.passCode);
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
