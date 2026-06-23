'use strict';

// Local Ollama client. Parses a raw X.com tweet caption into structured event
// fields via a local LLM. Never throws — returns null on any failure (network,
// timeout, parse, malformed model output) so the caller can fall back to a
// minimal record. No external API calls; everything stays on localhost.

const OLLAMA_BASE    = process.env.OLLAMA_BASE  || 'http://localhost:11434';
const OLLAMA_MODEL   = process.env.OLLAMA_MODEL || 'llama3';
const OLLAMA_TIMEOUT_MS = 30000;

// Fields we ask the model to extract. Every value is a nullable string except
// is_event which is a boolean.
const FIELDS = ['is_event', 'title', 'start_datetime', 'venue_name', 'city_location', 'organizer_name', 'short_description'];

function buildPrompt(rawCaption, authorHandle, timestamp) {
  return [
    'You are an event-detection and information-extraction engine.',
    'You are given the raw text of a social media post. Your job has two parts:',
    '1. Decide whether the post is announcing a REAL upcoming live event.',
    '2. If it is, extract the event details.',
    '',
    'Set "is_event" to false if the post is:',
    '  - Selling or reselling tickets (WTS, WTB, WTT, passaway, for sale, ticket transfer)',
    '  - A fan post, reaction, or general comment about an event',
    '  - Announcing a streaming release, album drop, or digital content',
    '  - A retweet or quote with no new event information',
    '  - Too vague or unrelated to live events',
    '',
    'Set "is_event" to true only if the post directly announces an upcoming live event.',
    '',
    'IMPORTANT — for start_datetime:',
    `  The post was published at: ${timestamp}`,
    '  Use this timestamp to resolve relative date phrases:',
    '    "this Sunday" → compute the actual calendar date of the next Sunday after the post date',
    '    "tomorrow" → one day after the post date',
    '    "next week" → 7 days after the post date',
    '  "start_datetime" is the EVENT date/time, NOT the ticket sale date.',
    '  If the post says "tickets on sale May 10" and the concert is "this Sunday",',
    '  the start_datetime should be the concert date (this Sunday), not May 10.',
    '  Use ISO 8601 format when the date is known (e.g. "2026-05-10T21:00:00"),',
    '  or a short human phrase if only partial info is available (e.g. "Sunday, May 10").',
    '',
    'Respond with ONLY a single JSON object, no prose, no markdown, no code fences.',
    'JSON keys:',
    '  "is_event"          - boolean: true if this announces an upcoming live event',
    '  "title"             - the event name/title (null if is_event is false)',
    '  "start_datetime"    - the EVENT start date/time, not the ticket sale date (null if unknown)',
    '  "venue_name"        - the name of the venue/place (null if unknown)',
    '  "city_location"     - the city or location (null if unknown)',
    '  "organizer_name"    - who is organizing/hosting (null if unknown)',
    '  "short_description" - a one-sentence summary of the event (null if is_event is false)',
    '',
    `Post author: ${authorHandle}`,
    'Post text:',
    '"""',
    rawCaption,
    '"""',
    '',
    'Respond with ONLY the JSON object.',
  ].join('\n');
}

// Coerce an arbitrary parsed value into the expected shape.
// String fields become trimmed strings or null. is_event becomes a boolean.
function coerce(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  for (const key of FIELDS) {
    const v = obj[key];
    if (key === 'is_event') {
      // Accept boolean true/false or string "true"/"false"
      out.is_event = v === true || String(v).toLowerCase() === 'true';
      continue;
    }
    if (v === undefined || v === null) { out[key] = null; continue; }
    const s = String(v).trim();
    out[key] = s === '' ? null : s;
  }
  // Default is_event to true if missing (older model output compatibility)
  if (out.is_event === undefined) out.is_event = true;
  return out;
}

