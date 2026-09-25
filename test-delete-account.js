require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://cobuddy:development-secret-password-2026@localhost:5433/cobuddy_customer_db?schema=public',
});

const BASE_URL = 'http://localhost:4002/api/v1';
const TEST_PHONE = '+919999900001';

async function runTest() {
  console.log('===============================================================');
  console.log('🧪 TESTING DELETE ACCOUNT PURGE & CASCADE PERSISTENCE');
  console.log('===============================================================');

  // Step 1: Clean any existing test user
  await pool.query('DELETE FROM customers WHERE phone = $1', [TEST_PHONE]);

  // Step 2: Register/Login test customer
  console.log('📋 STEP 1: Registering & logging in test customer...');
  await axios.post(`${BASE_URL}/auth/send-otp`, { phone: TEST_PHONE });
  const verifyRes = await axios.post(`${BASE_URL}/auth/verify-otp`, {
    phone: TEST_PHONE,
    otp: '123456',
  });
  const token = verifyRes.data.data ? verifyRes.data.data.accessToken : verifyRes.data.accessToken;
  const customerId = verifyRes.data.data ? verifyRes.data.data.customer.id : verifyRes.data.customer.id;
  console.log(`  ✅ Registered test customer: ${customerId}`);

  const api = axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${token}` },
  });

  // Step 3: Populate customer records (settings, trusted contact, favorite, KYC)
  console.log('📋 STEP 2: Creating customer child records in PostgreSQL...');
  await api.post('/safety/trusted-contacts', {
    name: 'Emergency Friend',
    phone: '+919876543299',
    relationship: 'Friend',
  });
  await api.post('/discovery/favorites/c1');
  await api.post('/kyc/document', {
    docType: 'AADHAAR',
    docNumber: '111122223333',
    legalName: 'Test Delete User',
    frontDocUrl: 'https://placehold.co/front.jpg',
  });

  // Verify in PostgreSQL that rows exist
  const beforeCustomer = await pool.query('SELECT id FROM customers WHERE id = $1', [customerId]);
  const beforeContacts = await pool.query('SELECT id FROM customer_trusted_contacts WHERE "customerId" = $1', [customerId]);
  const beforeKyc = await pool.query('SELECT id FROM customer_kyc WHERE "customerId" = $1', [customerId]);
  const beforeFavorites = await pool.query('SELECT id FROM customer_favorites WHERE "customerId" = $1', [customerId]);

  console.log(`  📊 DB Check BEFORE delete:`);
  console.log(`     Customer row: ${beforeCustomer.rowCount}`);
  console.log(`     Trusted contacts: ${beforeContacts.rowCount}`);
  console.log(`     KYC: ${beforeKyc.rowCount}`);
  console.log(`     Favorites: ${beforeFavorites.rowCount}`);

  if (beforeCustomer.rowCount !== 1 || beforeContacts.rowCount !== 1) {
    throw new Error('Failed to seed child records before test');
  }

  // Step 4: Call DELETE /account/delete
  console.log('📋 STEP 3: Calling DELETE /account/delete API...');
  const deleteRes = await api.delete('/account/delete');
  console.log(`  ✅ API Response:`, deleteRes.data);

  // Step 5: Verify in PostgreSQL that EVERYTHING is purged!
  console.log('📋 STEP 4: Verifying PostgreSQL database purge...');
  const afterCustomer = await pool.query('SELECT id FROM customers WHERE id = $1', [customerId]);
  const afterContacts = await pool.query('SELECT id FROM customer_trusted_contacts WHERE "customerId" = $1', [customerId]);
  const afterKyc = await pool.query('SELECT id FROM customer_kyc WHERE "customerId" = $1', [customerId]);
  const afterFavorites = await pool.query('SELECT id FROM customer_favorites WHERE "customerId" = $1', [customerId]);
  const afterSettings = await pool.query('SELECT id FROM customer_settings WHERE "customerId" = $1', [customerId]);
  const afterWallet = await pool.query('SELECT id FROM customer_wallets WHERE "customerId" = $1', [customerId]);

  console.log(`  📊 DB Check AFTER delete:`);
  console.log(`     Customer row: ${afterCustomer.rowCount} (Expected: 0)`);
  console.log(`     Trusted contacts: ${afterContacts.rowCount} (Expected: 0)`);
  console.log(`     KYC: ${afterKyc.rowCount} (Expected: 0)`);
  console.log(`     Favorites: ${afterFavorites.rowCount} (Expected: 0)`);
  console.log(`     Settings: ${afterSettings.rowCount} (Expected: 0)`);
  console.log(`     Wallet: ${afterWallet.rowCount} (Expected: 0)`);

  const allZero = afterCustomer.rowCount === 0 &&
                  afterContacts.rowCount === 0 &&
                  afterKyc.rowCount === 0 &&
                  afterFavorites.rowCount === 0 &&
                  afterSettings.rowCount === 0 &&
                  afterWallet.rowCount === 0;

  if (allZero) {
    console.log('  🎉 SUCCESS: 100% of customer data and relations were permanently purged!');
  } else {
    console.error('  ❌ FAILED: Some customer data remained in the database!');
    process.exit(1);
  }

  // Step 6: Verify old token is rejected
  console.log('📋 STEP 5: Verifying deleted customer token is rejected...');
  try {
    await api.get('/profile');
    console.error('  ❌ FAILED: Token should have been rejected!');
    process.exit(1);
  } catch (err) {
    console.log(`  ✅ Old token rejected with HTTP ${err.response ? err.response.status : 'network error'}`);
  }

  await pool.end();
  console.log('===============================================================');
  console.log('✅ ALL DELETE ACCOUNT VERIFICATIONS PASSED 100%');
  console.log('===============================================================');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  pool.end();
  process.exit(1);
});
