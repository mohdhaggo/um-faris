/**
 * Umfaris WhatsApp Agent — n8n "Code" node (Run Once for All Items).
 *
 * Pipeline: WhatsApp webhook -> THIS node -> replies on WhatsApp.
 * - Whitelist gate (only active users in إدارة المستخدمين get a reply).
 * - Gemini function-calling loop over booking actions.
 * - Writes to web_bookings / reads web_settings — same collections as the web app.
 * - Field config is fetched live from web_settings/config so any change in
 *   إدارة الحقول takes effect automatically (cached 5 min).
 */

// ============================ CONFIG ============================
const CONFIG = {
  // WhatsApp Cloud API
  WA_PHONE_NUMBER_ID: '1216368424887112',
  WA_TOKEN: 'PASTE_WHATSAPP_TOKEN',
  WA_API_VERSION: 'v21.0',

  // Whitelist — the bot only replies to active users in إدارة المستخدمين.
  // EXTRA_ALLOWED: always-allow list (digits only) on top; leave empty to rely solely on users list.
  EXTRA_ALLOWED: [],
  WHITELIST_TTL_MS: 60_000,

  // Google Gemini
  GEMINI_API_KEY: 'PASTE_GEMINI_KEY',
  GEMINI_MODEL: 'gemini-2.5-flash',

  // Firebase (public web config — safe to embed) + bot app-user credentials
  FB_API_KEY: 'AIzaSyAU6H9FZY0PR6-3JE3KGuwskKPbWbjwTew',
  FB_PROJECT_ID: 'umfaris-1efca',
  BOT_EMAIL: 'bot@umfaris.com',
  BOT_PASSWORD: 'PASTE_BOT_PASSWORD',

  MAX_TOOL_ROUNDS: 6,
  HISTORY_TURNS: 20,
  FIELD_CONFIG_TTL_MS: 5 * 60_000, // re-read field config every 5 minutes
};
// ================================================================

const http  = (opts) => this.helpers.httpRequest(opts);
const sleep = (ms)  => new Promise((r) => setTimeout(r, ms));
const FS_BASE    = `https://firestore.googleapis.com/v1/projects/${CONFIG.FB_PROJECT_ID}/databases/(default)/documents`;
const staticData = $getWorkflowStaticData('global');

// ─── Firestore value (de)serialisation ───────────────────────────────────────
function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean')  return { booleanValue: v };
  if (typeof v === 'number')   return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string')   return { stringValue: v };
  if (Array.isArray(v))        return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === 'object')   return { mapValue: { fields: toFsFields(v) } };
  return { stringValue: String(v) };
}
function toFsFields(obj) {
  const f = {};
  for (const k of Object.keys(obj)) f[k] = toFsValue(obj[k]);
  return f;
}
function fromFsValue(val) {
  if (!val) return null;
  if ('nullValue'     in val) return null;
  if ('booleanValue'  in val) return val.booleanValue;
  if ('integerValue'  in val) return parseInt(val.integerValue, 10);
  if ('doubleValue'   in val) return val.doubleValue;
  if ('stringValue'   in val) return val.stringValue;
  if ('arrayValue'    in val) return (val.arrayValue.values || []).map(fromFsValue);
  if ('mapValue'      in val) return fromFsFields(val.mapValue.fields || {});
  if ('timestampValue' in val) return val.timestampValue;
  return null;
}
function fromFsFields(fields) {
  const o = {};
  for (const k of Object.keys(fields || {})) o[k] = fromFsValue(fields[k]);
  return o;
}
function docId(name) { return name.split('/').pop(); }

// ─── Firebase auth (bot user) ─────────────────────────────────────────────────
async function getIdToken() {
  const now = Date.now();
  if (staticData.fbToken && staticData.fbTokenExp && now < staticData.fbTokenExp - 60_000)
    return staticData.fbToken;
  const res = await http({
    method: 'POST',
    url: `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${CONFIG.FB_API_KEY}`,
    body: { email: CONFIG.BOT_EMAIL, password: CONFIG.BOT_PASSWORD, returnSecureToken: true },
    json: true,
  });
  staticData.fbToken    = res.idToken;
  staticData.fbTokenExp = now + parseInt(res.expiresIn || '3600', 10) * 1000;
  return res.idToken;
}
async function fsRequest(method, path, body) {
  const token = await getIdToken();
  return http({
    method,
    url: `${FS_BASE}${path}`,
    headers: { Authorization: `Bearer ${token}` },
    body: body || undefined,
    json: true,
  });
}

