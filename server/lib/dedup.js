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

// Normalize an X.com (Twitter) tweet URL to `x.com/status/{tweetId}`.
// Strips the username, query params, and protocol so the same tweet dedups
// regardless of which handle path or tracking params it arrived with.
function normalizeXUrl(url) {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/(.*?)\/status\/(\d+)/i);
    if (!match) return null;
    return `x.com/status/${match[2]}`;
  } catch {
    return null;
  }
}

module.exports = { normalizeUrl, normalizeXUrl };
