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

// Normalize a Facebook post permalink to a stable dedup key. Facebook exposes the
// same post under many shapes — path-based (/posts/, /groups/{id}/posts/{id},
// /permalink/{id}, /{user}/posts/{id}) and query-based (?post_id=, ?story_fbid=,
// ?fbid=). We strip the query/fragment and reduce each shape to a canonical form:
//   facebook.com/groups/{groupId}/posts/{postId}   (group posts)
//   facebook.com/posts/{postId}                     (everything else)
// Returns null when no usable post id can be found.
function normalizeFBPostUrl(url) {
  try {
    const u = new URL(url);
    if (!/facebook\.com$/i.test(u.hostname.replace(/^www\./i, ''))) return null;

    const path = u.pathname;

    // 1. Group post: /groups/{groupId}/posts/{postId} (or /permalink/{postId})
    const groupMatch = path.match(/\/groups\/([^/]+)\/(?:posts|permalink)\/(\d+)/i);
    if (groupMatch) {
      return `facebook.com/groups/${groupMatch[1]}/posts/${groupMatch[2]}`;
    }

    // 2. Group post id carried in the query: /groups/{groupId}/... ?post_id=...
    const groupIdMatch = path.match(/\/groups\/([^/]+)/i);
    const queryPostId =
      u.searchParams.get('post_id') ||
      u.searchParams.get('story_fbid') ||
      u.searchParams.get('fbid');
    if (groupIdMatch && queryPostId && /^\d+$/.test(queryPostId)) {
      return `facebook.com/groups/${groupIdMatch[1]}/posts/${queryPostId}`;
    }

    // 3. Permalink path: /permalink/{postId}
    const permalinkMatch = path.match(/\/permalink\/(\d+)/i);
    if (permalinkMatch) {
      return `facebook.com/posts/${permalinkMatch[1]}`;
    }

    // 4. User/page post: /{anything}/posts/{postId} or /posts/{postId}
    const postsMatch = path.match(/\/posts\/(?:pfbid[\w]+|(\d+))/i);
    if (postsMatch && postsMatch[1]) {
      return `facebook.com/posts/${postsMatch[1]}`;
    }
    // pfbid-style permalinks (no numeric id): keep the pfbid token as the key.
    const pfbidMatch = path.match(/\/posts\/(pfbid[\w]+)/i);
    if (pfbidMatch) {
      return `facebook.com/posts/${pfbidMatch[1]}`;
    }

    // 5. story.php?story_fbid=...&id=... — query-only permalink
    if (/\/story\.php/i.test(path) && queryPostId && /^\d+$/.test(queryPostId)) {
      return `facebook.com/posts/${queryPostId}`;
    }

    // 6. Video post: /{anything}/videos/{videoId}
    const videoMatch = path.match(/\/videos\/(\d+)/i);
    if (videoMatch) {
      return `facebook.com/videos/${videoMatch[1]}`;
    }

    // 7. Synthetic URL — built by the content script when no permalink anchor
    //    exists (Facebook search results). Stable hash = stable dedup key.
    const synthMatch = path.match(/\/posts\/(synth_[0-9a-f]+)$/i);
    if (synthMatch) {
      return `facebook.com/posts/${synthMatch[1]}`;
    }

    return null;
  } catch {
    return null;
  }
}

module.exports = { normalizeUrl, normalizeXUrl, normalizeFBPostUrl };
