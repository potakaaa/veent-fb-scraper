'use strict';

const API = '';
let debounceTimer;

// ── Server calls ──────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(str) {
  if (!str) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  return str;
}
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function selectedIds() {
  return Array.from(document.querySelectorAll('#eventsBody input.row-check:checked')).map(cb => cb.dataset.id);
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTable(events) {
  const tbody = document.getElementById('eventsBody');
  if (!events.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty">No events found.</td></tr>';
    return;
  }
  tbody.innerHTML = events.map(e => `
    <tr data-id="${e.id}">
      <td class="col-check"><input type="checkbox" class="row-check" data-id="${e.id}" /></td>
      <td><a href="${esc(e.event_url)}" target="_blank" rel="noopener noreferrer">${esc(e.title)}</a></td>
      <td>${esc(formatDate(e.start_datetime))}</td>
      <td>${esc(e.venue_name) || '—'}</td>
      <td>${esc(e.city_location) || '—'}</td>
      <td>${esc(e.organizer_name) || '—'}</td>
      <td class="resp-count">${e.respondent_count > 0 ? e.respondent_count : '—'}</td>
      <td><span class="tag">${esc(e.source_search_term)}</span></td>
      <td>${esc(formatDate(e.collected_at))}</td>
      <td><input class="notes-input" type="text" value="${esc(e.notes || '')}" data-id="${e.id}" placeholder="Add notes…" /></td>
      <td><button class="btn-delete" data-id="${e.id}" title="Delete">&#128465;</button></td>
    </tr>
  `).join('');
  updateBulkBar();
}

function updateBulkBar() {
  const ids     = selectedIds();
  const bar     = document.getElementById('bulkBar');
  const countEl = document.getElementById('selectedCount');
  if (ids.length > 0) {
    bar.classList.remove('hidden');
    countEl.textContent = `${ids.length} selected`;
  } else {
    bar.classList.add('hidden');
  }
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadEvents() {
  const term = document.getElementById('filterTerm').value.trim();
  const from = document.getElementById('filterFrom').value;
  const to   = document.getElementById('filterTo').value;
  const params = new URLSearchParams({ limit: 500 });
  if (term) params.set('term', term);
  if (from) params.set('from', from);
  if (to)   params.set('to', to);

  const tbody = document.getElementById('eventsBody');
  tbody.innerHTML = '<tr><td colspan="11" class="empty">Loading…</td></tr>';
  try {
    const events = await apiFetch(`/events?${params}`);
    renderTable(events);
    document.getElementById('countLabel').textContent = `${events.length} event(s)`;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty" style="color:#e74c3c">Failed to load: ${err.message}</td></tr>`;
  }
}

// ── Delete helpers ────────────────────────────────────────────────────────────
async function deleteIds(ids) {
  await Promise.all(ids.map(id => apiFetch(`/events/${id}`, { method: 'DELETE' })));
  ids.forEach(id => document.querySelector(`tr[data-id="${id}"]`)?.remove());
  const remaining = document.querySelectorAll('#eventsBody tr[data-id]').length;
  document.getElementById('countLabel').textContent = `${remaining} event(s)`;
  updateBulkBar();
}

// ── Events ────────────────────────────────────────────────────────────────────

// Select-all checkbox
document.getElementById('selectAll').addEventListener('change', (e) => {
  document.querySelectorAll('#eventsBody input.row-check').forEach(cb => {
    cb.checked = e.target.checked;
  });
  updateBulkBar();
});

// Row checkbox change
document.getElementById('eventsBody').addEventListener('change', (e) => {
  if (e.target.classList.contains('row-check')) updateBulkBar();
  if (e.target.classList.contains('notes-input')) {
    const { id } = e.target.dataset;
    apiFetch(`/events/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ notes: e.target.value }),
    }).catch(err => console.error('Save notes failed:', err));
  }
});

// Single-row delete
document.getElementById('eventsBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-delete');
  if (!btn) return;
  if (!confirm('Delete this event?')) return;
  await deleteIds([btn.dataset.id]);
});

// Delete selected
document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
  const ids = selectedIds();
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} selected event(s)?`)) return;
  try { await deleteIds(ids); } catch (err) { alert(`Delete failed: ${err.message}`); }
});

// Delete all visible (current filter)
document.getElementById('clearAllBtn').addEventListener('click', async () => {
  const ids = Array.from(document.querySelectorAll('#eventsBody tr[data-id]')).map(tr => tr.dataset.id);
  if (!ids.length) return;
  if (!confirm(`Delete ALL ${ids.length} visible event(s)? This cannot be undone.`)) return;
  try { await deleteIds(ids); } catch (err) { alert(`Delete failed: ${err.message}`); }
});

// Deselect all
document.getElementById('deselectBtn').addEventListener('click', () => {
  document.querySelectorAll('#eventsBody input.row-check').forEach(cb => cb.checked = false);
  document.getElementById('selectAll').checked = false;
  updateBulkBar();
});

// Export
document.getElementById('exportBtn').addEventListener('click', () => {
  window.location.href = `${API}/export/csv`;
});

// Filters
document.getElementById('applyFilter').addEventListener('click', loadEvents);
document.getElementById('clearFilter').addEventListener('click', () => {
  document.getElementById('filterTerm').value = '';
  document.getElementById('filterFrom').value = '';
  document.getElementById('filterTo').value   = '';
  loadEvents();
});
document.getElementById('filterTerm').addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadEvents, 400);
});

loadEvents();
