const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(path.join(dataDir, 'leads.db'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    niche TEXT NOT NULL,
    location TEXT NOT NULL,
    requested_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    processed INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_id INTEGER REFERENCES searches(id),
    name TEXT NOT NULL,
    category TEXT,
    address TEXT,
    phone TEXT,
    website TEXT,
    has_website INTEGER NOT NULL DEFAULT 0,
    email TEXT,
    instagram TEXT,
    facebook TEXT,
    linkedin TEXT,
    whatsapp TEXT,
    tiktok TEXT,
    rating REAL,
    reviews_count INTEGER,
    maps_url TEXT UNIQUE,
    qualification TEXT NOT NULL DEFAULT 'nao_avaliado',
    status TEXT NOT NULL DEFAULT 'nao_contatado',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_leads_search_id ON leads(search_id);
  CREATE INDEX IF NOT EXISTS idx_leads_has_website ON leads(has_website);
  CREATE INDEX IF NOT EXISTS idx_leads_qualification ON leads(qualification);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
`);

module.exports = db;
