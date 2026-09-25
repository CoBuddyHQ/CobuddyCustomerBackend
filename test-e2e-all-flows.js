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
const TEST_PHONE = '+919876543210';

let authToken = '';
let refreshToken = '';
let customerId = '';
let bookingId = '';
let sessionId = '';
let ticketId = '';
let sosId = '';
let contactId = '';
let paymentMethodId = '';
let bankAccountId = '';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const results = [];

function assert(condition, message, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
    results.push({ status: 'PASS', message, details });
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${message} - ${details}`);
    results.push({ status: 'FAIL', message, details });
  }
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => {
    // Unwrap { success: true, data: T } if present
    if (res.data && typeof res.data === 'object' && 'success' in res.data && 'data' in res.data) {
      res.data = res.data.data;
    }
    return res;
  },
  (err) => Promise.reject(err)
);

async function runAllTests() {
  console.log('===============================================================');
  console.log('🚀 STARTING COBUDDY CUSTOMER FULL END-TO-END VERIFICATION SUITE');
  console.log('===============================================================\n');

  try {
    // ── 1. SYSTEM & CONFIG VERIFICATION ──────────────────────────────────────
    console.log('📋 STEP 1: System & Config Health Check');
    const statusRes = await api.get('/system/status');
    assert(statusRes.status === 200 && statusRes.data.status === 'operational', 'GET /system/status returns operational');

    const configRes = await api.get('/system/config');
    assert(configRes.data.minAppVersion === '1.0.0', 'GET /system/config returns valid remote config');

    const masterDataRes = await api.get('/system/master-data');
    assert(Array.isArray(masterDataRes.data.activityCategories), 'GET /system/master-data returns activityCategories');

    // ── 2. AUTH FLOW & DB VERIFICATION ───────────────────────────────────────
    console.log('\n📋 STEP 2: Authentication & Database Creation');
    // Cleanup prior test user if exists
    await prisma.customer.deleteMany({ where: { phone: TEST_PHONE } }).catch(() => {});

    const sendOtpRes = await api.post('/auth/send-otp', { phone: TEST_PHONE });
    assert(sendOtpRes.data.message === 'OTP sent successfully', 'POST /auth/send-otp succeeds');

    // Verify OTP in DB
    const otpRecord = await prisma.customerOtp.findFirst({ where: { phone: TEST_PHONE } });
    assert(otpRecord !== null, 'Customer OTP persisted in PostgreSQL customer_otps');

    const otpToUse = otpRecord ? otpRecord.otp : '123456';
    const verifyOtpRes = await api.post('/auth/verify-otp', { phone: TEST_PHONE, otp: otpToUse });
    assert(verifyOtpRes.data.accessToken && verifyOtpRes.data.customer, 'POST /auth/verify-otp returns tokens and customer payload');

    authToken = verifyOtpRes.data.accessToken;
    refreshToken = verifyOtpRes.data.refreshToken;
    customerId = verifyOtpRes.data.customer.id;

    // Verify PostgreSQL customer record
    const dbCustomer = await prisma.customer.findUnique({ where: { id: customerId } });
    assert(dbCustomer && dbCustomer.phone === TEST_PHONE, 'Customer persisted in PostgreSQL customers table');

    // Verify PostgreSQL customer wallet record
    const dbWallet = await prisma.customerWallet.findUnique({ where: { customerId } });
    assert(dbWallet && dbWallet.balance === 0, 'Customer Wallet automatically initialized in PostgreSQL');

    // Verify PostgreSQL customer settings record
    const dbSettings = await prisma.customerSetting.findUnique({ where: { customerId } });
    assert(dbSettings !== null, 'Customer Settings automatically initialized in PostgreSQL');

    // Verify /auth/me
    const meRes = await api.get('/auth/me');
    assert(meRes.data.id === customerId, 'GET /auth/me returns authenticated customer profile');

    // Verify /auth/refresh
    const refreshRes = await api.post('/auth/refresh', { refreshToken });
    assert(refreshRes.data.accessToken && refreshRes.data.refreshToken, 'POST /auth/refresh successfully rotates tokens');
    authToken = refreshRes.data.accessToken;
    refreshToken = refreshRes.data.refreshToken;

    // ── 3. ONBOARDING & PROFILE SETUP ────────────────────────────────────────
    console.log('\n📋 STEP 3: Onboarding & Profile Setup Flow');
    const consentRes = await api.post('/profile/legal-consent', {
      tosAccepted: true,
      privacyAccepted: true,
      communityGuidelinesAccepted: true,
      safetyAgreementAccepted: true,
    });
    assert(consentRes.data.success === true, 'POST /profile/legal-consent saves consent');

    // Verify in DB
    const dbConsent = await prisma.customer.findUnique({ where: { id: customerId } });
    assert(dbConsent.tosAccepted === true && dbConsent.safetyAgreementAccepted === true, 'Legal consent persisted in PostgreSQL');

    const locRes = await api.patch('/profile/location', {
      city: 'Mumbai',
      latitude: 19.076,
      longitude: 72.8777,
      address: 'Bandra West, Mumbai',
      permissionGranted: true,
    });
    assert(locRes.data.success === true && locRes.data.city === 'Mumbai', 'PATCH /profile/location updates location');

    const profileUpdateRes = await api.patch('/profile', {
      name: 'Rohan Sharma',
      bio: 'Enthusiastic explorer of tech and coffee.',
      age: 27,
      dob: '1999-05-15',
      gender: 'Male',
    });
    assert(profileUpdateRes.data.name === 'Rohan Sharma', 'PATCH /profile updates basic profile info');

    const interestsRes = await api.patch('/profile/interests', {
      interests: ['Coffee Meetup', 'Art & Museums', 'Gaming'],
    });
    assert(interestsRes.data.success === true, 'PATCH /profile/interests saves customer interests');

    const completeOnboardRes = await api.post('/profile/complete-onboarding', {
      name: 'Rohan Sharma',
      city: 'Mumbai',
      gender: 'Male',
      age: 27,
    });
    assert(completeOnboardRes.data.customer.isOnboardingComplete === true, 'POST /profile/complete-onboarding marks onboarding complete');

    const progressRes = await api.get('/profile/onboarding-progress');
    assert(progressRes.data.isOnboardingComplete === true, 'GET /profile/onboarding-progress confirms completed onboarding');

    // ── 4. KYC SUBMISSION FLOW ───────────────────────────────────────────────
    console.log('\n📋 STEP 4: KYC Submission & Verification Flow');
    const kycDocRes = await api.post('/kyc/document', {
      docType: 'AADHAAR',
      docNumber: '9999 8888 7777',
      legalName: 'Rohan Sharma',
      frontDocUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136',
      backDocUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136',
    });
    assert(kycDocRes.data.message !== undefined, 'POST /kyc/document submits KYC identity documents');

    const kycSelfieRes = await api.post('/kyc/selfie', {
      selfieUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
    });
    assert(kycSelfieRes.data.message !== undefined, 'POST /kyc/selfie submits KYC selfie image');

    const kycLivenessRes = await api.post('/kyc/liveness', {
      livenessUrl: 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4',
    });
    assert(kycLivenessRes.data.message !== undefined, 'POST /kyc/liveness submits KYC liveness verification');

    const kycStatusRes = await api.get('/kyc/status');
    assert(kycStatusRes.data.status === 'verified', 'GET /kyc/status confirms verified customer KYC status');

    const dbKyc = await prisma.customerKyc.findUnique({ where: { customerId } });
    assert(dbKyc && dbKyc.status === 'verified', 'KYC record persisted and verified in PostgreSQL customer_kyc');

    // ── 5. DISCOVERY & FAVORITES ─────────────────────────────────────────────
    console.log('\n📋 STEP 5: Discovery & Favorites Flow');
    const companionsRes = await api.get('/discovery/companions');
    assert(Array.isArray(companionsRes.data.companions) && companionsRes.data.companions.length > 0, 'GET /discovery/companions returns companions list');

    const filteredCompanionsRes = await api.get('/discovery/companions', { params: { category: 'coffee', gender: 'Female' } });
    assert(Array.isArray(filteredCompanionsRes.data.companions), 'GET /discovery/companions with category & gender filtering works');

    const featuredRes = await api.get('/discovery/featured');
    assert(Array.isArray(featuredRes.data) && featuredRes.data.length > 0, 'GET /discovery/featured returns top-rated companions');

    const companionDetailRes = await api.get('/discovery/companions/c1');
    assert(companionDetailRes.data.id === 'c1' && companionDetailRes.data.pricing, 'GET /discovery/companions/:id returns companion detail');

    const addFavRes = await api.post('/discovery/favorites/c1');
    assert(addFavRes.data.message === 'Added to favorites', 'POST /discovery/favorites/:companionId saves favorite');

    const dbFav = await prisma.customerFavorite.findUnique({ where: { customerId_companionId: { customerId, companionId: 'c1' } } });
    assert(dbFav !== null, 'Favorite persisted in PostgreSQL customer_favorites');

    const favsListRes = await api.get('/discovery/favorites');
    assert(favsListRes.data.length > 0, 'GET /discovery/favorites returns favorited companions');

    const delFavRes = await api.delete('/discovery/favorites/c1');
    assert(delFavRes.data.message === 'Removed from favorites', 'DELETE /discovery/favorites/:companionId removes favorite');

    // ── 6. BOOKING LIFECYCLE ─────────────────────────────────────────────────
    console.log('\n📋 STEP 6: Booking Request & Pricing Lifecycle');
    const bookingReqData = {
      companionId: 'c1',
      companionName: 'Elena Vasquez',
      activityId: 'INT-1',
      activityName: 'Coffee Meetup',
      venueName: 'Blue Tokai Cafe',
      venueAddress: 'Bandra West, Mumbai',
      date: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      time: '18:00',
      durationHours: 2,
      baseRate: 500,
      specialInstructions: 'Looking forward to discussing local architecture.',
    };

    const createBookingRes = await api.post('/bookings', bookingReqData);
    assert(createBookingRes.data.id && createBookingRes.data.pricing, 'POST /bookings creates booking with server-calculated pricing');
    bookingId = createBookingRes.data.id;

    // Verify Server-Side Pricing math: baseRate=500, duration=2 -> baseTotal=1000, platformFee(15%)=150, tax(18%)=180, totalAmount=1330
    const pricing = createBookingRes.data.pricing;
    assert(pricing.baseTotal === 1000 && pricing.platformFee === 150 && pricing.taxAmount === 180 && pricing.totalAmount === 1330, 'Server-side 15% platform fee and 18% GST pricing strictly validated');

    // Verify PostgreSQL booking persistence
    const dbBooking = await prisma.customerBooking.findUnique({ where: { id: bookingId } });
    assert(dbBooking && dbBooking.customerId === customerId && dbBooking.totalAmount === 1330, 'Customer booking persisted in PostgreSQL customer_bookings table');

    const getBookingRes = await api.get(`/bookings/${bookingId}`);
    assert(getBookingRes.data.id === bookingId && getBookingRes.data.status === 'pending', 'GET /bookings/:id retrieves persisted booking detail');

    const listBookingsRes = await api.get('/bookings', { params: { filter: 'pending' } });
    assert(Array.isArray(listBookingsRes.data) && listBookingsRes.data.some(b => b.id === bookingId), 'GET /bookings?filter=pending returns created booking');

    const modifyRes = await api.patch(`/bookings/${bookingId}/modify`, {
      time: '19:00',
      specialInstructions: 'Updated instructions for Blue Tokai meetup.',
    });
    assert(modifyRes.data.time === '19:00', 'PATCH /bookings/:id/modify updates pending booking');

    // ── 7. PAYMENT & WALLET MANAGEMENT ───────────────────────────────────────
    console.log('\n📋 STEP 7: Payment Order & Wallet Management');
    const orderRes = await api.post('/payments/create-order', { bookingId });
    assert(orderRes.data.orderId && orderRes.data.amount === 133000, 'POST /payments/create-order creates Razorpay order for booking amount in paise');

    const dbOrder = await prisma.customerRazorpayOrder.findUnique({ where: { orderId: orderRes.data.orderId } });
    assert(dbOrder && dbOrder.bookingId === bookingId && dbOrder.amount === 1330, 'Razorpay order persisted in PostgreSQL customer_razorpay_orders');

    const walletBalRes = await api.get('/wallet/balance');
    assert(walletBalRes.data.balance !== undefined, 'GET /wallet/balance retrieves customer wallet');

    const addPmRes = await api.post('/wallet/payment-methods', {
      type: 'upi',
      title: 'Google Pay UPI',
      sub: 'rohan@okhdfcbank',
      icon: 'cellphone-wireless',
      isDefault: true,
    });
    assert(addPmRes.data.id !== undefined, 'POST /wallet/payment-methods adds payment method');
    paymentMethodId = addPmRes.data.id;

    const pmListRes = await api.get('/wallet/payment-methods');
    assert(pmListRes.data.length > 0, 'GET /wallet/payment-methods returns saved payment methods');

    const addBankRes = await api.post('/wallet/bank-accounts', {
      accName: 'Rohan Sharma',
      accNumber: '123456789012',
      ifsc: 'HDFC0001234',
    });
    assert(addBankRes.data.id !== undefined, 'POST /wallet/bank-accounts adds payout bank account');
    bankAccountId = addBankRes.data.id;

    const bankListRes = await api.get('/wallet/bank-accounts');
    assert(bankListRes.data.length > 0, 'GET /wallet/bank-accounts returns saved bank accounts');

    // ── 8. LIVE SESSIONS & COMPANION REVIEW ──────────────────────────────────
    console.log('\n📋 STEP 8: Session Check-In, Live Management & Completion');
    // Set booking to confirmed in DB so check-in is allowed
    await prisma.customerBooking.update({ where: { id: bookingId }, data: { status: 'confirmed' } });

    const checkInRes = await api.post('/sessions/check-in', { bookingId });
    assert(checkInRes.data.id && checkInRes.data.passCode, 'POST /sessions/check-in initiates live session with passCode');
    sessionId = checkInRes.data.id;

    const dbSession = await prisma.customerSession.findUnique({ where: { id: sessionId } });
    assert(dbSession && dbSession.bookingId === bookingId, 'Customer session persisted in PostgreSQL customer_sessions');

    const currentSessionRes = await api.get('/sessions/current');
    assert(currentSessionRes.data && currentSessionRes.data.id === sessionId, 'GET /sessions/current returns active live session');

    const sessionPassRes = await api.get(`/sessions/${sessionId}/pass`);
    assert(sessionPassRes.data.sessionId === sessionId && sessionPassRes.data.passCode, 'GET /sessions/:id/pass returns digital pass');

    const extendRes = await api.patch(`/sessions/${sessionId}/extend`, { extraMinutes: 30 });
    assert(extendRes.data.extensionMinutes === 30, 'PATCH /sessions/:id/extend extends active session');

    const endSessionRes = await api.patch(`/sessions/${sessionId}/end`, { tip: 100 });
    assert(endSessionRes.data.status === 'completed', 'PATCH /sessions/:id/end successfully completes session');

    const feedbackRes = await api.post(`/sessions/${sessionId}/feedback`, {
      sentiment: 'up',
      tags: ['Punctual', 'Great Conversation', 'Respectful'],
    });
    assert(feedbackRes.data.success === true, 'POST /sessions/:id/feedback submits sentiment feedback');

    const dbFeedback = await prisma.customerSessionFeedback.findUnique({ where: { sessionId } });
    assert(dbFeedback && dbFeedback.sentiment === 'up', 'Session feedback persisted in PostgreSQL customer_session_feedbacks');

    // ── 9. REVIEWS & RATINGS ─────────────────────────────────────────────────
    console.log('\n📋 STEP 9: Review & Rating Submission');
    const reviewRes = await api.post('/reviews', {
      companionId: 'c1',
      bookingId,
      rating: 5,
      comment: 'Elena was phenomenal. Extremely professional and courteous.',
      punctuality: 5,
      communication: 5,
      behavior: 5,
    });
    assert(reviewRes.data.id && reviewRes.data.rating === 5, 'POST /reviews submits 5-star review for completed booking');

    const dbReview = await prisma.customerReview.findFirst({ where: { bookingId } });
    assert(dbReview && dbReview.rating === 5, 'Customer review persisted in PostgreSQL customer_reviews');

    const myReviewsRes = await api.get('/reviews/my');
    assert(myReviewsRes.data.length > 0, 'GET /reviews/my returns submitted reviews');

    const companionReviewsRes = await api.get('/reviews/companion/c1');
    assert(Array.isArray(companionReviewsRes.data), 'GET /reviews/companion/:id returns companion public reviews');

    // ── 10. CHAT CONVERSATIONS & MESSAGING ───────────────────────────────────
    console.log('\n📋 STEP 10: Chat & Realtime Messaging');
    const compConvRes = await api.post('/chat/conversations/companion', { companionId: 'c1', bookingId });
    assert(compConvRes.data.id !== undefined, 'POST /chat/conversations/companion gets/creates conversation');
    const convId = compConvRes.data.id;

    const conciergeConvRes = await api.post('/chat/conversations/concierge');
    assert(conciergeConvRes.data.id !== undefined, 'POST /chat/conversations/concierge gets/creates concierge conversation');

    const sendMsgRes = await api.post(`/chat/conversations/${convId}/messages`, {
      text: 'Hello Elena, see you at Blue Tokai Cafe!',
    });
    assert(sendMsgRes.data.id && sendMsgRes.data.text === 'Hello Elena, see you at Blue Tokai Cafe!', 'POST /chat/conversations/:id/messages sends message');

    const dbMessage = await prisma.customerMessage.findUnique({ where: { id: sendMsgRes.data.id } });
    assert(dbMessage !== null, 'Customer chat message persisted in PostgreSQL customer_messages');

    const msgsListRes = await api.get(`/chat/conversations/${convId}/messages`);
    assert(Array.isArray(msgsListRes.data) && msgsListRes.data.length > 0, 'GET /chat/conversations/:id/messages retrieves messages');

    const readConvRes = await api.patch(`/chat/conversations/${convId}/read`);
    assert(readConvRes.data.message === 'Conversation marked as read', 'PATCH /chat/conversations/:id/read marks read');

    // ── 11. SAFETY & SOS DISPATCH ────────────────────────────────────────────
    console.log('\n📋 STEP 11: Safety, Trusted Contacts & SOS Dispatch');
    const addContactRes = await api.post('/safety/trusted-contacts', {
      name: 'Priya Sharma',
      phone: '+919876543211',
      relationship: 'Sister',
    });
    assert(addContactRes.data.id !== undefined, 'POST /safety/trusted-contacts adds emergency contact');
    contactId = addContactRes.data.id;

    const dbContact = await prisma.customerTrustedContact.findUnique({ where: { id: contactId } });
    assert(dbContact !== null, 'Trusted contact persisted in PostgreSQL customer_trusted_contacts');

    const contactsListRes = await api.get('/safety/trusted-contacts');
    assert(contactsListRes.data.length > 0, 'GET /safety/trusted-contacts returns contact list');

    const triggerSOSRes = await api.post('/safety/sos/trigger', {
      sessionId,
      lat: 19.076,
      lng: 72.8777,
    });
    assert(triggerSOSRes.data.sosId !== undefined, 'POST /safety/sos/trigger triggers emergency alert and notifies contacts');
    sosId = triggerSOSRes.data.sosId;

    const dbSOS = await prisma.customerSOS.findUnique({ where: { id: sosId } });
    assert(dbSOS && dbSOS.status === 'active', 'SOS alert record persisted in PostgreSQL customer_sos');

    const resolveSOSRes = await api.patch(`/safety/sos/${sosId}/resolve`);
    assert(resolveSOSRes.data.status === 'resolved', 'PATCH /safety/sos/:id/resolve resolves SOS');

    const incidentRes = await api.post('/safety/incidents', {
      companionId: 'c1',
      bookingId,
      incidentType: 'safety_concern',
      description: 'Test incident description logged for safety audit.',
    });
    assert(incidentRes.data.id !== undefined, 'POST /safety/incidents submits safety incident report');

    const dbIncident = await prisma.customerIncident.findUnique({ where: { id: incidentRes.data.id } });
    assert(dbIncident !== null, 'Incident report persisted in PostgreSQL customer_incidents');

    // ── 12. SUPPORT & HELP CENTER ────────────────────────────────────────────
    console.log('\n📋 STEP 12: Support Tickets & FAQs');
    const suppCatRes = await api.get('/support/categories');
    assert(Array.isArray(suppCatRes.data) && suppCatRes.data.length > 0, 'GET /support/categories returns help categories');

    const faqsRes = await api.get('/support/faqs');
    assert(Array.isArray(faqsRes.data) && faqsRes.data.length > 0, 'GET /support/faqs returns FAQs');

    const createTicketRes = await api.post('/support/tickets', {
      subject: 'Inquiry regarding wallet transaction',
      category: 'payment_payout',
      message: 'Hello, I have a query about booking invoice download.',
    });
    assert(createTicketRes.data.id !== undefined, 'POST /support/tickets creates support ticket with initial message');
    ticketId = createTicketRes.data.id;

    const dbTicket = await prisma.customerSupportTicket.findUnique({ where: { id: ticketId } });
    assert(dbTicket !== null, 'Support ticket persisted in PostgreSQL customer_support_tickets');

    const replyTicketRes = await api.post(`/support/tickets/${ticketId}/reply`, {
      text: 'Following up with additional details.',
    });
    assert(replyTicketRes.data.id !== undefined, 'POST /support/tickets/:id/reply posts message to ticket thread');

    const ticketDetailRes = await api.get(`/support/tickets/${ticketId}`);
    assert(ticketDetailRes.data.messages && ticketDetailRes.data.messages.length === 2, 'GET /support/tickets/:id returns ticket thread');

    // ── 13. NOTIFICATIONS ────────────────────────────────────────────────────
    console.log('\n📋 STEP 13: Push Notifications & In-App Alerts');
    const notifsRes = await api.get('/notifications');
    const notifsList = Array.isArray(notifsRes.data) ? notifsRes.data : (notifsRes.data?.notifications || []);
    assert(Array.isArray(notifsList) && notifsList.length > 0, 'GET /notifications lists notifications generated across flows');

    const notifId = notifsList[0].id;
    const readNotifRes = await api.patch(`/notifications/${notifId}/read`);
    assert(readNotifRes.data.isRead === true || readNotifRes.data.id === notifId, 'PATCH /notifications/:id/read marks notification as read');

    const readAllRes = await api.patch('/notifications/read-all');
    assert(readAllRes.data.message === 'All notifications marked as read', 'PATCH /notifications/read-all marks all notifications read');

    const devTokenRes = await api.post('/notifications/device-token', {
      fcmToken: 'fcm_sample_device_token_customer_2026',
    });
    assert(devTokenRes.data.message === 'Device token registered', 'POST /notifications/device-token registers push token');

    // ── 14. ACCOUNT SETTINGS & SESSIONS ──────────────────────────────────────
    console.log('\n📋 STEP 14: Account Settings & Active Sessions');
    const settingsRes = await api.get('/account/settings');
    assert(settingsRes.data.language !== undefined || settingsRes.data.appLanguage !== undefined, 'GET /account/settings returns account settings');

    const updateSettingsRes = await api.patch('/account/settings', {
      language: 'en',
      notificationsEnabled: true,
      appLockEnabled: false,
    });
    assert(updateSettingsRes.data !== undefined, 'PATCH /account/settings updates settings in PostgreSQL');

    const notifPrefsRes = await api.get('/account/notification-preferences');
    assert(notifPrefsRes.data.bookings !== undefined, 'GET /account/notification-preferences returns preferences');

    const languagesRes = await api.get('/account/languages');
    assert(languagesRes.data.appLanguage !== undefined, 'GET /account/languages returns language configuration');

    const activeSessionsRes = await api.get('/account/sessions');
    assert(Array.isArray(activeSessionsRes.data) && activeSessionsRes.data.length > 0, 'GET /account/sessions returns active device sessions');

    // Cleanup resources
    await api.delete(`/safety/trusted-contacts/${contactId}`).catch(() => {});
    await api.delete(`/wallet/payment-methods/${paymentMethodId}`).catch(() => {});
    await api.delete(`/wallet/bank-accounts/${bankAccountId}`).catch(() => {});

  } catch (err) {
    console.error('💥 Unhandled Exception during E2E Execution:', err?.response?.data || err.message);
    failedTests++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n===============================================================');
  console.log('📊 COBUDDY CUSTOMER E2E TEST SUMMARY');
  console.log('===============================================================');
  console.log(`Total Tests Run: ${totalTests}`);
  console.log(`✅ Passed:       ${passedTests}`);
  console.log(`❌ Failed:       ${failedTests}`);
  console.log(`Success Rate:    ${Math.round((passedTests / (totalTests || 1)) * 100)}%`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests();
