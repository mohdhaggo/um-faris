import { Router } from 'express';
import { db } from '../db.js';
import { hydrateBooking, safeParse } from './bookingHelpers.js';

const router = Router();

const FIELDS = [
  'client_id', 'client_name', 'client_phone', 'booking_date', 'event_time', 'event_type',
  'city', 'location_type', 'guests_count', 'material_type', 'material_color',
  'sabbabat_count', 'workers_count', 'clothes_type', 'clothes_color', 'extra_drinks', 'custom_fields',
  'amount', 'discount', 'payment_status', 'paid_amount', 'status', 'tips_amount',
  'tips_distributed', 'payment_completed', 'closed', 'notes',
];

function normalize(body) {
  const out = {};
  for (const f of FIELDS) {
    if (body[f] === undefined) continue;
    if (f === 'extra_drinks') out[f] = JSON.stringify(body[f] || []);
    else if (f === 'custom_fields') out[f] = JSON.stringify(body[f] || {});
    else if (['tips_distributed', 'payment_completed', 'closed'].includes(f)) out[f] = body[f] ? 1 : 0;
    else out[f] = body[f];
  }
  return out;
}

function ensureClient(body) {
  if (body.client_id) return body.client_id;
  if (!body.client_name) return null;
  const existing = body.client_phone
    ? db.prepare('SELECT id FROM clients WHERE phone = ?').get(body.client_phone)
    : null;
  if (existing) return existing.id;
  return db
    .prepare('INSERT INTO clients (name,phone) VALUES (?,?)')
    .run(body.client_name, body.client_phone || null).lastInsertRowid;
}

// max allowed CONFIRMED bookings for a given date (per-day override else global).
// 0 = no confirmed bookings accepted (everything goes to the waiting list).
// missing/blank setting = unlimited.
function maxForDate(date) {
  const globalRow = db.prepare("SELECT value FROM settings WHERE key = 'max_bookings_per_day'").get();
  const ovRow = db.prepare("SELECT value FROM settings WHERE key = 'day_overrides'").get();
  const overrides = ovRow ? safeParse(ovRow.value, {}) : {};
  let raw;
  if (date && overrides[date] !== undefined && overrides[date] !== null && overrides[date] !== '') {
    raw = overrides[date];
  } else {
    raw = globalRow ? globalRow.value : '';
  }
  if (raw === '' || raw === null || raw === undefined) return Infinity;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? Infinity : n;
}

function confirmedCount(date) {
  return db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE booking_date = ? AND status = 'active'").get(date).c;
}

// GET /api/bookings?from=&to=&date=&q=&payment_status=&tips=&status=
router.get('/', (req, res) => {
  const { from, to, date, q, payment_status, tips, status } = req.query;
  const where = [];
  const params = [];
  if (date) { where.push('booking_date = ?'); params.push(date); }
  if (from) { where.push('booking_date >= ?'); params.push(from); }
  if (to) { where.push('booking_date <= ?'); params.push(to); }
  if (q) { where.push('(client_name LIKE ? OR client_phone LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (payment_status) { where.push('payment_status = ?'); params.push(payment_status); }
  if (status) {
    const list = String(status).split(',').map((s) => s.trim()).filter(Boolean);
    where.push(`status IN (${list.map(() => '?').join(',')})`);
    params.push(...list);
  }
  if (tips === '1') where.push('tips_amount > 0');
  const sql = `SELECT * FROM bookings ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY booking_date, event_time`;
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(hydrateBooking));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'الحجز غير موجود' });
  res.json(hydrateBooking(row));
});

router.post('/', (req, res) => {
  const body = req.body || {};
  body.client_id = ensureClient(body);
  const data = normalize(body);
  if (!data.client_name || !data.booking_date) {
    return res.status(400).json({ error: 'اسم العميل وتاريخ الحجز مطلوبان' });
  }
  // waiting-list logic: accept but mark pending if the day is full (0 = none allowed)
  let overflow = false;
  if (data.status === undefined) {
    const max = maxForDate(data.booking_date);
    if (confirmedCount(data.booking_date) >= max) {
      data.status = 'pending';
      overflow = true;
    } else {
      data.status = 'active';
    }
  }
  const cols = Object.keys(data);
  const stmt = db.prepare(
    `INSERT INTO bookings (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
  );
  const id = stmt.run(...cols.map((c) => data[c])).lastInsertRowid;
  const out = hydrateBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id));
  res.status(201).json({ ...out, overflow, max_for_date: maxForDate(data.booking_date) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'الحجز غير موجود' });
  const body = req.body || {};
  if (body.client_id === undefined && (body.client_name || body.client_phone)) {
    body.client_id = ensureClient(body) ?? existing.client_id;
  }
  const data = normalize(body);
  const cols = Object.keys(data);
  if (cols.length) {
    db.prepare(`UPDATE bookings SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...cols.map((c) => data[c]), req.params.id);
  }
  res.json(hydrateBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)));
});

// confirm a pending (waiting) booking -> active
router.post('/:id/confirm', (req, res) => {
  db.prepare("UPDATE bookings SET status = 'active' WHERE id = ?").run(req.params.id);
  res.json(hydrateBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)));
});

// reject a pending booking -> rejected
router.post('/:id/reject', (req, res) => {
  db.prepare("UPDATE bookings SET status = 'rejected' WHERE id = ?").run(req.params.id);
  res.json(hydrateBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)));
});

router.post('/:id/cancel', (req, res) => {
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  res.json(hydrateBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// assign employees for a role (replaces existing for that role)
router.put('/:id/employees/:role', (req, res) => {
  const { id, role } = req.params;
  const ids = Array.isArray(req.body.employee_ids) ? req.body.employee_ids : [];
  db.prepare('DELETE FROM booking_employees WHERE booking_id = ? AND role = ?').run(id, role);
  const ins = db.prepare('INSERT INTO booking_employees (booking_id,employee_id,role) VALUES (?,?,?)');
  for (const empId of ids) ins.run(id, empId, role);
  res.json(hydrateBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)));
});

// close & finalize a booking: payment + per-employee amounts + tips
router.post('/:id/close', (req, res) => {
  const id = req.params.id;
  const {
    payment_status, paid_amount, payment_completed,
    tips_amount = 0, tips_distributed = false, employees = [], closed = true,
  } = req.body || {};

  const fields = {
    closed: closed ? 1 : 0,
    payment_completed: payment_completed ? 1 : 0,
    tips_distributed: tips_distributed ? 1 : 0,
    tips_amount: Number(tips_amount) || 0,
  };
  if (payment_status) fields.payment_status = payment_status;
  if (paid_amount !== undefined) fields.paid_amount = Number(paid_amount) || 0;

  const cols = Object.keys(fields);
  db.prepare(`UPDATE bookings SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
    .run(...cols.map((c) => fields[c]), id);

  // per-employee paid amount + tip
  const upd = db.prepare(
    'UPDATE booking_employees SET paid_amount = ?, tip_amount = ? WHERE booking_id = ? AND employee_id = ? AND role = ?'
  );
  for (const e of employees) {
    upd.run(Number(e.paid_amount) || 0, Number(e.tip_amount) || 0, id, e.id, e.role);
  }
  res.json(hydrateBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)));
});

export default router;
