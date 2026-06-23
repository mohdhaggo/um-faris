import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM services ORDER BY kind, name').all());
});

router.post('/', (req, res) => {
  const { name, kind = 'service', price = 0, description = '' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم الخدمة مطلوب' });
  const id = db
    .prepare('INSERT INTO services (name,kind,price,description) VALUES (?,?,?,?)')
    .run(name, kind, price, description).lastInsertRowid;
  res.status(201).json(db.prepare('SELECT * FROM services WHERE id = ?').get(id));
});

router.put('/:id', (req, res) => {
  const { name, kind, price, description } = req.body || {};
  db.prepare('UPDATE services SET name=?, kind=?, price=?, description=? WHERE id=?')
    .run(name, kind, price, description, req.params.id);
  res.json(db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
