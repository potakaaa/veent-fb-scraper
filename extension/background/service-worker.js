'use strict';

const SERVER         = 'http://localhost:7842';
const FB_EVENTS_RE   = /^https:\/\/www\.facebook\.com\/events\//;
const RENDER_DELAY   = 2500; // ms after tab "complete" for FB React to finish rendering
const CONCURRENT     = 3;    // tabs open in parallel during enrichment

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
});
