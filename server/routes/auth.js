import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { signToken, authRequired } from '../auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'البريد وكلمة المرور مطلوبان' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  if (user.status !== 'active') return res.status(403).json({ error: 'الحساب موقوف' });
  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id,name,email,role,status FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'غير موجود' });
  res.json({ user });
});

export default router;