// ─── Field config (live from web_settings — auto-refreshes every 5 min) ──────
// Fallback used if the Firestore read fails (mirrors DEFAULT_FIELD_CONFIG in constants.js).
const FALLBACK_FIELDS = [
  { key: 'event_time',      label: 'وقت المناسبة',  type: 'time',   system: true, enabled: true },
  { key: 'event_type',      label: 'نوع المناسبة',  type: 'select', system: true, enabled: true },
  { key: 'city',            label: 'المدينة',        type: 'text',   system: true, enabled: true },
  { key: 'location_type',   label: 'نوع الموقع',    type: 'select', system: true, enabled: true },
  { key: 'guests_count',    label: 'عدد المعازيم',  type: 'number', system: true, enabled: true },
  { key: 'material_type',   label: 'نوع المعاميل',  type: 'select', system: true, enabled: true },
  { key: 'material_color',  label: 'لون المعاميل',  type: 'text',   system: true, enabled: true },
  { key: 'sabbabat_count',  label: 'عدد الصبابات',  type: 'number', system: true, enabled: true },
  { key: 'workers_count',   label: 'عدد العاملات',  type: 'number', system: true, enabled: true },
  { key: 'clothes_type',    label: 'نوع الملابس',   type: 'text',   system: true, enabled: true },
  { key: 'clothes_color',   label: 'لون الملابس',   type: 'text',   system: true, enabled: true },
  { key: 'notes',           label: 'ملاحظات',       type: 'text',   system: true, enabled: true },
];

async function getEnabledFields() {
  const now = Date.now();
  if (staticData.fields && staticData.fieldsExp && now < staticData.fieldsExp)
    return staticData.fields;
  try {
    const d   = await fsRequest('GET', '/web_settings/config');
    const raw = fromFsFields(d.fields || {});
    const cfg = raw.field_config ? JSON.parse(raw.field_config) : FALLBACK_FIELDS;
    staticData.fields    = cfg.filter((f) => f.enabled);
    staticData.fieldsExp = now + CONFIG.FIELD_CONFIG_TTL_MS;
    return staticData.fields;
  } catch (_) {
    return FALLBACK_FIELDS;
  }
}

// ─── Firestore queries (web_bookings) ────────────────────────────────────────
async function bookingsOnDate(date) {
  const res = await fsRequest('POST', ':runQuery', {
    structuredQuery: {
      from: [{ collectionId: 'web_bookings' }],
      where: { fieldFilter: { field: { fieldPath: 'booking_date' }, op: 'EQUAL', value: { stringValue: date } } },
    },
  });
  return (res || []).filter((r) => r.document).map((r) => ({ id: docId(r.document.name), ...fromFsFields(r.document.fields) }));
}
async function bookingsInRange(from, to) {
  const res = await fsRequest('POST', ':runQuery', {
    structuredQuery: {
      from: [{ collectionId: 'web_bookings' }],
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'booking_date' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: from } } },
        { fieldFilter: { field: { fieldPath: 'booking_date' }, op: 'LESS_THAN_OR_EQUAL',    value: { stringValue: to   } } },
      ] } },
      orderBy: [{ field: { fieldPath: 'booking_date' } }],
    },
  });
  return (res || []).filter((r) => r.document).map((r) => ({ id: docId(r.document.name), ...fromFsFields(r.document.fields) }));
}

async function getCapSettings() {
  try {
    const d   = await fsRequest('GET', '/web_settings/config');
    const raw = fromFsFields(d.fields || {});
    return {
      maxPerDay:    parseInt(raw.max_bookings_per_day || '-1', 10),
      dayOverrides: raw.day_overrides ? JSON.parse(raw.day_overrides) : {},
    };
  } catch (_) { return { maxPerDay: -1, dayOverrides: {} }; }
}
function capForDate(settings, date) {
  const ov = settings.dayOverrides || {};
  return (date in ov) ? parseInt(ov[date], 10) : settings.maxPerDay;
}

