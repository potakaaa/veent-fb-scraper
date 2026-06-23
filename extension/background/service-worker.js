'use strict';

const SERVER         = 'http://localhost:7842';
const FB_EVENTS_RE   = /^https:\/\/www\.facebook\.com\/events\//;
const FB_URL_RE      = /^https:\/\/(?:[\w-]+\.)*facebook\.com\//;
const X_URL_RE       = /^https:\/\/x\.com\//;
const POSTS_BATCH    = 50;   // FB posts POSTed per request to /events/posts
const RENDER_DELAY   = 2500; // ms after tab "complete" for FB React to finish rendering
const CONCURRENT     = 3;    // tabs open in parallel during enrichment

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Fetch the raw event_url values already stored for a search term so the content
// script can skip them during extraction. Content scripts run in the page origin
// (facebook.com) and cannot reach localhost — only the service worker can. Always
// resolves to an array; never throws (server-down → []).
async function fetchKnownUrls(searchTerm) {
  if (!searchTerm) return [];
  return fetch(`${SERVER}/events/posts/known-urls?term=${encodeURIComponent(searchTerm)}`)
    .then(r => r.json())
    .then(d => d.urls || [])
    .catch(() => []);
}

// MV3 keepalive: chrome.alarms fire every ~24 s during long batch runs to prevent
// the service worker from being terminated by Chrome's 30-second idle timer.
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== 'batchKeepalive') return;
  // no-op — the alarm event itself resets the SW idle timer
});

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise(resolve => {
    const fallback = setTimeout(resolve, timeoutMs);
    const listener = (id, info) => {
      if (id !== tabId || info.status !== 'complete') return;
      clearTimeout(fallback);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Retry sending a message to a tab — content script might not be injected yet.
async function sendToTab(tabId, msg, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch {
      if (i < retries - 1) await sleep(1000);
    }
  }
  return null;
}

async function enrichOne(eventUrl, searchTerm) {
  const tab = await chrome.tabs.create({ url: eventUrl, active: false });
  try {
    await waitForTabComplete(tab.id);
    await sleep(RENDER_DELAY);

    const resp = await sendToTab(tab.id, { action: 'EXTRACT', searchTerm });
    if (!resp?.events?.length) return false;

    const detail = resp.events[0];
    const patch  = {};
    if (detail.organizer_name) patch.organizer_name = detail.organizer_name;
    if (detail.city_location)  patch.city_location  = detail.city_location;
    if (detail.start_datetime) patch.start_datetime = detail.start_datetime;
    if (!Object.keys(patch).length) return false;

    await fetch(`${SERVER}/events/enrich`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ event_url: eventUrl, ...patch }),
    });
    return true;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// ─── Message listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  // ── CHECK_TAB ──────────────────────────────────────────────────────────────
  if (message.action === 'CHECK_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) { sendResponse({ valid: false, reason: 'No active tab.' }); return; }
      FB_EVENTS_RE.test(tab.url)
        ? sendResponse({ valid: true, tabId: tab.id, url: tab.url })
        : sendResponse({ valid: false, reason: 'Not on a Facebook Events page.' });
    });
    return true;
  }

  // ── RELAY_EXTRACT ──────────────────────────────────────────────────────────
  if (message.action === 'RELAY_EXTRACT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !FB_EVENTS_RE.test(tab.url)) {
        sendResponse({ events: [], error: 'Not on a Facebook Events page.' });
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT', searchTerm: message.searchTerm }, (resp) => {
        chrome.runtime.lastError
          ? sendResponse({ events: [], error: chrome.runtime.lastError.message })
          : sendResponse(resp);
      });
    });
    return true;
  }

  // ── START_ENRICH ───────────────────────────────────────────────────────────
  if (message.action === 'START_ENRICH') {
    sendResponse({ started: true }); // release popup's message channel immediately

    const { events, searchTerm } = message;
    if (!Array.isArray(events) || !events.length) return false;

    (async () => {
      chrome.action.setBadgeBackgroundColor({ color: '#1877f2' });
      let enriched = 0;
      let completed = 0;
      const total = events.length;

      // Process in parallel chunks of CONCURRENT tabs to balance speed vs load.
      for (let i = 0; i < total; i += CONCURRENT) {
        const chunk = events.slice(i, i + CONCURRENT);

        await Promise.all(chunk.map(async (ev) => {
          try {
            const ok = await enrichOne(ev.event_url, searchTerm);
            if (ok) enriched++;
          } catch (err) {
            console.error('[Enrich] failed:', ev.event_url, err.message);
          }
          completed++;
          chrome.action.setBadgeText({ text: `${completed}/${total}` });
          chrome.runtime.sendMessage({
            action: 'ENRICH_PROGRESS',
            current: completed,
            total,
            done: false,
          }).catch(() => {});
        }));
      }

      chrome.action.setBadgeText({ text: '' });
      chrome.runtime.sendMessage({
        action:   'ENRICH_PROGRESS',
        done:     true,
        enriched,
        total,
      }).catch(() => {});
    })();

    return false; // already sent response above
  }

  // ── CHECK_TAB_X ────────────────────────────────────────────────────────────
  if (message.action === 'CHECK_TAB_X') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) { sendResponse({ valid: false, reason: 'No active tab.' }); return; }
      X_URL_RE.test(tab.url)
        ? sendResponse({ valid: true, tabId: tab.id, url: tab.url })
        : sendResponse({ valid: false, reason: 'Not on an X.com page.' });
    });
    return true;
  }

  // ── RELAY_EXTRACT_X ────────────────────────────────────────────────────────
  if (message.action === 'RELAY_EXTRACT_X') {
    const xSearchTerm = message.searchTerm || ''; // capture before any async boundary
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab || !X_URL_RE.test(tab.url)) {
        sendResponse({ error: 'Not on an X.com page.' });
        return;
      }
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: function extractTweetsFromPage() {
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            const seen   = new Set();
            const tweets = [];
            for (const article of articles) {
              let tweetUrl = null;
              const statusLink = article.querySelector('a[href*="/status/"]');
              if (statusLink) {
                const href = statusLink.getAttribute('href') || '';
                tweetUrl = href.startsWith('http') ? href : `https://x.com${href}`;
              }
              const textEl     = article.querySelector('[data-testid="tweetText"]');
              const rawCaption = textEl ? (textEl.innerText || '').trim() : '';
              if (!tweetUrl || !rawCaption) continue;
              let authorHandle = '@unknown';
              const userNameEl = article.querySelector('[data-testid="User-Name"]');
              if (userNameEl) {
                const m = (userNameEl.innerText || '').match(/@(\w+)/);
                if (m) authorHandle = `@${m[1]}`;
              }
              let tweetTimestamp = new Date().toISOString();
              const timeEl = article.querySelector('time');
              if (timeEl && timeEl.getAttribute('datetime')) {
                tweetTimestamp = timeEl.getAttribute('datetime');
              }
              if (seen.has(tweetUrl)) continue;
              seen.add(tweetUrl);
              tweets.push({ tweet_url: tweetUrl, raw_caption: rawCaption, author_handle: authorHandle, tweet_timestamp: tweetTimestamp });
            }
            return tweets;
          },
        });

        const tweets = result?.result || [];
        if (!tweets.length) {
          sendResponse({ started: false, error: 'No tweets found on this page.' });
          return;
        }

        // Release the popup's message channel immediately, then process in background.
        sendResponse({ started: true, total: tweets.length });

        let inserted = 0, duplicates = 0, skipped = 0, errors = 0;
        for (let i = 0; i < tweets.length; i++) {
          const tweet = tweets[i];
          chrome.runtime.sendMessage({
            action:  'X_PROGRESS',
            current: i + 1,
            total:   tweets.length,
            author:  tweet.author_handle,
            done:    false,
          }).catch(() => {});

          try {
            const res = await fetch(`${SERVER}/events/x`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify([{ ...tweet, search_term: xSearchTerm }]),
            });
            const r = await res.json().catch(() => ({}));
            inserted   += r.inserted   ?? 0;
            duplicates += r.duplicates ?? 0;
            skipped    += r.skipped    ?? 0;
            errors     += (r.errors || []).length;
          } catch {
            errors++;
          }
        }

        chrome.runtime.sendMessage({
          action: 'X_PROGRESS',
          done: true,
          total: tweets.length,
          inserted, duplicates, skipped, errors,
        }).catch(() => {});

      } catch (err) {
        sendResponse({ error: err.message });
      }
    });
    return true;
  }

  // ── CHECK_TAB_POSTS ─────────────────────────────────────────────────────────
  if (message.action === 'CHECK_TAB_POSTS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) { sendResponse({ valid: false, reason: 'No active tab.' }); return; }
      FB_URL_RE.test(tab.url)
        ? sendResponse({ valid: true, tabId: tab.id, url: tab.url })
        : sendResponse({ valid: false, reason: 'Not on a Facebook page.' });
    });
    return true;
  }

  // ── RELAY_EXTRACT_POSTS ─────────────────────────────────────────────────────
  // content-posts.js is auto-injected via the manifest, so we message it directly
  // (chrome.tabs.sendMessage) — same pattern as RELAY_EXTRACT, NOT executeScript.
  if (message.action === 'RELAY_EXTRACT_POSTS') {
    const searchTerm = message.searchTerm || ''; // capture before any async boundary
    // async callback so we can await fetchKnownUrls before messaging the tab.
    // Chrome ignores the returned Promise from an async query callback — safe.
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab || !FB_URL_RE.test(tab.url)) {
        sendResponse({ started: false, error: 'Not on a Facebook page.' });
        return;
      }
      const knownUrls = await fetchKnownUrls(searchTerm);
      chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_POSTS', autoScroll: true, knownUrls }, async (resp) => {
        if (chrome.runtime.lastError) {
          sendResponse({ started: false, error: chrome.runtime.lastError.message });
          return;
        }
        if (resp?.error) {
          sendResponse({ started: false, error: resp.error });
          return;
        }
        const posts = resp?.posts || [];
        if (!posts.length) {
          sendResponse({ started: false, error: 'No posts found on this page.' });
          return;
        }

        // Release the popup's message channel immediately, then process in background.
        sendResponse({ started: true, total: posts.length });

        let inserted = 0, duplicates = 0, skipped = 0, errors = 0;
        for (let i = 0; i < posts.length; i++) {
          const post = posts[i];

          chrome.runtime.sendMessage({
            action:  'POSTS_PROGRESS',
            current: i + 1,
            total:   posts.length,
            done:    false,
          }).catch(() => {});

          try {
            const res = await fetch(`${SERVER}/events/posts`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify([{ ...post, search_term: searchTerm }]),
            });
            const r = await res.json().catch(() => ({}));
            inserted   += r.inserted   ?? 0;
            duplicates += r.duplicates ?? 0;
            skipped    += r.skipped    ?? 0;
            errors     += (r.errors || []).length;
          } catch {
            errors++;
          }
        }

        chrome.runtime.sendMessage({
          action: 'POSTS_PROGRESS',
          done: true,
          total: posts.length,
          inserted, duplicates, skipped, errors,
        }).catch(() => {});
      });
    });
    return true;
  }

  // ── BATCH_POSTS_SEARCH ──────────────────────────────────────────────────────
  // Loop over comma-separated keywords (validated in popup.js). One tab is reused
  // for every keyword: navigate → wait → click "Recent" filter (fail-safe) →
  // auto-scroll + extract → chunk-POST to /events/posts tagged with the keyword →
  // broadcast per-keyword progress. The button re-enable + final broadcast live in
  // the finally block so they always fire, even if a keyword errors mid-loop.
  if (message.action === 'BATCH_POSTS_SEARCH') {
    const keywords = message.keywords; // already validated as a non-empty array in popup.js
    let batchTab = null;
    let totalInserted = 0, totalDuplicates = 0;

    sendResponse({ started: true }); // release popup's message channel immediately

    // Start keepalive alarm before entering the long async loop.
    chrome.alarms.create('batchKeepalive', { periodInMinutes: 0.4 });
    chrome.action.setBadgeBackgroundColor({ color: '#1877f2' });

    (async () => {
      try {
        for (let i = 0; i < keywords.length; i++) {
          const kw  = keywords[i];
          const url = `https://www.facebook.com/search/posts?q=${encodeURIComponent(kw)}`;

          // Badge shows current keyword index so user can track progress even when popup is closed.
          chrome.action.setBadgeText({ text: `${i + 1}/${keywords.length}` });

          // Reuse one tab across keywords: create on the first, update on the rest.
          // active:true ensures full JS execution speed — background tabs throttle
          // timers and React rendering, which breaks autoScroll and page load.
          if (!batchTab) batchTab = await chrome.tabs.create({ url, active: true });
          else           await chrome.tabs.update(batchTab.id, { url });

          await waitForTabComplete(batchTab.id);
          await sleep(RENDER_DELAY);

          // Fail-safe: ignore the result — if the Recent filter button is absent the
          // batch continues with the default sort order.
          await sendToTab(batchTab.id, { action: 'CLICK_RECENT_FILTER' });
          await sleep(800); // let Facebook re-sort after the filter click

          // Pull already-stored URLs for this keyword so the content script can
          // skip them — drives both the fresh-count early exit and dedup-on-extract.
          const knownUrls = await fetchKnownUrls(kw);
          const resp      = await sendToTab(batchTab.id, { action: 'EXTRACT_POSTS', autoScroll: true, knownUrls });
          const posts     = resp?.posts || [];
          const extracted = posts.length;

          let inserted = 0, duplicates = 0, serverError = false;

          // Chunked POST: single call when small, sliced into POSTS_BATCH chunks otherwise.
          for (let j = 0; j < posts.length; j += POSTS_BATCH) {
            const chunk = posts.slice(j, j + POSTS_BATCH);
            try {
              const res = await fetch(`${SERVER}/events/posts`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(chunk.map(p => ({ ...p, search_term: kw }))),
              });
              const r = await res.json().catch(() => ({}));
              inserted   += r.inserted   ?? 0;
              duplicates += r.duplicates ?? 0;
            } catch (err) {
              console.error('[batch] POST failed for keyword', kw, err);
              serverError = true;
            }
          }

          totalInserted   += inserted;
          totalDuplicates += duplicates;

          chrome.runtime.sendMessage({
            action: 'BATCH_POSTS_PROGRESS',
            keyword: kw,
            keywordIndex: i,
            total: keywords.length,
            done: false,
            extracted,
            inserted,
            duplicates,
            serverError,
          }).catch(() => {});
        }
      } catch (err) {
        console.error('[batch]', err);
      } finally {
        chrome.alarms.clear('batchKeepalive');
        chrome.action.setBadgeText({ text: '' });
        if (batchTab) chrome.tabs.remove(batchTab.id).catch(() => {});
        const finalMsg = {
          action: 'BATCH_POSTS_PROGRESS',
          done: true,
          totalInserted,
          totalDuplicates,
          totalKeywords: keywords.length,
        };
        // Persist result so popup can show it when it reopens after the batch tab closed it.
        chrome.storage.session.set({ batchLastResult: { ...finalMsg, completedAt: Date.now() } });
        chrome.runtime.sendMessage(finalMsg).catch(() => {});
      }
    })();

    return true; // async — keep the message channel open (MV3)
  }
});
