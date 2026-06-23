'use strict';

const SERVER = 'http://localhost:7842';

const searchInput  = document.getElementById('searchTerm');
const openSearchBtn = document.getElementById('openSearch');
const extractBtn   = document.getElementById('extractBtn');
const statusEl     = document.getElementById('status');

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className   = `status ${type}`;
}

function getMode() {
  const checked = document.querySelector('input[name="mode"]:checked');
  return checked ? checked.value : 'facebook';
}

// Keep the extract button label in sync with the active mode.
function updateExtractLabel() {
  const mode = getMode();
  if (mode === 'x')     { extractBtn.textContent = 'Collect X.com Tweets'; return; }
  if (mode === 'posts') { extractBtn.textContent = 'Collect FB Posts';     return; }
  extractBtn.textContent = 'Extract Visible Events';
}

const CHECK_ACTION = { x: 'CHECK_TAB_X', posts: 'CHECK_TAB_POSTS', facebook: 'CHECK_TAB' };
const READY_STATUS = {
  x:        'Ready — click Collect to gather visible tweets.',
  posts:    'Ready — click Collect to gather visible posts.',
  facebook: 'Ready — click Extract to collect visible events.',
};
const NAV_HINT = {
  x:        'Navigate to an X.com page first.',
  posts:    'Navigate to a Facebook page or group first.',
  facebook: 'Navigate to a Facebook Events page first.',
};

function checkActiveTab() {
  const mode   = getMode();
  const action = CHECK_ACTION[mode] || CHECK_ACTION.facebook;

  // Fallback: if the service worker doesn't respond within 1 s (e.g. MV3 SW cold
  // start or termination mid-scroll), enable the button anyway so the user isn't
  // stuck. The relay handler has its own guard and will surface an error if needed.
  let handled = false;
  const fallback = setTimeout(() => {
    if (!handled) {
      extractBtn.disabled = false;
      setStatus(READY_STATUS[mode] || READY_STATUS.facebook, '');
    }
  }, 1000);

  chrome.runtime.sendMessage({ action }, (resp) => {
    handled = true;
    clearTimeout(fallback);
    if (chrome.runtime.lastError) {
      // SW unavailable — enable optimistically.
      extractBtn.disabled = false;
      setStatus(READY_STATUS[mode] || READY_STATUS.facebook, '');
      return;
    }
    if (resp?.valid) {
      extractBtn.disabled = false;
      setStatus(READY_STATUS[mode] || READY_STATUS.facebook, '');
    } else {
      extractBtn.disabled = true;
      setStatus(resp?.reason || NAV_HINT[mode] || NAV_HINT.facebook, 'error');
    }
  });
}

// ── Receive progress updates from background ──────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'ENRICH_PROGRESS') {
    if (msg.done) {
      setStatus(
        `Done! ${msg.enriched}/${msg.total} events enriched with organizer & city.`,
        'success'
      );
    } else {
      setStatus(`Enriching event ${msg.current}/${msg.total}…`, 'loading');
    }
  }

  if (msg.action === 'X_PROGRESS') {
    if (msg.done) {
      let summary = `Done! Saved ${msg.inserted} new`;
      if (msg.duplicates > 0) summary += `, ${msg.duplicates} duplicate`;
      if (msg.skipped    > 0) summary += `, ${msg.skipped} filtered`;
      if (msg.errors     > 0) summary += `, ${msg.errors} error(s)`;
      summary += '.';
      setStatus(summary, 'success');
      extractBtn.disabled = false;
    } else {
      setStatus(
        `Processing tweet ${msg.current}/${msg.total} — ${msg.author}…`,
        'loading'
      );
    }
  }

  if (msg.action === 'POSTS_PROGRESS') {
    if (msg.done) {
      let summary = `Done! Saved ${msg.inserted} new`;
      if (msg.duplicates > 0) summary += `, ${msg.duplicates} duplicate`;
      if (msg.skipped    > 0) summary += `, ${msg.skipped} filtered`;
      if (msg.errors     > 0) summary += `, ${msg.errors} error(s)`;
      summary += '.';
      setStatus(summary, 'success');
      extractBtn.disabled = false;
    } else {
      setStatus(`Processing post ${msg.current}/${msg.total}…`, 'loading');
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.session.get(['lastSearchTerm'], (data) => {
    if (data.lastSearchTerm) searchInput.value = data.lastSearchTerm;
  });
  updateExtractLabel();
  checkActiveTab();
});

// Switching mode re-checks the active tab and relabels the extract button.
document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    updateExtractLabel();
    checkActiveTab();
  });
});

