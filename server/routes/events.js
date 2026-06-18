'use strict';

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { sanitize, SanitizationError } = require('../lib/sanitize');
const { normalizeUrl }                = require('../lib/dedup');

const MAX_BATCH = 100;

// POST /events — insert batch from search results
router.post('/', async (req, res) => {
  const cards = req.body;
  if (!Array.isArray(cards)) return res.status(400).json({ error: 'Body must be a JSON array' });
  if (cards.length > MAX_BATCH) return res.status(400).json({ error: `Max ${MAX_BATCH} per request` });

  let inserted = 0, duplicates = 0;
  const errors = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const raw of cards) {
      try {
        const clean      = sanitize(raw);
        const normalized = normalizeUrl(clean.event_url);
        if (!normalized) throw new SanitizationError('Could not normalize URL');
        const result = await client.query(
          `INSERT INTO events
             (event_url, event_url_normalized, title, start_datetime, end_datetime,
              venue_name, city_location, organizer_name, short_description,
              source_search_term, collected_at, respondent_count)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (event_url_normalized) DO NOTHING`,
          [
            clean.event_url, normalized, clean.title,
            clean.start_datetime   ?? null, clean.end_datetime  ?? null,
            clean.venue_name       ?? null, clean.city_location ?? null,
            clean.organizer_name   ?? null, clean.short_description ?? null,
            clean.source_search_term, clean.collected_at,
            clean.respondent_count ?? 0,
          ]
        );
        if (result.rowCount > 0) inserted++;
        else duplicates++;
      } catch (err) {
        errors.push({ title: raw?.title || '(unknown)', reason: err.message });
      }
    }
    await client.query('COMMIT');
    res.json({ inserted, duplicates, errors });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Batch insert failed:', err);
    res.status(500).json({ error: 'Database error during batch insert' });
  } finally {
    client.release();
  }
});

// POST /events/enrich — update organizer/city/venue/date for one event, matched by URL
// Must be registered BEFORE /:id routes so Express doesn't treat "enrich" as an ID.
router.post('/enrich', async (req, res) => {
  const { event_url, organizer_name, city_location, venue_name, start_datetime } = req.body;

  const normalized = normalizeUrl(event_url);
  if (!normalized) return res.status(400).json({ error: 'Invalid event URL' });

  const ALLOWED = { organizer_name, city_location, venue_name, start_datetime };
  const fields  = {};
  for (const [k, v] of Object.entries(ALLOWED)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') fields[k] = v;
  }
  if (!Object.keys(fields).length) return res.json({ updated: false, reason: 'Nothing to enrich' });

  const keys       = Object.keys(fields);
  const values     = Object.values(fields);
  const setClauses = [...keys.map((k, i) => `${k} = $${i + 1}`), 'enriched_at = NOW()'].join(', ');

  try {
    const result = await pool.query(
      `UPDATE events SET ${setClauses} WHERE event_url_normalized = $${keys.length + 1}`,
      [...values, normalized]
    );
    res.json({ updated: result.rowCount > 0 });
  } catch (err) {
    console.error('POST /events/enrich failed:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// GET /events
router.get('/', async (req, res) => {
  const { term, from, to, limit = 200, offset = 0 } = req.query;

  let sql    = 'SELECT * FROM events WHERE TRUE';
  const params = [];
  if (term) { params.push(`%${term}%`); sql += ` AND source_search_term ILIKE $${params.length}`; }
  if (from) { params.push(from);        sql += ` AND collected_at >= $${params.length}`; }
  if (to)   { params.push(to);          sql += ` AND collected_at <= $${params.length}`; }
  params.push(parseInt(limit,  10));
  params.push(parseInt(offset, 10));
  sql += ` ORDER BY collected_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

  try {
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /events failed:', err);
    res.status(500).json({ error: 'Query failed' });
  }
});

// DELETE /events/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM events WHERE id = $1', [req.params.id]);
    res.json({ deleted: result.rowCount > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// PATCH /events/:id — update notes or enrichment fields from the review UI
router.patch('/:id', async (req, res) => {
  const ALLOWED = ['notes', 'organizer_name', 'city_location', 'venue_name'];
  const fields  = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) fields[key] = req.body[key];
  }
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'No valid fields' });

  const keys       = Object.keys(fields);
  const values     = Object.values(fields);
  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

  try {
    const result = await pool.query(
      `UPDATE events SET ${setClauses} WHERE id = $${keys.length + 1}`,
      [...values, req.params.id]
    );
    res.json({ updated: result.rowCount > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

module.exports = router;
