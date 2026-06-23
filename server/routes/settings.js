import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});

router.put('/', (req, res) => {
  const body = req.body || {};
  const up = db.prepare(`
    INSERT INTO settings (key,value) VALUES (?,?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  for (const [k, v] of Object.entries(body)) {
    up.run(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});

export default router;