openSearchBtn.addEventListener('click', () => {
  // Facebook Posts mode: no events search URL — open the generic feed so the user
  // can navigate to the group/page they want to scrape.
  if (getMode() === 'posts') {
    chrome.tabs.create({ url: 'https://www.facebook.com/' });
    setStatus('Opened Facebook. Navigate to a group or page, scroll, then collect.', '');
    return;
  }

  const term = searchInput.value.trim();
  if (!term) { setStatus('Enter a search term first.', 'error'); return; }
  chrome.storage.session.set({ lastSearchTerm: term });
  chrome.tabs.create({ url: `https://www.facebook.com/events/search?q=${encodeURIComponent(term)}` });
  setStatus('Opened Facebook Events search. Browse, scroll, then extract.', '');
});

extractBtn.addEventListener('click', async () => {
  // ── X.com mode ─────────────────────────────────────────────────────────────
  if (getMode() === 'x') {
    const searchTerm = searchInput.value.trim();
    if (!searchTerm) { setStatus('Enter a search term so tweets are tagged correctly.', 'error'); return; }

    extractBtn.disabled = true;
    setStatus('Collecting visible tweets…', 'loading');

    chrome.runtime.sendMessage({ action: 'RELAY_EXTRACT_X', searchTerm }, (resp) => {
      if (chrome.runtime.lastError || resp?.error) {
        setStatus(`Collection failed: ${resp?.error || chrome.runtime.lastError?.message}`, 'error');
        extractBtn.disabled = false;
        return;
      }
      if (!resp?.started) {
        setStatus('No tweets found. Scroll the timeline, then collect again.', 'error');
        extractBtn.disabled = false;
        return;
      }
      // Background is now processing — X_PROGRESS messages drive the status updates.
      setStatus(`Found ${resp.total} tweet(s). Processing 1/${resp.total}…`, 'loading');
    });
    return;
  }

  // ── Facebook Posts mode ──────────────────────────────────────────────────────
  if (getMode() === 'posts') {
    // search term is optional for posts; pass it through if provided so rows are tagged.
    const searchTerm = searchInput.value.trim();

    extractBtn.disabled = true;
    setStatus('Scrolling & collecting posts… (this takes ~10–15 s)', 'loading');

    chrome.runtime.sendMessage({ action: 'RELAY_EXTRACT_POSTS', searchTerm }, (resp) => {
      if (chrome.runtime.lastError || resp?.error) {
        setStatus(`Collection failed: ${resp?.error || chrome.runtime.lastError?.message}`, 'error');
        extractBtn.disabled = false;
        return;
      }
      if (!resp?.started) {
        setStatus('No posts found. Scroll the feed/group, then collect again.', 'error');
        extractBtn.disabled = false;
        return;
      }
      // Background is now processing — POSTS_PROGRESS messages drive the status updates.
      setStatus(`Found ${resp.total} post(s). Processing 1/${resp.total}…`, 'loading');
    });
    return;
  }

  // ── Facebook mode (unchanged) ────────────────────────────────────────────────
  const searchTerm = searchInput.value.trim();
  if (!searchTerm) { setStatus('Enter a search term so events are tagged correctly.', 'error'); return; }

  extractBtn.disabled = true;
  setStatus('Extracting visible events…', 'loading');

  chrome.runtime.sendMessage({ action: 'RELAY_EXTRACT', searchTerm }, async (resp) => {
    if (chrome.runtime.lastError || resp?.error) {
      setStatus(`Extraction failed: ${resp?.error || chrome.runtime.lastError?.message}`, 'error');
      extractBtn.disabled = false;
      return;
    }

    const events = resp?.events || [];
    const mode   = resp?.debug?.mode;

    if (events.length === 0) {
      const cards   = resp?.debug?.cardRoots ?? '?';
      const skipped = resp?.debug?.skippedLowCount;
      let msg = `No events extracted. Cards found: ${cards}.`;
      if (skipped > 0) msg += ` ${skipped} skipped (< ${10} respondents).`;
      else msg += ' Try scrolling, then extract again.';
      setStatus(msg, 'error');
      extractBtn.disabled = false;
      return;
    }

    setStatus(`Saving ${events.length} event(s)…`, 'loading');

    try {
      const res = await fetch(`${SERVER}/events`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(events),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const { inserted, duplicates, errors } = await res.json();
      let msg = `Saved ${inserted} new`;
      if (duplicates > 0) msg += `, ${duplicates} existing`;
      msg += ' event(s).';
      if (errors.length > 0) msg += ` ${errors.length} skipped.`;

      // Auto-enrich: open each event's detail page in the background to pull
      // organizer, city, and full date. Only do this on search-results pages
      // (not when already on an individual event detail page).
      if (mode !== 'detail' && events.length > 0) {
        setStatus(msg + ` Enriching 0/${events.length}…`, 'loading');
        chrome.runtime.sendMessage({
          action:     'START_ENRICH',
          events:     events.map(e => ({ event_url: e.event_url })),
          searchTerm,
        });
        // Progress updates arrive via the ENRICH_PROGRESS listener above.
      } else {
        setStatus(msg, 'success');
      }
    } catch (err) {
      setStatus(`Server error: ${err.message}. Is the server running?`, 'error');
    } finally {
      extractBtn.disabled = false;
    }
  });
});
