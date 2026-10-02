import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking Online Database via Prisma...\n');
  try {
    const customerCount = await prisma.customerProfile.count();
    const bookingCount = await prisma.customerBooking.count();
    const sessionCount = await prisma.customerSession.count();
    const walletCount = await prisma.customerWallet.count();
    const kycCount = await prisma.customerKyc.count();

    console.log('✅ Connected to Database successfully!\n');
    console.log('📊 Table Record Summary:');
    console.log(` - Customer Profiles : ${customerCount}`);
    console.log(` - Bookings          : ${bookingCount}`);
    console.log(` - Sessions          : ${sessionCount}`);
    console.log(` - Wallets           : ${walletCount}`);
    console.log(` - KYC Records       : ${kycCount}`);
  } catch (error) {
    console.error('❌ Connection error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
