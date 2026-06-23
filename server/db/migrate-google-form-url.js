'use strict';

// One-off, idempotent migration for the Facebook Posts scraper.
// Adds the additive `google_form_url TEXT` column to the events table.
//
// Usage (from the server/ directory, with DATABASE_URL set in .env or the env):
//   node db/migrate-google-form-url.js
//
// Safe to run repeatedly — uses ADD COLUMN IF NOT EXISTS. No existing data is
// touched; every existing row keeps google_form_url = NULL.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = require('./pool');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ABORT: DATABASE_URL is not set. Check server/.env before migrating.');
    process.exit(1);
  }

  // Print the target host (not the secret) so the operator can confirm the instance.
  try {
    const host = new URL(process.env.DATABASE_URL).hostname;
    console.log(`Target DB host: ${host}`);
  } catch {
    console.warn('Could not parse DATABASE_URL host for confirmation.');
  }

  try {
    await pool.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS google_form_url TEXT;');
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'events' AND column_name = 'google_form_url';`
    );
    if (rows.length === 1) {
      console.log('OK: google_form_url column present.');
    } else {
      console.error('WARNING: column not found after migration.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