// ─── Facebook Posts structuring ────────────────────────────────────────────────
// Mirrors the X.com structuring approach exactly — same prompt structure, same
// coerce pattern, same boolean field name (is_event). Extra fields: organizer
// contact info and Google Form detection.
const FB_POST_FIELDS = [
  'is_event', 'title', 'start_datetime', 'venue_name', 'city_location',
  'organizer_name', 'organizer_email', 'organizer_phone',
  'short_description', 'google_form_detected', 'google_form_url',
];

function buildFBPostPrompt(rawCaption, authorName, timestamp, rawLinks) {
  const links = Array.isArray(rawLinks) && rawLinks.length
    ? rawLinks.map((url, i) => `  [${i + 1}] ${url}`).join('\n')
    : '  (none)';

  return [
    'You are an event-detection and information-extraction engine.',
    'You are given the raw text of a Facebook post. Your job has two parts:',
    '1. Decide whether the post is announcing a REAL upcoming live event.',
    '2. If it is, extract the event details.',
    '',
    'Set "is_event" to false if the post is:',
    '  - Selling or reselling tickets (WTS, WTB, WTT, passaway, for sale, ticket transfer)',
    '  - A fan post, reaction, or general comment about an event',
    '  - Announcing a streaming release, album drop, or digital content',
    '  - A retweet or quote with no new event information',
    '  - Too vague or unrelated to live events',
    '',
    'Set "is_event" to true only if the post directly announces an upcoming live event.',
    '',
    'IMPORTANT — for start_datetime:',
    `  The post was published at: ${timestamp}`,
    '  Use this timestamp to resolve relative date phrases:',
    '    "this Sunday" → compute the actual calendar date of the next Sunday after the post date',
    '    "tomorrow" → one day after the post date',
    '    "next week" → 7 days after the post date',
    '  "start_datetime" is the EVENT date/time, NOT the ticket sale date.',
    '  Use ISO 8601 format when the date is known (e.g. "2026-05-10T21:00:00"),',
    '  or a short human phrase if only partial info is available (e.g. "Sunday, May 10").',
    '',
    'For organizer_email: scan the post for an email address (pattern: word@domain.tld).',
    '  Look near phrases like "contact", "email", "inquire", "register", "pm", "dm".',
    '  ONLY return an email address that is LITERALLY present in the post text.',
    '  Do NOT invent, guess, or fabricate any email address.',
    '  Return null — NOT "none", NOT "N/A" — if absent.',
    '',
    'For organizer_phone: scan the post for a phone/mobile number.',
    '  Philippine formats to recognise: 09XXXXXXXXX, +639XXXXXXXXX, (02) XXXX-XXXX, etc.',
    '  Look near phrases like "contact", "call", "text", "viber", "whatsapp", "cp", "mobile".',
    '  ONLY return a phone number that is LITERALLY present in the post text.',
    '  Do NOT invent, guess, or fabricate any phone number.',
    '  Return null — NOT "none", NOT "N/A" — if absent.',
    '',
    'For google_form_url: check the LINKS list below.',
    '  If a link contains "forms.gle/" or "docs.google.com/forms/d/" output it as google_form_url.',
    '  If the post mentions a form/registration AND a short link exists (bit.ly, tinyurl, etc), output that.',
    '  Otherwise set google_form_detected to false and google_form_url to null.',
    '',
    'IMPORTANT: for any field where the value is unknown or absent, output JSON null — never output',
    'the strings "none", "None", "N/A", "n/a", "unknown", or "-". Use only JSON null.',
    '',
    'Respond with ONLY a single JSON object, no prose, no markdown, no code fences.',
    'JSON keys:',
    '  "is_event"             - boolean: true if this announces an upcoming live event',
    '  "title"                - the event name/title (null if is_event is false)',
    '  "start_datetime"       - the EVENT start date/time, not the ticket sale date (null if unknown)',
    '  "venue_name"           - the name of the venue/place (null if unknown)',
    '  "city_location"        - the city or location (null if unknown)',
    '  "organizer_name"       - who is organizing/hosting (null if unknown)',
    '  "organizer_email"      - organizer contact email (null if none)',
    '  "organizer_phone"      - organizer contact phone/mobile (null if none)',
    '  "short_description"    - a one-sentence summary of the event (null if is_event is false)',
    '  "google_form_detected" - boolean: true if a Google Form or registration form is referenced',
    '  "google_form_url"      - the Google Form or registration URL (null if none)',
    '',
    `Post author: ${authorName || '(unknown)'}`,
    'Post text:',
    '"""',
    rawCaption,
    '"""',
    '',
    'LINKS found in the post:',
    links,
    '',
    'Respond with ONLY the JSON object.',
  ].join('\n');
}

