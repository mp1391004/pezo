// Lớp dữ liệu — Postgres (Neon) khi có DATABASE_URL, SQLite khi chạy ở máy.
const crypto = require('crypto');
const os = require('os');

const URL = process.env.DATABASE_URL || '';
const USE_PG = !!URL;

let pg = null, sqlite = null;
if (USE_PG) {
  const { Pool } = require('pg');
  pg = new Pool({ connectionString: URL, ssl: { rejectUnauthorized: false }, max: 3 });
} else {
  // Chạy ở máy. Trên máy chủ mà thiếu DATABASE_URL thì báo rõ, không để crash trắng.
  try {
    const { DatabaseSync } = require('node:sqlite');
    const fs = require('fs'), path = require('path');
    const storage = process.env.STORAGE_DIR || (process.env.NODE_ENV === 'production' ? path.join(os.homedir(), 'pezo-storage') : path.join(__dirname, '..', 'data'));
    fs.mkdirSync(path.join(storage, 'uploads'), { recursive: true });
    sqlite = new DatabaseSync(path.join(storage, 'app.db'));
  } catch (e) {
    console.error('Khong mo duoc SQLite:', e.message);
    sqlite = null;
  }
}

// $1,$2… cho Postgres  →  ?,? cho SQLite
const toSqlite = (sql) => sql.replace(/\$\d+/g, '?');

async function q(sql, params = []) {
  if (USE_PG) return (await pg.query(sql, params)).rows;
  if (!sqlite) throw new Error('Chua khai bao DATABASE_URL (bien moi truong) nen khong co noi luu du lieu.');
  const s = toSqlite(sql);
  if (/^\s*(select|with)/i.test(s)) return sqlite.prepare(s).all(...params);
  const info = sqlite.prepare(s).run(...params);
  return [{ changes: Number(info.changes || 0) }];
}
const one = async (sql, params) => (await q(sql, params))[0] || null;

async function init() {
  if (USE_PG) {
    await q(`CREATE TABLE IF NOT EXISTS leads(
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
      pack TEXT, flavour TEXT, status TEXT NOT NULL DEFAULT 'new', note TEXT,
      is_test INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS settings(
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS content(
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS visits(
      id SERIAL PRIMARY KEY, path TEXT, ua TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, google_id TEXT,
      paid INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS orders(
      id SERIAL PRIMARY KEY, order_code BIGINT UNIQUE NOT NULL, email TEXT NOT NULL,
      amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', payment_link_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  } else {
    await q(`CREATE TABLE IF NOT EXISTS leads(
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
      pack TEXT, flavour TEXT, status TEXT NOT NULL DEFAULT 'new', note TEXT,
      is_test INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    await q(`CREATE TABLE IF NOT EXISTS settings(
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    await q(`CREATE TABLE IF NOT EXISTS content(
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    await q(`CREATE TABLE IF NOT EXISTS visits(
      id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT, ua TEXT,
      at TEXT NOT NULL DEFAULT (datetime('now')))`);
    await q(`CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, name TEXT, google_id TEXT,
      paid INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    await q(`CREATE TABLE IF NOT EXISTS orders(
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_code INTEGER UNIQUE NOT NULL, email TEXT NOT NULL,
      amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', payment_link_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  }
}

// ---- settings / content ----
const getSetting = async (k, d = '') => {
  const r = await one('SELECT value FROM settings WHERE key=$1', [k]);
  return r ? r.value : d;
};
const setSetting = (k, v) => q(
  `INSERT INTO settings(key,value) VALUES($1,$2)
   ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`, [k, String(v)]);

const hasKey = async (table, k) => !!(await one(`SELECT 1 AS x FROM ${table} WHERE key=$1`, [k]));

// ---- mật khẩu ----
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const makePw = (pw) => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + hashPw(pw, s); };
const checkPw = (pw, stored) => {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(hashPw(pw, salt), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = { q, one, init, getSetting, setSetting, hasKey, makePw, checkPw, USE_PG };
