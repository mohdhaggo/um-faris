// Firebase-backed implementation of the REST API the app used to call on Express.
// Every handler returns the SAME JSON shape the server returned, so pages/components
// remain unchanged. Collections are prefixed `web_` to stay isolated from other data.
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, sendPasswordResetEmail,
} from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, where,
} from 'firebase/firestore';
import { app, auth, db, authReady, firebaseConfig } from '../firebase';
import { DEFAULT_FIELD_CONFIG, JOB_TYPES } from '../constants';

// ---- collection names (isolated from the Flutter app's data) ----
const C = {
  users: 'web_users',
  clients: 'web_clients',
  employees: 'web_employees',
  services: 'web_services',
  bookings: 'web_bookings',
  settings: 'web_settings',
  attempts: 'web_login_attempts',
};

const MAX_LOGIN_ATTEMPTS = 3;
const BLOCKED_MSG = 'تم حظر حسابك بسبب محاولات دخول فاشلة متكررة. تواصل مع المدير لإلغاء الحظر.';
// doc id derived from the email (Firestore ids can't contain '/', etc.)
const attemptKey = (email) => lower(email).replace(/[^a-z0-9]/g, '_');

class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const col = (name) => collection(db, name);
const nowIso = () => new Date().toISOString();
const num = (v) => Number(v) || 0;
const lower = (s) => String(s || '').trim().toLowerCase();

