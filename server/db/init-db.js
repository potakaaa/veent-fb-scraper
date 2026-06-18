'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs   = require('fs');
const path = require('path');
const pool = require('./pool');

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.pg.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log('Schema applied to Neon database.');
  } finally {
    client.release();
    await pool.end();
  }
}

init().catch(err => { console.error(err); process.exit(1); });
