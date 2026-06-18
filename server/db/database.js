'use strict';

const path = require('path');
const fs   = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'events.db');
const SCHEMA  = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
    // Non-destructive migration: add respondent_count if not yet present.
    try { db.exec('ALTER TABLE events ADD COLUMN respondent_count INTEGER NOT NULL DEFAULT 0'); } catch {}
  }
  return db;
}

module.exports = { getDb };
