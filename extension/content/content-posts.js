'use strict';

// Facebook Posts content script. Scrapes raw post text, permalink URL, author
// name, and any Google-Form-style links from whatever feed/group posts are
// currently rendered in the DOM. No viewport filter — the user scrolls first,
// then triggers extraction. Raw captions go to the server, where the LLM
// structures them and resolves the Google Form URL.
//
// IMPORTANT: this script is injected on every facebook.com/* page (manifest),
// including facebook.com/events/* where content.js also runs. It only acts on
// EXTRACT_POSTS messages and refuses to run on the Events surface, so the two
// scrapers never collide.

const MIN_CAPTION_LEN = 20;

// Google Form / short-link patterns (Tier 1, client-side). Matches both direct
// Google Forms and common short URLs that frequently wrap a form link.
const GFORM_PATTERNS = [
  /https?:\/\/forms\.gle\/[A-Za-z0-9_-]+/i,
  /https?:\/\/docs\.google\.com\/forms\/d\/[A-Za-z0-9_/?=&.-]+/i,
  /https?:\/\/(?:tinyurl\.com|bit\.ly|rb\.gy|ow\.ly|cutt\.ly)\/[A-Za-z0-9_-]+/i,
];

function isEventsPage() {
  return /^https:\/\/www\.facebook\.com\/events\//.test(location.href);
}

// Returns true when the URL is a valid post/video permalink we should keep.
function isPostHref(href) {
  if (!href || /\/photo[/?]/.test(href) || /\/media\//.test(href)) return false;
  return (
    /\/(posts|permalink)\//.test(href) ||
    /\/groups\/[^/]+\/(posts|permalink)\//.test(href) ||
    /story\.php\?/.test(href) ||
    /[?&](post_id|story_fbid)=\d+/.test(href) ||
    /\/videos\/\d/.test(href)
  );
}

function toAbsolute(href) {
  return href.startsWith('http') ? href : `https://www.facebook.com${href}`;
}

// Pull the post permalink from a post card.
// Strategy 1: timestamp anchor — Facebook wraps <time> in an <a> on feeds/groups/profiles.
// Strategy 2: data-href on role="link" divs — Facebook search results use these instead of
//   real <a> elements for timestamp navigation.
// Strategy 3: any <a href> whose path matches known post-URL patterns.
// Strategy 4: any [data-href] on the card that matches post-URL patterns.
function findPostUrl(card) {
  // Strategy 1 — timestamp <a href> (feeds, profiles, group feeds)
  const timeEl = card.querySelector('time[datetime], abbr[data-utime]');
  if (timeEl) {
    const a = timeEl.closest('a[href]');
    if (a) {
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('#')) return toAbsolute(href);
    }

    // Strategy 2 — data-href on timestamp ancestor (Facebook search results render
    // timestamps as role="link" divs with data-href instead of real <a> elements).
    let node = timeEl.parentElement;
    for (let i = 0; i < 12; i++) {
      if (!node || node === document.body) break;
      const dh = node.getAttribute('data-href') || '';
      if (dh && isPostHref(dh)) return toAbsolute(dh);
      // Also accept role="link" elements that carry the href as a regular attribute.
      const rl = node.getAttribute('href') || '';
      if (rl && isPostHref(rl)) return toAbsolute(rl);
      node = node.parentElement;
    }
  }

  // Strategy 3 — pattern-match <a href> elements anywhere in the card.
  for (const a of card.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    if (isPostHref(href)) return toAbsolute(href);
  }

  // Strategy 4 — [data-href] on any element in the card (broader sweep).
  for (const el of card.querySelectorAll('[data-href]')) {
    const dh = el.getAttribute('data-href') || '';
    if (isPostHref(dh)) return toAbsolute(dh);
  }

  return null;
}

// Author name — the post header heading link (h2/h3/h4 a strong) text.
function findAuthorName(card) {
  const headingLink =
    card.querySelector('h2 a, h3 a, h4 a') ||
    card.querySelector('strong a, span strong');
  if (headingLink) {
    const txt = (headingLink.innerText || headingLink.textContent || '').trim();
    if (txt) return txt.split('\n')[0].trim();
  }
  return null;
}

// Collect every Google-Form-style link from both href attributes and the raw text.
function findGoogleFormLinks(card, captionText) {
  const found = new Set();

  for (const a of card.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    // Facebook wraps external links in l.facebook.com/l.php?u=<encoded> — unwrap it.
    let target = href;
    const m = href.match(/l\.facebook\.com\/l\.php\?u=([^&]+)/i);
    if (m) {
      try { target = decodeURIComponent(m[1]); } catch { /* keep raw */ }
    }
    for (const re of GFORM_PATTERNS) {
      const hit = target.match(re);
      if (hit) found.add(hit[0]);
    }
  }

  for (const re of GFORM_PATTERNS) {
    const hit = (captionText || '').match(re);
    if (hit) found.add(hit[0]);
  }

  return [...found];
}

