import 'package:flutter/material.dart';
import '../theme.dart';
import '../constants.dart';
import '../models.dart';
import '../firestore_service.dart';
import '../widgets/um_date_picker.dart';
import 'booking_form.dart';
import 'booking_details.dart';

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  String _view = 'month';
  String _calType = 'greg';
  DateTime _cursor = DateTime.now();
  String? _selected; // iso of a specifically-picked date (highlighted)

  List<DateTime> get _days => _view == 'month' ? monthGrid(_cursor) : weekGrid(_cursor);

  void _move(int dir) {
    setState(() {
      _cursor = _view == 'week'
          ? _cursor.add(Duration(days: 7 * dir))
          : DateTime(_cursor.year, _cursor.month + dir, 1);
    });
  }

  Future<void> _newBooking({DateTime? date}) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => BookingFormScreen(initialDate: date)));

  Future<void> _pickSpecificDate() async {
    final d = await pickUmDate(context, initial: _cursor);
    if (d == null || !mounted) return;
    setState(() { _cursor = d; _selected = iso(d); });
    final list = (await Db.bookingsOnDate(iso(d))).where((b) => b.status == 'active').toList();
    if (mounted) _openDay(d, list);
  }

  @override
  Widget build(BuildContext context) {
    final days = _days;
    final from = iso(days.first);
    final to = iso(days.last);
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(children: [
            _header(),
            const SizedBox(height: 10),
            _controls(),
            const SizedBox(height: 8),
            _weekdayHeader(),
            Expanded(
              child: StreamBuilder<List<BookingModel>>(
                stream: Db.bookingsInRange(from, to),
                builder: (context, snap) {
                  final byDate = <String, List<BookingModel>>{};
                  for (final b in (snap.data ?? [])) {
                    if (b.status == 'active') (byDate[b.date] ??= []).add(b);
                  }
                  return _grid(days, byDate);
                },
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _header() => Row(children: [
        const Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('الرئيسية', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            Text('تقويم الحجوزات', style: TextStyle(color: Colors.black54, fontSize: 13)),
          ]),
        ),
        FilledButton.icon(
          onPressed: () => _newBooking(),
          icon: const Icon(Icons.add),
          label: const Text('إضافة حجز جديد'),
        ),
      ]);

  Widget _controls() {
    final periodGreg = _view == 'month' ? monthYearLabel(_cursor) : '${gregLabel(_days.first)} — ${gregLabel(_days.last)}';
    final periodHijri = _view == 'month' ? hijriMonthYearLabel(_cursor) : hijriLabel(_days.first);
    final today = DateTime.now();
    return Wrap(
      alignment: WrapAlignment.spaceBetween,
      crossAxisAlignment: WrapCrossAlignment.center,
      runSpacing: 8,
      spacing: 8,
      children: [
        Row(mainAxisSize: MainAxisSize.min, children: [
          IconButton(onPressed: () => _move(-1), icon: const Icon(Icons.chevron_left), tooltip: 'السابق'),
          Column(children: [
            Text(periodGreg, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.maroon)),
            Text(periodHijri, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.emerald)),
          ]),
          IconButton(onPressed: () => _move(1), icon: const Icon(Icons.chevron_right), tooltip: 'التالي'),
          const SizedBox(width: 4),
          OutlinedButton(onPressed: () => setState(() { _cursor = DateTime.now(); _selected = null; }), child: const Text('اليوم')),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(gregLabel(today), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.maroon)),
            Text(hijriLabel(today), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.emerald)),
          ]),
        ]),
        Row(mainAxisSize: MainAxisSize.min, children: [
          OutlinedButton.icon(onPressed: _pickSpecificDate, icon: const Icon(Icons.event, size: 18), label: const Text('اختيار التاريخ')),
          const SizedBox(width: 8),
          _toggle(['greg', 'hijri'], const ['ميلادي', 'هجري'], _calType, (v) => setState(() => _calType = v)),
          const SizedBox(width: 8),
          _toggle(['week', 'month'], const ['أسبوع', 'شهر'], _view, (v) => setState(() => _view = v)),
        ]),
      ],
    );
  }

  Widget _toggle(List<String> values, List<String> labels, String current, ValueChanged<String> onCh) {
    return Container(
      decoration: BoxDecoration(border: Border.all(color: const Color(0xFFD6D3CE)), borderRadius: BorderRadius.circular(10)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        for (int i = 0; i < values.length; i++)
          GestureDetector(
            onTap: () => onCh(values[i]),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: current == values[i] ? (values[i] == 'hijri' ? AppColors.emerald : AppColors.brand) : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(labels[i], style: TextStyle(fontWeight: FontWeight.bold, color: current == values[i] ? Colors.white : Colors.black54)),
            ),
          ),
      ]),
    );
  }

  Widget _weekdayHeader() => Row(children: [
        for (final w in weekdaysAr)
          Expanded(child: Center(child: Text(w, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: Colors.black54)))),
      ]);

  Widget _grid(List<DateTime> days, Map<String, List<BookingModel>> byDate) {
    final weeks = <List<DateTime>>[];
    for (int i = 0; i < days.length; i += 7) {
      weeks.add(days.sublist(i, i + 7));
    }
    return Column(children: [
      for (final week in weeks)
        Expanded(child: Row(children: [for (final d in week) Expanded(child: _cell(d, byDate[iso(d)] ?? const []))])),
    ]);
  }

  Widget _cell(DateTime d, List<BookingModel> list) {
    final otherMonth = _view == 'month' && d.month != _cursor.month;
    final isToday = iso(d) == iso(DateTime.now());
    final isSelected = iso(d) == _selected;
    final primary = _calType == 'hijri' ? hijriDayNum(d) : '${d.day}';
    final secondary = _calType == 'hijri' ? '${d.day}' : hijriDayNum(d);
    final primaryColor = _calType == 'hijri' ? AppColors.emerald : AppColors.maroon;
    final secondaryColor = _calType == 'hijri' ? AppColors.maroon : AppColors.emerald;
    return GestureDetector(
      onTap: () { setState(() => _selected = iso(d)); _openDay(d, list); },
      child: Container(
        margin: const EdgeInsets.all(3),
        padding: const EdgeInsets.all(5),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFFFBEEF2) : (otherMonth ? const Color(0xFFF0EEEA) : Colors.white),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? AppColors.maroon : (isToday ? AppColors.brand : const Color(0xFFE7E3DC)),
            width: (isSelected || isToday) ? 2 : 1,
          ),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Row(children: [
              Text(primary, style: TextStyle(fontWeight: FontWeight.w800, color: primaryColor)),
              const SizedBox(width: 3),
              Text(secondary, style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: secondaryColor)),
            ]),
            if (list.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(color: const Color(0xFFF4E9D2), borderRadius: BorderRadius.circular(20)),
                child: Text('${list.length}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppColors.brandDark)),
              ),
          ]),
          const SizedBox(height: 2),
          Expanded(
            child: ListView(padding: EdgeInsets.zero, physics: const NeverScrollableScrollPhysics(), children: [
              for (final b in list.take(3))
                Container(
                  margin: const EdgeInsets.only(bottom: 2),
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: BoxDecoration(color: const Color(0xFFFBF7EF), borderRadius: BorderRadius.circular(4)),
                  child: Text(b.clientName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10, color: AppColors.brandDark, fontWeight: FontWeight.bold)),
                ),
              if (list.length > 3) Text('+${list.length - 3} المزيد', style: const TextStyle(fontSize: 9, color: Colors.black45)),
            ]),
          ),
        ]),
      ),
    );
  }

  // centered dialog (old design) instead of a bottom sheet
  void _openDay(DateTime d, List<BookingModel> list) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('حجوزات ${dayTitle(d)}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
        contentPadding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
        content: SizedBox(
          width: 420,
          child: list.isEmpty
              ? Column(mainAxisSize: MainAxisSize.min, children: [
                  const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('لا توجد حجوزات في هذا اليوم', style: TextStyle(color: Colors.black45))),
                ])
              : ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 420),
                  child: ListView(shrinkWrap: true, children: [for (final b in list) _dayCard(ctx, b)]),
                ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إغلاق')),
          FilledButton.icon(
            onPressed: () { Navigator.pop(ctx); _newBooking(date: d); },
            icon: const Icon(Icons.add, size: 18),
            label: const Text('إضافة حجز'),
          ),
        ],
      ),
    );
  }

  Widget _dayCard(BuildContext ctx, BookingModel b) => Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: ListTile(
          title: Text(b.clientName, style: const TextStyle(fontWeight: FontWeight.w800)),
          subtitle: Text('${b.eventType}${b.eventTime.isNotEmpty ? ' · ${b.eventTime}' : ''} · ${sar(b.netTotal)}'),
          trailing: const Icon(Icons.chevron_left),
          onTap: () { Navigator.pop(ctx); Navigator.push(context, MaterialPageRoute(builder: (_) => BookingDetailsScreen(bookingId: b.id))); },
        ),
      );
}