async function allDocs(name) {
  const snap = await getDocs(col(name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function oneDoc(name, id) {
  const d = await getDoc(doc(db, name, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}

/* ============================= AUTH ============================= */

// Owner email(s): always treated as an active root admin, regardless of invite-only state.
const ROOT_EMAILS = ['mohd.haggo@gmail.com'];
const isRootEmail = (e) => ROOT_EMAILS.includes(lower(e));

async function ensureProfile(uid, email) {
  const root = isRootEmail(email);
  const existing = await oneDoc(C.users, uid);
  if (existing) {
    // Keep the owner email permanently as an active root admin (self-heal if demoted).
    if (root && (existing.role !== 'admin' || existing.status !== 'active' || !existing.is_root)) {
      const patch = { role: 'admin', status: 'active', is_root: true };
      await updateDoc(doc(db, C.users, uid), patch);
      return { ...existing, ...patch };
    }
    return existing;
  }

  const allUsers = await allDocs(C.users);

  // The owner email OR the first-ever user bootstraps as root admin; everyone else must be invited.
  if (!root && allUsers.length > 0) {
    throw new ApiError('الحساب غير مُفعّل — تواصل مع المدير', 403);
  }
  const profile = {
    name: (email || '').split('@')[0] || 'المدير',
    email: lower(email), phone: '',
    role: 'admin', status: 'active', is_root: true, created_at: nowIso(),
  };
  await setDoc(doc(db, C.users, uid), profile);
  return { id: uid, ...profile };
}

// Throws unless the signed-in user is an active admin (manager). Used to gate user management.
async function requireAdmin() {
  const u = auth.currentUser;
  if (!u) throw new ApiError('مطلوب تسجيل الدخول', 401);
  const p = await oneDoc(C.users, u.uid);
  if (!p || p.role !== 'admin' || p.status !== 'active') {
    throw new ApiError('هذه العملية تتطلب صلاحية مدير', 403);
  }
  return p;
}

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone || null,
  role: u.role, status: u.status, created_at: u.created_at,
});

async function login({ email, password }) {
  if (!email || !password) throw new ApiError('البريد وكلمة المرور مطلوبان');
  const em = lower(email);
  const aKey = attemptKey(em);
  const aRef = doc(db, C.attempts, aKey);

  // 1) Already blocked? Refuse before even trying (stays blocked until an admin clears it).
  //    The read happens pre-auth, so it must never hard-fail login if the rule is missing —
  //    on any read error we fall back to "no lockout info" and continue.
  let aSnap = null;
  try {
    aSnap = await getDoc(aRef);
    if (aSnap.exists() && aSnap.data().blocked) throw new ApiError(BLOCKED_MSG, 403);
  } catch (e) {
    if (e instanceof ApiError) throw e; // genuine "blocked" -> propagate
    aSnap = null;                       // permission/other read error -> skip lockout gracefully
  }

  // 2) Attempt sign-in.
  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, em, password);
  } catch {
    // 3) Failed -> raise the counter (unauthenticated write allowed by a scoped rule).
    const count = (aSnap && aSnap.exists() ? (aSnap.data().count || 0) : 0) + 1;
    const blocked = count >= MAX_LOGIN_ATTEMPTS;
    let counted = false;
    try {
      await setDoc(aRef, { email: em, count, blocked, updated_at: nowIso() });
      counted = true;
    } catch { /* counter is best-effort (e.g. rule not deployed) */ }
    if (counted && blocked) throw new ApiError(BLOCKED_MSG, 403);
    throw new ApiError(
      counted ? `بيانات الدخول غير صحيحة. المحاولات المتبقية: ${Math.max(MAX_LOGIN_ATTEMPTS - count, 0)}`
              : 'بيانات الدخول غير صحيحة',
      401,
    );
  }

  // 4) Success -> clear the counter (now authenticated, so the write is allowed).
  if (aSnap && aSnap.exists()) { try { await deleteDoc(aRef); } catch { /* ignore */ } }

  const profile = await ensureProfile(cred.user.uid, cred.user.email);
  if (profile.status !== 'active') {
    await signOut(auth);
    throw new ApiError('الحساب موقوف', 403);
  }
  return { token: cred.user.uid, user: { id: profile.id, name: profile.name, email: profile.email, role: profile.role } };
}

async function me() {
  const u = await authReady();
  if (!u) throw new ApiError('مطلوب تسجيل الدخول', 401);
  const profile = await oneDoc(C.users, u.uid);
  if (!profile) throw new ApiError('غير موجود', 404);
  if (profile.status !== 'active') throw new ApiError('الحساب موقوف', 403);
  return { user: { id: profile.id, name: profile.name, email: profile.email, role: profile.role, status: profile.status } };
}

async function logout() {
  await signOut(auth);
  return { ok: true };
}

/* ============================= SETTINGS ============================= */

const SETTINGS_DOC = 'config';

async function getSettings() {
  const d = await getDoc(doc(db, C.settings, SETTINGS_DOC));
  if (d.exists()) return d.data();
  // seed defaults (values stored as JSON strings, mirroring the old server)
  const defaults = {
    max_bookings_per_day: '3',
    job_types: JSON.stringify(JOB_TYPES),
    field_config: JSON.stringify(DEFAULT_FIELD_CONFIG),
    day_overrides: JSON.stringify({}),
  };
  await setDoc(doc(db, C.settings, SETTINGS_DOC), defaults);
  return defaults;
}

async function putSettings(body) {
  const patch = {};
  for (const [k, v] of Object.entries(body || {})) {
    patch[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  await setDoc(doc(db, C.settings, SETTINGS_DOC), patch, { merge: true });
  return getSettings();
}

function parse(v, fallback) {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

// max allowed CONFIRMED bookings for a date (per-day override else global; blank = unlimited)
async function maxForDate(date) {
  const s = await getSettings();
  const overrides = parse(s.day_overrides, {});
  let raw;
  if (date && overrides[date] !== undefined && overrides[date] !== null && overrides[date] !== '') raw = overrides[date];
  else raw = s.max_bookings_per_day;
  if (raw === '' || raw === null || raw === undefined) return Infinity;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? Infinity : n;
}

/* ============================= BOOKINGS ============================= */

function hydrateBooking(b) {
  if (!b) return null;
  const assignments = Array.isArray(b.assignments) ? b.assignments : [];
  const byRole = {};
  let empCost = 0, tipsFromEmps = 0;
  for (const e of assignments) {
    (byRole[e.role] ||= []).push({
      id: e.employee_id, name: e.name, role: e.role,
      paid_amount: e.paid_amount || 0, tip_amount: e.tip_amount || 0,
    });
    empCost += e.paid_amount || 0;
    tipsFromEmps += e.tip_amount || 0;
  }
  const total = (b.amount || 0) - (b.discount || 0);
  const out = {
    ...b,
    tips_distributed: !!b.tips_distributed,
    payment_completed: !!b.payment_completed,
    closed: !!b.closed,
    extra_drinks: Array.isArray(b.extra_drinks) ? b.extra_drinks : [],
    custom_fields: b.custom_fields || {},
    employees: byRole,
    has_sabbabat: (byRole['صبابة'] || []).length > 0,
    has_workers: (byRole['عاملة'] || []).length > 0,
    has_driver: (byRole['سائق'] || []).length > 0,
    employee_cost: empCost,
    tips_from_employees: tipsFromEmps,
    net_total: total,
    remaining: Math.max(total - (b.paid_amount || 0), 0),
  };
  delete out.assignments;
  return out;
}

const BOOKING_FIELDS = [
  'client_id', 'client_name', 'client_phone', 'booking_date', 'event_time', 'event_type',
  'city', 'location_type', 'guests_count', 'material_type', 'material_color',
  'sabbabat_count', 'workers_count', 'clothes_type', 'clothes_color', 'extra_drinks', 'custom_fields',
  'amount', 'discount', 'payment_status', 'paid_amount', 'status', 'tips_amount',
  'tips_distributed', 'payment_completed', 'closed', 'notes',
];
const BOOL_FIELDS = ['tips_distributed', 'payment_completed', 'closed'];
const NUM_FIELDS = ['guests_count', 'sabbabat_count', 'workers_count', 'amount', 'discount', 'paid_amount', 'tips_amount'];

function normalizeBooking(body) {
  const out = {};
  for (const f of BOOKING_FIELDS) {
    if (body[f] === undefined) continue;
    if (f === 'extra_drinks') out[f] = body[f] || [];
    else if (f === 'custom_fields') out[f] = body[f] || {};
    else if (BOOL_FIELDS.includes(f)) out[f] = !!body[f];
    else if (NUM_FIELDS.includes(f)) out[f] = num(body[f]);
    else out[f] = body[f];
  }
  return out;
}

async function ensureClient(body) {
  if (body.client_id) return body.client_id;
  if (!body.client_name) return null;
  if (body.client_phone) {
    const q = await getDocs(query(col(C.clients), where('phone', '==', body.client_phone)));
    if (!q.empty) return q.docs[0].id;
  }
  const ref = await addDoc(col(C.clients), {
    name: body.client_name, phone: body.client_phone || null, created_at: nowIso(),
  });
  return ref.id;
}

async function listBookings(p = {}) {
  let rows = await allDocs(C.bookings);
  const { from, to, date, q, payment_status, tips, status } = p;
  if (date) rows = rows.filter((b) => b.booking_date === date);
  if (from) rows = rows.filter((b) => b.booking_date >= from);
  if (to) rows = rows.filter((b) => b.booking_date <= to);
  if (q) {
    const needle = String(q);
    rows = rows.filter((b) => (b.client_name || '').includes(needle) || (b.client_phone || '').includes(needle));
  }
  if (payment_status) rows = rows.filter((b) => b.payment_status === payment_status);
  if (status) {
    const list = String(status).split(',').map((s) => s.trim()).filter(Boolean);
    rows = rows.filter((b) => list.includes(b.status));
  }
  if (tips === '1' || tips === 1) rows = rows.filter((b) => (b.tips_amount || 0) > 0);
  rows.sort((a, b) =>
    (a.booking_date || '').localeCompare(b.booking_date || '') ||
    (a.event_time || '').localeCompare(b.event_time || ''));
  return rows.map(hydrateBooking);
}

async function createBooking(body) {
  body.client_id = await ensureClient(body);
  const data = normalizeBooking(body);
  if (!data.client_name || !data.booking_date) throw new ApiError('اسم العميل وتاريخ الحجز مطلوبان');
  let overflow = false;
  if (data.status === undefined) {
    const max = await maxForDate(data.booking_date);
    const dayRows = await listBookings({ date: data.booking_date });
    const confirmed = dayRows.filter((b) => b.status === 'active').length;
    if (confirmed >= max) { data.status = 'pending'; overflow = true; } else data.status = 'active';
  }
  // sensible defaults to mirror the SQLite column defaults
  const full = {
    extra_drinks: [], custom_fields: {}, guests_count: 0, sabbabat_count: 0, workers_count: 0,
    amount: 0, discount: 0, paid_amount: 0, tips_amount: 0, payment_status: 'unpaid',
    tips_distributed: false, payment_completed: false, closed: false,
    assignments: [], created_at: nowIso(), ...data,
  };
  const ref = await addDoc(col(C.bookings), full);
  const saved = hydrateBooking({ id: ref.id, ...full });
  return { ...saved, overflow, max_for_date: await maxForDate(data.booking_date) };
}

async function updateBooking(id, body) {
  const existing = await oneDoc(C.bookings, id);
  if (!existing) throw new ApiError('الحجز غير موجود', 404);
  if (body.client_id === undefined && (body.client_name || body.client_phone)) {
    body.client_id = (await ensureClient(body)) ?? existing.client_id;
  }
  const data = normalizeBooking(body);
  if (Object.keys(data).length) await updateDoc(doc(db, C.bookings, id), data);
  return hydrateBooking(await oneDoc(C.bookings, id));
}

async function setStatus(id, status) {
  await updateDoc(doc(db, C.bookings, id), { status });
  return hydrateBooking(await oneDoc(C.bookings, id));
}

async function assignEmployees(id, role, employeeIds) {
  const b = await oneDoc(C.bookings, id);
  if (!b) throw new ApiError('الحجز غير موجود', 404);
  const emps = await allDocs(C.employees);
  const nameById = Object.fromEntries(emps.map((e) => [e.id, e.name]));
  const kept = (b.assignments || []).filter((a) => a.role !== role);
  const added = (employeeIds || []).map((eid) => ({
    employee_id: eid, name: nameById[eid] || '', role, paid_amount: 0, tip_amount: 0,
  }));
  await updateDoc(doc(db, C.bookings, id), { assignments: [...kept, ...added] });
  return hydrateBooking(await oneDoc(C.bookings, id));
}

async function closeBooking(id, body) {
  const b = await oneDoc(C.bookings, id);
  if (!b) throw new ApiError('الحجز غير موجود', 404);
  const {
    payment_status, paid_amount, payment_completed,
    tips_amount = 0, tips_distributed = false, employees = [], closed = true,
  } = body || {};
  const patch = {
    closed: !!closed,
    payment_completed: !!payment_completed,
    tips_distributed: !!tips_distributed,
    tips_amount: num(tips_amount),
  };
  if (payment_status) patch.payment_status = payment_status;
  if (paid_amount !== undefined) patch.paid_amount = num(paid_amount);

  const assignments = (b.assignments || []).map((a) => {
    const match = employees.find((e) => e.id === a.employee_id && e.role === a.role);
    return match ? { ...a, paid_amount: num(match.paid_amount), tip_amount: num(match.tip_amount) } : a;
  });
  patch.assignments = assignments;
  await updateDoc(doc(db, C.bookings, id), patch);
  return hydrateBooking(await oneDoc(C.bookings, id));
}

/* ============================= CLIENTS ============================= */

async function listClients() {
  const [clients, bookings] = await Promise.all([allDocs(C.clients), allDocs(C.bookings)]);
  const counts = {};
  for (const b of bookings) if (b.client_id) counts[b.client_id] = (counts[b.client_id] || 0) + 1;
  return clients
    .map((c) => ({ ...c, bookings_count: counts[c.id] || 0 }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

async function lookupClient(phone) {
  const p = (phone || '').trim();
  if (!p) return { found: false };
  const q = await getDocs(query(col(C.clients), where('phone', '==', p)));
  if (q.empty) return { found: false };
  const client = { id: q.docs[0].id, ...q.docs[0].data() };
  const bk = await getDocs(query(col(C.bookings), where('client_id', '==', client.id)));
  return { found: true, client: { ...client, bookings_count: bk.size } };
}

async function getClient(id) {
  const client = await oneDoc(C.clients, id);
  if (!client) throw new ApiError('العميل غير موجود', 404);
  let rows = (await allDocs(C.bookings)).filter((b) => b.client_id === id);
  rows.sort((a, b) => (b.booking_date || '').localeCompare(a.booking_date || ''));
  return { ...client, bookings: rows.map(hydrateBooking) };
}

/* ============================= EMPLOYEES ============================= */

async function listEmployees(p = {}) {
  let rows = (await allDocs(C.employees)).map((e) => ({
    ...e, active: !!e.active, job_types: Array.isArray(e.job_types) ? e.job_types : [],
  }));
  rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const { role, date, exclude_booking } = p;
  if (role) rows = rows.filter((e) => e.job_types.includes(role) && e.active);
  if (role && date) {
    const dayBookings = (await allDocs(C.bookings)).filter(
      (b) => b.booking_date === date && ['active', 'pending'].includes(b.status) && b.id !== exclude_booking
    );
    const busyMap = {};
    for (const b of dayBookings) {
      for (const a of (b.assignments || [])) (busyMap[a.employee_id] ||= []).push(b.client_name);
    }
    rows = rows.map((e) => ({ ...e, busy: !!busyMap[e.id], busy_with: busyMap[e.id] || [] }));
  }
  return rows;
}

/* ============================= USERS ============================= */

async function listUsers() {
  const [rows, attempts] = await Promise.all([allDocs(C.users), allDocs(C.attempts)]);
  const blockedByEmail = new Set(attempts.filter((a) => a.blocked).map((a) => lower(a.email)));
  const out = rows
    .filter((u) => u.status !== 'deleted')
    .map((u) => ({ ...publicUser(u), login_blocked: blockedByEmail.has(lower(u.email)) }));
  out.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  return out;
}

// Admin clears a login lockout (resets the failed-attempt counter for the user's email).
async function unblockUser(id) {
  await requireAdmin();
  const u = await oneDoc(C.users, id);
  if (!u?.email) throw new ApiError('المستخدم غير موجود');
  try { await deleteDoc(doc(db, C.attempts, attemptKey(u.email))); } catch { /* already clear */ }
  return { ok: true };
}

async function createUser(body) {
  await requireAdmin();
  const { name, email, phone, password, role = 'user', status = 'active' } = body || {};
  const em = lower(email);
  if (!name || !email) throw new ApiError('الاسم والبريد مطلوبان');

  // Re-add of an existing user (e.g. previously deleted/blocked): just reactivate the
  // existing profile and show it again. Profiles are keyed by Auth UID and never hard-
  // deleted, so the same email always maps back to the same account.
  const existing = (await allDocs(C.users)).find((u) => lower(u.email) === em);
  if (existing) {
    await updateDoc(doc(db, C.users, existing.id), {
      name, phone: phone || null, role, status: 'active', updated_at: nowIso(),
    });
    return publicUser(await oneDoc(C.users, existing.id));
  }

  // Brand-new user: needs a password to create the Firebase Auth account.
  if (!password) throw new ApiError('كلمة المرور مطلوبة');
  let uid;
  // Create the Auth account on a temporary instance so the admin stays signed in.
  const tmp = initializeApp(firebaseConfig, `userCreator_${Date.now()}`);
  const tmpAuth = getAuth(tmp);
  try {
    const cred = await createUserWithEmailAndPassword(tmpAuth, em, password);
    uid = cred.user.uid;
    await signOut(tmpAuth);
    await deleteApp(tmp);
  } catch (e) {
    await deleteApp(tmp);
    if (e.code === 'auth/email-already-in-use') {
      // Auth account exists but has no profile here — recover the UID by signing in,
      // then create the profile. Requires the correct current password.
      const tmp2 = initializeApp(firebaseConfig, `userSignIn_${Date.now()}`);
      const tmpAuth2 = getAuth(tmp2);
      try {
        const cred2 = await signInWithEmailAndPassword(tmpAuth2, em, password);
        uid = cred2.user.uid;
        await signOut(tmpAuth2);
        await deleteApp(tmp2);
      } catch {
        await deleteApp(tmp2);
        throw new ApiError('البريد مستخدم مسبقاً — أدخل كلمة المرور الصحيحة لهذا الحساب');
      }
    } else if (e.code === 'auth/weak-password') {
      throw new ApiError('كلمة المرور قصيرة جداً');
    } else {
      throw new ApiError('تعذّر إنشاء الحساب');
    }
  }

  const profile = { name, email: em, phone: phone || null, role, status, is_root: false, created_at: nowIso() };
  await setDoc(doc(db, C.users, uid), profile);
  return publicUser({ id: uid, ...profile });
}

async function updateUser(id, body) {
  await requireAdmin();
  const { name, email, phone, role, status } = body || {};
  // Note: another user's Firebase Auth login email can't be changed from the client;
  // we update the profile record (name/phone/role/status + display email).
  await updateDoc(doc(db, C.users, id), {
    name, email: lower(email), phone: phone || null, role, status,
  });
  return publicUser(await oneDoc(C.users, id));
}

async function setUserStatus(id, status) {
  await requireAdmin();
  await updateDoc(doc(db, C.users, id), { status });
  return publicUser(await oneDoc(C.users, id));
}

async function resetUserPassword(id) {
  await requireAdmin();
  // Admins can't set another user's password from the client; send them a reset link.
  const u = await oneDoc(C.users, id);
  if (!u?.email) throw new ApiError('لا يوجد بريد لهذا المستخدم');
  await sendPasswordResetEmail(auth, u.email);
  return { ok: true, reset_email_sent: true };
}

async function deleteUser(id) {
  await requireAdmin();
  if (auth.currentUser && auth.currentUser.uid === id) throw new ApiError('لا يمكن حذف حسابك الحالي');
  // Soft-delete: preserves the Firestore doc (needed to re-activate the same email later)
  // and keeps the inert Auth record. Login is blocked because status !== 'active'.
  await updateDoc(doc(db, C.users, id), { status: 'deleted' });
  return { ok: true };
}

/* ============================= SERVICES ============================= */

async function listServices() {
  const rows = await allDocs(C.services);
  rows.sort((a, b) => (a.kind || '').localeCompare(b.kind || '') || (a.name || '').localeCompare(b.name || ''));
  return rows;
}

/* ============================= FINANCE ============================= */

async function financeSummary(p = {}) {
  const { from, to, payment_status, tips, group = 'day' } = p;
  let rows = (await allDocs(C.bookings)).filter((b) => b.status === 'active');
  if (from) rows = rows.filter((b) => b.booking_date >= from);
  if (to) rows = rows.filter((b) => b.booking_date <= to);
  if (payment_status) rows = rows.filter((b) => b.payment_status === payment_status);
  if (tips === '1' || tips === 1) rows = rows.filter((b) => (b.tips_amount || 0) > 0);
  rows.sort((a, b) => (a.booking_date || '').localeCompare(b.booking_date || ''));

  let revenue = 0, paidSum = 0, collected = 0, empCostTotal = 0, tipsTotal = 0, discountTotal = 0;
  const buckets = new Map();
  for (const b of rows) {
    const net = (b.amount || 0) - (b.discount || 0);
    const cost = (b.assignments || []).reduce((s, a) => s + (a.paid_amount || 0), 0);
    const tip = b.tips_amount || 0;
    const paid = b.paid_amount || 0;
    const collectedThis = paid + tip;
    const key = group === 'month' ? (b.booking_date || '').slice(0, 7) : b.booking_date;
    const profit = collectedThis - cost - tip;
    revenue += net; paidSum += paid; collected += collectedThis;
    empCostTotal += cost; tipsTotal += tip; discountTotal += b.discount || 0;
    const cur = buckets.get(key) || { period: key, revenue: 0, collected: 0, employee_cost: 0, tips: 0, profit: 0, count: 0 };
    cur.revenue += net; cur.collected += collectedThis; cur.employee_cost += cost;
    cur.tips += tip; cur.profit += profit; cur.count += 1;
    buckets.set(key, cur);
  }
  const series = [...buckets.values()].sort((a, b) => (a.period < b.period ? -1 : 1));
  return {
    totals: {
      revenue, collected, remaining: revenue - paidSum, employee_cost: empCostTotal,
      tips: tipsTotal, discount: discountTotal, net_profit: collected - empCostTotal - tipsTotal, count: rows.length,
    },
    series,
  };
}

/* ============================= NOTIFICATIONS ============================= */

function daysBetween(a, b) {
  const ms = new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00');
  return Math.round(ms / 86400000);
}

// Dynamically computed in-app notifications based on booking dates / state.
// Mirrors the old Express route; staff count comes from the embedded assignments array.
async function listNotifications() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = (await allDocs(C.bookings)).filter((b) => ['active', 'pending'].includes(b.status));
  const list = [];
  const n = (b, type, severity, message) => ({
    id: `${type}-${b.id}`, booking_id: b.id, type, severity, message,
    booking_date: b.booking_date, client_name: b.client_name,
  });

  for (const b of rows) {
    if (!b.booking_date) continue;
    if (b.status === 'pending') {
      list.push(n(b, 'pending', 'warning',
        `حجز انتظار للعميل ${b.client_name} يوم ${b.booking_date} — بانتظار التأكيد أو الرفض.`));
      continue;
    }
    const diff = daysBetween(today, b.booking_date);
    const empCount = Array.isArray(b.assignments) ? b.assignments.length : 0;
    if (diff === 0) list.push(n(b, 'today', 'info', `حجز اليوم: ${b.client_name} (${b.booking_date}).`));
    if (diff === 1) list.push(n(b, 'tomorrow', 'info', `حجز غداً: ${b.client_name} (${b.booking_date}).`));
    if (diff >= 1 && diff <= 3 && empCount === 0) list.push(n(b, 'no_staff', 'warning',
      `لم يتم حجز الموظفين لحجز ${b.client_name} بعد ${diff === 1 ? 'يوم' : diff === 2 ? 'يومين' : '٣ أيام'} (${b.booking_date}).`));
    if (diff < 0 && !b.closed) list.push(n(b, 'close_day', 'danger',
      `انتهى موعد حجز ${b.client_name} (${b.booking_date}). يرجى إنهاء الحجز وتوزيع الإكراميات.`));
  }
  const order = { danger: 0, warning: 1, info: 2 };
  list.sort((a, b) => order[a.severity] - order[b.severity] || (a.booking_date < b.booking_date ? 1 : -1));
  return list;
}

/* ============================= CRUD helpers ============================= */

async function createDocReturn(name, data) {
  const ref = await addDoc(col(name), { ...data, created_at: nowIso() });
  return { id: ref.id, ...(await oneDoc(name, ref.id)) };
}
async function updateDocReturn(name, id, data) {
  await updateDoc(doc(db, name, id), data);
  return oneDoc(name, id);
}

/* ============================= ROUTER ============================= */

// Matches METHOD + path (segments) and dispatches. `params` = query (GET), `body` = payload.
export async function handle(method, rawPath, { params = {}, body = {} } = {}) {
  const path = rawPath.split('?')[0];
  const seg = path.replace(/^\/api\//, '').replace(/\/$/, '').split('/'); // e.g. ['bookings','123','close']
  const [root, a, b] = seg;
  const M = method.toUpperCase();

  switch (root) {
    case 'auth':
      if (a === 'login' && M === 'POST') return login(body);
      if (a === 'me' && M === 'GET') return me();
      if (a === 'logout' && M === 'POST') return logout();
      break;

    case 'bookings':
      if (!a && M === 'GET') return listBookings(params);
      if (!a && M === 'POST') return createBooking(body);
      if (a && !b && M === 'GET') return hydrateBooking(await requireBooking(a));
      if (a && !b && M === 'PUT') return updateBooking(a, body);
      if (a && !b && M === 'DELETE') { await deleteDoc(doc(db, C.bookings, a)); return { ok: true }; }
      if (a && b === 'confirm' && M === 'POST') return setStatus(a, 'active');
      if (a && b === 'reject' && M === 'POST') return setStatus(a, 'rejected');
      if (a && b === 'cancel' && M === 'POST') return setStatus(a, 'cancelled');
      if (a && b === 'employees' && M === 'PUT') return assignEmployees(a, decodeURIComponent(seg[3]), body.employee_ids || []);
      if (a && b === 'close' && M === 'POST') return closeBooking(a, body);
      break;

    case 'clients':
      if (a === 'lookup' && M === 'GET') return lookupClient(params.phone);
      if (!a && M === 'GET') return listClients();
      if (!a && M === 'POST') {
        if (!body.name) throw new ApiError('اسم العميل مطلوب');
        return createDocReturn(C.clients, { name: body.name, phone: body.phone || null });
      }
      if (a && M === 'GET') return getClient(a);
      if (a && M === 'PUT') return updateDocReturn(C.clients, a, { name: body.name, phone: body.phone || null });
      if (a && M === 'DELETE') { await deleteDoc(doc(db, C.clients, a)); return { ok: true }; }
      break;

    case 'employees':
      if (!a && M === 'GET') return listEmployees(params);
      if (!a && M === 'POST') {
        if (!body.name) throw new ApiError('اسم الموظف مطلوب');
        return hydrateEmployee(await createDocReturn(C.employees, empPayload(body)));
      }
      if (a && M === 'PUT') return hydrateEmployee(await updateDocReturn(C.employees, a, empPayload(body)));
      if (a && M === 'DELETE') { await deleteDoc(doc(db, C.employees, a)); return { ok: true }; }
      break;

    case 'services':
      if (!a && M === 'GET') return listServices();
      if (!a && M === 'POST') {
        if (!body.name) throw new ApiError('اسم الخدمة مطلوب');
        return createDocReturn(C.services, {
          name: body.name, kind: body.kind || 'service', price: num(body.price), description: body.description || '',
        });
      }
      if (a && M === 'PUT') return updateDocReturn(C.services, a, {
        name: body.name, kind: body.kind, price: num(body.price), description: body.description || '',
      });
      if (a && M === 'DELETE') { await deleteDoc(doc(db, C.services, a)); return { ok: true }; }
      break;

    case 'users':
      if (!a && M === 'GET') return listUsers();
      if (!a && M === 'POST') return createUser(body);
      if (a && !b && M === 'PUT') return updateUser(a, body);
      if (a && b === 'status' && M === 'POST') return setUserStatus(a, body.status);
      if (a && b === 'password' && M === 'POST') return resetUserPassword(a);
      if (a && b === 'unblock' && M === 'POST') return unblockUser(a);
      if (a && !b && M === 'DELETE') return deleteUser(a);
      break;

    case 'settings':
      if (M === 'GET') return getSettings();
      if (M === 'PUT') return putSettings(body);
      break;

    case 'finance':
      if (a === 'summary' && M === 'GET') return financeSummary(params);
      break;

    case 'notifications':
      if (!a && M === 'GET') return listNotifications();
      break;
  }
  throw new ApiError(`Unhandled route: ${M} ${path}`, 404);
}

async function requireBooking(id) {
  const b = await oneDoc(C.bookings, id);
  if (!b) throw new ApiError('الحجز غير موجود', 404);
  return b;
}

const empPayload = (body) => ({
  name: body.name, phone: body.phone || null,
  job_types: Array.isArray(body.job_types) ? body.job_types : [],
  wage: num(body.wage), active: body.active !== false,
});
const hydrateEmployee = (e) => ({ ...e, active: !!e.active, job_types: Array.isArray(e.job_types) ? e.job_types : [] });
