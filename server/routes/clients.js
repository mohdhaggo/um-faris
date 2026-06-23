import { Router } from 'express';
import { db } from '../db.js';
import { hydrateBooking } from './bookingHelpers.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM bookings b WHERE b.client_id = c.id) AS bookings_count
    FROM clients c ORDER BY c.name
  `).all();
  res.json(rows);
});

// lookup by phone -> used by the booking form to auto-detect existing clients
router.get('/lookup', (req, res) => {
  const phone = (req.query.phone || '').trim();
  if (!phone) return res.json({ found: false });
  const client = db.prepare('SELECT * FROM clients WHERE phone = ?').get(phone);
  if (!client) return res.json({ found: false });
  const count = db.prepare('SELECT COUNT(*) AS c FROM bookings WHERE client_id = ?').get(client.id).c;
  res.json({ found: true, client: { ...client, bookings_count: count } });
});

router.get('/:id', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'العميل غير موجود' });
  const bookings = db.prepare('SELECT * FROM bookings WHERE client_id = ? ORDER BY booking_date DESC').all(req.params.id);
  res.json({ ...client, bookings: bookings.map(hydrateBooking) });
});

router.post('/', (req, res) => {
  const { name, phone } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم العميل مطلوب' });
  const id = db.prepare('INSERT INTO clients (name,phone) VALUES (?,?)').run(name, phone || null).lastInsertRowid;
  res.status(201).json(db.prepare('SELECT * FROM clients WHERE id = ?').get(id));
});

router.put('/:id', (req, res) => {
  const { name, phone } = req.body || {};
  db.prepare('UPDATE clients SET name=?, phone=? WHERE id=?').run(name, phone || null, req.params.id);
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
