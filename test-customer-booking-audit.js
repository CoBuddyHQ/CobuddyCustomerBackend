require('dotenv').config();
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://cobuddy:development-secret-password-2026@localhost:5433/cobuddy_customer_db?schema=public',
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const BASE_URL = 'http://localhost:4002/api/v1';
const TEST_PHONE_A = '+919876543210'; // Customer A
const TEST_PHONE_B = '+919999999999'; // Customer B (for cross-customer isolation test)

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${message} - ${details}`);
  }
}

async function loginCustomer(phone) {
  await axios.post(`${BASE_URL}/auth/send-otp`, { phone });
  const otpRecord = await prisma.customerOtp.findFirst({ where: { phone } });
  const otp = otpRecord ? otpRecord.otp : '123456';
  const res = await axios.post(`${BASE_URL}/auth/verify-otp`, { phone, otp });
  const data = res.data?.data || res.data;
  return {
    token: data.accessToken,
    customer: data.customer,
  };
}

async function runAudit() {
  console.log('================================================================');
  console.log('🧪 REAL DATA & ZERO MOCK BOOKING COMPREHENSIVE AUDIT');
  console.log('================================================================\n');

  try {
    // 1. Authenticate Customer A
    console.log('📋 STEP 1: Authenticate Customer A');
    const authA = await loginCustomer(TEST_PHONE_A);
    const apiA = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${authA.token}` },
    });
    assert(authA.token && authA.customer.id, 'Customer A logged in via JWT');

    // 2. Authenticate Customer B
    console.log('\n📋 STEP 2: Authenticate Customer B (for isolation tests)');
    const authB = await loginCustomer(TEST_PHONE_B);
    const apiB = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${authB.token}` },
    });
    assert(authB.token && authB.customer.id, 'Customer B logged in via JWT');

    // 3. Create Real Booking for Customer A
    console.log('\n📋 STEP 3: Create Real Booking for Customer A in PostgreSQL');
    const createRes = await apiA.post('/bookings', {
      companionId: 'c1',
      companionName: 'Elena Vasquez',
      activityName: 'Coffee & Books',
      venueName: 'Blue Tokai Cafe',
      venueAddress: 'Bandra West, Mumbai',
      date: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      time: '18:00',
      durationHours: 2,
      baseRate: 500,
      specialInstructions: 'Real booking test instructions.',
    });
    const createdBooking = createRes.data?.data || createRes.data;
    assert(createdBooking.id && createdBooking.status === 'pending', 'POST /bookings created booking with server ID');

    // Verify in DB
    const dbBooking = await prisma.customerBooking.findUnique({ where: { id: createdBooking.id } });
    assert(dbBooking && dbBooking.customerId === authA.customer.id, 'Booking persisted to PostgreSQL with customerId from JWT');
    assert(dbBooking.specialInstructions === 'Real booking test instructions.', 'Instructions matched DB record');

    // 4. List Bookings (Pending)
    console.log('\n📋 STEP 4: List Bookings with Authenticated Customer Filter');
    const listPendingRes = await apiA.get('/bookings', { params: { filter: 'pending' } });
    const pendingList = listPendingRes.data?.data || listPendingRes.data;
    assert(Array.isArray(pendingList) && pendingList.some(b => b.id === createdBooking.id), 'GET /bookings?filter=pending returns created booking');

    // 5. Cross-Customer Isolation (Customer B must NOT see Customer A's booking)
    console.log('\n📋 STEP 5: Verify Cross-Customer Data Isolation');
    const listBRes = await apiB.get('/bookings', { params: { filter: 'pending' } });
    const listB = listBRes.data?.data || listBRes.data;
    const canCustomerBSeeBookingA = listB.some(b => b.id === createdBooking.id);
    assert(!canCustomerBSeeBookingA, 'Customer B CANNOT see Customer A\'s booking in list');

    let customerBAccessDenied = false;
    try {
      await apiB.get(`/bookings/${createdBooking.id}`);
    } catch (err) {
      if (err.response?.status === 404) customerBAccessDenied = true;
    }
    assert(customerBAccessDenied, 'Customer B is blocked (404) when attempting to access Customer A\'s booking details');

    // 6. Modify Booking
    console.log('\n📋 STEP 6: Modify Booking in PostgreSQL');
    const modifyRes = await apiA.patch(`/bookings/${createdBooking.id}/modify`, {
      time: '19:30',
      specialInstructions: 'Updated instructions for session.',
    });
    const modified = modifyRes.data?.data || modifyRes.data;
    assert(modified.time === '19:30', 'PATCH /bookings/:id/modify updated time in response');
    const dbModified = await prisma.customerBooking.findUnique({ where: { id: createdBooking.id } });
    assert(dbModified.time === '19:30', 'PostgreSQL row updated with modified time');

    // 7. Counter Offer Lifecycle
    console.log('\n📋 STEP 7: Counter Offer & Acceptance Lifecycle');
    // Simulate companion counter-proposing in DB
    await prisma.customerBooking.update({
      where: { id: createdBooking.id },
      data: {
        status: 'counter_proposed',
        counterTime: '20:00',
        counterVenueName: 'Third Wave Coffee',
        counterDurationHours: 2.5,
        counterTotalAmount: 1600,
        counterMessage: 'Can we meet at Third Wave Coffee at 8 PM?',
      }
    });

    const getCountered = await apiA.get(`/bookings/${createdBooking.id}`);
    const counteredData = getCountered.data?.data || getCountered.data;
    assert(counteredData.status === 'counter_proposed', 'Booking status is counter_proposed');
    assert(counteredData.counterOffer?.message === 'Can we meet at Third Wave Coffee at 8 PM?', 'Counter offer message accurately returned');

    // Customer A accepts counter offer
    const acceptRes = await apiA.patch(`/bookings/${createdBooking.id}/counter-offer`, { action: 'accept' });
    const acceptedData = acceptRes.data?.data || acceptRes.data;
    assert(acceptedData.status === 'accepted', 'PATCH /bookings/:id/counter-offer accepted the counter proposal');

    const dbAccepted = await prisma.customerBooking.findUnique({ where: { id: createdBooking.id } });
    assert(dbAccepted.status === 'accepted' && dbAccepted.time === '20:00' && dbAccepted.venueName === 'Third Wave Coffee', 'PostgreSQL row updated with accepted counter time and venue');

    // 8. Accepted List
    console.log('\n📋 STEP 8: Accepted Tab Verification');
    const acceptedListRes = await apiA.get('/bookings', { params: { filter: 'accepted' } });
    const acceptedList = acceptedListRes.data?.data || acceptedListRes.data;
    assert(acceptedList.some(b => b.id === createdBooking.id), 'Booking now appears in Accepted tab list');

    // 9. Cancel Booking & Tiered Refund Calculation
    console.log('\n📋 STEP 9: Cancel Booking & Tiered Refund');
    const cancelRes = await apiA.patch(`/bookings/${createdBooking.id}/cancel`, {
      reason: 'Schedule conflict',
    });
    const cancelledData = cancelRes.data?.data || cancelRes.data;
    assert(cancelledData.status === 'cancelled', 'Booking marked cancelled');

    const dbCancelled = await prisma.customerBooking.findUnique({ where: { id: createdBooking.id } });
    assert(dbCancelled.status === 'cancelled', 'PostgreSQL booking status is cancelled');

    // 10. History List
    console.log('\n📋 STEP 10: History Tab Verification');
    const historyListRes = await apiA.get('/bookings', { params: { filter: 'history' } });
    const historyList = historyListRes.data?.data || historyListRes.data;
    assert(historyList.some(b => b.id === createdBooking.id), 'Cancelled booking now appears in History tab list');

    // Cleanup test data
    await prisma.customerBooking.deleteMany({ where: { customerId: { in: [authA.customer.id, authB.customer.id] } } });
    await prisma.customer.deleteMany({ where: { phone: { in: [TEST_PHONE_A, TEST_PHONE_B] } } });

  } catch (err) {
    console.error('💥 Audit execution failed:', err.response?.data || err.message);
    failedTests++;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }

  console.log('\n================================================================');
  console.log(`📊 AUDIT SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) process.exit(1);
}

runAudit();
