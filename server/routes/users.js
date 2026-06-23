import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';

const router = Router();

const publicCols = 'id,name,email,phone,role,status,created_at';

router.get('/', (req, res) => {
  res.json(db.prepare(`SELECT ${publicCols} FROM users ORDER BY created_at`).all());
});

router.post('/', (req, res) => {
  const { name, email, phone, password, role = 'user', status = 'active' } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(400).json({ error: 'البريد مستخدم مسبقاً' });
  const id = db.prepare('INSERT INTO users (name,email,phone,password_hash,role,status) VALUES (?,?,?,?,?,?)')
    .run(name, email.toLowerCase(), phone || null, bcrypt.hashSync(password, 10), role, status).lastInsertRowid;
  res.status(201).json(db.prepare(`SELECT ${publicCols} FROM users WHERE id = ?`).get(id));
});

router.put('/:id', (req, res) => {
  const { name, email, phone, role, status } = req.body || {};
  db.prepare('UPDATE users SET name=?, email=?, phone=?, role=?, status=? WHERE id=?')
    .run(name, email.toLowerCase(), phone || null, role, status, req.params.id);
  res.json(db.prepare(`SELECT ${publicCols} FROM users WHERE id = ?`).get(req.params.id));
});

// toggle status (تفعيل / ايقاف)
router.post('/:id/status', (req, res) => {
  const { status } = req.body || {};
  db.prepare('UPDATE users SET status=? WHERE id=?').run(status, req.params.id);
  res.json(db.prepare(`SELECT ${publicCols} FROM users WHERE id = ?`).get(req.params.id));
});

// change password (تغيير كلمة السر)
router.post('/:id/password', (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 4) return res.status(400).json({ error: 'كلمة المرور قصيرة جداً' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'لا يمكن حذف حسابك الحالي' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
