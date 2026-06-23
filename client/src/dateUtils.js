// Hijri (Umm al-Qura) <-> Gregorian helpers, all using English (Latin) digits.
const pad = (n) => String(n).padStart(2, '0');

export const GREG_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const HIJRI_MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];

const hfmt = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura-nu-latn', {
  year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
});

// {y,m,d} (m is 1-based) for the Hijri calendar
export function hijriParts(date) {
  const o = {};
  for (const p of hfmt.formatToParts(date)) {
    if (p.type === 'year') o.y = +p.value;
    if (p.type === 'month') o.m = +p.value;
    if (p.type === 'day') o.d = +p.value;
  }
  return o;
}

const utcNoon = (y, m, d) => new Date(Date.UTC(y, m, d, 12));
const isoOfUTC = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const isoFromGreg = (y, m /* 0-based */, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const gregMonthLength = (y, m) => new Date(y, m + 1, 0).getDate();

// today's Hijri year (number)
export function currentHijriYear() {
  const n = new Date();
  return hijriParts(utcNoon(n.getFullYear(), n.getMonth(), n.getDate())).y;
}

// Hijri (hy, hm 1-based, hd) -> Gregorian ISO 'YYYY-MM-DD'
export function hijriToISO(hy, hm, hd) {
  const n = new Date();
  const base = utcNoon(n.getFullYear(), n.getMonth(), n.getDate());
  const tp = hijriParts(base);
  const approxMonths = (hy - tp.y) * 12 + (hm - tp.m);
  let guess = new Date(base.getTime() + Math.round(approxMonths * 29.53059) * 86400000 + (hd - tp.d) * 86400000);
  for (let i = 0; i < 90; i++) {
    const p = hijriParts(guess);
    if (p.y === hy && p.m === hm && p.d === hd) break;
    const cmp = (p.y - hy) || (p.m - hm) || (p.d - hd);
    guess = new Date(guess.getTime() - Math.sign(cmp) * 86400000);
  }
  return isoOfUTC(guess);
}

// number of days (29/30) in a Hijri month
export function hijriMonthLength(hy, hm /* 1-based */) {
  let ny = hy, nm = hm + 1;
  if (nm > 12) { nm = 1; ny++; }
  const a = new Date(hijriToISO(hy, hm, 1) + 'T00:00:00Z');
  const b = new Date(hijriToISO(ny, nm, 1) + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}
