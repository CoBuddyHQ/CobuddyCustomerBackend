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
  console.log('🌱 Seeding CoBuddy Customer Development Database...');

  // 1. Create / Upsert Demo Customer
  const demoPhone = '+919876543210';
  const customer = await prisma.customer.upsert({
    where: { phone: demoPhone },
    create: {
      phone: demoPhone,
      countryCode: '+91',
      name: 'Rohan Verma',
      bio: 'Tech enthusiast and coffee lover exploring new places.',
      age: 26,
      gender: 'Male',
      city: 'Mumbai',
      photoUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
      kycStatus: 'verified',
      accountStatus: 'active',
      isOnboardingComplete: true,
      interests: ['Coffee & Conversation', 'Fine Dining & Food', 'City Guide & Walk'],
      spokenLanguages: ['English', 'Hindi', 'Marathi'],
    },
    update: {
      name: 'Rohan Verma',
      isOnboardingComplete: true,
      kycStatus: 'verified',
    },
  });

  console.log(`👤 Customer created/updated: ${customer.name} (${customer.id})`);

  // 2. Initialize Customer Wallet (Balance: ₹4,500 matching WithdrawMoneyScreen)
  await prisma.customerWallet.upsert({
    where: { customerId: customer.id },
    create: {
      customerId: customer.id,
      balance: 4500,
      pendingRefunds: 0,
      escrowHeld: 0,
      currency: 'INR',
    },
    update: {
      balance: 4500,
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

  // 6. Payment Methods & Bank Account (Matching AddBankAccountScreen / WithdrawalMethodsScreen)
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

  // 7. Seed Sample Bookings & Sessions
  const booking1 = await prisma.customerBooking.create({
    data: {
      customerId: customer.id,
      companionId: 'c1',
      companionName: 'Elena Vasquez',
      activityName: 'Coffee & Conversation',
      venueName: 'Blue Tokai Cafe, Bandra West',
      venueAddress: 'Plot 12, Pali Hill, Mumbai',
      date: new Date(Date.now() + 86400000), // Tomorrow
      time: '04:00 PM',
      durationHours: 2,
      status: 'confirmed',
      baseRate: 500,
      baseTotal: 1000,
      platformFee: 99,
      taxAmount: 180,
      totalAmount: 1279,
      paymentStatus: 'completed',
    },
  });

  await prisma.customerSession.create({
    data: {
      bookingId: booking1.id,
      customerId: customer.id,
      companionId: 'c1',
      status: 'upcoming',
      passCode: '482910',
    },
  });

  // 8. Sample Transactions
  await prisma.customerTransaction.createMany({
    data: [
      {
        customerId: customer.id,
        bookingId: booking1.id,
        type: 'session_payment',
        amount: 1279,
        description: 'Payment for Coffee session with Elena Vasquez',
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

  // 9. Sample Notification
  await prisma.customerNotification.createMany({
    data: [
      {
        customerId: customer.id,
        title: 'Booking Confirmed!',
        description: 'Elena Vasquez has accepted your booking request for tomorrow at 04:00 PM.',
        category: 'Bookings',
        icon: 'calendar-check',
        iconColor: '#10B981',
      },
      {
        customerId: customer.id,
        title: 'KYC Verification Approved',
        description: 'Your Aadhaar document has been successfully verified.',
        category: 'Security',
        icon: 'shield-check',
        iconColor: '#3B82F6',
      },
    ],
  });

  console.log('✅ Seed data successfully inserted into PostgreSQL database!');
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
