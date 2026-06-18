'use strict';

const express = require('express');
const router  = express.Router();
const { getDb }           = require('../db/database');
const { sanitize, SanitizationError } = require('../lib/sanitize');
const { normalizeUrl }    = require('../lib/dedup');

const MAX_BATCH = 100;

// POST /events — insert batch from search results
router.post('/', (req, res) => {
  const cards = req.body;
  if (!Array.isArray(cards)) return res.status(400).json({ error: 'Body must be a JSON array' });
  if (cards.length > MAX_BATCH) return res.status(400).json({ error: `Max ${MAX_BATCH} per request` });

  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO events
      (event_url, event_url_normalized, title, start_datetime, end_datetime,
       venue_name, city_location, organizer_name, short_description,
       source_search_term, collected_at, respondent_count)
    VALUES
      (@event_url, @event_url_normalized, @title, @start_datetime, @end_datetime,
       @venue_name, @city_location, @organizer_name, @short_description,
       @source_search_term, @collected_at, @respondent_count)
  `);

  let inserted = 0, duplicates = 0;
  const errors = [];

  const runBatch = db.transaction((batch) => {
    for (const raw of batch) {
      try {
        const clean      = sanitize(raw);
        const normalized = normalizeUrl(clean.event_url);
        if (!normalized) throw new SanitizationError('Could not normalize URL');
        const result = insert.run({ ...clean, event_url_normalized: normalized });
        if (result.changes > 0) inserted++;
        else duplicates++;
      } catch (err) {
        errors.push({ title: raw?.title || '(unknown)', reason: err.message });
      }
    }
  });

  try {
    runBatch(cards);
    res.json({ inserted, duplicates, errors });
  } catch (err) {
    console.error('Batch insert failed:', err);
    res.status(500).json({ error: 'Database error during batch insert' });
  }
});

// POST /events/enrich — update organizer/city/venue/date for one event, matched by URL
// Must be registered BEFORE /:id routes so Express doesn't treat "enrich" as an ID.
router.post('/enrich', (req, res) => {
  const db = getDb();
  const { event_url, organizer_name, city_location, venue_name, start_datetime } = req.body;

  const normalized = normalizeUrl(event_url);
  if (!normalized) return res.status(400).json({ error: 'Invalid event URL' });

  const ALLOWED = { organizer_name, city_location, venue_name, start_datetime };
  const fields  = {};
  for (const [k, v] of Object.entries(ALLOWED)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') fields[k] = v;
  }
  if (!Object.keys(fields).length) return res.json({ updated: false, reason: 'Nothing to enrich' });

  const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const values     = [...Object.values(fields), normalized];

  try {
    const result = db.prepare(
      `UPDATE events SET ${setClauses} WHERE event_url_normalized = ?`
    ).run(values);
    res.json({ updated: result.changes > 0 });
  } catch (err) {
    console.error('POST /events/enrich failed:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// GET /events
router.get('/', (req, res) => {
  const db = getDb();
  const { term, from, to, limit = 200, offset = 0 } = req.query;

  let sql    = 'SELECT * FROM events WHERE 1=1';
  const params = {};
  if (term) { sql += ' AND source_search_term LIKE @term'; params.term = `%${term}%`; }
  if (from) { sql += ' AND collected_at >= @from';         params.from = from; }
  if (to)   { sql += ' AND collected_at <= @to';           params.to   = to; }
  sql += ' ORDER BY collected_at DESC LIMIT @limit OFFSET @offset';
  params.limit  = parseInt(limit, 10);
  params.offset = parseInt(offset, 10);

  try {
    res.json(db.prepare(sql).all(params));
  } catch (err) {
    console.error('GET /events failed:', err);
    res.status(500).json({ error: 'Query failed' });
  }
});

// DELETE /events/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  try {
    const result = db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
    res.json({ deleted: result.changes > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// PATCH /events/:id — update notes or any enrichment fields from the review UI
router.patch('/:id', (req, res) => {
  const db = getDb();
  const ALLOWED = ['notes', 'organizer_name', 'city_location', 'venue_name'];
  const fields  = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) fields[key] = req.body[key];
  }
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'No valid fields' });

  const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const values     = [...Object.values(fields), req.params.id];
  try {
    const result = db.prepare(`UPDATE events SET ${setClauses} WHERE id = ?`).run(values);
    res.json({ updated: result.changes > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

module.exports = router;