// Walk up from an anchor to find the full post container div.
// Strategy: keep walking past the first small div (which is usually just the
// post header/metadata row) and stop at the first div that is substantially
// larger (300+ chars) — that div contains BOTH the header and the post body.
function findPostContainer(el) {
  let node = el.parentElement;
  let firstCandidate = null;
  for (let i = 0; i < 30; i++) {
    if (!node || node === document.body) break;
    if (node.tagName === 'DIV' || node.getAttribute?.('role') === 'article') {
      const txt = (node.innerText || '').trim();
      if (!firstCandidate && txt.length >= 80) {
        firstCandidate = node;
      } else if (firstCandidate && txt.length >= 300) {
        return node; // full post wrapper
      }
    }
    node = node.parentElement;
  }
  return firstCandidate;
}

// Extract the readable post caption from a container.
// Prefers div[dir="auto"] which is where Facebook puts the post body text,
// avoiding the header metadata area that often contains scrambled characters.
function findPostCaption(card) {
  // Facebook post body lives in div[dir="auto"] blocks — pick the longest one
  const dirDivs = [...card.querySelectorAll('div[dir="auto"]')];
  if (dirDivs.length) {
    const texts = dirDivs
      .map(el => (el.innerText || '').trim())
      .filter(t => t.length >= 20);
    if (texts.length) return texts.sort((a, b) => b.length - a.length)[0];
  }
  return (card.innerText || '').trim();
}

// djb2-style hash of the first 150 chars of a string — used to build stable
// synthetic post URLs when Facebook doesn't expose a permalink anchor.
function hashCaption(str) {
  let h = 5381;
  const s = str.substring(0, 150);
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0');
}

// Walk up from a text node to find its post container: the first ancestor div
// that has at least 20 more chars than the text block itself (author, timestamp,
// metadata, etc.). Requiring only a small delta avoids overshooting into a
// section div that spans multiple posts.
function findPostContainerFromNode(el) {
  const baseLen = (el.innerText || '').trim().length;
  const minLen  = Math.max(200, baseLen + 20);
  let node = el.parentElement;
  for (let i = 0; i < 25; i++) {
    if (!node || node === document.body) break;
    if (node.tagName === 'DIV') {
      if ((node.innerText || '').trim().length >= minLen) return node;
    }
    node = node.parentElement;
  }
  return null;
}

function extractPosts() {
  const seen           = new Set();    // dedup by URL path
  const seenCards      = new WeakSet(); // one entry per post container
  const seenCaptions   = new Set();    // dedup by caption prefix — same post can yield two containers
  const posts          = [];

  // Text-first strategy: find post bodies via div[dir="auto"], then derive the
  // post URL from the surrounding container. Facebook search results often don't
  // expose post permalinks as <a href> elements — they use JS-driven navigation —
  // so scanning anchors directly misses most posts.
  const textEls = document.querySelectorAll('div[dir="auto"]');
  console.log('[content-posts] dir=auto blocks found:', textEls.length);

  for (const textEl of textEls) {
    if ((textEl.innerText || '').trim().length < MIN_CAPTION_LEN) continue;

    const card = findPostContainerFromNode(textEl);
    if (!card || seenCards.has(card)) continue;
    seenCards.add(card);

    const rawCaption = findPostCaption(card);
    if (rawCaption.length < MIN_CAPTION_LEN) continue;

    // Caption-prefix dedup: two div[dir="auto"] blocks in the same post can land on
    // different ancestor containers (different baseLen → different minLen threshold),
    // making seenCards miss the duplicate. Keying on the first 200 chars catches it
    // because the same post body always starts with the same text regardless of container.
    const captionPrefix = rawCaption.substring(0, 200);
    if (seenCaptions.has(captionPrefix)) continue;
    seenCaptions.add(captionPrefix);

    // Try to get a real permalink; fall back to a stable synthetic URL built from
    // a caption hash (Facebook search results often have no permalink anchors at all).
    const realHref = findPostUrl(card);
    const href = realHref || (() => {
      const hash = hashCaption(rawCaption);
      return `https://www.facebook.com/fbpost/posts/synth_${hash}`;
    })();

    const dedupeKey = href.replace(/[?#].*$/, '');
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    console.log('[content-posts] post:', href.substring(0, 80), '| caption_len:', rawCaption.length, realHref ? '' : '(synthetic)');

    posts.push({
      post_url:     href,
      author_name:  findAuthorName(card),
      raw_caption:  rawCaption.substring(0, 2000),
      raw_links:    findGoogleFormLinks(card, rawCaption),
      collected_at: new Date().toISOString(),
    });
  }

  return posts;
}

// ── Bot-evasion helpers ────────────────────────────────────────────────────────

// Random integer in [lo, hi].
function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// Async sleep with slight jitter so intervals never land on a machine-perfect grid.
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms + randInt(-20, 20)));
}

