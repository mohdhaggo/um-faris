import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// DB_PATH lets production mount a persistent volume for the database file
const dbPath = process.env.DB_PATH || join(__dirname, 'data.db');

export const db = new DatabaseSync(dbPath);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  job_types TEXT NOT NULL DEFAULT '[]',
  wage REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'service',
  price REAL NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  booking_date TEXT NOT NULL,
  event_time TEXT,
  event_type TEXT,
  city TEXT,
  location_type TEXT,
  guests_count INTEGER DEFAULT 0,
  material_type TEXT,
  material_color TEXT,
  sabbabat_count INTEGER DEFAULT 0,
  workers_count INTEGER DEFAULT 0,
  clothes_type TEXT,
  clothes_color TEXT,
  extra_drinks TEXT NOT NULL DEFAULT '[]',
  amount REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  paid_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  tips_amount REAL NOT NULL DEFAULT 0,
  tips_distributed INTEGER NOT NULL DEFAULT 0,
  payment_completed INTEGER NOT NULL DEFAULT 0,
  closed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS booking_employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// ---- migrations (idempotent) for existing databases ----
function addColumn(table, def) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`);
  } catch {
    /* column already exists */
  }
}
addColumn('bookings', "custom_fields TEXT NOT NULL DEFAULT '{}'");
addColumn('booking_employees', 'paid_amount REAL NOT NULL DEFAULT 0');
addColumn('booking_employees', 'tip_amount REAL NOT NULL DEFAULT 0');

export const DEFAULT_JOB_TYPES = ['صبابة', 'عاملة', 'سائق'];

export const DEFAULT_FIELD_CONFIG = [
  { key: 'event_time', label: 'وقت المناسبة', type: 'time', required: false, enabled: true, system: true },
  { key: 'event_type', label: 'نوع المناسبة', type: 'select', required: false, enabled: true, system: true,
    options: ['زواج', 'زواره', 'استقبال', 'عزيمة', 'ولادة', 'عزاء', 'تخرج', 'خطوبة'] },
  { key: 'city', label: 'المدينة', type: 'text', required: false, enabled: true, system: true },
  { key: 'location_type', label: 'نوع الموقع', type: 'select', required: false, enabled: true, system: true,
    options: ['استراحة', 'بيت', 'مستشفى', 'قاعة', 'شالية'] },
  { key: 'guests_count', label: 'عدد المعازيم', type: 'number', required: false, enabled: true, system: true },
  { key: 'material_type', label: 'نوع المعاميل', type: 'select', required: false, enabled: true, system: true,
    options: ['ذهبي', 'فضي', 'شفاف', 'ملون', 'أخرى'] },
  { key: 'material_color', label: 'لون المعاميل', type: 'text', required: false, enabled: true, system: true },
  { key: 'sabbabat_count', label: 'عدد الصبابات', type: 'number', required: false, enabled: true, system: true },
  { key: 'workers_count', label: 'عدد العاملات', type: 'number', required: false, enabled: true, system: true },
  { key: 'clothes_type', label: 'نوع الملابس', type: 'text', required: false, enabled: true, system: true },
  { key: 'clothes_color', label: 'لون الملابس', type: 'text', required: false, enabled: true, system: true },
  { key: 'notes', label: 'ملاحظات', type: 'text', required: false, enabled: true, system: true },
];

function ensureSetting(key, value) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run(key, value);
}
ensureSetting('max_bookings_per_day', '3');
ensureSetting('job_types', JSON.stringify(DEFAULT_JOB_TYPES));
ensureSetting('field_config', JSON.stringify(DEFAULT_FIELD_CONFIG));
ensureSetting('day_overrides', JSON.stringify({}));

// Demo/sample data is only seeded when SEED_DEMO=true (kept OFF in production).
function seed() {
  if (process.env.SEED_DEMO !== 'true') return;
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    'INSERT INTO users (name,email,phone,password_hash,role,status) VALUES (?,?,?,?,?,?)'
  ).run('المدير', 'admin@umfaris.com', '0500000000', hash, 'admin', 'active');

  db.prepare('INSERT INTO users (name,email,phone,password_hash,role,status) VALUES (?,?,?,?,?,?)').run(
    'سارة',
    'sara@umfaris.com',
    '0511111111',
    bcrypt.hashSync('user123', 10),
    'user',
    'active'
  );

  const emp = db.prepare(
    'INSERT INTO employees (name,phone,job_types,wage,active) VALUES (?,?,?,?,1)'
  );
  emp.run('نورة', '0551111111', JSON.stringify(['صبابة']), 150);
  emp.run('منيرة', '0552222222', JSON.stringify(['صبابة', 'عاملة']), 180);
  emp.run('هند', '0553333333', JSON.stringify(['عاملة']), 130);
  emp.run('أبو محمد', '0554444444', JSON.stringify(['سائق']), 100);
  emp.run('ريم', '0555555555', JSON.stringify(['صبابة']), 150);
  emp.run('عبدالله', '0556666666', JSON.stringify(['سائق', 'عاملة']), 120);

  const cl = db.prepare('INSERT INTO clients (name,phone) VALUES (?,?)');
  const c1 = cl.run('أم خالد', '0500000001').lastInsertRowid;
  const c2 = cl.run('أبو فهد', '0500000002').lastInsertRowid;
  cl.run('أم سعد', '0500000003');

  const sv = db.prepare(
    'INSERT INTO services (name,kind,price,description) VALUES (?,?,?,?)'
  );
  sv.run('ضيافة قهوة وشاي', 'service', 500, 'تقديم القهوة والشاي للضيوف');
  sv.run('صبابة إضافية', 'service', 150, 'صبابة واحدة لكامل المناسبة');
  sv.run('باقة زواج كاملة', 'package', 2500, '٣ صبابات + ٢ عاملات + سائق + معاميل ذهبية');
  sv.run('باقة استقبال', 'package', 1500, 'صبابتان + عاملة + ضيافة كاملة');

  const today = new Date();
  const d = (offset) => {
    const x = new Date(today);
    x.setDate(x.getDate() + offset);
    return x.toISOString().slice(0, 10);
  };

  const bk = db.prepare(`INSERT INTO bookings
    (client_id,client_name,client_phone,booking_date,event_time,event_type,city,location_type,
     guests_count,material_type,material_color,sabbabat_count,workers_count,clothes_type,clothes_color,
     extra_drinks,amount,discount,payment_status,paid_amount)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const b1 = bk.run(c1, 'أم خالد', '0500000001', d(2), '20:00', 'زواج', 'الرياض', 'قاعة',
    200, 'ذهبي', 'ذهبي', 3, 2, 'عباية', 'أسود',
    JSON.stringify([{ name: 'عصير برتقال', count: 50, cost: 250 }]), 2500, 0, 'deposit', 1000).lastInsertRowid;

  const b2 = bk.run(c2, 'أبو فهد', '0500000002', d(5), '18:30', 'استقبال', 'جدة', 'استراحة',
    80, 'فضي', 'فضي', 2, 1, 'مريول', 'بيج',
    JSON.stringify([]), 1500, 100, 'paid', 1400).lastInsertRowid;

  bk.run(null, 'أم عبدالعزيز', '0500000004', d(2), '17:00', 'تخرج', 'الرياض', 'بيت',
    40, 'شفاف', 'شفاف', 1, 1, 'عادي', 'أبيض',
    JSON.stringify([]), 900, 0, 'unpaid', 0);

  const be = db.prepare('INSERT INTO booking_employees (booking_id,employee_id,role) VALUES (?,?,?)');
  be.run(b1, 1, 'صبابة');
  be.run(b1, 5, 'صبابة');
  be.run(b1, 3, 'عاملة');
  be.run(b1, 4, 'سائق');
  be.run(b2, 2, 'صبابة');
}

// Ensures the root admin account exists (idempotent).
// Created from env on first run; later password changes via the portal are preserved.
function ensureRootAdmin() {
  const email = (process.env.ROOT_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ROOT_ADMIN_PASSWORD || '';
  if (!email || !password) return;
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return; // do not overwrite an existing account / changed password
  const name = process.env.ROOT_ADMIN_NAME || 'Mohamed';
  db.prepare(
    'INSERT INTO users (name,email,phone,password_hash,role,status) VALUES (?,?,?,?,?,?)'
  ).run(name, email, null, bcrypt.hashSync(password, 10), 'admin', 'active');
  console.log('✓ Root admin ready:', email);
}

seed();
ensureRootAdmin();
