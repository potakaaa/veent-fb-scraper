'use strict';

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { sanitizeX, SanitizationError } = require('../lib/sanitize');
const { normalizeXUrl }                = require('../lib/dedup');
const { structureXEvent }              = require('../lib/llm');

const MAX_BATCH_X = 50;

// Keyword pre-filter — reject obvious non-event posts before hitting the LLM.
// Catches ticket resale abbreviations common in PH fandom communities, plus
// generic slop that matches event search terms without being event announcements.
const RESALE_RE = /\b(wts|wtb|wtt|lfs|lfb|lft|passaway|pasabay)\b|ticket[s]?\s+(for sale|transfer|resell|selling)|selling\s+ticket/i;
const SLOP_RE   = /^(rt @|📢\s*rt|share this|follow us|stream now|streaming now|out now|listen now|pre[-\s]?order now|dropping|available now)/i;
const MIN_CAPTION_LEN = 30; // tweets shorter than this are almost never event announcements

function isEligibleCaption(caption) {
  if (!caption || caption.length < MIN_CAPTION_LEN) return false;
  if (RESALE_RE.test(caption)) return false;
  if (SLOP_RE.test(caption))   return false;
  return true;
}

// POST /events/x — insert a batch of raw X.com tweet cards.
// Pipeline per card:
//   1. Keyword pre-filter  — reject obvious resale / slop
//   2. LLM structuring     — extract fields + is_event classification
//   3. Content dedup       — skip if identical title already exists for x.com
//   4. URL dedup           — ON CONFLICT DO NOTHING on event_url_normalized
router.post('/', async (req, res) => {
  const cards = req.body;
  if (!Array.isArray(cards)) return res.status(400).json({ error: 'Body must be a JSON array' });
  if (cards.length > MAX_BATCH_X) return res.status(400).json({ error: `Max ${MAX_BATCH_X} per request` });

  let inserted = 0, duplicates = 0, skipped = 0;
  const errors = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const raw of cards) {
      try {
        const clean      = sanitizeX(raw);
        const normalized = normalizeXUrl(clean.tweet_url);
        if (!normalized) throw new SanitizationError('Could not normalize X.com URL');

        // Stage 1 — keyword pre-filter (no LLM call needed)
        if (!isEligibleCaption(clean.raw_caption)) {
          skipped++;
          continue;
        }

        // Stage 2 — LLM structuring + eligibility classification
        // null means Ollama is down; insert with fallback title (permissive).
        const structured = await structureXEvent(
          clean.raw_caption, clean.author_handle, clean.tweet_timestamp,
        );

        // If LLM ran and explicitly marked this as not an event, skip it.
        if (structured !== null && structured.is_event === false) {
          skipped++;
          continue;
        }

        const fields = structured || {
          is_event:          true,
          title:             null,
          start_datetime:    null,
          venue_name:        null,
          city_location:     null,
          organizer_name:    null,
          short_description: null,
        };

        const title = (fields.title && String(fields.title).trim())
          || `${clean.author_handle}: ${clean.raw_caption.substring(0, 80)}`;

        // Stage 3 — content dedup.
        // Strip emojis, symbols, and punctuation from both sides before comparing
        // so "F✦FOREVER 1ST WORLD TOUR" matches "FOREVER 1ST WORLD TOUR".
        // Secondary signal: same venue + same date = same event regardless of title.
        const dupCheck = await client.query(
          `SELECT 1 FROM events
           WHERE source = 'x.com'
           AND (
             -- Exact normalized title match (strips emojis/symbols)
             regexp_replace(LOWER(TRIM(title)),      '[^a-z0-9 ]+', '', 'g')
             = regexp_replace(LOWER(TRIM($1::text)), '[^a-z0-9 ]+', '', 'g')

             OR (
               -- Prefix match: catches "iKON FOUR EVER TOUR" vs "iKON FOUR EVER TOUR in Manila".
               -- Require ≥10 chars so short titles don't produce false positives.
               LENGTH(regexp_replace(LOWER(TRIM($1::text)), '[^a-z0-9 ]+', '', 'g')) >= 10
               AND (
                 regexp_replace(LOWER(TRIM(title)),      '[^a-z0-9 ]+', '', 'g')
                   LIKE regexp_replace(LOWER(TRIM($1::text)), '[^a-z0-9 ]+', '', 'g') || ' %'
                 OR
                 regexp_replace(LOWER(TRIM($1::text)), '[^a-z0-9 ]+', '', 'g')
                   LIKE regexp_replace(LOWER(TRIM(title)), '[^a-z0-9 ]+', '', 'g') || ' %'
               )
             )

             OR (
               -- Venue + date secondary signal. Also compare ISO date prefix (YYYY-MM-DD) so
               -- format differences from the LLM ("2026-07-05T19:00" vs "July 5, 2026 7PM")
               -- don't prevent a match when the date part is identical.
               start_datetime IS NOT NULL AND $2::text IS NOT NULL
               AND venue_name  IS NOT NULL AND $3::text IS NOT NULL
               AND LOWER(TRIM(venue_name)) = LOWER(TRIM($3::text))
               AND (
                 LOWER(TRIM(start_datetime)) = LOWER(TRIM($2::text))
                 OR (
                   $2::text        ~ '^\d{4}-\d{2}-\d{2}'
                   AND start_datetime ~ '^\d{4}-\d{2}-\d{2}'
                   AND LEFT(start_datetime, 10) = LEFT($2::text, 10)
                 )
               )
             )
           )
           LIMIT 1`,
          [title, fields.start_datetime ?? null, fields.venue_name ?? null],
        );
        if (dupCheck.rowCount > 0) {
          duplicates++;
          continue;
        }

        // Stage 4 — URL dedup via UNIQUE constraint
        // Set enriched_at only when the LLM actually ran (structured !== null).
        const enrichedAt = structured !== null ? new Date().toISOString() : null;

        const result = await client.query(
          `INSERT INTO events
             (event_url, event_url_normalized, title, start_datetime, end_datetime,
              venue_name, city_location, organizer_name, short_description,
              source_search_term, collected_at, respondent_count, source, enriched_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (event_url_normalized) DO NOTHING`,
          [
            clean.tweet_url, normalized, title,
            fields.start_datetime ?? null, null,
            fields.venue_name     ?? null, fields.city_location ?? null,
            fields.organizer_name ?? null, fields.short_description ?? null,
            raw.search_term || `x.com/${clean.author_handle}`, clean.collected_at,
            0, 'x.com', enrichedAt,
          ]
        );
        if (result.rowCount > 0) inserted++;
        else duplicates++;
      } catch (err) {
        errors.push({ handle: raw?.author_handle || '(unknown)', reason: err.message });
      }
    }
    await client.query('COMMIT');
    res.json({ inserted, duplicates, skipped, errors });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('X.com batch insert failed:', err);
    res.status(500).json({ error: 'Database error during X.com batch insert' });
  } finally {
    client.release();
  }
});

