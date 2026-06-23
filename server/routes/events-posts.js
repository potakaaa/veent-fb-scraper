'use strict';

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { sanitizeFBPost, SanitizationError } = require('../lib/sanitize');
const { normalizeFBPostUrl }                = require('../lib/dedup');
const { structureFBPost }                   = require('../lib/llm');

const MAX_BATCH_POSTS    = 50;
const MAX_REPROCESS      = 200;

// Keyword pre-filter — reject obvious non-event posts before hitting the LLM.
// Mirrors the X.com route: resale abbreviations + generic slop, plus a minimum
// caption length so empty/short posts never reach Ollama.
const RESALE_RE = /\b(wts|wtb|wtt|lfs|lfb|lft|passaway|pasabay)\b|ticket[s]?\s+(for sale|transfer|resell|selling)|selling\s+ticket/i;
const SLOP_RE   = /^(rt @|📢\s*rt|share this|follow us|stream now|streaming now|out now|listen now|pre[-\s]?order now|dropping|available now)/i;
const MIN_CAPTION_LEN = 20; // posts shorter than this are skipped (AC-4)

// Direct Google Form patterns. Used as a deterministic tier-1 fallback so a
// forms.gle / docs.google.com/forms link is captured even when Ollama is offline.
const DIRECT_GFORM_RE = /https?:\/\/(?:forms\.gle\/[A-Za-z0-9_-]+|docs\.google\.com\/forms\/d\/[A-Za-z0-9_/?=&.-]+)/i;

// Deterministic regex extraction for organizer contact info.
// These run AFTER the LLM and fill in any gaps the model missed.
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
// Philippine mobile: 09XX or +639XX variants; also landline (02/032/etc.)
const PHONE_RE = /(?:\+?63[\s.\-]?|(?<!\d))(?:9\d{2}[\s.\-]?\d{3}[\s.\-]?\d{4}|0\d{1,2}[\s.\-]?\d{3,4}[\s.\-]?\d{4})/;

function extractContactFallback(caption) {
  const text = caption || '';
  const emailMatch = text.match(EMAIL_RE);
  const phoneMatch = text.match(PHONE_RE);
  return {
    email: emailMatch ? emailMatch[0].trim() : null,
    phone: phoneMatch ? phoneMatch[0].trim() : null,
  };
}

function isEligibleCaption(caption) {
  if (!caption || caption.length < MIN_CAPTION_LEN) return false;
  if (RESALE_RE.test(caption)) return false;
  if (SLOP_RE.test(caption))   return false;
  return true;
}

// Scan raw_links (and as a backstop, the caption) for a DIRECT Google Form URL.
// Short-URL detection is intentionally left to the LLM (it needs the text context).
function detectDirectGoogleForm(rawLinks, caption) {
  if (Array.isArray(rawLinks)) {
    for (const link of rawLinks) {
      if (typeof link === 'string' && DIRECT_GFORM_RE.test(link)) {
        return link.match(DIRECT_GFORM_RE)[0];
      }
    }
  }
  const inText = (caption || '').match(DIRECT_GFORM_RE);
  return inText ? inText[0] : null;
}