// Strings the LLM commonly outputs instead of JSON null — treat all as null.
const NULL_LIKE = new Set([
  '', 'null', 'none', 'n/a', 'na', 'n.a.', 'nil', 'unknown',
  'not available', 'not found', 'not provided', 'not specified',
  '-', '—', '–', 'no', 'false',
]);

// Mirrors coerce() for X.com — same logic, extended for the extra FB fields.
function coerceFBPost(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  for (const key of FB_POST_FIELDS) {
    const v = obj[key];
    if (key === 'is_event' || key === 'google_form_detected') {
      out[key] = v === true || String(v).toLowerCase() === 'true';
      continue;
    }
    if (v === undefined || v === null) { out[key] = null; continue; }
    const s = String(v).trim();
    out[key] = NULL_LIKE.has(s.toLowerCase()) ? null : s;
  }
  if (out.is_event === undefined) out.is_event = true;
  return out;
}

// Returns true only when the phone number's digits appear verbatim in the
// source text (handles formatting differences like spaces and dashes).
function phoneFoundInText(phone, sourceText) {
  if (!phone || !sourceText) return false;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return false;
  // Strip all non-digits from source and look for the digit run as a substring.
  const sourceDigits = sourceText.replace(/\D/g, '');
  return sourceDigits.includes(digits);
}

// Returns true only when the email address appears literally in the source text.
function emailFoundInText(email, sourceText) {
  if (!email || !sourceText) return false;
  return sourceText.toLowerCase().includes(email.toLowerCase());
}

async function structureFBPost(rawCaption, authorName, timestamp, rawLinks) {
  try {
    const prompt = buildFBPostPrompt(rawCaption, authorName, timestamp, rawLinks);
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
      signal:  AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error('[llm] structureFBPost failed:', `Ollama HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const text = data && typeof data.response === 'string' ? data.response : '';

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn('[llm] structureFBPost: no JSON object found in model response');
      return null;
    }

    const parsed = JSON.parse(match[0]);
    const result = coerceFBPost(parsed);
    if (!result) return null;

    // Ground-truth check: reject any phone or email the LLM fabricated that
    // does not actually appear in the raw post text or links.
    const allText = [rawCaption, ...(Array.isArray(rawLinks) ? rawLinks : [])].join(' ');
    if (result.organizer_phone && !phoneFoundInText(result.organizer_phone, allText)) {
      console.warn('[llm] structureFBPost: fabricated phone rejected:', result.organizer_phone);
      result.organizer_phone = null;
    }
    if (result.organizer_email && !emailFoundInText(result.organizer_email, allText)) {
      console.warn('[llm] structureFBPost: fabricated email rejected:', result.organizer_email);
      result.organizer_email = null;
    }

    return result;
  } catch (err) {
    console.error('[llm] structureFBPost failed:', err.message);
    return null;
  }
}

async function structureXEvent(rawCaption, authorHandle, timestamp) {
  try {
    const prompt = buildPrompt(rawCaption, authorHandle, timestamp);
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
      signal:  AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error('[llm] structureXEvent failed:', `Ollama HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const text = data && typeof data.response === 'string' ? data.response : '';

    // The model may wrap the JSON in prose/code fences despite instructions.
    // Extract the first {...} block.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn('[llm] structureXEvent: no JSON object found in model response');
      return null;
    }

    const parsed = JSON.parse(match[0]);
    return coerce(parsed);
  } catch (err) {
    console.error('[llm] structureXEvent failed:', err.message);
    return null;
  }
}

module.exports = { structureXEvent, structureFBPost };
