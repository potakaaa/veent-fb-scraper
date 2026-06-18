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

function checkActiveTab() {
  chrome.runtime.sendMessage({ action: 'CHECK_TAB' }, (resp) => {
    if (resp?.valid) {
      extractBtn.disabled = false;
      setStatus('Ready — click Extract to collect visible events.', '');
    } else {
      extractBtn.disabled = true;
      setStatus(resp?.reason || 'Navigate to a Facebook Events page first.', 'error');
    }
  });
}

// ── Receive progress updates from background enrichment ──────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action !== 'ENRICH_PROGRESS') return;
  if (msg.done) {
    setStatus(
      `Done! ${msg.enriched}/${msg.total} events enriched with organizer & city.`,
      'success'
    );
  } else {
    setStatus(`Enriching event ${msg.current}/${msg.total}…`, 'loading');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.session.get(['lastSearchTerm'], (data) => {
    if (data.lastSearchTerm) searchInput.value = data.lastSearchTerm;
  });
  checkActiveTab();
});

openSearchBtn.addEventListener('click', () => {
  const term = searchInput.value.trim();
  if (!term) { setStatus('Enter a search term first.', 'error'); return; }
  chrome.storage.session.set({ lastSearchTerm: term });
  chrome.tabs.create({ url: `https://www.facebook.com/events/search?q=${encodeURIComponent(term)}` });
  setStatus('Opened Facebook Events search. Browse, scroll, then extract.', '');
});

extractBtn.addEventListener('click', async () => {
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
