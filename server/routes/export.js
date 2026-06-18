'use strict';

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { rowsToCsv } = require('../lib/csvExporter');

router.get('/csv', async (req, res) => {
  const { ids } = req.query;

  let rows;
  try {
    if (ids && ids.length > 0) {
      const idList      = (Array.isArray(ids) ? ids : [ids]).map(Number).filter(Number.isFinite);
      const placeholders = idList.map((_, i) => `$${i + 1}`).join(',');
      const result = await pool.query(
        `SELECT * FROM events WHERE id IN (${placeholders}) ORDER BY collected_at DESC`,
        idList
      );
      rows = result.rows;
    } else {
      const result = await pool.query('SELECT * FROM events ORDER BY collected_at DESC');
      rows = result.rows;
    }
  } catch (err) {
    console.error('Export query failed:', err);
    return res.status(500).json({ error: 'Export query failed' });
  }

  if (rows.length === 0) {
    return res.status(404).json({ error: 'No events to export' });
  }

  const now = new Date().toISOString().slice(0, 10);
  const csv = rowsToCsv(rows);

  try {
    const exportedAt   = new Date().toISOString();
    const exportedIds  = rows.map(r => r.id);
    const placeholders = exportedIds.map((_, i) => `$${i + 2}`).join(',');
    await pool.query(
      `UPDATE events SET exported_at = $1 WHERE id IN (${placeholders})`,
      [exportedAt, ...exportedIds]
    );
  } catch (err) {
    console.error('Failed to stamp exported_at:', err);
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fb-events-${now}.csv"`);
  res.send(csv);
});

module.exports = router;