// ─── Whitelist ────────────────────────────────────────────────────────────────
function normPhone(s) { return String(s || '').replace(/\D/g, ''); }
function phoneMatches(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [lo, hi] = a.length <= b.length ? [a, b] : [b, a];
  return lo.length >= 8 && hi.endsWith(lo);
}
async function activeUserPhones() {
  const now = Date.now();
  if (staticData.wl && staticData.wlExp && now < staticData.wlExp) return staticData.wl;
  const res    = await fsRequest('GET', '/web_users');
  const phones = (res.documents || [])
    .map((d) => fromFsFields(d.fields || {}))
    .filter((u) => (u.status || 'active') === 'active')
    .map((u) => normPhone(u.phone))
    .filter((p) => p.length >= 8);
  staticData.wl    = phones;
  staticData.wlExp = now + CONFIG.WHITELIST_TTL_MS;
  return phones;
}
async function isAllowed(from) {
  const f = normPhone(from);
  if (CONFIG.EXTRA_ALLOWED.map(normPhone).some((p) => phoneMatches(f, p))) return true;
  return (await activeUserPhones()).some((p) => phoneMatches(f, p));
}

// ─── Build new booking document (web_bookings schema) ────────────────────────
function newBookingDoc(params, fields, status) {
  const now = new Date().toISOString();
  const doc = {
    client_name: params.client_name || '', client_phone: params.client_phone || '', client_id: '',
    booking_date: params.date,
    amount: Number(params.amount) || 0, discount: 0, paid_amount: 0, payment_status: 'unpaid',
    tips_amount: 0, tips_distributed: false, payment_completed: false,
    closed: false, extra_drinks: [], custom_fields: {}, assignments: [],
    status, created_at: now,
  };
  // Only set fields that are enabled in the current field config
  for (const field of fields) {
    const val = params[field.key];
    if (val === undefined || val === null || val === '') continue;
    if (field.system) {
      doc[field.key] = field.type === 'number' ? (Number(val) || 0) : String(val);
    } else {
      doc.custom_fields[field.key] = String(val);
    }
  }
  return doc;
}

// ─── Dynamic tool declarations (rebuilt each call from live field config) ────
const FIELD_TO_GEMINI_TYPE = { number: 'INTEGER', time: 'STRING', select: 'STRING', text: 'STRING' };

function buildFunctionDeclarations(fields) {
  // Shared editable field props for edit_booking
  const editableFieldProps = {};
  for (const f of fields) {
    editableFieldProps[f.key] = {
      type: FIELD_TO_GEMINI_TYPE[f.type] || 'STRING',
      description: f.label,
    };
  }

  // create_booking: client info + date + all enabled fields
  const createProps = {
    client_name:  { type: 'STRING', description: 'اسم العميل (مطلوب)' },
    client_phone: { type: 'STRING', description: 'رقم الجوال' },
    date:         { type: 'STRING', description: 'تاريخ الحجز YYYY-MM-DD (مطلوب)' },
    amount:       { type: 'NUMBER', description: 'المبلغ المتفق عليه (ر.س)' },
    ...editableFieldProps,
  };

  return [
    {
      name: 'check_availability',
      description: 'تتحقق من توفّر يوم: كم حجز نشط وكم يتبقّى حسب الحد الأقصى.',
      parameters: { type: 'OBJECT', properties: { date: { type: 'STRING', description: 'YYYY-MM-DD' } }, required: ['date'] },
    },
    {
      name: 'list_bookings',
      description: 'تعرض حجوزات يوم أو مدى من تاريخ إلى تاريخ.',
      parameters: {
        type: 'OBJECT',
        properties: {
          date:    { type: 'STRING', description: 'YYYY-MM-DD' },
          to_date: { type: 'STRING', description: 'اختياري: نهاية المدى YYYY-MM-DD' },
        },
        required: ['date'],
      },
    },
    {
      name: 'create_booking',
      description: 'تنشئ حجزاً جديداً. إن كان اليوم ممتلئاً يُحفظ كقائمة انتظار (pending).',
      parameters: { type: 'OBJECT', properties: createProps, required: ['client_name', 'date'] },
    },
    {
      name: 'edit_booking',
      description: 'تعدّل حقول حجز قائم. مرّر فقط الحقول المراد تغييرها داخل changes.',
      parameters: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING', description: 'معرّف الحجز' },
          changes: {
            type: 'OBJECT',
            description: 'الحقول المراد تغييرها فقط',
            properties: {
              date: { type: 'STRING' },
              amount: { type: 'NUMBER' },
              ...editableFieldProps,
            },
          },
        },
        required: ['id', 'changes'],
      },
    },
    {
      name: 'cancel_booking',
      description: 'تلغي حجزاً (status=cancelled). لا تحذفه نهائياً.',
      parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' } }, required: ['id'] },
    },
    {
      name: 'set_waiting_status',
      description: 'تؤكّد أو ترفض حجز انتظار. confirm→active, reject→rejected.',
      parameters: {
        type: 'OBJECT',
        properties: {
          id:     { type: 'STRING' },
          action: { type: 'STRING', enum: ['confirm', 'reject'] },
        },
        required: ['id', 'action'],
      },
    },
  ];
}

