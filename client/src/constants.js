import { getLang } from './i18n';

const isAr = () => getLang() === 'ar';

export const EVENT_TYPES =['زواج', 'زواره', 'استقبال', 'عزيمة', 'ولادة', 'عزاء', 'تخرج', 'خطوبة'];
export const LOCATION_TYPES = ['استراحة', 'بيت', 'مستشفى', 'قاعة', 'شالية'];
export const MATERIAL_TYPES = ['ذهبي', 'فضي', 'شفاف', 'ملون', 'أخرى'];
export const JOB_TYPES = ['صبابة', 'عاملة', 'سائق'];

export const PAYMENT_STATUS = {
  paid: 'مدفوع كامل',
  deposit: 'عربون',
  unpaid: 'لم يتم الدفع',
};

export const PAYMENT_COLORS = {
  paid: 'bg-emerald-100 text-emerald-700',
  deposit: 'bg-amber-100 text-amber-700',
  unpaid: 'bg-red-100 text-red-700',
};

// role -> booking count field used for "auto" selection hints
export const ROLE_COUNT_FIELD = {
  'صبابة': 'sabbabat_count',
  'عاملة': 'workers_count',
  'سائق': null,
};

// all numbers shown with Latin (English) digits via the `nu-latn` numbering system
export const SAR = (n) =>
  isAr()
    ? new Intl.NumberFormat('ar-SA-u-nu-latn', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(n || 0)
    : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n || 0)} ሪያል`;

const toDate = (d) => (typeof d === 'string' ? new Date(d + 'T00:00:00') : d);

// Tigrinya names are built in: browser/WebView ICU support for the `ti` locale is unreliable.
const TI_GREG_MONTHS = ['ጥሪ', 'ለካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰነ', 'ሓምለ', 'ነሓሰ', 'መስከረም', 'ጥቅምቲ', 'ሕዳር', 'ታሕሳስ'];
const TI_HIJRI_MONTHS = ['ሙሓረም', 'ሰፈር', 'ረቢዕ ቀዳማይ', 'ረቢዕ ካልኣይ', 'ጁማዳ ቀዳማይ', 'ጁማዳ ካልኣይ', 'ረጀብ', 'ሻዕባን', 'ረመዳን', 'ሸዋል', 'ዙል-ቓዕዳ', 'ዙል-ሒጃ'];
const TI_WEEKDAYS = ['ሰንበት', 'ሰኑይ', 'ሰሉስ', 'ረቡዕ', 'ሓሙስ', 'ዓርቢ', 'ቀዳም'];
const TI_WEEKDAYS_SHORT = ['ሰን', 'ሰኑ', 'ሰሉ', 'ረቡ', 'ሓሙ', 'ዓር', 'ቀዳ'];
const AR_GREG_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_HIJRI_MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
const AR_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const AR_WEEKDAYS_SHORT = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];

export const gregMonthNames = () => (isAr() ? AR_GREG_MONTHS : TI_GREG_MONTHS);
export const hijriMonthNames = () => (isAr() ? AR_HIJRI_MONTHS : TI_HIJRI_MONTHS);
export const weekdayNames = () => (isAr() ? AR_WEEKDAYS : TI_WEEKDAYS);
export const weekdayShortNames = () => (isAr() ? AR_WEEKDAYS_SHORT : TI_WEEKDAYS_SHORT);

// local-timezone Hijri parts {y, m (1-based), d}
const hijriLocalFmt = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });
function hijriLocal(date) {
  const o = {};
  for (const p of hijriLocalFmt.formatToParts(date)) {
    if (p.type === 'year') o.y = parseInt(p.value, 10);
    if (p.type === 'month') o.m = +p.value;
    if (p.type === 'day') o.d = +p.value;
  }
  return o;
}

export const fmtDate = (d) => {
  if (!d) return '';
  const date = toDate(d);
  if (!isAr()) return `${date.getDate()} ${TI_GREG_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

// weekday + full date (Gregorian), Latin digits
export const fmtFull = (d) => {
  const date = toDate(d);
  if (!isAr()) return `${TI_WEEKDAYS[date.getDay()]}፣ ${fmtDate(date)}`;
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

// Hijri (Umm al-Qura) formatting
export const fmtHijri = (d) => {
  if (!d) return '';
  const date = toDate(d);
  if (!isAr()) { const h = hijriLocal(date); return `${h.d} ${TI_HIJRI_MONTHS[h.m - 1]} ${h.y}`; }
  return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};
export const hijriDay = (date) =>
  isAr()
    ? new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric' }).format(date)
    : String(hijriLocal(date).d);
export const hijriMonthYear = (date) => {
  if (!isAr()) { const h = hijriLocal(date); return `${TI_HIJRI_MONTHS[h.m - 1]} ${h.y}`; }
  return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { month: 'long', year: 'numeric' }).format(date);
};

// 'HH:MM' -> '2:00 م' (12-hour, localized period)
export const fmtTime = (hm) => {
  if (!hm) return '';
  const [h, m] = hm.split(':').map(Number);
  const period = h < 12 ? (isAr() ? 'ص' : 'ቅ.ቀ.') : isAr() ? 'م' : 'ድ.ቀ.';
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${period}`;
};

// weekday + Gregorian + Hijri, for modal titles
export const fmtDayTitle = (iso) => `${fmtFull(iso)} — ${fmtHijri(iso)}`;

// staff completeness for a role: 'done' | 'partial' | 'none'
export function staffStatus(booking, role) {
  const reqField = role === 'صبابة' ? 'sabbabat_count' : role === 'عاملة' ? 'workers_count' : null;
  const selected = ((booking.employees && booking.employees[role]) || []).length;
  const required = reqField ? Number(booking[reqField]) || 0 : null;
  if (selected === 0) return 'none';
  if (required != null && required > 0 && selected < required) return 'partial';
  return 'done';
}
export const STAFF_LABEL = { done: 'تم', partial: 'لم', none: 'لا' };
export const STAFF_CLS = {
  done: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  none: 'bg-red-100 text-red-700',
};

export function safeParse(v, fallback) {
  try {
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

// fallback used until /api/settings loads (mirrors server DEFAULT_FIELD_CONFIG)
export const DEFAULT_FIELD_CONFIG = [
  { key: 'event_time', label: 'وقت المناسبة', type: 'time', required: false, enabled: true, system: true },
  { key: 'event_type', label: 'نوع المناسبة', type: 'select', required: false, enabled: true, system: true, options: EVENT_TYPES },
  { key: 'city', label: 'المدينة', type: 'text', required: false, enabled: true, system: true },
  { key: 'location_type', label: 'نوع الموقع', type: 'select', required: false, enabled: true, system: true, options: LOCATION_TYPES },
  { key: 'guests_count', label: 'عدد المعازيم', type: 'number', required: false, enabled: true, system: true },
  { key: 'material_type', label: 'نوع المعاميل', type: 'select', required: false, enabled: true, system: true, options: MATERIAL_TYPES },
  { key: 'material_color', label: 'لون المعاميل', type: 'text', required: false, enabled: true, system: true },
  { key: 'sabbabat_count', label: 'عدد الصبابات', type: 'number', required: false, enabled: true, system: true },
  { key: 'workers_count', label: 'عدد العاملات', type: 'number', required: false, enabled: true, system: true },
  { key: 'clothes_type', label: 'نوع الملابس', type: 'text', required: false, enabled: true, system: true },
  { key: 'clothes_color', label: 'لون الملابس', type: 'text', required: false, enabled: true, system: true },
  { key: 'notes', label: 'ملاحظات', type: 'text', required: false, enabled: true, system: true },
];

// numeric/count fields that bind to dedicated booking columns
export const SYSTEM_FIELD_KEYS = DEFAULT_FIELD_CONFIG.map((f) => f.key);

export const BOOKING_STATUS = {
  active: 'مؤكد',
  pending: 'انتظار',
  cancelled: 'ملغي',
  rejected: 'مرفوض',
};
