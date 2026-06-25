'use strict';

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { sanitizeIGPost, SanitizationError } = require('../lib/sanitize');
const { normalizeIGUrl }                    = require('../lib/dedup');

const MAX_BATCH = 50;

// Reject obvious resale / spam posts before inserting.
const RESALE_RE = /\b(wts|wtb|wtt|lfs|lfb|lft|passaway|pasabay)\b|ticket[s]?\s+(for sale|transfer|resell|selling)|selling\s+ticket/i;
const SPAM_RE   = /^(follow us|stream now|out now|listen now|pre[-\s]?order|dropping|available now)/i;

function isEligibleCaption(caption) {
  if (!caption) return true; // caption-less image posts are allowed
  if (RESALE_RE.test(caption)) return false;
  if (SPAM_RE.test(caption))   return false;
  return true;
}

// POST /events/instagram — batch insert Instagram post cards collected by the extension.
// Pipeline per card:
//   1. sanitize          — validate URL, strip HTML, reject PII in author handle
//   2. normalize         — canonical dedup key (instagram.com/p/<shortcode>)
//   3. keyword pre-filter — reject obvious resale / spam
//   4. URL dedup          — ON CONFLICT DO NOTHING on event_url_normalized
router.post('/', async (req, res) => {
  const cards = req.body;
  if (!Array.isArray(cards)) return res.status(400).json({ error: 'Body must be a JSON array' });
  if (cards.length > MAX_BATCH) return res.status(400).json({ error: `Max ${MAX_BATCH} per request` });

  let inserted = 0, duplicates = 0, skipped = 0;
  const errors = [];

  console.log('[instagram] batch received:', cards.length, 'card(s)');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const raw of cards) {
      const label = (raw?.post_url || '(unknown)').substring(0, 80);
      try {
        const clean      = sanitizeIGPost(raw);
        const normalized = normalizeIGUrl(clean.post_url);
        if (!normalized) throw new SanitizationError('Could not normalize Instagram post URL');

        if (!isEligibleCaption(clean.raw_caption)) {
          console.log(`[instagram] SKIP (pre-filter) ${label}`);
          skipped++;
          continue;
        }

        const handle  = clean.author_handle || 'instagram';
        const snippet = (clean.raw_caption || '').substring(0, 80);
        const title   = snippet ? `${handle}: ${snippet}` : `${handle}: ${normalized}`;

        const result = await client.query(
          `INSERT INTO events
             (event_url, event_url_normalized, title,
              start_datetime, end_datetime,
              venue_name, city_location, organizer_name,
              short_description, source_search_term,
              collected_at, respondent_count, source, enriched_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (event_url_normalized) DO NOTHING`,
          [
            clean.post_url, normalized, title,
            null, null,
            null, null,
            clean.author_handle || null,
            clean.raw_caption ? clean.raw_caption.substring(0, 500) : null,
            raw.search_term || 'instagram.posts',
            clean.collected_at,
            0,
            'instagram.posts',
            null,
          ]
        );

        if (result.rowCount > 0) {
          console.log(`[instagram] SAVE "${title.substring(0, 60)}"`);
          inserted++;
        } else {
          console.log(`[instagram] DUP ${label}`);
          duplicates++;
        }
      } catch (err) {
        console.error(`[instagram] ERROR ${label} → ${err.message}`);
        errors.push({ post: raw?.post_url || '(unknown)', reason: err.message });
      }
    }

    await client.query('COMMIT');
    res.json({ inserted, duplicates, skipped, errors });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Instagram batch insert failed:', err);
    res.status(500).json({ error: 'Database error during Instagram batch insert' });
  } finally {
    client.release();
  }
});

module.exports = router;