// ─── System prompt (includes live field list) ─────────────────────────────────
function systemPrompt(fields) {
  const today     = new Date().toISOString().slice(0, 10);
  const fieldList = fields.map((f) => `• ${f.label}`).join('\n');
  return `اسمك "حمودي ودي"، مساعد ودود لإدارة حجوزات شركة "أم فارس" للضيافة. تستقبل الطلبات عبر واتساب وتنفّذها على نظام الحجوزات.

البيانات التي تجمعها عند إنشاء حجز جديد (اسأل عنها فقط — لا تسأل عن أي شيء آخر):
• اسم العميل (مطلوب)
• تاريخ الحجز (مطلوب)
${fieldList}
• المبلغ المتفق عليه (ر.س) — إن ذُكر

القواعد:
- اليوم هو ${today}. حوّل أي تاريخ إلى صيغة YYYY-MM-DD الميلادية. إذا كان غامضاً اسأل سؤالاً قصيراً واحداً.
- قبل أي إنشاء/تعديل/إلغاء: اعرض ملخصاً واطلب تأكيداً، ولا تنفّذ إلا بعد أن يؤكّد المستخدم (نعم/تأكيد/✅). عمليات القراءة نفّذها فوراً.
- لو امتلأ اليوم سيوضع الحجز في قائمة الانتظار — أخبر المستخدم بذلك بوضوح.
- ردودك قصيرة وودّية وعملية بالعربية. عرّف عن نفسك باسم "حمودي" في أول رسالة، وأكّد النتيجة بعد كل تنفيذ.
- ما هو خارج صلاحياتك (المستخدمون، الإعدادات، الإغلاق المالي/الإكراميات، الحذف النهائي) اعتذر عنه بلطف.`;
}

// ─── Tool execution ───────────────────────────────────────────────────────────
async function runTool(name, input, fields) {
  if (name === 'check_availability') {
    const settings  = await getCapSettings();
    const cap       = capForDate(settings, input.date);
    const active    = (await bookingsOnDate(input.date)).filter((b) => b.status === 'active').length;
    const remaining = cap === -1 ? -1 : Math.max(cap - active, 0);
    return { date: input.date, active_count: active, cap, remaining, is_full: cap !== -1 && active >= cap };
  }

  if (name === 'list_bookings') {
    const list = await bookingsInRange(input.date, input.to_date || input.date);
    return {
      bookings: list.map((b) => ({
        id: b.id, client_name: b.client_name, client_phone: b.client_phone,
        booking_date: b.booking_date, status: b.status,
        // include all enabled fields that have a value
        ...Object.fromEntries(fields.filter((f) => f.system && b[f.key] != null && b[f.key] !== '').map((f) => [f.key, b[f.key]])),
      })),
    };
  }

  if (name === 'create_booking') {
    const settings  = await getCapSettings();
    const cap       = capForDate(settings, input.date);
    const active    = (await bookingsOnDate(input.date)).filter((b) => b.status === 'active').length;
    const status    = (cap !== -1 && active >= cap) ? 'pending' : 'active';
    const doc       = newBookingDoc(input, fields, status);
    const res       = await fsRequest('POST', '/web_bookings', { fields: toFsFields(doc) });
    return { id: docId(res.name), status, waitlisted: status === 'pending' };
  }

  if (name === 'edit_booking') {
    const changes = input.changes || {};
    // Remap 'date' param to 'booking_date' field name
    if (changes.date) { changes.booking_date = changes.date; delete changes.date; }
    const keys = Object.keys(changes);
    if (!keys.length) return { error: 'no changes provided' };
    const mask = keys.map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const res  = await fsRequest('PATCH', `/web_bookings/${input.id}?${mask}`, { fields: toFsFields(changes) });
    return { id: docId(res.name), updated: keys };
  }

  if (name === 'cancel_booking') {
    const res = await fsRequest('PATCH', `/web_bookings/${input.id}?updateMask.fieldPaths=status`, { fields: { status: { stringValue: 'cancelled' } } });
    return { id: docId(res.name), status: 'cancelled' };
  }

  if (name === 'set_waiting_status') {
    const status = input.action === 'confirm' ? 'active' : 'rejected';
    const res    = await fsRequest('PATCH', `/web_bookings/${input.id}?updateMask.fieldPaths=status`, { fields: { status: { stringValue: status } } });
    return { id: docId(res.name), status };
  }

  return { error: `unknown tool: ${name}` };
}