// POST /events/x/reprocess — re-run Ollama structuring on existing x.com rows
// that have a fallback title (starts with '@'). Useful after Ollama is set up
// for the first time to fix rows inserted without LLM.
router.post('/reprocess', async (req, res) => {
  let updated = 0, skipped = 0, failed = 0;

  try {
    // Fetch x.com rows that haven't been LLM-enriched yet (enriched_at IS NULL).
    const { rows } = await pool.query(
      `SELECT id, event_url, title, short_description AS raw_caption, source_search_term, collected_at
       FROM events
       WHERE source = 'x.com' AND enriched_at IS NULL
       ORDER BY collected_at DESC
       LIMIT 200`
    );

    for (const row of rows) {
      try {
        // Reconstruct author handle and raw caption from stored fallback title.
        // Fallback format: "@handle: first 80 chars of caption"
        const handleMatch = row.title.match(/^(@\w+):\s*/);
        const authorHandle = handleMatch ? handleMatch[1] : '@unknown';
        // Use short_description as raw caption if available, otherwise extract from title
        const rawCaption = row.raw_caption || row.title.replace(/^@\w+:\s*/, '');

        const structured = await structureXEvent(rawCaption, authorHandle, row.collected_at || new Date().toISOString());

        if (!structured || structured.is_event === false) {
          skipped++;
          continue;
        }

        const title = (structured.title && String(structured.title).trim()) || row.title;

        await pool.query(
          `UPDATE events SET
             title             = $1,
             start_datetime    = COALESCE($2, start_datetime),
             venue_name        = COALESCE($3, venue_name),
             city_location     = COALESCE($4, city_location),
             organizer_name    = COALESCE($5, organizer_name),
             short_description = COALESCE($6, short_description),
             enriched_at       = NOW()
           WHERE id = $7`,
          [
            title,
            structured.start_datetime    ?? null,
            structured.venue_name        ?? null,
            structured.city_location     ?? null,
            structured.organizer_name    ?? null,
            structured.short_description ?? null,
            row.id,
          ]
        );
        updated++;
      } catch (err) {
        console.error('[reprocess] row', row.id, err.message);
        failed++;
      }
    }

    res.json({ total: rows.length, updated, skipped, failed });
  } catch (err) {
    console.error('Reprocess failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
