/**
 * Umfaris WhatsApp Agent — Cloudflare Worker (smart edition, real web_* schema).
 *
 * GET  = Meta webhook verification. POST = inbound WhatsApp (text/voice/image/interactive/contacts)
 *        -> whitelist (web_users) -> Groq tool-loop -> Firestore (web_*) -> reply.
 *
 * Brain: Groq (free, OpenAI-compatible) — gpt-oss-120b chat+tools (gpt-oss-20b fallback), Whisper voice
 * transcription, Qwen vision for images (image -> text description).
 *
 * Capabilities: guided booking (real form config), Hijri<->Gregorian, voice + images,
 * finance/analytics, clients (lookup/auto-register), employees + staff assignment,
 * services, booking-level payments. Options as WhatsApp buttons/lists. Arabic/English.
 *
 * Secrets: WA_TOKEN, GROQ_API_KEY, BOT_PASSWORD
 * Vars:    WA_PHONE_NUMBER_ID, WA_API_VERSION, GROQ_MODEL, GROQ_VISION_MODEL, WHISPER_MODEL,
 *          FB_API_KEY, FB_PROJECT_ID, BOT_EMAIL, VERIFY_TOKEN
 * Firestore: web_users (whitelist), web_bookings, web_settings/config, botSessions (memory).
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/__setup' && env.SETUP_KEY && url.searchParams.get('key') === env.SETUP_KEY) {
      return new Response(JSON.stringify(await numberSetup(env, url.searchParams), null, 1), { headers: { 'content-type': 'application/json' } });
    }
    if (request.method === 'GET') {
      const challenge = url.searchParams.get('hub.challenge');
      const token = url.searchParams.get('hub.verify_token');
      if (challenge && (!env.VERIFY_TOKEN || token === env.VERIFY_TOKEN)) return new Response(challenge, { status: 200 });
      return new Response('ok', { status: 200 });
    }
    if (request.method !== 'POST') return new Response('ok', { status: 200 });
    let body = {};
    try { body = await request.json(); } catch (e) {}
    ctx.waitUntil(handle(body, env).catch((e) => console.log('handle error', String(e && e.stack || e))));
    return new Response('EVENT_RECEIVED', { status: 200 });
  },
};

// TEMPORARY one-time number setup (register + subscribe) — remove after use.
async function numberSetup(env, q) {
  const v = env.WA_API_VERSION || 'v21.0', H = { Authorization: `Bearer ${env.WA_TOKEN}`, 'content-type': 'application/json' };
  const g = async (path, method = 'GET', body) => (await fetch(`https://graph.facebook.com/${v}/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined })).json();
  const waba = q.get('waba'), pid = q.get('pid'), out = {};
  out.phone_numbers = await g(`${waba}/phone_numbers?fields=id,display_phone_number,verified_name,status,name_status,code_verification_status`);
  if (q.get('pin')) out.register = await g(`${pid}/register`, 'POST', { messaging_product: 'whatsapp', pin: q.get('pin') });
  out.subscribe = await g(`${waba}/subscribed_apps`, 'POST');
  out.subscribed_apps = await g(`${waba}/subscribed_apps`);
  out.number = await g(`${pid}?fields=display_phone_number,verified_name,status,name_status,quality_rating,platform_type,throughput`);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let _idToken = null;
let _wl = null;

async function handle(body, env) {
  let value, msg;
  try { value = body.entry[0].changes[0].value; msg = value.messages && value.messages[0]; } catch (e) { return; }
  if (!msg) return;
  const from = msg.from;
  if (!(await isAllowed(env, from))) return;

  let userContent; // plain text (voice transcribed, images described)
  try {
    if (msg.type === 'text') {
      userContent = msg.text.body;
    } else if (msg.type === 'interactive') {
      const r = msg.interactive.button_reply || msg.interactive.list_reply || {};
      userContent = r.title || r.id || '';
    } else if (msg.type === 'image') {
      const media = await getMedia(env, msg.image.id);
      const desc = await describeImage(env, media);
      userContent = (msg.image.caption ? msg.image.caption + ' — ' : '') + '(محتوى صورة أرسلها المستخدم) ' + desc;
    } else if (msg.type === 'audio' || msg.type === 'voice') {
      const m = msg.audio || msg.voice;
      const media = await getMedia(env, m.id);
      userContent = await transcribeAudio(env, media);
      if (!userContent) { await sendText(env, from, 'ما قدرت أفهم الرسالة الصوتية، حاول مرة ثانية.'); return; }
    } else if (msg.type === 'contacts') {
      const cards = (msg.contacts || []).map((c) => {
        const nm = (c.name && (c.name.formatted_name || c.name.first_name)) || '';
        const phones = (c.phones || []).map((p) => p.phone || (p.wa_id ? '+' + p.wa_id : '')).filter(Boolean);
        return `${nm} — ${phones.join('، ')}`.trim();
      }).filter(Boolean).join(' | ');
      userContent = `(بطاقة جهة اتصال مشاركة) ${cards}` + (msg.contacts && msg.contacts.length ? '\n(استخدم الاسم والرقم من البطاقة لتنفيذ ما يطلبه المستخدم — مثل إضافة عميل أو حجز.)' : '');
    } else {
      await sendText(env, from, 'أتعامل مع النص والصوت والصور وبطاقات جهات الاتصال 🙏');
      return;
    }
  } catch (e) {
    await sendText(env, from, 'تعذّر تحميل الوسائط، حاول مرة ثانية.');
    console.log('media error', String(e));
    return;
  }

  // An open booking form is answered by the server's wizard — exact app questions/options, no LLM.
  try {
    const draft = await loadDraft(env, from);
    if (draft) {
      let card = null;
      if (msg.type === 'contacts' && msg.contacts && msg.contacts[0]) {
        const c = msg.contacts[0];
        card = { name: (c.name && (c.name.formatted_name || c.name.first_name)) || '', phone: ((c.phones || [])[0] || {}).phone || ((c.phones || [])[0] || {}).wa_id || '' };
      }
      await wizardStep(env, from, draft, userContent, card);
      return;
    }
  } catch (e) { console.log('wizard error', String(e && e.stack || e)); await sendText(env, from, 'صار خطأ تقني في نموذج الحجز، حاول مرة ثانية.'); return; }

  let result;
  try { result = await runAgent(env, from, userContent); }
  catch (e) { console.log('agent error', String(e && e.stack || e)); await sendText(env, from, 'صار خطأ تقني، حاول مرة ثانية بعد قليل.'); return; }
  // If the agent already pushed an interactive options message this turn, don't double-send text.
  if (!result.presented && result.reply) await sendText(env, from, result.reply);
}

// ---------- WhatsApp send ----------
function waUrl(env) { return `https://graph.facebook.com/${env.WA_API_VERSION || 'v21.0'}/${env.WA_PHONE_NUMBER_ID}/messages`; }
async function waSend(env, payload) {
  const r = await fetch(waUrl(env), { method: 'POST', headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }) });
  if (!r.ok) console.log('wa send', r.status, await r.text());
}
async function sendText(env, to, text) { await waSend(env, { to, type: 'text', text: { body: text } }); }
async function sendOptions(env, to, body, options) {
  const opts = options.filter(Boolean).map((o) => String(o));
  if (opts.length === 0) return sendText(env, to, body);
  if (opts.length <= 3) {
    await waSend(env, { to, type: 'interactive', interactive: { type: 'button', body: { text: body.slice(0, 1024) }, action: { buttons: opts.map((o, i) => ({ type: 'reply', reply: { id: 'opt_' + i, title: o.slice(0, 20) } })) } } });
  } else if (opts.length <= 10) {
    await waSend(env, { to, type: 'interactive', interactive: { type: 'list', body: { text: body.slice(0, 1024) }, action: { button: 'اختر', sections: [{ rows: opts.map((o, i) => ({ id: 'opt_' + i, title: o.slice(0, 24) })) }] } } });
  } else {
    await sendText(env, to, body + '\n\n' + opts.map((o, i) => `${i + 1}. ${o}`).join('\n'));
  }
}

// ---------- WhatsApp media download ----------
function toBase64(buf) { const b = new Uint8Array(buf); let s = ''; const c = 0x8000; for (let i = 0; i < b.length; i += c) s += String.fromCharCode.apply(null, b.subarray(i, i + c)); return btoa(s); }
async function getMedia(env, mediaId) {
  const ver = env.WA_API_VERSION || 'v21.0';
  const meta = await (await fetch(`https://graph.facebook.com/${ver}/${mediaId}`, { headers: { Authorization: `Bearer ${env.WA_TOKEN}` } })).json();
  if (!meta.url) throw new Error('no media url: ' + JSON.stringify(meta));
  const buf = await (await fetch(meta.url, { headers: { Authorization: `Bearer ${env.WA_TOKEN}` } })).arrayBuffer();
  return { mimeType: (meta.mime_type || 'application/octet-stream').split(';')[0].trim(), buf };
}
// Voice note -> Arabic text via Groq Whisper.
async function transcribeAudio(env, media) {
  const fd = new FormData();
  fd.append('file', new Blob([media.buf], { type: media.mimeType || 'audio/ogg' }), 'audio.ogg');
  fd.append('model', env.WHISPER_MODEL || 'whisper-large-v3');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: fd });
  const j = await r.json();
  if (j.error) { console.log('whisper', JSON.stringify(j.error)); return ''; }
  return (j.text || '').trim();
}
// Image -> Arabic description (extract dates/names/numbers) via a Groq vision model.
async function describeImage(env, media) {
  const dataUrl = `data:${media.mimeType || 'image/jpeg'};base64,${toBase64(media.buf)}`;
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b', max_tokens: 600, messages: [{ role: 'user', content: [
      { type: 'text', text: 'صف هذه الصورة بإيجاز واستخرج أي نص مكتوب فيها، خصوصاً التواريخ والأسماء والأرقام والمبالغ.' },
      { type: 'image_url', image_url: { url: dataUrl } }] }] }),
  });
  const j = await r.json();
  if (j.error) { console.log('vision', JSON.stringify(j.error)); return '(تعذّر تحليل الصورة)'; }
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
}

// ---------- Firestore ----------
function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFsFields(v) } };
  return { stringValue: String(v) };
}
function toFsFields(o) { const f = {}; for (const k of Object.keys(o)) f[k] = toFsValue(o[k]); return f; }
function fromFsValue(v) {
  if (!v) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFsValue);
  if ('mapValue' in v) return fromFsFields(v.mapValue.fields || {});
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}
function fromFsFields(f) { const o = {}; for (const k of Object.keys(f || {})) o[k] = fromFsValue(f[k]); return o; }
function docId(name) { return name.split('/').pop(); }
async function getIdToken(env) {
  const now = Date.now();
  if (_idToken && now < _idToken.exp - 60000) return _idToken.token;
  const j = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FB_API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: env.BOT_EMAIL, password: env.BOT_PASSWORD, returnSecureToken: true }) })).json();
  if (!j.idToken) throw new Error('firebase auth failed: ' + JSON.stringify(j.error || j));
  _idToken = { token: j.idToken, exp: now + parseInt(j.expiresIn || '3600', 10) * 1000 };
  return j.idToken;
}
async function fsdb(env, method, path, body) {
  const token = await getIdToken(env);
  const base = `https://firestore.googleapis.com/v1/projects/${env.FB_PROJECT_ID}/databases/(default)/documents`;
  return (await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
}

// ---------- Whitelist (web_users) ----------
function normPhone(s) { return String(s || '').replace(/\D/g, ''); }
function phoneMatches(a, b) { if (!a || !b) return false; if (a === b) return true; const [lo, hi] = a.length <= b.length ? [a, b] : [b, a]; return lo.length >= 8 && hi.endsWith(lo); }
async function isAllowed(env, from) {
  const now = Date.now();
  if (!_wl || now >= _wl.exp) {
    const res = await fsdb(env, 'GET', '/web_users');
    const phones = (res.documents || []).map((d) => fromFsFields(d.fields || {})).filter((u) => (u.status || 'active') === 'active').map((u) => normPhone(u.phone)).filter((p) => p.length >= 8);
    _wl = { phones, exp: now + 60000 };
  }
  return _wl.phones.some((p) => phoneMatches(normPhone(from), p));
}

// ---------- Memory ----------
async function loadHistory(env, from) {
  const d = await fsdb(env, 'GET', `/botSessions/${from}`);
  if (d && d.fields && d.fields.historyJson) {
    try {
      const h = JSON.parse(d.fields.historyJson.stringValue || '[]');
      // sessions saved by the previous Claude version use array content blocks — incompatible, start fresh
      if (h.some((m) => Array.isArray(m.content))) return [];
      return h;
    } catch (e) { return []; }
  }
  return [];
}
// Older turns are compacted: tool calls/results become one short assistant note, so facts
// (name, phone, date, chosen options) survive without paying full tool-result tokens.
function compactTurn(msgs) {
  const out = []; let notes = [];
  const flush = () => { if (notes.length) { out.push({ role: 'assistant', content: notes.join('\n') }); notes = []; } };
  const calls = {};
  for (const m of msgs) {
    if (m.role === 'user') { flush(); out.push({ role: 'user', content: m.content }); }
    else if (m.role === 'assistant') {
      for (const tc of m.tool_calls || []) calls[tc.id] = tc.function;
      if (m.content) notes.push(m.content);
    } else if (m.role === 'tool') {
      const f = calls[m.tool_call_id] || {};
      if (f.name === 'present_options') { try { const a = JSON.parse(f.arguments || '{}'); if (JSON.parse(m.content).presented) notes.push(`(سألتُ بأزرار: ${a.body || a.field})`); } catch (e) {} }
      else notes.push(`(${f.name || 'tool'} ${String(f.arguments || '').slice(0, 200)} → ${String(m.content).slice(0, 300)})`);
    }
  }
  flush();
  return out;
}
async function saveHistory(env, from, history) {
  const userIdx = history.map((m, i) => (m.role === 'user' && typeof m.content === 'string' ? i : -1)).filter((i) => i >= 0);
  const cut = userIdx.length > 3 ? userIdx[userIdx.length - 3] : 0; // last 3 turns stay verbatim
  let h = [...compactTurn(history.slice(0, cut)), ...history.slice(cut)];
  h = h.slice(-40);
  while (h.length && !(h[0].role === 'user' && typeof h[0].content === 'string')) h.shift(); // valid OpenAI prefix
  await fsdb(env, 'PATCH', `/botSessions/${from}?updateMask.fieldPaths=historyJson`, { fields: { historyJson: { stringValue: JSON.stringify(h) } } });
}

// ---------- Hijri <-> Gregorian (Umm al-Qura) ----------
const HIJRI_MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
function gToH(date) { const p = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).formatToParts(date); const o = {}; for (const x of p) if (x.type !== 'literal') o[x.type] = parseInt(x.value, 10); return [o.year, o.month, o.day]; }
function cmpT(a, b) { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
function hToG(hy, hm, hd) { let lo = Date.UTC(1937, 2, 14), hi = Date.UTC(2100, 0, 1); const t = [hy, hm, hd]; while (lo <= hi) { const mid = lo + Math.floor((hi - lo) / 2 / 86400000) * 86400000; const c = cmpT(gToH(new Date(mid)), t); if (c === 0) return new Date(mid); if (c < 0) lo = mid + 86400000; else hi = mid - 86400000; } return null; }
function isoUTC(d) { return d.toISOString().slice(0, 10); }
function hijriLabel(d) { const [y, m, dd] = gToH(d); return `${dd} ${HIJRI_MONTHS[m - 1]} ${y} هـ`; }
// Business runs in Qatar (UTC+3): read calendar fields with getUTC* on this shifted date.
function qatarNow() { return new Date(Date.now() + 3 * 3600 * 1000); }
const AR_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
function weekdayAr(d) { return AR_WEEKDAYS[d.getUTCDay()]; }
// "يوم الجمعة 2026-11-13 (3 جمادى الآخرة 1448 هـ)"
function fullDateLabel(iso) { const d = new Date(iso + 'T00:00:00Z'); return `يوم ${weekdayAr(d)} ${iso} (${hijriLabel(d)})`; }
function gregLabelEn(d) { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d); }

// ---------- Other collections (clients / employees / services / finance) ----------
async function listColl(env, coll) {
  const res = await fsdb(env, 'GET', `/${coll}?pageSize=300`);
  return (res.documents || []).map((d) => ({ id: docId(d.name), ...fromFsFields(d.fields || {}) }));
}
async function employeeMap(env) {
  const m = {};
  for (const e of await listColl(env, 'web_employees')) m[e.id] = { name: e.name, jobTypes: e.job_types || [], active: e.active !== false };
  return m;
}
async function financeSummary(env, from, to) {
  const list = await bookingsInRange(env, from, to);
  const active = list.filter((b) => b.status === 'active');
  const num = (x) => (typeof x === 'number' ? x : 0);
  let amount = 0, collected = 0, outstanding = 0, tips = 0, empCost = 0;
  for (const b of active) {
    const net = num(b.amount) - num(b.discount);
    amount += net; collected += num(b.paid_amount);
    outstanding += Math.max(net - num(b.paid_amount), 0);
    tips += num(b.tips_amount);
    for (const a of (b.assignments || [])) empCost += num(a.paid_amount ?? a.paidAmount);
  }
  const byStatus = {}; for (const b of list) byStatus[b.status] = (byStatus[b.status] || 0) + 1;
  const dayCount = {}; for (const b of active) dayCount[b.booking_date] = (dayCount[b.booking_date] || 0) + 1;
  const busiest = Object.entries(dayCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d, n]) => ({ date: d, count: n }));
  const unpaid = active.filter((b) => (num(b.amount) - num(b.discount) - num(b.paid_amount)) > 0)
    .map((b) => ({ id: b.id, clientName: b.client_name, date: b.booking_date, outstanding: num(b.amount) - num(b.discount) - num(b.paid_amount) }));
  return { range: { from, to }, active_bookings: active.length, total_amount: amount, total_collected: collected, total_outstanding: outstanding, total_tips: tips, employee_cost: empCost, net_profit: collected - empCost, by_status: byStatus, busiest_dates: busiest, unpaid };
}

// ---------- Settings / form config (web_settings/config) ----------
function jparse(v, def) { if (v == null) return def; if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return def; } } return v; }
async function getSettings(env) {
  const d = await fsdb(env, 'GET', '/web_settings/config');
  const f = d && d.fields ? fromFsFields(d.fields) : {};
  return {
    maxPerDay: typeof f.max_bookings_per_day === 'number' ? f.max_bookings_per_day : -1,
    dayOverrides: jparse(f.day_overrides, {}),
    fieldConfig: jparse(f.field_config, []),
    jobTypes: jparse(f.job_types, []),
  };
}
function capForDate(s, date) { const ov = s.dayOverrides || {}; return date in ov ? ov[date] : (typeof s.maxPerDay === 'number' ? s.maxPerDay : -1); }

// ---------- Booking form spec: mirrors the app's BookingForm exactly ----------
// phone*, name*, date*, enabled field_config fields (config order), extra drinks, amount, discount, payment status.
const PAYMENT_LABELS = { paid: 'مدفوع كامل', deposit: 'عربون', unpaid: 'لم يتم الدفع' };
let _spec = null;
function normAr(s) { return String(s == null ? '' : s).replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase(); }
async function getFormSpec(env) {
  const now = Date.now();
  if (_spec && now < _spec.exp) return _spec.spec;
  const s = await getSettings(env);
  const fields = [
    { id: 'clientPhone', col: 'client_phone', label: 'رقم الجوال', type: 'text', required: true },
    { id: 'clientName', col: 'client_name', label: 'اسم العميل', type: 'text', required: true },
    { id: 'date', col: 'booking_date', label: 'تاريخ الحجز', type: 'date', required: true },
  ];
  for (const f of (Array.isArray(s.fieldConfig) ? s.fieldConfig : [])) {
    if (!f || f.enabled !== true || !f.key) continue; // app shows only enabled === true
    const opts = f.type === 'select' ? (f.options || []).map((o) => String(o).trim()).filter(Boolean) : undefined;
    fields.push({ id: f.system ? (SYS_KEY_TO_PARAM[f.key] || f.key) : f.key, col: f.system ? f.key : null, custom: !f.system, label: String(f.label || f.key).trim(), type: f.type || 'text', required: !!f.required, options: opts });
  }
  fields.push(
    { id: 'extraDrinks', col: 'extra_drinks', label: 'مشروبات إضافية', type: 'drinks', required: false },
    { id: 'amount', col: 'amount', label: 'المبلغ', type: 'number', required: false },
    { id: 'discount', col: 'discount', label: 'خصم', type: 'number', required: false },
    { id: 'paymentStatus', col: 'payment_status', label: 'حالة الدفع', type: 'select', required: false, options: Object.values(PAYMENT_LABELS) },
    { id: 'paidAmount', col: 'paid_amount', label: 'المبلغ المدفوع', type: 'number', required: false },
  );
  const alias = {};
  for (const f of fields) { alias[f.id] = f; if (f.col) alias[f.col] = f; alias[normAr(f.label)] = f; }
  const spec = { fields, alias, settings: s };
  _spec = { spec, exp: now + 60000 };
  return spec;
}
function matchOption(options, value) {
  const v = normAr(value);
  if (!v) return null;
  const exact = options.find((o) => normAr(o) === v);
  if (exact) return exact;
  const partial = options.filter((o) => normAr(o).includes(v) || v.includes(normAr(o)));
  return partial.length === 1 ? partial[0] : null;
}
// Validate model-supplied values against the live form. Returns columns to write + custom_fields,
// or errors (invalid option / not a number) so the model must re-ask instead of saving invented data.
function validateValues(spec, input) {
  const cols = {}, custom = {}, errors = [], ignored = [];
  const entries = Object.entries(input || {});
  for (const sel of (input && input.custom_selections) || []) if (sel && sel.key) entries.push([sel.key, sel.value]);
  for (const [k, raw] of entries) {
    if (k === 'custom_selections' || raw === undefined || raw === null || raw === '') continue;
    const f = spec.alias[k] || spec.alias[normAr(k)];
    if (!f) { ignored.push(k); continue; }
    let val = raw;
    if (f.type === 'select') {
      const m = matchOption(f.options || [], raw);
      if (!m) { errors.push({ field: f.label, given: raw, allowed: f.options, note: 'قيمة غير موجودة في التطبيق — اعرض الخيارات عبر present_options' }); continue; }
      val = f.id === 'paymentStatus' ? Object.keys(PAYMENT_LABELS).find((key) => PAYMENT_LABELS[key] === m) : m;
    } else if (f.type === 'number') {
      val = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
      if (!Number.isFinite(val) || val < 0) { errors.push({ field: f.label, given: raw, note: 'يجب أن يكون رقماً' }); continue; }
    } else if (f.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) { errors.push({ field: f.label, given: raw, note: 'الصيغة YYYY-MM-DD ميلادي' }); continue; }
    } else if (f.type === 'drinks') {
      val = (Array.isArray(raw) ? raw : []).filter((d) => d && d.name).map((d) => ({ name: String(d.name), count: Number(d.count) || 0, cost: Number(d.cost) || 0 }));
    } else val = String(raw).trim();
    if (f.custom) custom[f.id] = val; else cols[f.col] = val;
  }
  return { cols, custom, errors, ignored };
}
function formSpecPrompt(spec) {
  const lines = spec.fields.map((f, i) => {
    let t;
    if (f.type === 'select') t = `اختيار (${f.options.join('، ')}) — أزرار: نادِ أداة present_options بالحقل ${f.id}`;
    else if (f.type === 'number') t = 'رقم — اسأل نصاً';
    else if (f.type === 'date') t = 'تاريخ — اسأل نصاً';
    else if (f.type === 'time') t = 'وقت HH:MM — اسأل نصاً';
    else if (f.type === 'drinks') t = 'اسأل "هل يوجد مشروبات إضافية؟" بأزرار present_options بالحقل confirm؛ إن نعم: الاسم والعدد والتكلفة لكل مشروب';
    else t = 'نص حر — اسأل نصاً بدون اقتراح أمثلة أو خيارات';
    const extra = f.id === 'paidAmount' ? ' (فقط إذا حالة الدفع ليست "لم يتم الدفع")' : '';
    return `${i + 1}. ${f.label}${f.required ? ' *إلزامي' : ''} [${f.id}]: ${t}${extra}`;
  });
  return lines.join('\n');
}
// ---------- Booking wizard: the server runs the app's form itself (no LLM, exact questions/options) ----------
const SKIP_BTN = '⏭️ تخطي';
const CONFIRM_BTNS = ['✅ تأكيد', '✏️ تعديل', '❌ إلغاء'];
const DRAFT_TTL = 3 * 3600 * 1000;
function enDigits(s) { return String(s == null ? '' : s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); }
function isSkip(t) { const n = normAr(t); return n.includes('تخطي') || n.includes('تخطا') || ['skip', 'لا', 'لايوجد', 'بدون', 'مافي', 'ماكو', 'لاشي', '-'].includes(n); }
function isCancel(t) { const n = normAr(t); return ['الغاء', 'cancel', 'الغاءالحجز', '❌الغاء', 'وقف', 'خلاص'].includes(n); }
function normalizePhone(raw) {
  let d = enDigits(raw).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '974' + d; // local Qatar number
  else if (d.length === 10 && d.startsWith('05')) d = '966' + d.slice(1); // local Saudi mobile
  return d.length >= 10 && d.length <= 15 ? '+' + d : null;
}
const G_MONTHS = [['يناير', 'كانونالثاني', 'january', 'jan'], ['فبراير', 'شباط', 'february', 'feb'], ['مارس', 'اذار', 'march'], ['ابريل', 'نيسان', 'april', 'apr'], ['مايو', 'ايار', 'may'], ['يونيو', 'يونيه', 'حزيران', 'june', 'jun'], ['يوليو', 'يوليه', 'تموز', 'july', 'jul'], ['اغسطس', 'august', 'aug'], ['سبتمبر', 'ايلول', 'september', 'sep'], ['اكتوبر', 'تشرينالاول', 'october', 'oct'], ['نوفمبر', 'تشرينالثاني', 'november', 'nov'], ['ديسمبر', 'كانونالاول', 'december', 'dec']];
const H_MONTHS = [['محرم'], ['صفر'], ['ربيعالاول', 'ربيعاول'], ['ربيعالاخر', 'ربيعالثاني', 'ربيعثاني', 'ربيعاخر'], ['جماديالاولي', 'جمادالاول', 'جماداول', 'جماديالاول'], ['جماديالاخره', 'جماديالثانيه', 'جمادالثاني', 'جمادثاني', 'جماديالاخر'], ['رجب'], ['شعبان'], ['رمضان'], ['شوال'], ['ذوالقعده', 'ذيالقعده'], ['ذوالحجه', 'ذيالحجه']];
function findMonth(n, table) { let best = null; table.forEach((names, i) => { for (const nm of names) if (n.includes(nm) && (!best || nm.length > best.len)) best = { m: i + 1, len: nm.length }; }); return best && best.m; }
// Free-text date (Gregorian or Hijri, Arabic or English) -> Date (UTC) or null.
function parseDateText(text, now = qatarNow()) {
  const t = enDigits(text).trim(); const n = normAr(t);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const addDays = (k) => new Date(today.getTime() + k * 86400000);
  if (n.includes('بعدبكره') || n.includes('بعدغد')) return addDays(2);
  if (n.includes('بكره') || n.includes('غدا') || n === 'tomorrow') return addDays(1);
  if (n === 'اليوم' || n === 'today') return today;
  if (!/\d/.test(t)) { // weekday name -> its next occurrence (today counts unless "الجاي/القادم")
    const WD = [['الاحد', 'احد', 'sunday'], ['الاثنين', 'اثنين', 'monday'], ['الثلاثاء', 'ثلاثاء', 'tuesday'], ['الاربعاء', 'اربعاء', 'wednesday'], ['الخميس', 'خميس', 'thursday'], ['الجمعه', 'جمعه', 'friday'], ['السبت', 'سبت', 'saturday']];
    const wd = WD.findIndex((names) => names.some((x) => n.includes(x)));
    if (wd >= 0) { let k = (wd - today.getUTCDay() + 7) % 7; if (k === 0 && /الجاي|القادم|الجايه|الجاية|next/.test(t)) k = 7; return addDays(k); }
  }
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  const mk = (y, mo, d, hijri) => { if (hijri) return hToG(y, mo, d); const g = new Date(Date.UTC(y, mo - 1, d)); return g.getUTCMonth() === mo - 1 ? g : null; };
  const isH = /هـ|هجري|هجريه/.test(t) || n.includes('هجري');
  if (m) { const y = +m[1]; return mk(y, +m[2], +m[3], y < 1600); }
  m = /(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/.exec(t);
  if (m) { let y = +m[3]; if (y < 100) y += y > 60 ? 1400 : 2000; return mk(y, +m[2], +m[1], isH || y < 1600); }
  const nums = (t.match(/\d+/g) || []).map(Number);
  const day = nums.find((x) => x >= 1 && x <= 30 + 1);
  if (!day) return null;
  const hm = findMonth(n, H_MONTHS);
  if (hm) {
    let y = nums.find((x) => x >= 1300 && x < 1600);
    if (!y) { y = gToH(today)[0]; const g = hToG(y, hm, day); if (g && g < today) y++; }
    return hToG(y, hm, day);
  }
  const gm = findMonth(n, G_MONTHS);
  if (gm) {
    let y = nums.find((x) => x >= 2000 && x < 2200);
    if (!y) { y = today.getUTCFullYear(); const g = mk(y, gm, day); if (g && g < today) y++; }
    return mk(y, gm, day);
  }
  return null;
}
async function loadDraft(env, from) {
  const d = await fsdb(env, 'GET', `/botSessions/${from}`);
  const s = d && d.fields && d.fields.draftJson && d.fields.draftJson.stringValue;
  if (!s) return null;
  try { const x = JSON.parse(s); return x && Date.now() - x.startedAt < DRAFT_TTL ? x : null; } catch (e) { return null; }
}
async function saveDraft(env, from, draft) {
  await fsdb(env, 'PATCH', `/botSessions/${from}?updateMask.fieldPaths=draftJson`, { fields: { draftJson: { stringValue: draft ? JSON.stringify(draft) : '' } } });
}
async function appendHistoryNote(env, from, userText, note) {
  const h = await loadHistory(env, from);
  h.push({ role: 'user', content: userText }, { role: 'assistant', content: note });
  await saveHistory(env, from, h);
}
function wizNext(spec, draft) {
  for (const f of spec.fields) {
    if (f.id in draft.values || draft.skipped.includes(f.id)) continue;
    if (f.id === 'paidAmount' && (!draft.values.paymentStatus || draft.values.paymentStatus === PAYMENT_LABELS.unpaid)) continue;
    return f;
  }
  return null;
}
function wizSummary(spec, draft) {
  const lines = [];
  for (const f of spec.fields) {
    const v = draft.values[f.id];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (f.id === 'date') lines.push(`${f.label}: ${fullDateLabel(v)}`);
    else if (f.type === 'drinks') lines.push(`${f.label}: ${v.map((d) => `${d.name} ×${d.count} (${d.cost})`).join('، ')}`);
    else lines.push(`${f.label}: ${v}`);
  }
  return lines.join('\n');
}
async function wizAsk(env, from, spec, draft, prefix) {
  const pre = prefix ? prefix + '\n\n' : '';
  const f = wizNext(spec, draft);
  if (!f) {
    draft.step = 'confirm';
    let note = '';
    try { const a = await runTool(env, from, 'check_availability', { date: draft.values.date }); if (a.is_full) note = '\n\n⚠️ هذا اليوم ممتلئ — سيُضاف الحجز لقائمة الانتظار.'; } catch (e) {}
    await sendOptions(env, from, `${pre}📋 ملخّص الحجز:\n${wizSummary(spec, draft)}${note}\n\nهل تؤكد الحجز؟`, CONFIRM_BTNS);
    return;
  }
  draft.step = f.id;
  const opt = f.required ? '' : '\n(أو اكتب "تخطي")';
  if (f.type === 'select') await sendOptions(env, from, `${pre}${f.label}؟`, [...f.options, ...(f.required ? [] : [SKIP_BTN])]);
  else if (f.type === 'drinks') await sendOptions(env, from, `${pre}هل يوجد ${f.label}؟`, ['نعم', 'لا']);
  else if (f.id === 'clientPhone') await sendText(env, from, `${pre}رقم جوال العميل؟`);
  else if (f.id === 'date') await sendText(env, from, `${pre}تاريخ الحجز؟ (ميلادي أو هجري)`);
  else if (f.type === 'number') await sendText(env, from, `${pre}${f.label}؟ (رقم)${opt}`);
  else await sendText(env, from, `${pre}${f.label}؟${opt}`);
}
// Apply one answer to a field. Returns { ok, info } or { ok:false, error }.
async function wizApply(env, from, spec, draft, f, text, card) {
  const raw = String(text == null ? '' : text).trim();
  if (!f.required && f.type !== 'drinks' && isSkip(raw)) { draft.skipped.push(f.id); return { ok: true }; }
  if (f.id === 'clientPhone') {
    const phone = normalizePhone((card && card.phone) || raw);
    if (!phone) return { ok: false, error: 'رقم الجوال غير صحيح.' };
    draft.values.clientPhone = phone;
    const cardName = (card && card.name) || '';
    const found = await runTool(env, from, 'lookup_client', { phone });
    if (found.found) {
      draft.clientId = found.id;
      const given = draft.values.clientName || cardName;
      if (given && normAr(given) !== normAr(found.name)) {
        draft.pendingName = given; draft.values.clientName = found.name; draft.step = 'name_mismatch';
        return { ok: true, mismatch: `هذا الرقم مسجّل سابقاً باسم "${found.name}"، والاسم المُدخل "${given}".` };
      }
      draft.values.clientName = found.name;
      return { ok: true, info: `✓ الرقم مسجّل باسم ${found.name}` };
    }
    if (cardName && !draft.values.clientName) draft.values.clientName = cardName;
    return { ok: true, info: '🆕 عميل جديد — سيُسجَّل في قاعدة العملاء عند حفظ الحجز.' };
  }
  if (f.id === 'clientName') { const nm = (card && card.name) || raw; if (!nm) return { ok: false, error: 'اكتب اسم العميل.' }; draft.values.clientName = nm; return { ok: true }; }
  if (f.id === 'date') {
    const g = parseDateText(raw);
    if (!g) return { ok: false, error: 'ما فهمت التاريخ. اكتبه مثل: 5 مايو 2031 أو 13 محرم 1453 أو 2031-05-05' };
    const now = qatarNow(); const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (g.getTime() < today) return { ok: false, error: `التاريخ ${isoUTC(g)} في الماضي.` };
    draft.values.date = isoUTC(g);
    return { ok: true, info: `📅 ${fullDateLabel(isoUTC(g))}` };
  }
  if (f.type === 'select') {
    const m = matchOption(f.options, raw.replace(SKIP_BTN, ''));
    if (!m) return { ok: false, error: `"${raw}" غير موجود في خيارات التطبيق.` };
    draft.values[f.id] = m; return { ok: true };
  }
  if (f.type === 'number') {
    const num = parseFloat((enDigits(raw).match(/\d+(\.\d+)?/) || [])[0]);
    if (!Number.isFinite(num)) return { ok: false, error: 'اكتب رقماً.' };
    draft.values[f.id] = num; return { ok: true };
  }
  if (f.type === 'drinks') {
    const n = normAr(raw);
    if (n.includes('نعم') || n === 'yes' || n.includes('يوجد') && !n.includes('لايوجد')) { draft.step = 'drinks_list'; return { ok: true, drinksList: true }; }
    draft.values.extraDrinks = []; return { ok: true };
  }
  if (f.type === 'time') {
    const tm = /(\d{1,2})[:٫.](\d{2})/.exec(enDigits(raw));
    draft.values[f.id] = tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : raw; return { ok: true };
  }
  if (!raw) return { ok: false, error: `اكتب ${f.label}.` };
  draft.values[f.id] = raw; return { ok: true };
}
function parseDrinks(text) {
  return enDigits(text).split(/\n|،|,/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const nums = (l.match(/\d+(\.\d+)?/g) || []).map(Number);
    const name = l.replace(/\d+(\.\d+)?/g, '').replace(/[×x*\-:]/g, ' ').replace(/\s+/g, ' ').trim();
    return { name, count: nums[0] || 1, cost: nums[1] || 0 };
  }).filter((d) => d.name);
}
async function wizFinish(env, from, spec, draft) {
  const out = await runTool(env, from, 'create_booking', draft.values);
  if (out.saved === false) {
    // should not happen (values already validated) — reopen the offending fields
    for (const e of out.errors || []) { const f = spec.fields.find((x) => x.label === e.field); if (f) delete draft.values[f.id]; }
    await saveDraft(env, from, draft);
    return wizAsk(env, from, spec, draft, '⚠️ بعض القيم تحتاج تصحيح:');
  }
  await saveDraft(env, from, null);
  let msg;
  if (out.already_exists) msg = `ℹ️ يوجد حجز مسبق لنفس العميل في هذا اليوم — لم يُنشأ حجز جديد. (رقم الحجز: ${out.id})`;
  else msg = `✅ تم حفظ الحجز${out.waitlisted ? ' في قائمة الانتظار (اليوم ممتلئ)' : ''}.\n${draft.values.clientName} — ${fullDateLabel(out.date)}${out.client_registered ? '\n🆕 تم تسجيل العميل في قاعدة العملاء.' : ''}`;
  await sendText(env, from, msg);
  await appendHistoryNote(env, from, '(أكملتُ نموذج حجز جديد)', `${msg}\n${wizSummary(spec, draft)}\n(معرّف الحجز: ${out.id})`);
}
// Handles one incoming message while a booking draft is open.
async function wizardStep(env, from, draft, text, card) {
  const spec = await getFormSpec(env);
  const t = String(text || '').trim();
  if (isCancel(t)) { await saveDraft(env, from, null); await sendText(env, from, 'تم إلغاء الحجز الجديد ❌'); return; }
  if (draft.step === 'confirm') {
    const n = normAr(t);
    if (n.includes('تاكيد') || n.includes('اكد') || n === 'نعم' || n === 'yes') return wizFinish(env, from, spec, draft);
    if (n.includes('تعديل') || n.includes('عدل') || n.includes('غير')) {
      const f = labelMatch(spec, t);
      if (f) return wizReopen(env, from, spec, draft, f);
      draft.step = 'pick_edit'; await saveDraft(env, from, draft);
      return sendText(env, from, 'أي حقل تريد تعديله؟ اكتب اسمه:\n' + spec.fields.map((f) => '• ' + f.label).join('\n'));
    }
    const f = labelMatch(spec, t);
    if (f) return wizReopen(env, from, spec, draft, f);
    await wizAsk(env, from, spec, draft, 'اختر من الأزرار:'); await saveDraft(env, from, draft); return;
  }
  if (draft.step === 'pick_edit') {
    const f = labelMatch(spec, t);
    if (!f) return sendText(env, from, 'ما وجدت هذا الحقل في النموذج. اكتب اسم الحقل كما في القائمة.');
    return wizReopen(env, from, spec, draft, f);
  }
  let info = '';
  if (draft.step === 'name_mismatch') {
    if (normAr(t).includes('حدث')) {
      await runTool(env, from, 'edit_client', { id: draft.clientId, changes: { name: draft.pendingName } });
      draft.values.clientName = draft.pendingName; info = `✓ تم تحديث اسم العميل إلى ${draft.pendingName}`;
    } else info = `✓ أبقينا الاسم المسجّل: ${draft.values.clientName}`;
    delete draft.pendingName;
  } else if (draft.step === 'drinks_list') {
    const drinks = parseDrinks(t);
    if (!drinks.length) return sendText(env, from, 'اكتب كل مشروب في سطر: الاسم ثم العدد ثم التكلفة.');
    draft.values.extraDrinks = drinks;
  } else {
    const f = spec.fields.find((x) => x.id === draft.step) || wizNext(spec, draft);
    if (f) {
      const r = await wizApply(env, from, spec, draft, f, t, card);
      if (!r.ok) { await wizAsk(env, from, spec, draft, '⚠️ ' + r.error); await saveDraft(env, from, draft); return; }
      if (r.mismatch) { await saveDraft(env, from, draft); return sendOptions(env, from, r.mismatch + '\nماذا تريد؟', FIXED_CHOICES.name_mismatch); }
      if (r.drinksList) { await saveDraft(env, from, draft); return sendText(env, from, 'اكتب المشروبات الإضافية، كل مشروب في سطر: الاسم ثم العدد ثم التكلفة.'); }
      info = r.info || '';
    }
  }
  await wizAsk(env, from, spec, draft, info);
  await saveDraft(env, from, draft);
}
function labelMatch(spec, text) {
  const n = normAr(text); let best = null;
  for (const f of spec.fields) { const l = normAr(f.label); if (l && n.includes(l) && (!best || l.length > normAr(best.label).length)) best = f; }
  return best;
}
async function wizReopen(env, from, spec, draft, f) {
  delete draft.values[f.id];
  draft.skipped = draft.skipped.filter((k) => k !== f.id);
  if (f.id === 'clientPhone') { delete draft.clientId; }
  await wizAsk(env, from, spec, draft, `✏️ تعديل ${f.label}:`);
  await saveDraft(env, from, draft);
}
// Start a draft from whatever the user already said (values extracted by the LLM), then ask what's missing.
async function startBooking(env, from, input) {
  const spec = await getFormSpec(env);
  const draft = { values: {}, skipped: [], startedAt: Date.now(), step: null };
  const infos = [];
  const order = ['clientName', ...spec.fields.map((f) => f.id).filter((id) => id !== 'clientName' && id !== 'clientPhone'), 'clientPhone'];
  const given = { ...input };
  if (given.date_text) given.date = given.date_text; // server parses the user's own wording (Gregorian/Hijri)
  for (const id of order) {
    const f = spec.fields.find((x) => x.id === id);
    if (!f || given[id] == null || given[id] === '' || f.type === 'drinks') continue;
    if (!f.required && isSkip(String(given[id]))) continue;
    const r = await wizApply(env, from, spec, draft, f, given[id]);
    if (r.ok && r.info) infos.push(r.info);
    if (r.mismatch) { await saveDraft(env, from, draft); await sendOptions(env, from, ['📝 حجز جديد (للإلغاء اكتب "إلغاء")', ...infos].join('\n') + '\n\n' + r.mismatch + '\nماذا تريد؟', FIXED_CHOICES.name_mismatch); return { started: true, presented: true }; }
  }
  await wizAsk(env, from, spec, draft, ['📝 حجز جديد (للإلغاء اكتب "إلغاء")', ...infos].join('\n'));
  await saveDraft(env, from, draft);
  return { started: true, presented: true, note: 'النظام يدير النموذج الآن — لا ترسل أي رد.' };
}

function bookingProps(spec) {
  const p = {};
  for (const f of spec.fields) {
    if (f.type === 'select') p[f.id] = { type: 'string', enum: f.options, description: f.label };
    else if (f.type === 'number') p[f.id] = { type: 'number', description: f.label };
    else if (f.type === 'drinks') p[f.id] = { type: 'array', description: f.label, items: { type: 'object', properties: { name: { type: 'string' }, count: { type: 'integer' }, cost: { type: 'number' } } } };
    else p[f.id] = { type: 'string', description: f.label + (f.type === 'date' ? ' YYYY-MM-DD ميلادي' : f.type === 'time' ? ' HH:MM' : '') };
  }
  return p;
}

// system field key (snake) -> friendly create_booking param
const SYS_KEY_TO_PARAM = { event_type: 'eventType', location_type: 'locationType', guests_count: 'guests', material_type: 'materialType', material_color: 'materialColor', clothes_type: 'clothesType', clothes_color: 'clothesColor', sabbabat_count: 'sabbabatCount', workers_count: 'workersCount', city: 'city', notes: 'notes', event_time: 'eventTime' };
// friendly param -> web_bookings column
const PARAM_TO_COL = { clientName: 'client_name', clientPhone: 'client_phone', date: 'booking_date', eventTime: 'event_time', eventType: 'event_type', city: 'city', locationType: 'location_type', guests: 'guests_count', materialType: 'material_type', materialColor: 'material_color', sabbabatCount: 'sabbabat_count', workersCount: 'workers_count', clothesType: 'clothes_type', clothesColor: 'clothes_color', amount: 'amount', discount: 'discount', notes: 'notes' };
const NUMERIC_PARAMS = new Set(['guests', 'sabbabatCount', 'workersCount', 'amount', 'discount']);
// web_bookings column -> friendly (for display/get_booking)
const COL_TO_FRIENDLY = { client_name: 'clientName', client_phone: 'clientPhone', booking_date: 'date', event_time: 'eventTime', event_type: 'eventType', city: 'city', location_type: 'locationType', guests_count: 'guests', material_type: 'materialType', material_color: 'materialColor', sabbabat_count: 'sabbabatCount', workers_count: 'workersCount', clothes_type: 'clothesType', clothes_color: 'clothesColor', amount: 'amount', discount: 'discount', notes: 'notes', status: 'status', payment_status: 'paymentStatus', paid_amount: 'paidAmount', custom_fields: 'customFields' };
function friendly(b) { const o = { id: b.id }; for (const k of Object.keys(b)) if (COL_TO_FRIENDLY[k] !== undefined) o[COL_TO_FRIENDLY[k]] = b[k]; return o; }

async function bookingsOnDate(env, date) {
  const res = await fsdb(env, 'POST', ':runQuery', { structuredQuery: { from: [{ collectionId: 'web_bookings' }], where: { fieldFilter: { field: { fieldPath: 'booking_date' }, op: 'EQUAL', value: { stringValue: date } } } } });
  return (res || []).filter((r) => r.document).map((r) => ({ id: docId(r.document.name), ...fromFsFields(r.document.fields) }));
}
async function bookingsInRange(env, from, to) {
  const res = await fsdb(env, 'POST', ':runQuery', { structuredQuery: { from: [{ collectionId: 'web_bookings' }], where: { compositeFilter: { op: 'AND', filters: [
    { fieldFilter: { field: { fieldPath: 'booking_date' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: from } } },
    { fieldFilter: { field: { fieldPath: 'booking_date' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: to } } }] } }, orderBy: [{ field: { fieldPath: 'booking_date' } }] } });
  return (res || []).filter((r) => r.document).map((r) => ({ id: docId(r.document.name), ...fromFsFields(r.document.fields) }));
}

// Same defaults as the app's BookingForm base; validated columns are merged on top.
function newBookingDoc(cols, status, customFields) {
  return {
    client_id: '', client_name: '', client_phone: '', booking_date: '',
    event_time: '', event_type: '', city: '', location_type: '',
    guests_count: 0, material_type: '', material_color: '',
    sabbabat_count: 0, workers_count: 0, clothes_type: '', clothes_color: '',
    amount: 0, discount: 0, paid_amount: 0, payment_status: 'unpaid',
    tips_amount: 0, tips_distributed: false, payment_completed: false, closed: false,
    notes: '', assignments: [], extra_drinks: [],
    ...cols, status, custom_fields: customFields || {},
  };
}
// Fixed button sets that are actions, not form answers.
const FIXED_CHOICES = { confirm: ['نعم', 'لا'], name_mismatch: ['حدّث الاسم', 'أبقِ القديم'] };

// Pre-computed staff status per role, e.g. "الصبابات: 3 من 3 ✅ (أ، ب، ج) | العاملات: 3 من 2 ✅ (...) | سائق: ممتاز"
function staffSummary(b) {
  const by = {};
  for (const a of b.assignments || []) (by[a.role] = by[a.role] || []).push(String(a.name || '').trim());
  const parts = [];
  const req = [['صبابة', 'الصبابات', b.sabbabat_count || 0], ['عاملة', 'العاملات', b.workers_count || 0]];
  for (const [role, label, need] of req) {
    const got = by[role] || []; delete by[role];
    if (!need && !got.length) continue;
    const mark = need ? (got.length >= need ? '✅' : `⚠️ ناقص ${need - got.length}`) : '';
    parts.push(`${label}: ${got.length} من ${need} ${mark}${got.length ? ` (${got.join('، ')})` : ''}`.replace(/\s+/g, ' ').trim());
  }
  for (const [role, names] of Object.entries(by)) parts.push(`${role}: ${names.join('، ')}`);
  return parts.length ? parts.join(' | ') : 'لا يوجد طاقم مطلوب أو معيَّن';
}

async function runTool(env, from, name, input) {
  if (name === 'convert_hijri_date') {
    const g = hToG(input.year, input.month, input.day);
    if (!g) return { error: 'invalid hijri date' };
    return { gregorian: isoUTC(g), gregorian_label: gregLabelEn(g), hijri_label: hijriLabel(g) };
  }
  if (name === 'start_booking') return await startBooking(env, from, input);
  if (name === 'present_options') {
    // Options always come from the app (or fixed action sets) — the model's own list is never sent.
    const spec = await getFormSpec(env);
    const key = String(input.field || '').trim();
    let options = FIXED_CHOICES[key];
    let label = '';
    if (key === 'confirm' && !/هل|تأكيد|تؤكد|أكد|أكّد|confirm/i.test(input.body || '')) {
      // yes/no buttons only for yes/no questions — never as answers to a number/text field
      const asked = spec.fields.find((x) => x.type !== 'select' && normAr(input.body).includes(normAr(x.label)));
      if (asked) return { presented: false, error: `"${asked.label}" حقل ${asked.type === 'number' ? 'رقمي' : 'نصي'} — اسأله نصاً بدون أزرار.` };
    }
    if (!options) {
      const f = spec.alias[key] || spec.alias[normAr(key)];
      if (!f || f.type !== 'select') return { presented: false, error: `"${key}" ليس حقل اختيار في نموذج التطبيق. حقول الاختيار: ${spec.fields.filter((x) => x.type === 'select').map((x) => x.id).join(', ')} أو confirm / name_mismatch. الحقول النصية والرقمية اسألها نصاً بدون خيارات.` };
      options = f.options; label = f.label;
    }
    await sendOptions(env, from, input.body || (label ? `اختر ${label}:` : 'اختر:'), options);
    return { presented: true, options_sent: options };
  }
  if (name === 'check_availability') {
    const s = await getSettings(env); const cap = capForDate(s, input.date);
    const active = (await bookingsOnDate(env, input.date)).filter((b) => b.status === 'active').length;
    const g = new Date(input.date + 'T00:00:00Z');
    return { date: input.date, weekday: weekdayAr(g), hijri: hijriLabel(g), active_count: active, cap, remaining: cap === -1 ? -1 : Math.max(cap - active, 0), is_full: cap !== -1 && active >= cap };
  }
  if (name === 'list_bookings') {
    // dates may come as the user's words ("الجمعة", "بكرة") — the server resolves them, never the model
    const toIso = (x) => { if (!x) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return x; const g = parseDateText(x); return g ? isoUTC(g) : null; };
    const from = toIso(input.date), to = toIso(input.to_date) || from;
    if (!from) return { error: 'تاريخ غير مفهوم' };
    const list = await bookingsInRange(env, from, to);
    const STATUS = { active: 'نشط', pending: 'قائمة انتظار', cancelled: 'ملغي', rejected: 'مرفوض' };
    return {
      range: from === to ? fullDateLabel(from) : `${fullDateLabel(from)} → ${fullDateLabel(to)}`,
      bookings: list.map((b) => ({
        id: b.id, clientName: b.client_name, date: fullDateLabel(b.booking_date), eventType: b.event_type, locationType: b.location_type, guests: b.guests_count, status: STATUS[b.status] || b.status,
        staff_summary: staffSummary(b),
      })),
      note: 'انقل staff_summary حرفياً عند السؤال عن الطاقم/البنات — لا تحسب الأعداد بنفسك.',
    };
  }
  if (name === 'get_booking') {
    const d = await fsdb(env, 'GET', `/web_bookings/${input.id}`);
    if (!d || !d.fields) return { error: 'not found' };
    const raw = { id: input.id, ...fromFsFields(d.fields) };
    const out = friendly(raw);
    out.staff = (raw.assignments || []).map((a) => ({ employeeId: a.employee_id, name: a.name, role: a.role, paid: a.paid_amount, tip: a.tip_amount }));
    out.sabbabatCount = raw.sabbabat_count; out.workersCount = raw.workers_count;
    out.staff_summary = staffSummary(raw);
    // the booking as the app displays it: only the form's fields, with their app labels
    const spec = await getFormSpec(env);
    out.form = spec.fields.filter((f) => f.type !== 'drinks').map((f) => {
      let v = f.custom ? (raw.custom_fields || {})[f.id] : raw[f.col];
      if (f.id === 'paymentStatus') v = PAYMENT_LABELS[v] || v;
      return { label: f.label, value: v ?? '' };
    });
    out.extraDrinks = raw.extra_drinks || [];
    return out;
  }
  if (name === 'create_booking') {
    const spec = await getFormSpec(env);
    const v = validateValues(spec, input);
    if (v.errors.length) return { saved: false, errors: v.errors };
    const missing = spec.fields.filter((f) => f.required && (f.custom ? v.custom[f.id] : v.cols[f.col]) == null).map((f) => f.label);
    if (missing.length) return { saved: false, missing };
    input = { ...input, clientName: v.cols.client_name, clientPhone: v.cols.client_phone, date: v.cols.booking_date };
    const s = spec.settings; const cap = capForDate(s, input.date);
    const dayBookings = await bookingsOnDate(env, input.date);
    // idempotency guard: same client (phone or name) already booked that day -> don't duplicate
    const pIn = normPhone(input.clientPhone || '');
    const dup = dayBookings.find((b) => (b.status === 'active' || b.status === 'pending') &&
      ((pIn.length >= 8 && phoneMatches(pIn, normPhone(b.client_phone))) || (b.client_name || '').trim() === (input.clientName || '').trim()));
    if (dup) return { already_exists: true, id: dup.id, status: dup.status, note: 'يوجد حجز مسبق لنفس العميل في هذا اليوم — لم يُنشأ حجز جديد.' };
    const active = dayBookings.filter((b) => b.status === 'active').length;
    const status = cap !== -1 && active >= cap ? 'pending' : 'active';
    // resolve / auto-register the client by phone so it's saved for next time
    let clientId = '', clientRegistered = false;
    if (input.clientPhone && normPhone(input.clientPhone).length >= 8) {
      const p = normPhone(input.clientPhone);
      const match = (await listColl(env, 'web_clients')).find((c) => phoneMatches(p, normPhone(c.phone)));
      if (match) clientId = match.id;
      else {
        const cr = await fsdb(env, 'POST', '/web_clients', { fields: { name: { stringValue: input.clientName || '' }, phone: { stringValue: input.clientPhone }, created_at: { timestampValue: new Date().toISOString() } } });
        clientId = docId(cr.name); clientRegistered = true;
      }
    }
    const cols = { ...v.cols };
    if (cols.payment_status === 'unpaid' || !cols.payment_status) delete cols.paid_amount;
    const doc = newBookingDoc(cols, status, v.custom); doc.client_id = clientId;
    const fields = toFsFields(doc);
    fields.created_at = { timestampValue: new Date().toISOString() };
    const res = await fsdb(env, 'POST', '/web_bookings', { fields });
    const hijri = hijriLabel(new Date(input.date + 'T00:00:00Z'));
    return { id: docId(res.name), status, waitlisted: status === 'pending', client_registered: clientRegistered, date: input.date, weekday: weekdayAr(new Date(input.date + 'T00:00:00Z')), date_hijri: hijri, ignored_not_in_form: v.ignored.length ? v.ignored : undefined };
  }
  if (name === 'edit_booking') {
    const spec = await getFormSpec(env);
    const v = validateValues(spec, input.changes || {});
    if (v.errors.length) return { saved: false, errors: v.errors };
    const fields = toFsFields(v.cols);
    const keys = Object.keys(v.cols);
    if (Object.keys(v.custom).length) {
      fields.custom_fields = { mapValue: { fields: toFsFields(v.custom) } };
      for (const k of Object.keys(v.custom)) keys.push(`custom_fields.${k}`);
    }
    if (!keys.length) return { error: 'no valid changes', ignored_not_in_form: v.ignored };
    const mask = keys.map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const res = await fsdb(env, 'PATCH', `/web_bookings/${input.id}?${mask}`, { fields });
    return { id: docId(res.name), updated: keys, ignored_not_in_form: v.ignored.length ? v.ignored : undefined };
  }
  if (name === 'cancel_booking') {
    const res = await fsdb(env, 'PATCH', `/web_bookings/${input.id}?updateMask.fieldPaths=status`, { fields: { status: { stringValue: 'cancelled' } } });
    return { id: docId(res.name), status: 'cancelled' };
  }
  if (name === 'set_waiting_status') {
    const status = input.action === 'confirm' ? 'active' : 'rejected';
    const res = await fsdb(env, 'PATCH', `/web_bookings/${input.id}?updateMask.fieldPaths=status`, { fields: { status: { stringValue: status } } });
    return { id: docId(res.name), status };
  }
  // ---- analytics / finance ----
  if (name === 'finance_summary') {
    return await financeSummary(env, input.from, input.to);
  }
  // ---- clients ----
  if (name === 'lookup_client') {
    const p = normPhone(input.phone);
    if (p.length < 8) return { found: false };
    const match = (await listColl(env, 'web_clients')).find((c) => phoneMatches(p, normPhone(c.phone)));
    return match ? { found: true, id: match.id, name: match.name, phone: match.phone } : { found: false };
  }
  if (name === 'list_clients') {
    const q = (input.search || '').trim();
    let list = (await listColl(env, 'web_clients')).map((c) => ({ id: c.id, name: c.name, phone: c.phone }));
    if (q) list = list.filter((c) => (c.name || '').includes(q) || normPhone(c.phone).includes(normPhone(q)));
    return { clients: list.slice(0, 50), total: list.length };
  }
  if (name === 'add_client') {
    const res = await fsdb(env, 'POST', '/web_clients', { fields: { name: { stringValue: input.name || '' }, phone: { stringValue: input.phone || '' }, created_at: { timestampValue: new Date().toISOString() } } });
    return { id: docId(res.name), name: input.name, phone: input.phone };
  }
  if (name === 'edit_client') {
    const changes = input.changes || {}; const cols = {};
    if (changes.name != null) cols.name = changes.name;
    if (changes.phone != null) cols.phone = changes.phone;
    const keys = Object.keys(cols); if (!keys.length) return { error: 'no valid changes' };
    const mask = keys.map((k) => `updateMask.fieldPaths=${k}`).join('&');
    const res = await fsdb(env, 'PATCH', `/web_clients/${input.id}?${mask}`, { fields: toFsFields(cols) });
    return { id: docId(res.name), updated: keys };
  }
  // ---- employees ----
  if (name === 'list_employees') {
    let list = (await listColl(env, 'web_employees')).filter((e) => e.active !== false)
      .map((e) => ({ id: e.id, name: e.name, phone: e.phone, jobTypes: e.job_types || [] }));
    if (input.jobType) list = list.filter((e) => (e.jobTypes || []).includes(input.jobType));
    return { employees: list };
  }
  // ---- services ----
  if (name === 'list_services') {
    const list = (await listColl(env, 'web_services')).map((s) => ({ id: s.id, name: s.name, kind: s.kind, price: s.price, description: s.description }));
    return { services: list };
  }
  // ---- staff assignment ----
  if (name === 'employees_available') {
    const emap = await employeeMap(env);
    let emps = Object.entries(emap).filter(([, e]) => e.active).map(([id, e]) => ({ id, name: e.name, jobTypes: e.jobTypes }));
    if (input.jobType) emps = emps.filter((e) => e.jobTypes.includes(input.jobType));
    const day = (await bookingsOnDate(env, input.date)).filter((b) => b.status === 'active');
    const busy = new Set(); for (const b of day) for (const a of (b.assignments || [])) busy.add(a.employee_id);
    return { date: input.date, available: emps.filter((e) => !busy.has(e.id)), busy: emps.filter((e) => busy.has(e.id)).map((e) => e.name) };
  }
  if (name === 'assign_staff') {
    const staff = (input.staff || []).filter((s) => s && s.employeeId && s.role);
    if (!staff.length) return { error: 'no staff provided' };
    const emap = await employeeMap(env);
    const resolved = staff.map((s) => ({ employee_id: s.employeeId, name: (emap[s.employeeId] && emap[s.employeeId].name) || s.name || '', role: s.role, paid_amount: 0, tip_amount: 0 }));
    const d = await fsdb(env, 'GET', `/web_bookings/${input.id}`);
    if (!d || !d.fields) return { error: 'booking not found' };
    const cur = fromFsFields(d.fields).assignments || [];
    let list = input.mode === 'replace' ? [] : cur.slice();
    for (const r of resolved) if (!list.some((a) => a.employee_id === r.employee_id && a.role === r.role)) list.push(r);
    const res = await fsdb(env, 'PATCH', `/web_bookings/${input.id}?updateMask.fieldPaths=assignments`, { fields: { assignments: toFsValue(list) } });
    return { id: docId(res.name), assigned: list.map((a) => ({ name: a.name, role: a.role })), count: list.length };
  }
  if (name === 'remove_staff') {
    const d = await fsdb(env, 'GET', `/web_bookings/${input.id}`);
    if (!d || !d.fields) return { error: 'booking not found' };
    let cur = fromFsFields(d.fields).assignments || [];
    const before = cur.length;
    cur = cur.filter((a) => !(a.employee_id === input.employeeId && (!input.role || a.role === input.role)));
    const res = await fsdb(env, 'PATCH', `/web_bookings/${input.id}?updateMask.fieldPaths=assignments`, { fields: { assignments: toFsValue(cur) } });
    return { id: docId(res.name), removed: before - cur.length, remaining: cur.map((a) => ({ name: a.name, role: a.role })) };
  }
  // ---- payments (booking-level) ----
  if (name === 'record_payment') {
    const cols = {}; const num = (x) => (typeof x === 'number' ? x : parseFloat(x));
    if (input.paidAmount != null) cols.paid_amount = num(input.paidAmount);
    if (input.paymentStatus) cols.payment_status = input.paymentStatus; // paid | deposit | unpaid
    if (input.tipsAmount != null) cols.tips_amount = num(input.tipsAmount);
    if (input.markClosed != null) cols.closed = !!input.markClosed;
    const keys = Object.keys(cols); if (!keys.length) return { error: 'no payment fields' };
    const mask = keys.map((k) => `updateMask.fieldPaths=${k}`).join('&');
    const res = await fsdb(env, 'PATCH', `/web_bookings/${input.id}?${mask}`, { fields: toFsFields(cols) });
    return { id: docId(res.name), updated: keys };
  }
  return { error: `unknown tool ${name}` };
}

function fn(name, description, properties, required) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties: properties || {}, required: required || [] } } };
}
function buildTools(spec) {
  const selectIds = spec.fields.filter((f) => f.type === 'select').map((f) => f.id);
  const props = bookingProps(spec);
  return [
  fn('convert_hijri_date', 'حوّل تاريخاً هجرياً إلى ميلادي. استدعها كلما أعطى المستخدم تاريخاً هجرياً.', { year: { type: 'integer' }, month: { type: 'integer' }, day: { type: 'integer' } }, ['year', 'month', 'day']),
  fn('present_options', 'أرسل سؤالاً بأزرار. الخيارات يضعها النظام تلقائياً من التطبيق — أنت تحدد الحقل فقط. field = معرّف حقل اختيار من النموذج، أو confirm (نعم/لا)، أو name_mismatch (حدّث الاسم/أبقِ القديم).', { body: { type: 'string', description: 'نص السؤال' }, field: { type: 'string', enum: [...selectIds, 'confirm', 'name_mismatch'] } }, ['body', 'field']),
  fn('check_availability', 'تحقق من توفّر يوم ميلادي (YYYY-MM-DD).', { date: { type: 'string', description: 'YYYY-MM-DD' } }, ['date']),
  fn('list_bookings', 'اعرض حجوزات يوم أو مدى مع الطاقم المعيَّن والمطلوب. مرّر التاريخ كما قاله المستخدم حرفياً (مثل "الجمعة" أو "بكرة" أو "13 نوفمبر") — النظام يحدد اليوم الصحيح.', { date: { type: 'string', description: 'كما قاله المستخدم، أو YYYY-MM-DD' }, to_date: { type: 'string' } }, ['date']),
  fn('get_booking', 'تفاصيل حجز بالمعرّف (قبل التعديل). form = الحقول كما تظهر في التطبيق.', { id: { type: 'string' } }, ['id']),
  fn('start_booking', 'ابدأ نموذج حجز جديد (النظام يكمل الأسئلة من التطبيق ويؤكد ويحفظ). مرّر فقط ما ذكره المستخدم.', (() => { const p = { ...props, date_text: { type: 'string', description: 'التاريخ كما كتبه المستخدم حرفياً (ميلادي أو هجري)' } }; delete p.date; return p; })()),
  fn('edit_booking', 'عدّل حجزاً بعد عرض (من→إلى) وتأكيد. changes تقبل حقول النموذج فقط.', { id: { type: 'string' }, changes: { type: 'object', properties: props } }, ['id', 'changes']),
  fn('cancel_booking', 'ألغِ حجزاً بعد التأكيد.', { id: { type: 'string' } }, ['id']),
  fn('set_waiting_status', 'أكّد/ارفض حجز قائمة انتظار.', { id: { type: 'string' }, action: { type: 'string', enum: ['confirm', 'reject'] } }, ['id', 'action']),
  // تحليلات ومالية (قراءة)
  fn('finance_summary', 'ملخّص مالي وإحصائي لمدى تاريخي: الدخل، المحصّل، المتبقّي، الإكراميات، صافي الربح، عدد الحجوزات حسب الحالة، أكثر الأيام ازدحاماً، والحجوزات غير المدفوعة. للأسئلة مثل: كم دخل هذا الشهر؟ أكثر يوم ازدحاماً؟ الحجوزات غير المدفوعة؟', { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }, ['from', 'to']),
  // العملاء
  fn('lookup_client', 'ابحث عن عميل برقم الهاتف. يرجّع found + الاسم المسجّل إن وُجد.', { phone: { type: 'string' } }, ['phone']),
  fn('list_clients', 'اعرض/ابحث في العملاء (بالاسم أو الهاتف).', { search: { type: 'string' } }),
  fn('add_client', 'أضف عميلاً جديداً بعد التأكيد.', { name: { type: 'string' }, phone: { type: 'string' } }, ['name']),
  fn('edit_client', 'عدّل بيانات عميل بعد التأكيد.', { id: { type: 'string' }, changes: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' } } } }, ['id', 'changes']),
  // الموظفون
  fn('list_employees', 'اعرض الموظفين النشطين (اختياري: تصفية حسب الدور jobType مثل صبابة/عاملة/سائق/قهوجية).', { jobType: { type: 'string' } }),
  fn('employees_available', 'من المتاح من الموظفين في يوم حجز معيّن (يستبعد المشغولين في حجوزات أخرى نفس اليوم). اختياري: تصفية بالدور jobType.', { date: { type: 'string', description: 'YYYY-MM-DD' }, jobType: { type: 'string' } }, ['date']),
  fn('assign_staff', 'عيّن موظفين على حجز (بعد التأكيد). staff=[{employeeId, role}]. الأدوار من job_types (صبابة/عاملة/سائق/قهوجية). mode=add يضيف للموجود (الافتراضي) أو replace يستبدل. استخدم employees_available أولاً لاختيار المتاحين.', { id: { type: 'string' }, staff: { type: 'array', items: { type: 'object', properties: { employeeId: { type: 'string' }, role: { type: 'string' } } } }, mode: { type: 'string', enum: ['add', 'replace'] } }, ['id', 'staff']),
  fn('remove_staff', 'أزل موظفاً من حجز (بعد التأكيد). حدّد employeeId، واختياري role لإزالة دور محدّد فقط.', { id: { type: 'string' }, employeeId: { type: 'string' }, role: { type: 'string' } }, ['id', 'employeeId']),
  // الخدمات
  fn('list_services', 'اعرض الخدمات والباقات وأسعارها ووصفها.', {}),
  // المدفوعات (على مستوى الحجز)
  fn('record_payment', 'سجّل دفعة/حالة دفع/إكرامية لحجز أو أغلقه — بعد التأكيد. paymentStatus: paid|deposit|unpaid.', { id: { type: 'string' }, paidAmount: { type: 'number' }, paymentStatus: { type: 'string', enum: ['paid', 'deposit', 'unpaid'] }, tipsAmount: { type: 'number' }, markClosed: { type: 'boolean' } }, ['id']),
  ];
}

function systemPrompt(spec) {
  const now = qatarNow();
  return `أنت "حمودي ودي"، مساعد حجوزات شركة "أم فارس" للضيافة عبر واتساب. ردّ بلغة المستخدم (عربي/إنجليزي)، باختصار وودّية. عرّف عن نفسك مرة واحدة في بداية المحادثة فقط.

اليوم: يوم ${weekdayAr(now)} ${isoUTC(now)} ميلادي / ${hijriLabel(now)}.
الأيام القادمة (استخدمها، لا تحسب بنفسك): ${Array.from({ length: 14 }, (_, k) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + k)); return `${weekdayAr(d)} ${isoUTC(d)}`; }).join('، ')}. النظام يخزّن التواريخ بصيغة YYYY-MM-DD ميلادية. التاريخ الهجري فقط (مثل محرم/رمضان أو سنة 14xx) حوّله عبر convert_hijri_date — والميلادي (مايو، 2031...) لا يحتاج تحويل. عند عرض التاريخ بالتقويمين، استخدم فقط قيم hijri الراجعة من الأدوات — لا تحسب الهجري بنفسك أبداً.

إنشاء حجز جديد: استدعِ start_booking فوراً، ومرّر فقط القيم التي ذكرها المستخدم فعلاً (الرقم، الاسم، التاريخ كما كتبه حرفياً في date_text، وأي حقل آخر). النظام يدير نموذج التطبيق بنفسه (الأسئلة والأزرار والتأكيد والحفظ) — لا تسأل أنت أي سؤال من أسئلة الحجز، ولا تكتب ملخصاً، ولا ترد بعد start_booking.

حقول نموذج الحجز في التطبيق (للتعديل فقط — لا تسأل عن غيرها ولا تقترح قيماً خارج خياراتها):
${formSpecPrompt(spec)}

تعديل حجز: جد الحجز (list_bookings ثم get_booking)، اعرض "الحقل: من X إلى Y"، أكّد، ثم edit_booking. لحقل اختيار نادِ أداة present_options بمعرّف الحقل (النظام يضع خيارات التطبيق). لو رجعت edit_booking بـ errors فالقيمة غير موجودة في التطبيق — اعرض الخيارات.

قدرات إضافية (أنت مساعد شامل لإدارة العمل، لست محصوراً بالحجوزات):
- مالية/تحليلات: استخدم finance_summary للإجابة عن الدخل/الربح/المحصّل/المتبقّي/الإكراميات/أكثر الأيام ازدحاماً/الحجوزات غير المدفوعة لأي مدى تاريخي.
- العملاء: list_clients للبحث والعرض، add_client/edit_client (بعد تأكيد).
- الموظفون: list_employees (مع تصفية بالدور). الخدمات: list_services (الأسعار والباقات).
- المدفوعات: record_payment لتسجيل مبلغ مدفوع/حالة الدفع/إكرامية أو إغلاق الحجز (بعد تأكيد).
- تعيين الموظفين على حجز: جد الحجز (list_bookings/get_booking)، تحقّق من المتاحين بـ employees_available في يوم الحجز، اعرض من ستعيّن ودوره واطلب تأكيداً، ثم assign_staff (mode=add افتراضياً). لإزالة: remove_staff. الموظف قد يكون في أكثر من دور. get_booking يعرض الطاقم الحالي والأعداد المطلوبة (sabbabatCount/workersCount).
- (تقسيم الإكراميات لكل موظف غير مدعوم بعد — سجّل الإكرامية على مستوى الحجز عبر record_payment.)

فهم الأسئلة:
- "البنات" / "الصبابات" / "العاملات" / "الموظفين" / "الطاقم" (حتى مع أخطاء إملائية مثل "المزطفين") = الموظفون المعيَّنون على الحجز. "هل حجزنا البنات؟" أو "هل تم حجز الموظفين؟" = هل عُيِّن الطاقم على الحجز/الحجوزات المذكورة في المحادثة؟ أجب من staff_summary في list_bookings/get_booking — انقله كما هو.
- لو السؤال يعود على حجوزات ذُكرت قبل قليل في المحادثة، استخدمها ولا تسأل من جديد.
- أسماء الأيام (الجمعة، السبت، بكرة...) لا تحسب تاريخها بنفسك — مرّرها كما هي لـ list_bookings، واستخدم التاريخ الراجع (range/date).

طريقة العرض (واتساب):
- لا تعرض أبداً معرّف الحجز أو أي ID داخلي للمستخدم.
- لا تستخدم جداول؛ اعرض كل حجز في سطر: • الاسم — المناسبة — الموقع — عدد المعازيم — الحالة.

القراءة (توفّر/عرض/تحليلات/قوائم) نفّذها فوراً. الإنشاء/التعديل/الإلغاء/إضافة أو تعديل عميل/تسجيل دفعة: بعد تأكيد صريح فقط.
خارج صلاحيتك: إدارة المستخدمين، الإعدادات، الحذف النهائي — اعتذر بلطف.`;
}

// Groq free-tier rate limits are per model, so on 429 switch to the fallback model before waiting.
// True when an LLM reply is asking for booking-form fields itself (≥2 form labels, or a select field's options listed).
function looksLikeFormQuestions(spec, text) {
  const n = normAr(text);
  if (!n || !/[؟?]|احتاج|زودني|ارجو|منفضلك|اكتب|حدد|اختر/.test(n)) return false; // must be asking, not displaying
  const labels = spec.fields.filter((f) => n.includes(normAr(f.label))).length;
  const listed = spec.fields.some((f) => f.type === 'select' && f.id !== 'paymentStatus' && f.options.filter((o) => n.includes(normAr(o))).length >= 3);
  return labels >= 2 || listed;
}
// Start the wizard from the server, pre-filling only what is unambiguous: phone/name from the latest
// shared contact card (or a phone in the message), plus a date and app options mentioned in the message.
async function serverStartBooking(env, from, spec, text, history) {
  const given = {};
  const recent = [String(text || ''), ...history.filter((x) => x.role === 'user' && typeof x.content === 'string').slice(-6).reverse().map((x) => x.content)];
  for (const t of recent) {
    const c = /\(بطاقة جهة اتصال مشاركة\)\s*([^—\n|]+?)\s*—\s*(\+?[\d][\d\s\-()]{6,}\d)/.exec(t);
    if (c) { given.clientName = c[1].trim(); given.clientPhone = c[2]; break; }
  }
  const msg = enDigits(String(text || ''));
  const ph = /(\+?\d[\d\s\-]{6,}\d)/.exec(msg);
  if (ph && normalizePhone(ph[1])) { given.clientPhone = ph[1]; if (!/\(بطاقة جهة اتصال مشاركة\)/.test(msg)) delete given.clientName; }
  const rest = ph ? msg.replace(ph[1], ' ') : msg;
  if (parseDateText(rest)) given.date_text = rest;
  const nmsg = normAr(rest);
  for (const f of spec.fields) {
    if (f.type !== 'select' || f.id === 'paymentStatus') continue;
    const hits = f.options.filter((o) => nmsg.includes(normAr(o)));
    if (hits.length === 1) given[f.id] = hits[0];
  }
  return startBooking(env, from, given);
}

// WhatsApp-safe reply: no internal IDs, no markdown tables (rendered as raw pipes on WhatsApp).
function sanitizeReply(text) {
  let s = String(text || '');
  s = s.replace(/\*{0,2}`?\b(?=[A-Za-z0-9]*[A-Z])(?=[A-Za-z0-9]*[a-z])[A-Za-z0-9]{20}\b`?\*{0,2}/g, '').replace(/[(\[]\s*[)\]]/g, '').replace(/ +([:،,])/g, '$1'); // Firestore doc ids
  s = s.split('\n').filter((l) => !/معر[ّ]?ف\s*(الحجز|العميل|الموظف)?\s*[:：]?\s*$|^\s*[-•*]?\s*(ID|id|المعرّف|معرّف)\s*[:：]\s*$/.test(l.trim())).join('\n');
  const out = []; let inTable = false, header = true;
  for (const line of s.split('\n')) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^\s*\|[\s:\-|]+\|\s*$/.test(line)) continue; // separator row
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.replace(/\*+/g, '').trim()).filter(Boolean);
      if (!inTable) { inTable = true; header = true; }
      if (header) { header = false; continue; } // drop the header row
      if (cells.length) out.push('• ' + cells.join(' — '));
    } else { inTable = false; out.push(line); }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isNewBookingIntent(text) {
  const t = String(text || '');
  if (/عد[ّ]?ل|تعديل|غي[ّ]?ر|[اأإ]لغ|كنسل|cancel|edit/i.test(t)) return false;
  return /حجز\s*جديد|[اأإ]حجز|[اأإ]نش[ئءى]\s*حجز|سو[يى]\s*حجز|(ابغ[ىي]|ابي|ودي|[اأ]ريد|عط[ني]ي?)\s*حجز|new booking|create (a )?booking|book (a|an|for)\b/i.test(t);
}

async function groqCall(env, messages, tools) {
  const toolChoice = 'auto';
  const models = [env.GROQ_MODEL || 'openai/gpt-oss-120b', env.GROQ_FALLBACK_MODEL].filter(Boolean);
  let data, status;
  for (let attempt = 0; attempt < 8; attempt++) {
    const model = models[attempt % models.length];
    const body = { model, messages, tools, tool_choice: toolChoice, temperature: 0.2, max_tokens: 700 };
    if (model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    status = r.status; data = await r.json();
    // malformed tool call from the model (e.g. "name<|channel|>...") — just regenerate
    if (data && data.error && status === 400 && /tool call validation failed|failed to call a function|tool_use_failed/i.test(data.error.message || '')) continue;
    if (data && data.error && (status === 429 || status === 503 || status >= 500)) {
      if (models.length > 1 && attempt % models.length === 0) continue; // try the other model's bucket immediately
      const ra = parseFloat(r.headers.get('retry-after'));
      const m = /try again in ([\d.]+)s/.exec((data.error && data.error.message) || '');
      const wait = ra ? ra * 1000 : (m ? parseFloat(m[1]) * 1000 : 1500 * (attempt + 1));
      await sleep(Math.min(wait + 400, 12000));
      continue;
    }
    break;
  }
  if (data && data.error) throw new Error(`Groq ${status}: ${(data.error && data.error.message) || JSON.stringify(data.error)}`);
  return data;
}

async function runAgent(env, from, userContent) {
  const history = await loadHistory(env, from); // OpenAI-format messages (no system)
  history.push({ role: 'user', content: userContent });
  let reply = '', presented = false;
  const toolsUsed = new Set();
  const spec = await getFormSpec(env);
  const tools = buildTools(spec);
  const sys = systemPrompt(spec);
  // A new-booking request never goes through the LLM: the server starts its own wizard directly.
  if (isNewBookingIntent(userContent)) {
    await serverStartBooking(env, from, spec, userContent, history);
    history.push({ role: 'assistant', content: '(بدأ نموذج حجز جديد — النظام يدير الأسئلة)' });
    await saveHistory(env, from, history);
    return { reply: '', presented: true };
  }
  for (let round = 0; round < 8; round++) {
    const messages = [{ role: 'system', content: sys }, ...history];
    const data = await groqCall(env, messages, tools);
    const raw = data.choices && data.choices[0] && data.choices[0].message;
    if (!raw) break;
    const m = { role: 'assistant', content: raw.content || '' }; // drop reasoning etc. (tokens)
    if (raw.tool_calls && raw.tool_calls.length) m.tool_calls = raw.tool_calls.map((tc) => ({ id: tc.id, type: 'function', function: { name: String(tc.function.name || '').split('<|')[0], arguments: tc.function.arguments || '{}' } }));
    history.push(m);
    if (m.tool_calls) {
      for (const tc of m.tool_calls) {
        const fnName = tc.function.name;
        toolsUsed.add(fnName);
        let args = {};
        try { args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments || '{}') : (tc.function.arguments || {}); } catch (e) {}
        let out;
        if (fnName === 'present_options' && presented) out = { presented: false, skipped: 'سؤال واحد في كل رسالة — انتظر إجابة السؤال السابق' };
        else {
          try { out = await runTool(env, from, fnName, args); }
          catch (e) { out = { error: String(e.message || e) }; }
        }
        if (out && out.presented) presented = true; // present_options or start_booking already messaged the user
        history.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 3000) });
      }
      if (presented) break; // a question is on screen — wait for the user's answer
      continue;
    }
    reply = (m.content || '').trim();
    // gpt-oss sometimes leaks its raw tool-call syntax into text: "to=present_options<|constrain|>json<|message|>{...}"
    const leak = /\(?\s*to=(?:functions\.)?(\w+)[^{]*?<\|message\|>\s*(\{[\s\S]*?\})\s*\)?/.exec(reply);
    if (leak) {
      reply = reply.replace(leak[0], '').replace(/<\|[^|]*\|>/g, '').trim();
      m.content = reply;
      let args = null; try { args = JSON.parse(leak[2]); } catch (e) {}
      if (args && (leak[1] === 'present_options' || leak[1] === 'start_booking') && !presented) {
        if (leak[1] === 'present_options' && reply) args.body = reply;
        const out = await runTool(env, from, leak[1], args);
        if (out && out.presented) { presented = true; reply = ''; }
      }
    }
    reply = reply.replace(/<\|[^|]*\|>/g, '').trim();
    // safety net: the model is collecting booking-form fields in text -> hand over to the server wizard
    if (!presented && !['get_booking', 'list_bookings', 'edit_booking', 'finance_summary'].some((x) => toolsUsed.has(x)) && looksLikeFormQuestions(spec, reply)) {
      await serverStartBooking(env, from, spec, userContent, history.slice(0, -1));
      m.content = '(بدأ نموذج حجز جديد — النظام يدير الأسئلة)';
      presented = true; reply = '';
      break;
    }
    // model wrote a present_options call as text instead of calling it: run it (server checks it) and strip it
    const re = /\{*\s*present_options\s*\(([^)]*)\)\s*\}*/g;
    const textCalls = [...reply.matchAll(re)];
    if (textCalls.length) {
      const leftover = reply.replace(re, '').trim();
      for (const mm of textCalls) {
        const field = (/field\s*[=:]\s*["']?([\w؀-ۿ]+)/.exec(mm[1]) || [])[1];
        const body = (/body\s*[=:]\s*["']([^"']*)["']/.exec(mm[1]) || [])[1];
        if (!field || presented) continue;
        const out = await runTool(env, from, 'present_options', { field, body: leftover || body || '' });
        if (out && out.presented) presented = true;
      }
      reply = leftover;
      m.content = leftover;
    }
    break;
  }
  reply = sanitizeReply(reply);
  await saveHistory(env, from, history);
  return { reply, presented };
}

export const __test = { hToG, gToH, hijriLabel, isoUTC, getFormSpec, validateValues, formSpecPrompt, buildTools, runTool, parseDateText, normalizePhone };
