'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────
const EVENT_PATH_RE  = /facebook\.com\/events\/(?!search|upcoming|calendar|explore|birthdays|create|feed|going|invited)([a-z0-9])/i;
const EVENT_ID_RE    = /\/events\/[^?#]*?(\d{8,})/;
const DATE_WORD_RE   = /\b(mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|today|tomorrow|happening|yesterday)\b/i;
const FULL_MONTH_RE  = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
const NOISE_RE       = /\b(interested|going|attending|share|invited|maybe)\b|\d+\s+(interested|going)|notifications?/i;
const UI_CHROME_SET  = new Set(['events', 'home', 'watch', 'marketplace', 'menu', 'notifications', 'your events']);
const CITY_RE        = /^[A-Za-zÀ-ɏ][\w\sÀ-ɏ]{1,40},\s+[A-Za-zÀ-ɏ][\w\sÀ-ɏ]{1,40}$/;
const MIN_RESPONDENTS = 10; // skip events with fewer total interested+going

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isPartiallyVisible(el) {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const vw = window.innerWidth  || document.documentElement.clientWidth;
  return rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
}

function leafText(el) {
  // Return textContent only if the element has minimal internal structure.
  if (el.querySelectorAll('span, div, p').length > 3) return null;
  return el.textContent?.trim() || null;
}

// Sum respondent numbers from a stats line like "411 interested · 71 going"
// or "482 people responded". Returns 0 if no stats line is found.
function parseRespondentCount(lines) {
  for (const t of lines) {
    if (!/\b(interested|going|attended|went|responded|people)\b/i.test(t)) continue;
    const nums = t.match(/\d+/g);
    if (nums) return nums.reduce((sum, n) => sum + parseInt(n, 10), 0);
  }
  return 0;
}

// ─── MODE A: Search-results page (multiple cards) ────────────────────────────
function findCardRoot(anchor, maxSteps = 10) {
  let el = anchor.parentElement;
  for (let i = 0; i < maxSteps; i++) {
    if (!el || el === document.body) break;
    const rect = el.getBoundingClientRect();
    if (rect.height > 80 && rect.width > 200) return el;
    el = el.parentElement;
  }
  return anchor.parentElement;
}

function findCardRoots() {
  const seenRoots = new Set();
  const seenUrls  = new Set();
  const roots     = [];

  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.href || '';
    if (!EVENT_PATH_RE.test(href)) continue;
    // No viewport filter — extract all events loaded in the DOM, not just
    // those currently scrolled into view. The user scrolls to load results
    // via FB's infinite scroll, then extracts everything at once.

    const idMatch  = href.match(EVENT_ID_RE);
    const eventUrl = href.split('?')[0];
    if (seenUrls.has(eventUrl)) continue;

    const root = findCardRoot(a);
    if (!root || seenRoots.has(root)) {
      seenUrls.add(eventUrl);
      continue;
    }
    seenRoots.add(root);
    seenUrls.add(eventUrl);
    roots.push({ root, eventUrl, eventId: idMatch ? idMatch[1] : '' });
  }

  return roots;
}

function getTextLines(card) {
  const lines = [];
  const seen  = new Set();
  for (const el of card.querySelectorAll('span, div')) {
    if (el.querySelectorAll('span, div').length > 2) continue;
    const t = el.textContent?.trim();
    if (!t || t.length < 3 || t.length > 300 || seen.has(t)) continue;
    seen.add(t);
    lines.push(t);
  }
  return lines;
}

function isNoise(t) {
  return NOISE_RE.test(t) || /^\d+$/.test(t) || t.length < 3 || t.length > 200 || UI_CHROME_SET.has(t.toLowerCase());
}

function pickLineAfterDate(lines, n) {
  let passedDate = false, count = 0;
  for (const t of lines) {
    if (DATE_WORD_RE.test(t)) { passedDate = true; continue; }
    if (!passedDate) continue;
    if (isNoise(t)) continue;
    if (count === n) return t;
    count++;
  }
  // Fallback: no date line found
  count = 0;
  for (const t of lines) {
    if (isNoise(t)) continue;
    if (count === n) return t;
    count++;
  }
  return null;
}

function extractSearchCardDatetime(card) {
  const timeEl = card.querySelector('time[datetime]');
  if (timeEl) return { start: timeEl.getAttribute('datetime') || timeEl.textContent.trim(), end: null };
  const lines = getTextLines(card);
  const dateLine = lines.find(t => DATE_WORD_RE.test(t) && t.length < 80);
  return { start: dateLine || null, end: null };
}

