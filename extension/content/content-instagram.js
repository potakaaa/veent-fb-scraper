'use strict';

// Instagram content script.
// Works on feed, hashtag explore pages (/explore/tags/…), profile grids,
// and individual post pages. Instagram obfuscates all class names, so this
// script uses structural selectors and img[alt] (Instagram populates the alt
// attribute from the post caption for accessibility — reliable on both grid
// and article/modal views).

function isPostHref(href) {
  return /^\/(p|reel|tv)\/[A-Za-z0-9_-]+/.test(href);
}

function toAbsolute(href) {
  return href.startsWith('http') ? href : `https://www.instagram.com${href}`;
}

function shortcodeFrom(url) {
  const m = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[2] : null;
}

function extractHashtags(text) {
  const matches = (text || '').match(/#[\w-￿]+/g) || [];
  return [...new Set(matches)].slice(0, 30);
}

// ── Per-article extraction ────────────────────────────────────────────────────

function postUrlFromEl(el) {
  for (const a of el.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    if (isPostHref(href)) return toAbsolute(href);
  }
  return null;
}

// Caption via img[alt] is the most reliable cross-surface approach.
// Falls back to the longest visible text block in the element.
function captionFromEl(el) {
  const img = el.querySelector('img[alt]');
  if (img) {
    const alt = (img.getAttribute('alt') || '').trim();
    if (alt.length > 0) return alt;
  }

  // Fallback: longest span/div text (avoids UI labels < 30 chars)
  let best = '';
  for (const node of el.querySelectorAll('span, div')) {
    const txt = (node.innerText || '').trim();
    if (txt.length > best.length && txt.length >= 30) best = txt;
  }
  return best;
}

// Author handle — first profile link (href = /username/ with no /p/ or /reel/)
function authorFromEl(el) {
  for (const a of el.querySelectorAll('a[href^="/"]')) {
    const href = a.getAttribute('href') || '';
    if (!isPostHref(href) && /^\/[A-Za-z0-9._]+\/?$/.test(href)) {
      return '@' + href.replace(/\//g, '');
    }
  }
  return null;
}

function mediaTypeFromEl(el) {
  if (el.querySelector('video')) return 'video';
  if (el.querySelector('[aria-label*="Carousel"], [aria-label*="Next slide"]')) return 'carousel';
  if (el.querySelector('img')) return 'photo';
  return null;
}

// ── Main extraction ───────────────────────────────────────────────────────────

function extractPosts() {
  const seen  = new Set();
  const posts = [];

  // Strategy 1: article elements (feed, detail modal, profile expanded views).
  // These contain full post data including author link and timestamp.
  const articles = document.querySelectorAll('article');
  console.log('[content-instagram] articles found:', articles.length);

  for (const article of articles) {
    const postUrl = postUrlFromEl(article);
    if (!postUrl) continue;

    const shortcode = shortcodeFrom(postUrl);
    if (!shortcode || seen.has(shortcode)) continue;
    seen.add(shortcode);

    const rawCaption   = captionFromEl(article);
    const authorHandle = authorFromEl(article);
    const timeEl       = article.querySelector('time[datetime]');

    posts.push({
      post_url:       postUrl,
      raw_caption:    rawCaption.substring(0, 2200),
      author_handle:  authorHandle,
      hashtags:       extractHashtags(rawCaption),
      media_type:     mediaTypeFromEl(article),
      post_timestamp: timeEl ? timeEl.getAttribute('datetime') : null,
      collected_at:   new Date().toISOString(),
    });
  }

  // Strategy 2: grid thumbnail links (explore/tags and profile grid pages).
  // No article wrapper — posts are just <a href="/p/shortcode/"><img alt="..."></a>.
  // Only runs when no article-based posts were found so they never overlap.
  if (posts.length === 0) {
    console.log('[content-instagram] no articles — falling back to grid links');
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      if (!isPostHref(href)) continue;

      const shortcode = shortcodeFrom(href);
      if (!shortcode || seen.has(shortcode)) continue;
      seen.add(shortcode);

      const postUrl    = toAbsolute(href);
      const img        = a.querySelector('img[alt]');
      const rawCaption = img ? (img.getAttribute('alt') || '').trim() : '';

      posts.push({
        post_url:       postUrl,
        raw_caption:    rawCaption.substring(0, 2200),
        author_handle:  null,
        hashtags:       extractHashtags(rawCaption),
        media_type:     a.querySelector('video') ? 'video' : (img ? 'photo' : null),
        post_timestamp: null,
        collected_at:   new Date().toISOString(),
      });
    }
  }

  console.log('[content-instagram] extracted', posts.length, 'post(s)');
  return posts;
}

// ── Auto-scroll ───────────────────────────────────────────────────────────────

function countPostLinks() {
  return document.querySelectorAll('article, a[href*="/p/"], a[href*="/reel/"]').length;
}

async function autoScroll() {
  const MAX_ROUNDS = 20;
  const MAX_IDLE   = 3;
  let idleRounds   = 0;
  let lastCount    = countPostLinks();

  console.log('[content-instagram] autoScroll start (post links:', lastCount, ')');

  for (let i = 0; i < MAX_ROUNDS; i++) {
    // Randomised scroll amount mimics a human reading pace.
    const amt = 400 + Math.floor(Math.random() * 350);
    window.scrollBy({ top: amt, behavior: 'smooth' });

    // Wait for Instagram's lazy-loader to fetch the next batch.
    await new Promise(r => setTimeout(r, 1200 + Math.floor(Math.random() * 800)));

    const newCount = countPostLinks();
    if (newCount > lastCount) {
      console.log('[content-instagram] autoScroll: post links', lastCount, '→', newCount);
      lastCount  = newCount;
      idleRounds = 0;
    } else {
      idleRounds++;
      console.log('[content-instagram] autoScroll: idle round', idleRounds, '/', MAX_IDLE);
      if (idleRounds >= MAX_IDLE) break;
    }
  }
  console.log('[content-instagram] autoScroll done (post links:', countPostLinks(), ')');
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'EXTRACT_INSTAGRAM') return;

  (async () => {
    if (message.autoScroll) await autoScroll();
    sendResponse({ posts: extractPosts() });
  })();
  return true; // async — keep channel open
});
