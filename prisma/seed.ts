import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://cobuddy:development-secret-password-2026@localhost:5433/cobuddy_customer_db?schema=public';

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log('🌱 Seeding CoBuddy Customer Development Database (Canonical Aligned)...');

  // 1. Create / Upsert Demo Customer
  const demoPhone = '+919876543210';
  const customer = await prisma.customer.upsert({
    where: { phone: demoPhone },
    create: {
      phone: demoPhone,
      countryCode: '+91',
      name: 'Rohan Verma',
      bio: 'Tech enthusiast and coffee lover exploring new places in the city.',
      age: 26,
      gender: 'Male',
      city: 'Mumbai',
      photoUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
      kycStatus: 'verified',
      accountStatus: 'active',
      isOnboardingComplete: true,
      interests: ['INT-1', 'INT-3', 'INT-7'], // Canonical activity IDs
      spokenLanguages: ['en', 'hi', 'mr'],      // Canonical language codes
    },
    update: {
      name: 'Rohan Verma',
      isOnboardingComplete: true,
      kycStatus: 'verified',
      interests: ['INT-1', 'INT-3', 'INT-7'],
      spokenLanguages: ['en', 'hi', 'mr'],
    },
  });

  console.log(`👤 Customer created/updated: ${customer.name} (${customer.id})`);

  // 2. Initialize Customer Wallet (within nonKycMax ₹10,000 limit)
  await prisma.customerWallet.upsert({
    where: { customerId: customer.id },
    create: {
      customerId: customer.id,
      balance: 5000,
      pendingRefunds: 0,
      escrowHeld: 0,
      currency: 'INR',
    },
    update: {
      balance: 5000,
    },
  });

  // 3. Customer Settings
  await prisma.customerSetting.upsert({
    where: { customerId: customer.id },
    create: {
      customerId: customer.id,
      language: 'en',
      notificationsEnabled: true,
      bookingNotifications: true,
      chatNotifications: true,
      safetyNotifications: true,
      walletNotifications: true,
      marketingNotifications: false,
      locationSharingEnabled: true,
      appLockEnabled: false,
    },
    update: {},
  });

  // 4. KYC Record
  await prisma.customerKyc.upsert({
    where: { customerId: customer.id },
    create: {
      customerId: customer.id,
      docType: 'AADHAAR',
      docNumber: 'XXXX-XXXX-4821',
      legalName: 'Rohan Verma',
      status: 'verified',
      verifiedAt: new Date(),
    },
    update: {},
  });

  // 5. Trusted Contacts
  await prisma.customerTrustedContact.deleteMany({ where: { customerId: customer.id } });
  await prisma.customerTrustedContact.createMany({
    data: [
      { customerId: customer.id, name: 'Ananya Verma', phone: '+919876543211', relationship: 'Sister' },
      { customerId: customer.id, name: 'Vikram Singh', phone: '+919876543212', relationship: 'Friend' },
    ],
  });

  // 6. Payment Methods & Bank Account
  await prisma.customerPaymentMethod.deleteMany({ where: { customerId: customer.id } });
  await prisma.customerPaymentMethod.createMany({
    data: [
      {
        customerId: customer.id,
        type: 'bank_account',
        title: 'HDFC Bank',
        sub: 'Account ending in 4242',
        icon: 'bank',
        maskedNumber: '•••• 4242',
        isDefault: true,
        isVerified: true,
      },
      {
        customerId: customer.id,
        type: 'upi',
        title: 'Google Pay UPI',
        sub: 'rohan@okaxis',
        icon: 'cellphone-wireless',
        maskedNumber: 'rohan@okaxis',
        isDefault: false,
        isVerified: true,
      },
    ],
  });

  // 7. Seed Sample Bookings & Sessions (Calculated with 15% platform fee + 18% GST)
  // baseTotal = 500 * 2 = 1000
  // platformFee = 1000 * 0.15 = 150
  // taxAmount = 1000 * 0.18 = 180
  // totalAmount = 1330
  const booking1 = await prisma.customerBooking.create({
    data: {
      customerId: customer.id,
      companionId: 'c1',
      companionName: 'Elena Vasquez',
      activityId: 'INT-3',
      activityName: 'Cafe Hopping',
      activityIcon: 'coffee',
      venueName: 'Blue Tokai Cafe, Bandra West',
      venueAddress: 'Plot 12, Pali Hill, Mumbai',
      venueArea: 'Bandra West',
      venueCity: 'Mumbai',
      venueType: 'cafe',
      meetingPoint: 'Main entrance outdoor seating',
      landmark: 'Near Pali Hill Market',
      isApproved: true,
      date: new Date(Date.now() + 86400000), // Tomorrow
      time: '04:00 PM',
      durationHours: 2,
      status: 'accepted',
      baseRate: 500,
      durationMultiplier: 1.0,
      baseTotal: 1000,
      platformFee: 150,
      taxAmount: 180,
      totalAmount: 1330,
      paymentStatus: 'completed',
    },
  });

  await prisma.customerSession.create({
    data: {
      bookingId: booking1.id,
      customerId: customer.id,
      companionId: 'c1',
      status: 'upcoming',
      passCode: '4829', // 4-digit code
    },
  });

  // 8. Sample Transactions
  await prisma.customerTransaction.createMany({
    data: [
      {
        customerId: customer.id,
        bookingId: booking1.id,
        type: 'session_payment',
        amount: 1330,
        description: 'Payment for Cafe Hopping with Elena Vasquez',
        status: 'completed',
      },
      {
        customerId: customer.id,
        type: 'add_money',
        amount: 5000,
        description: 'Wallet top-up via UPI',
        status: 'completed',
      },
    ],
  });

  // 9. Sample Notification using Canonical 11-category taxonomy
  await prisma.customerNotification.createMany({
    data: [
      {
        customerId: customer.id,
        title: 'Booking Confirmed!',
        description: 'Elena Vasquez has accepted your booking request for tomorrow at 04:00 PM.',
        category: 'request',
        icon: 'calendar-check',
        iconColor: '#10B981',
        route: 'BookingDetailScreen',
      },
      {
        customerId: customer.id,
        title: 'KYC Verification Approved',
        description: 'Your Aadhaar document has been successfully verified.',
        category: 'safety',
        icon: 'shield-check',
        iconColor: '#3B82F6',
        route: 'KycStatusScreen',
      },
    ],
  });

  console.log('✅ Seed data successfully inserted with canonical alignment!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
