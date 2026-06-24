import 'package:flutter/material.dart';
import '../theme.dart';
import '../constants.dart';
import '../models.dart';
import '../firestore_service.dart';

class BookingFormScreen extends StatefulWidget {
  final BookingModel? initial;
  final DateTime? initialDate;
  const BookingFormScreen({super.key, this.initial, this.initialDate});

  @override
  State<BookingFormScreen> createState() => _BookingFormScreenState();
}

class _BookingFormScreenState extends State<BookingFormScreen> {
  late final _clientName = TextEditingController(text: widget.initial?.clientName ?? '');
  late final _clientPhone = TextEditingController(text: widget.initial?.clientPhone ?? '');
  late final _city = TextEditingController(text: widget.initial?.city ?? '');
  late final _materialColor = TextEditingController(text: widget.initial?.materialColor ?? '');
  late final _clothesType = TextEditingController(text: widget.initial?.clothesType ?? '');
  late final _clothesColor = TextEditingController(text: widget.initial?.clothesColor ?? '');
  late final _guests = TextEditingController(text: _numStr(widget.initial?.guests));
  late final _sabbabat = TextEditingController(text: _numStr(widget.initial?.sabbabatCount));
  late final _workers = TextEditingController(text: _numStr(widget.initial?.workersCount));
  late final _amount = TextEditingController(text: _numStr(widget.initial?.amount));
  late final _discount = TextEditingController(text: _numStr(widget.initial?.discount));
  late final _paid = TextEditingController(text: _numStr(widget.initial?.paidAmount));
  late final _time = TextEditingController(text: widget.initial?.eventTime ?? '');
  late final _notes = TextEditingController(text: widget.initial?.notes ?? '');

  late DateTime? _date = widget.initial != null && widget.initial!.date.isNotEmpty
      ? parseIso(widget.initial!.date)
      : widget.initialDate;
  late String _eventType = widget.initial?.eventType.isNotEmpty == true ? widget.initial!.eventType : eventTypes.first;
  late String _locationType = widget.initial?.locationType.isNotEmpty == true ? widget.initial!.locationType : locationTypes.first;
  late String _materialType = widget.initial?.materialType.isNotEmpty == true ? widget.initial!.materialType : materialTypes.first;
  late String _paymentStatus = widget.initial?.paymentStatus ?? 'unpaid';
  bool _saving = false;
  String? _error;

  static String _numStr(num? v) => (v == null || v == 0) ? '' : v.toString();

