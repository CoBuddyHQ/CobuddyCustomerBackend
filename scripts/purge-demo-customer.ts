import 'dotenv/config';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

async function purge() {
  const client = await pool.connect();
  try {
    console.log('Purging demo seed customer (+919876543210)...');
    await client.query('BEGIN');
    
    // Find demo customer ID
    const custRes = await client.query("SELECT id FROM customers WHERE phone = '+919876543210'");
    if (custRes.rows.length === 0) {
      console.log('No demo customer found.');
      await client.query('ROLLBACK');
      return;
    }
    const customerId = custRes.rows[0].id;
    console.log(`Found demo customer ID: ${customerId}`);

    // Delete related child records explicitly if foreign keys don't cascade
    await client.query('DELETE FROM customer_transactions WHERE "customerId" = $1', [customerId]);
    await client.query('DELETE FROM customer_wallets WHERE "customerId" = $1', [customerId]);
    await client.query('DELETE FROM customer_sessions WHERE "customerId" = $1', [customerId]);
    await client.query('DELETE FROM customer_bookings WHERE "customerId" = $1', [customerId]);
    await client.query('DELETE FROM customer_notifications WHERE "customerId" = $1', [customerId]);
    await client.query('DELETE FROM customer_trusted_contacts WHERE "customerId" = $1', [customerId]);
    await client.query('DELETE FROM customer_payment_methods WHERE "customerId" = $1', [customerId]);
    await client.query('DELETE FROM customer_kyc WHERE "customerId" = $1', [customerId]);
    await client.query('DELETE FROM customer_settings WHERE "customerId" = $1', [customerId]);
    await client.query('DELETE FROM customer_otps WHERE phone = $1', ['+919876543210']);
    await client.query('DELETE FROM customer_refresh_tokens WHERE "customerId" = $1', [customerId]);
    await client.query('DELETE FROM customers WHERE id = $1', [customerId]);

    await client.query('COMMIT');
    console.log('✅ Demo customer and all associated mock bookings/data successfully purged!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Purge error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

purge();
