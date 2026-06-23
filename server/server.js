'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const eventsRouter      = require('./routes/events');
const eventsXRouter     = require('./routes/events-x');
const eventsPostsRouter = require('./routes/events-posts');
const exportRouter      = require('./routes/export');

const PORT = process.env.PORT ?? 7842;

const ALLOWED_ORIGINS = new Set([
  `http://localhost:${PORT}`,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : []),
]);

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.startsWith('chrome-extension://') || ALLOWED_ORIGINS.has(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin "${origin}" not allowed`));
    }
  },
  methods: ['GET', 'POST', 'DELETE', 'PATCH'],
}));

app.use(express.json({ limit: '512kb' }));

app.use('/events/posts', eventsPostsRouter);
app.use('/events/x', eventsXRouter);
app.use('/events', eventsRouter);
app.use('/export', exportRouter);

app.use(express.static(path.join(__dirname, '..', 'review-ui')));

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FB Events server running on port ${PORT}`);
});