  Future<void> _pickDate() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _date ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
    );
    if (d != null) setState(() => _date = d);
  }

  Future<void> _save() async {
    if (_clientName.text.trim().isEmpty) {
      setState(() => _error = 'اسم العميل مطلوب');
      return;
    }
    if (_date == null) {
      setState(() => _error = 'تاريخ الحجز مطلوب');
      return;
    }
    setState(() { _saving = true; _error = null; });
    final init = widget.initial;
    // waiting-list: new bookings on a full day become 'pending'
    bool overflow = false;
    String newStatus = 'active';
    if (init == null) {
      try {
        final s = await Db.settingsOnce();
        final max = s.maxForDate(iso(_date!));
        if (max != -1) {
          final dayB = await Db.bookingsOnDate(iso(_date!));
          final confirmed = dayB.where((x) => x.status == 'active').length;
          if (confirmed >= max) { newStatus = 'pending'; overflow = true; }
        }
      } catch (_) {}
    }
    final model = BookingModel(
      id: init?.id ?? '',
      clientId: init?.clientId ?? '',
      clientName: _clientName.text.trim(),
      clientPhone: _clientPhone.text.trim(),
      date: iso(_date!),
      eventTime: _time.text.trim(),
      eventType: _eventType,
      city: _city.text.trim(),
      locationType: _locationType,
      guests: int.tryParse(_guests.text.trim()) ?? 0,
      materialType: _materialType,
      materialColor: _materialColor.text.trim(),
      sabbabatCount: int.tryParse(_sabbabat.text.trim()) ?? 0,
      workersCount: int.tryParse(_workers.text.trim()) ?? 0,
      clothesType: _clothesType.text.trim(),
      clothesColor: _clothesColor.text.trim(),
      amount: num.tryParse(_amount.text.trim()) ?? 0,
      discount: num.tryParse(_discount.text.trim()) ?? 0,
      paidAmount: num.tryParse(_paid.text.trim()) ?? 0,
      paymentStatus: _paymentStatus,
      // preserve workflow fields on edit
      status: init?.status ?? newStatus,
      tipsAmount: init?.tipsAmount ?? 0,
      tipsDistributed: init?.tipsDistributed ?? false,
      paymentCompleted: init?.paymentCompleted ?? false,
      closed: init?.closed ?? false,
      notes: _notes.text.trim(),
      staff: init?.staff ?? const [],
    );
    try {
      if (init == null) {
        await Db.addBooking(model);
      } else {
        await Db.updateBooking(init.id, model.toMap());
      }
      if (!mounted) return;
      if (overflow) {
        await showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('قائمة الانتظار'),
            content: const Text('تم بلوغ الحد الأقصى للحجوزات في هذا اليوم. أُضيف الحجز إلى قائمة الانتظار بانتظار التأكيد.'),
            actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('حسناً'))],
          ),
        );
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      setState(() { _saving = false; _error = 'تعذّر الحفظ: $e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.brandDark,
        foregroundColor: Colors.white,
        title: Text(widget.initial == null ? 'إضافة حجز جديد' : 'تعديل الحجز'),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_error!, style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.bold)),
                  ),
                _section('بيانات العميل'),
                _field('رقم الجوال', _clientPhone, ltr: true, keyboard: TextInputType.phone),
                _field('اسم العميل *', _clientName),
                _section('بيانات الطلب'),
                _dateField(),
                _field('وقت المناسبة', _time, ltr: true),
                _dropdown('نوع المناسبة', _eventType, eventTypes, (v) => setState(() => _eventType = v)),
                _field('المدينة', _city),
                _dropdown('نوع الموقع', _locationType, locationTypes, (v) => setState(() => _locationType = v)),
                _field('عدد المعازيم', _guests, ltr: true, keyboard: TextInputType.number),
                _dropdown('نوع المعاميل', _materialType, materialTypes, (v) => setState(() => _materialType = v)),
                _field('لون المعاميل', _materialColor),
                _field('عدد الصبابات', _sabbabat, ltr: true, keyboard: TextInputType.number),
                _field('عدد العاملات', _workers, ltr: true, keyboard: TextInputType.number),
                _field('نوع الملابس', _clothesType),
                _field('لون الملابس', _clothesColor),
                _section('المبلغ والدفع'),
                _field('المبلغ (ر.س)', _amount, ltr: true, keyboard: TextInputType.number),
                _field('الخصم (ر.س)', _discount, ltr: true, keyboard: TextInputType.number),
                _dropdownMap('حالة الدفع', _paymentStatus, paymentStatusLabels, (v) => setState(() => _paymentStatus = v)),
                if (_paymentStatus != 'unpaid')
                  _field('المبلغ المدفوع (ر.س)', _paid, ltr: true, keyboard: TextInputType.number),
                _field('ملاحظات', _notes, maxLines: 2),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('حفظ'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _section(String t) => Padding(
        padding: const EdgeInsets.only(top: 14, bottom: 6),
        child: Text(t, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.brand, fontSize: 16)),
      );

  Widget _field(String label, TextEditingController c, {bool ltr = false, TextInputType? keyboard, int maxLines = 1}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: TextField(
          controller: c,
          textDirection: ltr ? TextDirection.ltr : null,
          keyboardType: keyboard,
          maxLines: maxLines,
          decoration: InputDecoration(labelText: label),
        ),
      );

  Widget _dropdown(String label, String value, List<String> opts, ValueChanged<String> onCh) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: DropdownButtonFormField<String>(
          initialValue: opts.contains(value) ? value : opts.first,
          decoration: InputDecoration(labelText: label),
          items: [for (final o in opts) DropdownMenuItem(value: o, child: Text(o))],
          onChanged: (v) => onCh(v ?? opts.first),
        ),
      );

  Widget _dropdownMap(String label, String value, Map<String, String> opts, ValueChanged<String> onCh) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: DropdownButtonFormField<String>(
          initialValue: value,
          decoration: InputDecoration(labelText: label),
          items: [for (final e in opts.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
          onChanged: (v) => onCh(v ?? 'unpaid'),
        ),
      );

  Widget _dateField() => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: InkWell(
          onTap: _pickDate,
          child: InputDecorator(
            decoration: const InputDecoration(labelText: 'تاريخ الحجز *', suffixIcon: Icon(Icons.calendar_today, size: 18)),
            child: _date == null
                ? const Text('اختر التاريخ', style: TextStyle(color: Colors.black45))
                : Row(children: [
                    Text(gregLabel(_date!), style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.maroon)),
                    const SizedBox(width: 8),
                    Text(hijriLabel(_date!), style: const TextStyle(color: AppColors.emerald, fontSize: 12)),
                  ]),
          ),
        ),
      );
}
