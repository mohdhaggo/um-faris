import 'package:hijri/hijri_calendar.dart';

// ---- domain enums (Arabic) ----
const eventTypes = ['زواج', 'زواره', 'استقبال', 'عزيمة', 'ولادة', 'عزاء', 'تخرج', 'خطوبة'];
const locationTypes = ['استراحة', 'بيت', 'مستشفى', 'قاعة', 'شالية'];
const materialTypes = ['ذهبي', 'فضي', 'شفاف', 'ملون', 'أخرى'];
const defaultJobTypes = ['صبابة', 'عاملة', 'سائق'];

const paymentStatusLabels = {
  'paid': 'مدفوع كامل',
  'deposit': 'عربون',
  'unpaid': 'لم يتم الدفع',
};

const bookingStatusLabels = {
  'active': 'مؤكد',
  'pending': 'انتظار',
  'cancelled': 'ملغي',
  'rejected': 'مرفوض',
};

const _gregMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];
const weekdaysAr = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

// ---- formatting (English/Latin digits per requirement) ----
String sar(num? v) {
  final n = (v ?? 0).round();
  final s = n.abs().toString();
  final buf = StringBuffer();
  for (int i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
    buf.write(s[i]);
  }
  return '${n < 0 ? '-' : ''}${buf.toString()} ر.س';
}

String gregLabel(DateTime d) => '${d.day} ${_gregMonths[d.month - 1]} ${d.year}';

String hijriLabel(DateTime d) {
  final h = HijriCalendar.fromDate(d);
  return '${h.hDay} ${h.longMonthName} ${h.hYear} هـ';
}

String hijriDayNum(DateTime d) => '${HijriCalendar.fromDate(d).hDay}';
String hijriMonthYearLabel(DateTime d) {
  final h = HijriCalendar.fromDate(d);
  return '${h.longMonthName} ${h.hYear} هـ';
}

String dayTitle(DateTime d) {
  final wd = weekdaysAr[(d.weekday + 1) % 7]; // Dart: Mon=1..Sun=7; Sat start
  return '$wd، ${gregLabel(d)} — ${hijriLabel(d)}';
}

String iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);
DateTime parseIso(String s) => DateTime.parse('${s}T00:00:00');

const _gregMonthsFull = _gregMonths;
String monthYearLabel(DateTime d) => '${_gregMonthsFull[d.month - 1]} ${d.year}';

/// Saturday-based week start (Gulf convention).
DateTime startOfWeekSat(DateTime d) {
  final offset = (d.weekday + 1) % 7; // Sat=0, Sun=1, ... Fri=6
  return dateOnly(d).subtract(Duration(days: offset));
}

List<DateTime> monthGrid(DateTime cursor) {
  final first = DateTime(cursor.year, cursor.month, 1);
  final start = startOfWeekSat(first);
  return List.generate(42, (i) => start.add(Duration(days: i)));
}

List<DateTime> weekGrid(DateTime cursor) {
  final start = startOfWeekSat(cursor);
  return List.generate(7, (i) => start.add(Duration(days: i)));
}
