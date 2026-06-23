export const EVENT_TYPES = ['زواج', 'زواره', 'استقبال', 'عزيمة', 'ولادة', 'عزاء', 'تخرج', 'خطوبة'];
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
  new Intl.NumberFormat('ar-SA-u-nu-latn', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(n || 0);

export const fmtDate = (d) => {
  if (!d) return '';
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(d + 'T00:00:00')
  );
};

// weekday + full date (Gregorian), Latin digits
export const fmtFull = (d) => {
  const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

// Hijri (Umm al-Qura) formatting
export const fmtHijri = (d) => {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};
export const hijriDay = (date) =>
  new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric' }).format(date);
export const hijriMonthYear = (date) =>
  new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { month: 'long', year: 'numeric' }).format(date);

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
