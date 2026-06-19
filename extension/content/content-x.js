'use strict';

// X.com (Twitter) content script. Scrapes raw tweet text, post URL, author
// handle, and timestamp from whatever tweets are currently rendered in the DOM.
// No viewport filter — the user scrolls first, then triggers extraction.
// Raw captions are sent to the server, where the LLM structures them.

const SERVER = 'http://localhost:7842';

function extractTweets() {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  const seen = new Set();
  const tweets = [];

  for (const article of articles) {
    // tweet_url — first /status/ link inside the article.
    let tweetUrl = null;
    const statusLink = article.querySelector('a[href*="/status/"]');
    if (statusLink) {
      const href = statusLink.getAttribute('href') || '';
      tweetUrl = href.startsWith('http') ? href : `https://x.com${href}`;
    }

    // raw_caption — the tweet text block.
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const rawCaption = textEl ? (textEl.innerText || '').trim() : '';

    // Skip anything without both a URL and a caption.
    if (!tweetUrl || !rawCaption) continue;

    // author_handle — pull the @handle out of the user-name block.
    let authorHandle = '@unknown';
    const userNameEl = article.querySelector('[data-testid="User-Name"]');
    if (userNameEl) {
      const m = (userNameEl.innerText || '').match(/@(\w+)/);
      if (m) authorHandle = `@${m[1]}`;
    }

    // tweet_timestamp — the <time> element's datetime attribute.
    let tweetTimestamp = new Date().toISOString();
    const timeEl = article.querySelector('time');
    if (timeEl && timeEl.getAttribute('datetime')) {
      tweetTimestamp = timeEl.getAttribute('datetime');
    }

    // De-dupe by tweet URL within this extraction pass.
    if (seen.has(tweetUrl)) continue;
    seen.add(tweetUrl);

    tweets.push({
      tweet_url:       tweetUrl,
      raw_caption:     rawCaption,
      author_handle:   authorHandle,
      tweet_timestamp: tweetTimestamp,
    });
  }

  return tweets;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'EXTRACT_X') {
    const tweets = extractTweets();
    sendResponse({ tweets });
    return false; // synchronous response already sent
  }
});
