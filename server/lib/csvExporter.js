'use strict';

const COLUMNS = [
  'title',
  'event_url',
  'start_datetime',
  'end_datetime',
  'venue_name',
  'city_location',
  'organizer_name',
  'short_description',
  'source_search_term',
  'collected_at',
  'notes',
];

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function rowsToCsv(rows) {
  const header = COLUMNS.join(',');
  const lines = rows.map(row =>
    COLUMNS.map(col => escapeCsv(row[col])).join(',')
  );
  return [header, ...lines].join('\r\n');
}

module.exports = { rowsToCsv, COLUMNS };