// POST /events/posts — insert a batch of raw Facebook post cards.
// Pipeline per card:
//   1. sanitize          — validate URL + caption, reject PII
//   2. normalize         — canonical dedup key from the permalink
//   3. keyword pre-filter — reject obvious resale / slop / too-short
//   4. LLM structuring    — extract fields + is_relevant + google_form_url
//   5. content dedup      — skip if identical title already exists for facebook.posts
//   6. URL dedup          — ON CONFLICT DO NOTHING on event_url_normalized
router.post('/', async (req, res) => {
  const cards = req.body;
  if (!Array.isArray(cards)) return res.status(400).json({ error: 'Body must be a JSON array' });
  if (cards.length > MAX_BATCH_POSTS) return res.status(400).json({ error: `Max ${MAX_BATCH_POSTS} per request` });

  let inserted = 0, duplicates = 0, skipped = 0;
  const errors = [];

  console.log('[posts] batch received:', cards.length, 'card(s)');
  cards.forEach((c, i) => console.log(`[posts] card[${i}] url=${c.post_url} caption_len=${(c.raw_caption||'').length} links=${JSON.stringify(c.raw_links)}`));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const raw of cards) {
      const label = (raw?.post_url || '(unknown)').substring(0, 80);
      try {
        const clean      = sanitizeFBPost(raw);
        const normalized = normalizeFBPostUrl(clean.post_url);
        if (!normalized) throw new SanitizationError('Could not normalize Facebook post URL');

        // Stage 3 — keyword pre-filter (no LLM call needed)
        if (!isEligibleCaption(clean.raw_caption)) {
          console.log(`[posts] SKIP (pre-filter) ${label}`);
          skipped++;
          continue;
        }

        // Deterministic tier-1 Google Form detection (works without Ollama).
        const directForm = detectDirectGoogleForm(clean.raw_links, clean.raw_caption);

        // Stage 4 — LLM structuring + relevance classification.
        // null means Ollama is down; insert with fallback title (permissive).
        console.log(`[posts] LLM → ${label}`);
        console.log(`[posts] caption (first 300): ${clean.raw_caption.substring(0, 300)}`);
        const structured = await structureFBPost(
          clean.raw_caption, clean.author_name, clean.collected_at, clean.raw_links,
        );

        console.log(`[posts] LLM result:`, JSON.stringify(structured));

        // If the LLM ran and explicitly marked this as not an event, skip it.
        if (structured !== null && structured.is_event === false) {
          console.log(`[posts] SKIP (not event) ${label}`);
          skipped++;
          continue;
        }

        const fields = structured || {
          is_event:             true,
          title:                null,
          start_datetime:       null,
          venue_name:           null,
          city_location:        null,
          organizer_name:       null,
          organizer_email:      null,
          organizer_phone:      null,
          short_description:    null,
          google_form_detected: false,
          google_form_url:      null,
        };

        // google_form_url precedence: LLM result first, then deterministic direct match.
        const googleFormUrl = (fields.google_form_url && String(fields.google_form_url).trim())
          || directForm
          || null;

        // Contact info: LLM result first; regex fallback fills any gaps the model missed.
        const contactFallback = extractContactFallback(clean.raw_caption);
        const organizerEmail = (fields.organizer_email && String(fields.organizer_email).trim()) || contactFallback.email || null;
        const organizerPhone = (fields.organizer_phone && String(fields.organizer_phone).trim()) || contactFallback.phone || null;

        const author = clean.author_name || 'Unknown';
        const title = (fields.title && String(fields.title).trim())
          || `${author}: ${clean.raw_caption.substring(0, 80)}`;

        // Stage 5 — content dedup against existing facebook.posts rows.
        const dupCheck = await client.query(
          `SELECT 1 FROM events
           WHERE source = 'facebook.posts'
           AND (
             regexp_replace(LOWER(TRIM(title)),      '[^a-z0-9 ]+', '', 'g')
             = regexp_replace(LOWER(TRIM($1::text)), '[^a-z0-9 ]+', '', 'g')

             OR (
               LENGTH(regexp_replace(LOWER(TRIM($1::text)), '[^a-z0-9 ]+', '', 'g')) >= 10
               AND (
                 regexp_replace(LOWER(TRIM(title)),      '[^a-z0-9 ]+', '', 'g')
                   LIKE regexp_replace(LOWER(TRIM($1::text)), '[^a-z0-9 ]+', '', 'g') || ' %'
                 OR
                 regexp_replace(LOWER(TRIM($1::text)), '[^a-z0-9 ]+', '', 'g')
                   LIKE regexp_replace(LOWER(TRIM(title)), '[^a-z0-9 ]+', '', 'g') || ' %'
               )
             )
           )
           LIMIT 1`,
          [title],
        );
        if (dupCheck.rowCount > 0) {
          console.log(`[posts] DUP (content) "${title.substring(0, 60)}"`);
          duplicates++;
          continue;
        }

        // Stage 6 — URL dedup via UNIQUE constraint.
        // Set enriched_at only when the LLM actually ran (structured !== null).
        const enrichedAt = structured !== null ? new Date().toISOString() : null;

        console.log(`[posts] SAVE title="${title.substring(0, 60)}" org="${fields.organizer_name||''}" email="${organizerEmail||''}" phone="${organizerPhone||''}" form=${googleFormUrl || 'none'} llm=${structured !== null ? 'yes' : 'offline'}`);

        const result = await client.query(
          `INSERT INTO events
             (event_url, event_url_normalized, title, start_datetime, end_datetime,
              venue_name, city_location, organizer_name, organizer_email, organizer_phone,
              short_description, source_search_term, collected_at, respondent_count,
              source, enriched_at, google_form_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT (event_url_normalized) DO NOTHING`,
          [
            clean.post_url, normalized, title,
            fields.start_datetime  ?? null, null,
            fields.venue_name      ?? null, fields.city_location    ?? null,
            fields.organizer_name  ?? null, organizerEmail,
            organizerPhone,                 fields.short_description ?? null,
            raw.search_term || 'facebook.posts', clean.collected_at,
            0, 'facebook.posts', enrichedAt,
            googleFormUrl,
          ]
        );
        if (result.rowCount > 0) inserted++;
        else {
          console.log(`[posts] DUP (url) ${label}`);
          duplicates++;
        }
      } catch (err) {
        console.error(`[posts] ERROR ${label} → ${err.message}`);
        errors.push({ post: raw?.post_url || '(unknown)', reason: err.message });
      }
    }
    await client.query('COMMIT');
    res.json({ inserted, duplicates, skipped, errors });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Facebook Posts batch insert failed:', err);
    res.status(500).json({ error: 'Database error during Facebook Posts batch insert' });
  } finally {
    client.release();
  }
});