// ─── Gemini agent loop ────────────────────────────────────────────────────────
async function runAgent(from, userText) {
  // Fetch live field config before every conversation turn (cached 5 min)
  const fields = await getEnabledFields();
  const fnDecls = buildFunctionDeclarations(fields);
  const sysPrompt = systemPrompt(fields);

  staticData.sessions = staticData.sessions || {};
  const history = staticData.sessions[from] || [];
  history.push({ role: 'user', parts: [{ text: userText }] });

  let reply = 'تم.';
  for (let round = 0; round < CONFIG.MAX_TOOL_ROUNDS; round++) {
    let res;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await http({
        method: 'POST',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`,
        headers: { 'content-type': 'application/json' },
        body: {
          system_instruction: { parts: [{ text: sysPrompt }] },
          contents: history,
          tools: [{ function_declarations: fnDecls }],
        },
        json: true,
      });
      const code = res?.error?.code;
      if (code === 503 || code === 429) { await sleep(1500 * (attempt + 1)); continue; }
      break;
    }
    if (res?.error) throw new Error(`Gemini ${res.error.code}: ${res.error.message}`);

    const parts = res?.candidates?.[0]?.content?.parts || [];
    history.push({ role: 'model', parts });

    const calls = parts.filter((p) => p.functionCall);
    if (calls.length) {
      const responseParts = [];
      for (const p of calls) {
        let out;
        try { out = await runTool(p.functionCall.name, p.functionCall.args || {}, fields); }
        catch (e) { out = { error: String(e.message || e) }; }
        responseParts.push({ functionResponse: { name: p.functionCall.name, response: out } });
      }
      history.push({ role: 'user', parts: responseParts });
      continue;
    }

    reply = parts.filter((p) => p.text).map((p) => p.text).join('\n').trim() || reply;
    break;
  }

  staticData.sessions[from] = history.slice(-CONFIG.HISTORY_TURNS);
  return reply;
}

// ─── WhatsApp send ────────────────────────────────────────────────────────────
async function sendWhatsApp(to, text) {
  await http({
    method: 'POST',
    url: `https://graph.facebook.com/${CONFIG.WA_API_VERSION}/${CONFIG.WA_PHONE_NUMBER_ID}/messages`,
    headers: { Authorization: `Bearer ${CONFIG.WA_TOKEN}` },
    body: { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
    json: true,
  });
}

// ============================ MAIN ============================
const body = items[0].json.body || items[0].json;
let value, msg;
try {
  value = body.entry[0].changes[0].value;
  msg   = value.messages && value.messages[0];
} catch (_) { return [{ json: { ignored: 'no-entry' } }]; }

if (!msg || msg.type !== 'text') return [{ json: { ignored: 'no-text-message' } }];

const from = msg.from;
const text = msg.text.body;

if (!(await isAllowed(from))) return [{ json: { ignored: 'not-registered', from } }];

let replyText;
try {
  replyText = await runAgent(from, text);
} catch (e) {
  replyText = 'صار خطأ تقني، حاولي مرة ثانية بعد قليل.';
  await sendWhatsApp(from, replyText);
  return [{ json: { error: String(e.message || e), from } }];
}

await sendWhatsApp(from, replyText);
return [{ json: { from, in: text, out: replyText } }];
