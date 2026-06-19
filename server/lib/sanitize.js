'use strict';

class SanitizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SanitizationError';
  }
}

const EVENT_URL_RE  = /facebook\.com\/events\/\d+/i;
const PROFILE_URL_RE = /facebook\.com\/(?!events\/)/i;
const X_URL_RE      = /x\.com\/(.*?)\/status\/\d+/i;
const EMAIL_RE      = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE      = /(\+?\d[\d\s\-().]{7,}\d)/;
const HTML_TAG_RE   = /<[^>]+>/g;

function stripHtml(str) {
  return str ? str.replace(HTML_TAG_RE, '').trim() : str;
}

function stripProfileUrls(str) {
  if (!str) return str;
  return str.replace(/https?:\/\/(?:www\.)?facebook\.com\/(?!events\/)\S+/gi, '').trim();
}

function rejectPii(field, value) {
  if (!value) return;
  if (EMAIL_RE.test(value)) throw new SanitizationError(`PII (email) detected in field "${field}"`);
  if (PHONE_RE.test(value)) throw new SanitizationError(`PII (phone) detected in field "${field}"`);
}

function sanitize(card) {
  if (!card || typeof card !== 'object') throw new SanitizationError('Invalid card object');

  const url = (card.event_url || '').trim();
  if (!EVENT_URL_RE.test(url)) {
    throw new SanitizationError(`Invalid event URL: "${url}"`);
  }
  if (PROFILE_URL_RE.test(url)) {
    throw new SanitizationError(`URL appears to be a profile, not an event: "${url}"`);
  }

  const title = (card.title || '').trim();
  if (!title) throw new SanitizationError('Missing event title');

  const organizer = stripProfileUrls(card.organizer_name);
  const description = stripHtml((card.short_description || '').substring(0, 500));

  const clean = {
    event_url:          url,
    title,
    start_datetime:     card.start_datetime  || null,
    end_datetime:       card.end_datetime    || null,
    venue_name:         (card.venue_name     || '').trim() || null,
    city_location:      (card.city_location  || '').trim() || null,
    organizer_name:     organizer            || null,
    short_description:  description          || null,
    source_search_term: (card.source_search_term || '').trim(),
    collected_at:       card.collected_at    || new Date().toISOString(),
    respondent_count:   Math.max(0, parseInt(card.respondent_count, 10) || 0),
  };

  rejectPii('organizer_name',   clean.organizer_name);
  rejectPii('short_description', clean.short_description);
  rejectPii('venue_name',       clean.venue_name);
  rejectPii('city_location',    clean.city_location);

  return clean;
}

function sanitizeX(card) {
  if (!card || typeof card !== 'object') throw new SanitizationError('Invalid card object');

  const tweetUrl = (card.tweet_url || '').trim();
  if (!X_URL_RE.test(tweetUrl)) {
    throw new SanitizationError(`Invalid X.com tweet URL: "${tweetUrl}"`);
  }

  const rawCaption = (card.raw_caption || '').trim();
  if (!rawCaption) throw new SanitizationError('Missing tweet caption');

  const authorHandle = (card.author_handle || '').trim();
  if (!authorHandle) throw new SanitizationError('Missing author handle');

  rejectPii('raw_caption',   rawCaption);
  rejectPii('author_handle', authorHandle);

  const caption = stripHtml(rawCaption).substring(0, 1000);

  return {
    tweet_url:       tweetUrl,
    raw_caption:     caption,
    author_handle:   authorHandle,
    tweet_timestamp: card.tweet_timestamp || new Date().toISOString(),
    collected_at:    new Date().toISOString(),
  };
}

module.exports = { sanitize, sanitizeX, SanitizationError };