// POST /events/posts/reprocess — re-run Ollama structuring on facebook.posts rows
// that were never LLM-enriched (enriched_at IS NULL). Reconstructs the raw caption
// from short_description (fallback to the stored fallback title).
router.post('/reprocess', async (req, res) => {
  let updated = 0, skipped = 0, failed = 0;

  try {
    const { rows } = await pool.query(
      `SELECT id, event_url, title, short_description AS raw_caption,
              organizer_name, collected_at, google_form_url
       FROM events
       WHERE source = 'facebook.posts' AND enriched_at IS NULL
       ORDER BY collected_at DESC
       LIMIT ${MAX_REPROCESS}`
    );

    for (const row of rows) {
      try {
        // Fallback title format: "author_name: first 80 chars of caption"
        const authorMatch = row.title.match(/^(.+?):\s/);
        const authorName  = row.organizer_name || (authorMatch ? authorMatch[1] : 'Unknown');
        // Reconstruct raw caption from short_description, else strip the fallback prefix.
        const rawCaption  = row.raw_caption || row.title.replace(/^.+?:\s*/, '');

        const structured = await structureFBPost(
          rawCaption, authorName, row.collected_at || new Date().toISOString(), [],
        );

        if (!structured || structured.is_relevant === false) {
          skipped++;
          continue;
        }

        const title = (structured.title && String(structured.title).trim()) || row.title;
        // Keep an existing google_form_url; only overwrite with a fresh LLM result.
        const googleFormUrl = (structured.google_form_url && String(structured.google_form_url).trim())
          || row.google_form_url
          || null;

        await pool.query(
          `UPDATE events SET
             title             = $1,
             start_datetime    = COALESCE($2, start_datetime),
             venue_name        = COALESCE($3, venue_name),
             city_location     = COALESCE($4, city_location),
             organizer_name    = COALESCE($5, organizer_name),
             short_description = COALESCE($6, short_description),
             google_form_url   = $7,
             enriched_at       = NOW()
           WHERE id = $8`,
          [
            title,
            structured.start_datetime    ?? null,
            structured.venue_name        ?? null,
            structured.city_location     ?? null,
            structured.organizer_name    ?? null,
            structured.short_description ?? null,
            googleFormUrl,
            row.id,
          ]
        );
        updated++;
      } catch (err) {
        console.error('[posts reprocess] row', row.id, err.message);
        failed++;
      }
    }

    res.json({ total: rows.length, updated, skipped, failed });
  } catch (err) {
    console.error('Posts reprocess failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /events/posts/known-urls?term=<search_term> — return the raw event_url
// values already stored for a given keyword so the extension can skip them
// during re-extraction. Mounted at /events/posts, so the full path is
// /events/posts/known-urls. Declared before module.exports (no /:id routes
// exist on this router, so there is no ID-collision risk to guard against).
router.get('/known-urls', async (req, res) => {
  const term = (req.query.term || '').trim();
  // No term → return empty immediately. Avoids a full-table scan and matches
  // the "absent term returns {urls:[]}" contract.
  if (!term) return res.json({ urls: [] });

  try {
    const { rows } = await pool.query(
      `SELECT event_url FROM events
       WHERE source = 'facebook.posts' AND source_search_term = $1`,
      [term],
    );
    res.json({ urls: rows.map(r => r.event_url) });
  } catch (e) {
    console.error('[posts] known-urls query failed:', e.message);
    res.status(500).json({ urls: [], error: e.message });
  }
});

module.exports = router;