function extractSearchCardOrganizer(card) {
  for (const el of card.querySelectorAll('span, div')) {
    const t = leafText(el);
    if (!t) continue;
    const m = t.match(/^Event\s+by\s+(.{1,100})$/i);
    if (m && !/https?:\/\//.test(m[1])) return m[1].trim();
  }
  return null;
}

function extractSearchCardDescription(card) {
  for (const p of card.querySelectorAll('p, [role="paragraph"]')) {
    const t = p.textContent.trim();
    if (t.length > 20) return t.substring(0, 500);
  }
  return null;
}

function extractFromSearchResults(searchTerm) {
  const collectedAt = new Date().toISOString();
  const cardRefs    = findCardRoots();
  const events      = [];

  let skippedLowCount = 0;

  for (const { root, eventUrl } of cardRefs) {
    const lines           = getTextLines(root);
    const respondent_count = parseRespondentCount(lines);

    if (respondent_count < MIN_RESPONDENTS) { skippedLowCount++; continue; }

    const title = pickLineAfterDate(lines, 0);
    if (!title) continue;

    const { start: start_datetime, end: end_datetime } = extractSearchCardDatetime(root);
    const venue_name         = pickLineAfterDate(lines, 1);
    const organizer_name     = extractSearchCardOrganizer(root);
    const short_description  = extractSearchCardDescription(root);

    events.push({
      event_url: eventUrl,
      title,
      start_datetime,
      end_datetime,
      venue_name:        venue_name || null,
      city_location:     null,
      organizer_name,
      short_description,
      respondent_count,
      source_search_term: searchTerm,
      collected_at:       collectedAt,
    });
  }

  return { events, debug: { cardRoots: cardRefs.length, skippedLowCount, mode: 'search' } };
}

// The left sidebar nav (Home/Your events/Notifications/Create new event) is
// marked with role="navigation" in FB's markup. Skip any element that lives
// inside it so venue/city/organizer scans don't pick up sidebar nav text —
// this doesn't depend on guessing how many DOM levels separate it from the title.
function isInSidebarNav(el) {
  return !!el.closest('[role="navigation"]');
}

// ─── MODE B: Individual event detail page ────────────────────────────────────
function extractFromEventDetailPage(searchTerm) {
  const collectedAt = new Date().toISOString();
  const eventUrl    = location.href.split('?')[0];

  // Title — the big h1
  const title = document.querySelector('h1')?.textContent?.trim();
  if (!title) return { events: [], debug: { mode: 'detail', error: 'no h1' } };

  // Date — full date text like "Saturday, June 27, 2026 at 8 PM"
  let start_datetime = null;
  for (const el of document.querySelectorAll('span, div, h2, strong')) {
    if (isInSidebarNav(el)) continue;
    const t = leafText(el);
    if (!t || t.length < 8 || t.length > 100) continue;
    if (FULL_MONTH_RE.test(t) && /\bat\b/i.test(t)) { start_datetime = t; break; }
    // Shorter form without "at": "Saturday, June 27, 2026"
    if (FULL_MONTH_RE.test(t) && /\d{4}/.test(t))   { start_datetime = t; break; }
  }

  // Organizer — "Event by NAME" (the bold name after those two words)
  let organizer_name = null;
  for (const el of document.querySelectorAll('span, div, a')) {
    if (isInSidebarNav(el)) continue;
    const t = leafText(el);
    if (!t) continue;
    const m = t.match(/^Event\s+by\s+(.{1,100})$/i);
    if (m && !/https?:\/\//.test(m[1])) { organizer_name = m[1].trim(); break; }
  }

  // Venue — prominent text in the Details section under the location pin.
  // FB often puts the venue as a bold/link element right below the title too.
  let venue_name = null;

  // First try: <a> or <span> near the location pin SVG (FB wraps it in a container)
  // We look for a sibling/nearby text to any SVG that has a path resembling a pin.
  // Practical approach: scan for text inside the Details card that isn't a date,
  // organizer, or city and is longer than a short phrase.
  const bodyText = Array.from(document.querySelectorAll('span, div, a'));
  for (const el of bodyText) {
    if (isInSidebarNav(el)) continue;
    const t = leafText(el);
    if (!t || t.length < 5 || t.length > 150) continue;
    if (DATE_WORD_RE.test(t) || FULL_MONTH_RE.test(t)) continue;
    if (NOISE_RE.test(t)) continue;
    if (CITY_RE.test(t)) continue;               // skip city tags
    if (/^Event\s+by\b/i.test(t)) continue;      // skip organizer line
    if (/people\s+respond/i.test(t)) continue;    // skip attendance count
    if (/Public|Anyone\s+on/i.test(t)) continue; // skip privacy line
    if (/Tickets?|Find\s+tickets/i.test(t)) continue;
    if (/Discussion|About|Going|Interested|Invite/i.test(t)) continue;
    if (UI_CHROME_SET.has(t.toLowerCase())) continue; // skip nav/breadcrumb chrome like "Events"
    // Must look like a place name: starts with a capital, reasonable length
    if (/^[A-Z]/.test(t) && t.length >= 5) { venue_name = t; break; }
  }

  // City — location tags/chips at the bottom of Details.
  // These match "City, Country" or "City, Region" format.
  let city_location = null;
  for (const el of document.querySelectorAll('a, span, div')) {
    if (isInSidebarNav(el)) continue;
    const t = leafText(el);
    if (!t || t.length > 60 || t.length < 5) continue;
    if (CITY_RE.test(t) && !DATE_WORD_RE.test(t) && !NOISE_RE.test(t)) {
      city_location = t;
      break;
    }
  }

  // Description — first substantial paragraph
  let short_description = null;
  for (const p of document.querySelectorAll('p, [role="paragraph"]')) {
    if (isInSidebarNav(p)) continue;
    const t = p.textContent.trim();
    if (t.length > 20) { short_description = t.substring(0, 500); break; }
  }

  return {
    events: [{
      event_url: eventUrl,
      title,
      start_datetime,
      end_datetime: null,
      venue_name:   venue_name   || null,
      city_location: city_location || null,
      organizer_name,
      short_description,
      source_search_term: searchTerm,
      collected_at: collectedAt,
    }],
    debug: { mode: 'detail', cardRoots: 1 },
  };
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────
function isEventDetailPage() {
  // Individual event page: /events/<id> or /events/<slug>/<id>
  // NOT the search page or listing pages.
  return EVENT_ID_RE.test(location.href) &&
         !/\/events\/search\b/.test(location.href);
}

function extractCards(searchTerm) {
  if (isEventDetailPage()) {
    return extractFromEventDetailPage(searchTerm);
  }
  return extractFromSearchResults(searchTerm);
}

// ─── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'EXTRACT') return false;

  try {
    const { events, debug } = extractCards(message.searchTerm || '');
    sendResponse({ events, error: null, debug });
  } catch (err) {
    sendResponse({ events: [], error: err.message, debug: null });
  }

  return true;
});
