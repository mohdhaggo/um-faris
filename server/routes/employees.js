import { Router } from 'express';
import { db } from '../db.js';
import { safeParse } from './bookingHelpers.js';

const router = Router();

function hydrate(row) {
  return { ...row, active: !!row.active, job_types: safeParse(row.job_types, []) };
}

// GET /api/employees?role=صبابة&date=YYYY-MM-DD&exclude_booking=ID
// role+date => only employees with that job type, available (not assigned elsewhere that date)
router.get('/', (req, res) => {
  const { role, date, exclude_booking } = req.query;
  let rows = db.prepare('SELECT * FROM employees ORDER BY name').all().map(hydrate);

  if (role) rows = rows.filter((e) => e.job_types.includes(role) && e.active);

  if (role && date) {
    const busyRows = db.prepare(`
      SELECT be.employee_id, b.client_name FROM booking_employees be
      JOIN bookings b ON b.id = be.booking_id
      WHERE b.booking_date = ? AND b.status IN ('active','pending') AND be.booking_id != ?
    `).all(date, exclude_booking || -1);
    const busyMap = {};
    for (const r of busyRows) (busyMap[r.employee_id] ||= []).push(r.client_name);
    rows = rows.map((e) => ({ ...e, busy: !!busyMap[e.id], busy_with: busyMap[e.id] || [] }));
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, phone, job_types = [], wage = 0, active = true } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم الموظف مطلوب' });
  const id = db.prepare('INSERT INTO employees (name,phone,job_types,wage,active) VALUES (?,?,?,?,?)')
    .run(name, phone || null, JSON.stringify(job_types), wage, active ? 1 : 0).lastInsertRowid;
  res.status(201).json(hydrate(db.prepare('SELECT * FROM employees WHERE id = ?').get(id)));
});

router.put('/:id', (req, res) => {
  const { name, phone, job_types = [], wage = 0, active = true } = req.body || {};
  db.prepare('UPDATE employees SET name=?, phone=?, job_types=?, wage=?, active=? WHERE id=?')
    .run(name, phone || null, JSON.stringify(job_types), wage, active ? 1 : 0, req.params.id);
  res.json(hydrate(db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