// Dispatch a realistic mouse event sequence on an element.
function humanClick(el) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width  * (0.3 + Math.random() * 0.4);
  const cy = rect.top  + rect.height * (0.3 + Math.random() * 0.4);
  const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy };
  el.dispatchEvent(new MouseEvent('mouseover', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new MouseEvent('mouseup',   opts));
  el.dispatchEvent(new MouseEvent('click',     opts));
}

// Click every "See more" expander inside post body divs so the full caption text
// is in the DOM before we run extractPosts(). Clicks are spaced with human-like
// jitter to avoid triggering Facebook's bot heuristics.
async function expandSeeMore() {
  // Facebook renders "See more" as a span/div with role="button" or as a plain
  // span at the tail of a truncated div[dir="auto"] block.
  const candidates = [];
  for (const el of document.querySelectorAll('div[dir="auto"] span, div[dir="auto"] div')) {
    const txt = (el.innerText || el.textContent || '').trim();
    if (/^see more$/i.test(txt) && el.offsetParent !== null) {
      candidates.push(el);
    }
  }
  console.log('[content-posts] expandSeeMore: found', candidates.length, '"See more" button(s)');
  for (const el of candidates) {
    humanClick(el);
    await sleep(randInt(80, 220));
  }
  if (candidates.length > 0) {
    // Brief pause after the last click so React can re-render expanded text.
    await sleep(randInt(300, 600));
  }
}

// Scroll the page gradually in human-like increments until no new posts appear
// for MAX_IDLE_ROUNDS consecutive checks. Respects a hard cap to avoid infinite loops.
async function autoScroll() {
  const MAX_ROUNDS    = 25;   // hard cap (roughly 10-15 s total scroll time)
  const MAX_IDLE      = 3;    // stop after 3 rounds with no new div[dir="auto"] blocks
  const SCROLL_MIN    = 280;
  const SCROLL_MAX    = 520;
  const PAUSE_MIN     = 600;
  const PAUSE_MAX     = 1400;

  let idleRounds = 0;
  let lastCount   = document.querySelectorAll('div[dir="auto"]').length;

  console.log('[content-posts] autoScroll: start (dir=auto baseline:', lastCount, ')');

  for (let i = 0; i < MAX_ROUNDS; i++) {
    // Scroll a random amount — sometimes two shorter sub-scrolls to look human.
    const total = randInt(SCROLL_MIN, SCROLL_MAX);
    const mid   = Math.random() > 0.4 ? randInt(80, total - 60) : total;
    window.scrollBy({ top: mid, behavior: 'smooth' });
    await sleep(randInt(120, 280));
    if (mid < total) {
      window.scrollBy({ top: total - mid, behavior: 'smooth' });
      await sleep(randInt(80, 180));
    }

    // Pause while Facebook loads more posts.
    await sleep(randInt(PAUSE_MIN, PAUSE_MAX));

    const newCount = document.querySelectorAll('div[dir="auto"]').length;
    if (newCount > lastCount) {
      console.log('[content-posts] autoScroll: new blocks', lastCount, '→', newCount);
      lastCount   = newCount;
      idleRounds  = 0;
      // After new posts load, expand any newly revealed "See more" buttons.
      await expandSeeMore();
    } else {
      idleRounds++;
      console.log('[content-posts] autoScroll: idle round', idleRounds, '/', MAX_IDLE);
      if (idleRounds >= MAX_IDLE) break;
    }
  }
  console.log('[content-posts] autoScroll: done (dir=auto final:', document.querySelectorAll('div[dir="auto"]').length, ')');
}

// ── Message handler ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'EXTRACT_POSTS') {
    // Guard: never scrape the Events surface — content.js owns that page.
    if (isEventsPage()) {
      sendResponse({ posts: [], error: 'On a Facebook Events page — use Facebook Events mode.' });
      return false;
    }

    // If the popup requested auto-scroll, do the full expand + scroll dance first,
    // then extract. The handler must return true to keep the message channel open
    // for the async response.
    if (message.autoScroll) {
      (async () => {
        await expandSeeMore();
        await autoScroll();
        sendResponse({ posts: extractPosts() });
      })();
      return true; // async — keep channel open
    }

    // Default (no scroll): just expand "See more" in the current viewport, then extract.
    (async () => {
      await expandSeeMore();
      sendResponse({ posts: extractPosts() });
    })();
    return true; // async
  }
});
