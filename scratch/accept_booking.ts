import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

  // Update booking to accepted
  const updatedBooking = await prisma.customerBooking.update({
    where: { id: bookingId },
    data: {
      status: 'accepted',
      acceptedAt: new Date(),
    }
  });

  console.log('Updated booking status:', updatedBooking.status);

  // Create session for the accepted booking if not exists
  const session = await prisma.customerSession.upsert({
    where: {
      bookingId_customerId: {
        bookingId,
        customerId: booking.customerId,
      }
    },
    create: {
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

  console.log('Created/Updated session:', session);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
