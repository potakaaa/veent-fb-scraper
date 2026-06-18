'use strict';

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/events\/(\d+)/i);
    if (!match) return null;
    return `facebook.com/events/${match[1]}`;
  } catch {
    return null;
  }
}

module.exports = { normalizeUrl };
