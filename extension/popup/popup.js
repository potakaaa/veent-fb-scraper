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
  extractBtn.textContent = getMode() === 'x' ? 'Collect X.com Tweets' : 'Extract Visible Events';
}

function checkActiveTab() {
  const mode   = getMode();
  const action = mode === 'x' ? 'CHECK_TAB_X' : 'CHECK_TAB';
  chrome.runtime.sendMessage({ action }, (resp) => {
    if (resp?.valid) {
      extractBtn.disabled = false;
      setStatus(
        mode === 'x'
          ? 'Ready — click Collect to gather visible tweets.'
          : 'Ready — click Extract to collect visible events.',
        ''
      );
    } else {
      extractBtn.disabled = true;
      const fallback = mode === 'x'
        ? 'Navigate to an X.com page first.'
        : 'Navigate to a Facebook Events page first.';
      setStatus(resp?.reason || fallback, 'error');
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
