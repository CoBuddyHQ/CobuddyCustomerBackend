const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const pool = new Pool({
  connectionString: 'postgresql://cobuddy:development-secret-password-2026@localhost:5433/cobuddy_customer_db?schema=public'
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function seed() {
  const customerId = 'b3199c68-5f02-429e-95af-3488168ed3b7'; // Avinash Shukla
  const phone = '+918745869875';

  // Ensure customer exists
  const customer = await prisma.customer.upsert({
    where: { phone },
    create: {
      id: customerId,
      phone,
      countryCode: '+91',
      name: 'Avinash Shukla',
      bio: 'Exploring great places and events.',
      age: 27,
      gender: 'Male',
      city: 'New Delhi',
      kycStatus: 'verified',
      accountStatus: 'active',
      isOnboardingComplete: true,
      interests: ['INT-1', 'INT-3', 'INT-7'],
      spokenLanguages: ['en', 'hi'],
    },
    update: {
      name: 'Avinash Shukla',
      kycStatus: 'verified',
      accountStatus: 'active',
      isOnboardingComplete: true,
    }
  });

  await prisma.customerWallet.upsert({
    where: { customerId: customer.id },
    create: {
      customerId: customer.id,
      balance: 10000,
      pendingRefunds: 0,
      escrowHeld: 0,
      currency: 'INR',
    },
    update: {},
  });

  console.log('Seeding bookings for customer:', customer.name, `(${customer.phone}) [ID: ${customer.id}]`);

  // Clean existing bookings for this customer
  await prisma.customerBooking.deleteMany({ where: { customerId: customer.id } });

  // 1. Counter-Proposed booking (Aisha Sharma)
  const counterBooking = await prisma.customerBooking.create({
    data: {
      customerId,
      companionId: 'c2',
      companionName: 'Aisha Sharma',
      activityName: 'Art & Gallery Walk',
      venueName: 'National Gallery of Modern Art',
      venueAddress: 'Jaipur House, India Gate, New Delhi',
      date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      time: '05:00 PM',
      durationHours: 3,
      specialInstructions: 'Interested in modern and contemporary Indian art.',
      status: 'counter_proposed',
      baseRate: 600,
      durationMultiplier: 1,
      baseTotal: 1800,
      platformFee: 270,
      taxAmount: 324,
      totalAmount: 2394,
      counterDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      counterTime: '06:00 PM - 09:00 PM',
      counterVenueName: 'National Gallery of Modern Art',
      counterDurationHours: 3,
      counterTotalAmount: 2394,
      counterMessage: 'Hi Avinash! Can we start at 6:00 PM instead? I have a prior exhibition walkthrough until 5:30 PM.',
    }
  });
  console.log('Created counter_proposed booking:', counterBooking.id);

  // 2. Accepted booking (Natasha)
  const acceptedBooking = await prisma.customerBooking.create({
    data: {
      customerId,
      companionId: 'c4',
      companionName: 'Natasha',
      activityName: 'Coffee & Conversation',
      venueName: 'Blue Tokai Coffee Roasters',
      venueAddress: 'Connaught Place, Inner Circle, New Delhi',
      date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      time: '04:00 PM',
      durationHours: 2,
      specialInstructions: 'Looking forward to great coffee and talking about books.',
      status: 'accepted',
      baseRate: 500,
      durationMultiplier: 1,
      baseTotal: 1000,
      platformFee: 150,
      taxAmount: 180,
      totalAmount: 1330,
      acceptedAt: new Date(),
    }
  });
  console.log('Created accepted booking:', acceptedBooking.id);

  // 3. Completed booking in History (Priya Kapoor)
  const completedBooking = await prisma.customerBooking.create({
    data: {
      customerId,
      companionId: 'c5',
      companionName: 'Priya Kapoor',
      activityName: 'Fine Dining & Culinary',
      venueName: 'Indian Accent',
      venueAddress: 'The Lodhi, Lodhi Road, New Delhi',
      date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      time: '07:30 PM',
      durationHours: 2.5,
      specialInstructions: 'Enjoyed an incredible tasting menu experience.',
      status: 'completed',
      baseRate: 800,
      durationMultiplier: 1,
      baseTotal: 2000,
      platformFee: 300,
      taxAmount: 360,
      totalAmount: 2660,
      acceptedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    }
  });
  console.log('Created completed booking:', completedBooking.id);

  console.log('✅ Real bookings seeded successfully!');
}

seed()
  .catch(console.error)
  .finally(() => pool.end());
