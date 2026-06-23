import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';

import './db.js';
import { authRequired } from './auth.js';
import authRoutes from './routes/auth.js';
import bookingsRoutes from './routes/bookings.js';
import servicesRoutes from './routes/services.js';
import clientsRoutes from './routes/clients.js';
import employeesRoutes from './routes/employees.js';
import usersRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import financeRoutes from './routes/finance.js';
import notificationsRoutes from './routes/notifications.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

// CORS: set CORS_ORIGINS (comma-separated) in production to restrict; default allows all
const corsOrigins = process.env.CORS_ORIGINS;
app.use(cors(corsOrigins ? { origin: corsOrigins.split(',').map((s) => s.trim()) } : {}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/bookings', authRequired, bookingsRoutes);
app.use('/api/services', authRequired, servicesRoutes);
app.use('/api/clients', authRequired, clientsRoutes);
app.use('/api/employees', authRequired, employeesRoutes);
app.use('/api/users', authRequired, usersRoutes);
app.use('/api/settings', authRequired, settingsRoutes);
app.use('/api/finance', authRequired, financeRoutes);
app.use('/api/notifications', authRequired, notificationsRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve built client in production if present
const distDir = join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not found' });
    res.sendFile(join(distDir, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'خطأ في الخادم' });
});

app.listen(PORT, () => console.log(`✅ Umfaris API running on http://localhost:${PORT}`));
