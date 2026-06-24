import 'package:flutter/material.dart';
import 'package:hijri/hijri_calendar.dart';
import '../theme.dart';
import '../constants.dart';

/// Tabbed date picker: نوع التقويم (ميلادي/هجري) → السنة → الشهر → اليوم.
/// Returns a Gregorian [DateTime] (converted from Hijri when needed).
Future<DateTime?> pickUmDate(BuildContext context, {DateTime? initial}) {
  return showDialog<DateTime>(
    context: context,
    builder: (_) => _UmDatePickerDialog(initial: initial ?? DateTime.now()),
  );
}

class _UmDatePickerDialog extends StatefulWidget {
  final DateTime initial;
  const _UmDatePickerDialog({required this.initial});
  @override
  State<_UmDatePickerDialog> createState() => _UmDatePickerDialogState();
}

class _UmDatePickerDialogState extends State<_UmDatePickerDialog> {
  String _type = 'greg';
  String _step = 'type';
  late int _yearBase = widget.initial.year - 5;
  int? _year;
  int? _month; // 1-based

  void _chooseType(String t) {
    final center = t == 'greg' ? widget.initial.year : HijriCalendar.fromDate(widget.initial).hYear;
    setState(() {
      _type = t;
      _yearBase = center - 5;
      _step = 'year';
    });
  }

  void _pickDay(int day) {
    final date = _type == 'greg'
        ? DateTime(_year!, _month!, day)
        : HijriCalendar().hijriToGregorian(_year!, _month!, day);
    Navigator.pop(context, DateTime(date.year, date.month, date.day));
  }

  @override
  Widget build(BuildContext context) {
    final months = _type == 'greg' ? gregMonthsAr : hijriMonthsAr;
    return AlertDialog(
      contentPadding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      title: const Text('اختيار التاريخ', style: TextStyle(fontSize: 16)),
      content: SizedBox(
        width: 320,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          _breadcrumb(months),
          const SizedBox(height: 12),
          if (_step == 'type') _typeStep(),
          if (_step == 'year') _yearStep(),
          if (_step == 'month') _monthStep(months),
          if (_step == 'day') _dayStep(),
        ]),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('إلغاء'))],
    );
  }

  Widget _breadcrumb(List<String> months) {
    Widget chip(String label, bool active, VoidCallback onTap) => InkWell(
          onTap: onTap,
          child: Container(
            margin: const EdgeInsets.only(left: 6),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: active ? AppColors.brand : const Color(0xFFEEEAE3),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(label, style: TextStyle(color: active ? Colors.white : Colors.black54, fontWeight: FontWeight.bold, fontSize: 12)),
          ),
        );
    return Row(children: [
      chip(_type == 'greg' ? 'ميلادي' : 'هجري', _step == 'type', () => setState(() => _step = 'type')),
      if (_year != null) chip('$_year', _step == 'year', () => setState(() => _step = 'year')),
      if (_month != null) chip(months[_month! - 1], _step == 'month', () => setState(() => _step = 'month')),
    ]);
  }

  Widget _typeStep() => Row(children: [
        Expanded(child: _bigBtn('ميلادي', _type == 'greg', AppColors.maroon, () => _chooseType('greg'))),
        const SizedBox(width: 8),
        Expanded(child: _bigBtn('هجري', _type == 'hijri', AppColors.emerald, () => _chooseType('hijri'))),
      ]);

  Widget _bigBtn(String label, bool active, Color color, VoidCallback onTap) => InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? color : Colors.transparent,
            border: Border.all(color: active ? color : const Color(0xFFD6D3CE)),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(label, style: TextStyle(color: active ? Colors.white : Colors.black87, fontWeight: FontWeight.w800)),
        ),
      );

  Widget _yearStep() {
    final years = List.generate(12, (i) => _yearBase + i);
    return Column(children: [
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        IconButton(onPressed: () => setState(() => _yearBase -= 12), icon: const Icon(Icons.chevron_right)),
        Text('السنة (${_type == 'greg' ? 'ميلادي' : 'هجري'})', style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.black54)),
        IconButton(onPressed: () => setState(() => _yearBase += 12), icon: const Icon(Icons.chevron_left)),
      ]),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final y in years)
          _cell('$y', y == _year, () => setState(() { _year = y; _step = 'month'; }), w: 84),
      ]),
    ]);
  }

  Widget _monthStep(List<String> months) => Wrap(spacing: 8, runSpacing: 8, children: [
        for (int i = 0; i < 12; i++)
          _cell(months[i], _month == i + 1, () => setState(() { _month = i + 1; _step = 'day'; }), w: 88),
      ]);

  Widget _dayStep() {
    final count = _type == 'greg' ? daysInGregMonth(_year!, _month!) : HijriCalendar().getDaysInMonth(_year!, _month!);
    return Wrap(spacing: 6, runSpacing: 6, children: [
      for (int d = 1; d <= count; d++) _cell('$d', false, () => _pickDay(d), w: 38),
    ]);
  }

  Widget _cell(String label, bool active, VoidCallback onTap, {required double w}) => InkWell(
        onTap: onTap,
        child: Container(
          width: w,
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? AppColors.brand : Colors.transparent,
            border: Border.all(color: const Color(0xFFD6D3CE)),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(label, style: TextStyle(color: active ? Colors.white : Colors.black87, fontWeight: FontWeight.bold, fontSize: 13)),
        ),
      );
}
