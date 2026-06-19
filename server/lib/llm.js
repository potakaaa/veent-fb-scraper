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

module.exports = { structureXEvent };
