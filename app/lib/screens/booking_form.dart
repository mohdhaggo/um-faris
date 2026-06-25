import 'dart:async';
import 'package:flutter/material.dart';
import '../theme.dart';
import '../constants.dart';
import '../models.dart';
import '../firestore_service.dart';
import '../widgets/um_date_picker.dart';

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
  late final _amount = TextEditingController(text: _numStr(widget.initial?.amount));
  late final _discount = TextEditingController(text: _numStr(widget.initial?.discount));
  late final _paid = TextEditingController(text: _numStr(widget.initial?.paidAmount));

  late DateTime? _date = widget.initial != null && widget.initial!.date.isNotEmpty
      ? parseIso(widget.initial!.date)
      : widget.initialDate;
  late String _paymentStatus = widget.initial?.paymentStatus ?? 'unpaid';

  List<FieldDef>? _fields;
  final _textCtrls = <String, TextEditingController>{};
  final _selectVals = <String, String>{};
  bool _saving = false;
  String? _error;

  // Phone lookup state
  Timer? _phoneDebounce;
  bool _lookingUp = false;
  ClientModel? _foundClient;   // non-null = existing customer
  bool _phoneChecked = false;  // true after first lookup completes
  bool _nameReadOnly = false;  // lock name if existing customer

  static String _numStr(num? v) => (v == null || v == 0) ? '' : v.toString();

  @override
  void initState() {
    super.initState();
    Db.settingsOnce().then((s) {
      final init = widget.initial;
      setState(() {
        _fields = s.fieldConfig;
        for (final f in s.fieldConfig.where((f) => f.enabled)) {
          if (f.type == 'select') {
            final v = _initialFor(init, f);
            _selectVals[f.key] = f.options.contains(v) ? v : '';
          } else {
            _textCtrls[f.key] = TextEditingController(text: _initialFor(init, f));
          }
        }
      });
    });

    // If editing an existing booking pre-populate as already verified
    if (widget.initial != null && widget.initial!.clientPhone.isNotEmpty) {
      _phoneChecked = true;
    }

    _clientPhone.addListener(_onPhoneChanged);
  }

  void _onPhoneChanged() {
    final phone = _clientPhone.text.trim();
    _phoneDebounce?.cancel();
    if (phone.length < 9) {
      setState(() { _foundClient = null; _phoneChecked = false; _nameReadOnly = false; });
      return;
    }
    setState(() => _lookingUp = true);
    _phoneDebounce = Timer(const Duration(milliseconds: 600), () => _lookupPhone(phone));
  }

  Future<void> _lookupPhone(String phone) async {
    try {
      final client = await Db.findClientByPhone(phone);
      if (!mounted) return;
      setState(() {
        _lookingUp = false;
        _phoneChecked = true;
        _foundClient = client;
        if (client != null) {
          _clientName.text = client.name;
          _nameReadOnly = true;
        } else {
          _nameReadOnly = false;
        }
      });
    } catch (_) {
      if (mounted) setState(() { _lookingUp = false; _phoneChecked = true; });
    }
  }

  @override
  void dispose() {
    _phoneDebounce?.cancel();
    _clientPhone.removeListener(_onPhoneChanged);
    super.dispose();
  }

  String _initialFor(BookingModel? b, FieldDef f) {
    if (b == null) return '';
    if (!f.system) return b.customFields[f.key]?.toString() ?? '';
    switch (f.key) {
      case 'eventTime': return b.eventTime;
      case 'eventType': return b.eventType;
      case 'city': return b.city;
      case 'locationType': return b.locationType;
      case 'guests': return b.guests == 0 ? '' : '${b.guests}';
      case 'materialType': return b.materialType;
      case 'materialColor': return b.materialColor;
      case 'sabbabatCount': return b.sabbabatCount == 0 ? '' : '${b.sabbabatCount}';
      case 'workersCount': return b.workersCount == 0 ? '' : '${b.workersCount}';
      case 'clothesType': return b.clothesType;
      case 'clothesColor': return b.clothesColor;
      case 'notes': return b.notes;
      default: return '';
    }
  }

  String _val(FieldDef f) {
    if (f.enabled) {
      if (f.type == 'select') return _selectVals[f.key] ?? '';
      return _textCtrls[f.key]?.text.trim() ?? '';
    }
    return _initialFor(widget.initial, f);
  }

  String _colVal(String key) {
    final list = _fields ?? const <FieldDef>[];
    for (final f in list) {
      if (f.key == key) return _val(f);
    }
    return _initialFor(widget.initial, FieldDef(key: key, label: '', type: 'text', system: true));
  }

  Future<void> _pickDate() async {
    final d = await pickUmDate(context, initial: _date ?? DateTime.now());
    if (d != null) setState(() => _date = d);
  }

  Future<void> _save() async {
    final phone = _clientPhone.text.trim();
    if (phone.isEmpty) { setState(() => _error = 'رقم الجوال مطلوب'); return; }
    if (_clientName.text.trim().isEmpty) { setState(() => _error = 'اسم العميل مطلوب'); return; }
    if (_date == null) { setState(() => _error = 'تاريخ الحجز مطلوب'); return; }
    for (final f in (_fields ?? []).where((f) => f.enabled && f.required)) {
      if (_val(f).isEmpty) { setState(() => _error = 'الحقل "${f.label}" مطلوب'); return; }
    }
    setState(() { _saving = true; _error = null; });
    final init = widget.initial;

    bool overflow = false;
    String newStatus = 'active';
    if (init == null) {
      try {
        final s = await Db.settingsOnce();
        final max = s.maxForDate(iso(_date!));
        if (max != -1) {
          final dayB = await Db.bookingsOnDate(iso(_date!));
          if (dayB.where((x) => x.status == 'active').length >= max) { newStatus = 'pending'; overflow = true; }
        }
      } catch (_) {}
    }

    // Ensure client exists (creates if new)
    String clientId = init?.clientId ?? '';
    try {
      clientId = await Db.ensureClientByPhone(_clientName.text.trim(), phone);
    } catch (_) {}

    final custom = <String, dynamic>{};
    for (final f in (_fields ?? []).where((f) => !f.system)) {
      final v = _val(f);
      custom[f.key] = f.type == 'number' ? (num.tryParse(v) ?? 0) : v;
    }

    final model = BookingModel(
      id: init?.id ?? '',
      clientId: clientId,
      clientName: _clientName.text.trim(),
      clientPhone: phone,
      date: iso(_date!),
      eventTime: _colVal('eventTime'),
      eventType: _colVal('eventType'),
      city: _colVal('city'),
      locationType: _colVal('locationType'),
      guests: int.tryParse(_colVal('guests')) ?? 0,
      materialType: _colVal('materialType'),
      materialColor: _colVal('materialColor'),
      sabbabatCount: int.tryParse(_colVal('sabbabatCount')) ?? 0,
      workersCount: int.tryParse(_colVal('workersCount')) ?? 0,
      clothesType: _colVal('clothesType'),
      clothesColor: _colVal('clothesColor'),
      notes: _colVal('notes'),
      amount: num.tryParse(_amount.text.trim()) ?? 0,
      discount: num.tryParse(_discount.text.trim()) ?? 0,
      paidAmount: num.tryParse(_paid.text.trim()) ?? 0,
      paymentStatus: _paymentStatus,
      status: init?.status ?? newStatus,
      tipsAmount: init?.tipsAmount ?? 0,
      tipsDistributed: init?.tipsDistributed ?? false,
      paymentCompleted: init?.paymentCompleted ?? false,
      closed: init?.closed ?? false,
      staff: init?.staff ?? const [],
      customFields: custom,
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
      body: _fields == null
          ? const Center(child: CircularProgressIndicator(color: AppColors.brand))
          : SafeArea(
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
                      _phoneField(),
                      _clientStatusBadge(),
                      _nameField(),
                      _section('بيانات الطلب'),
                      _dateField(),
                      for (final f in _fields!.where((f) => f.enabled)) _dynField(f),
                      _section('المبلغ والدفع'),
                      _box(TextField(
                        controller: _amount,
                        textDirection: TextDirection.ltr,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'المبلغ (ر.س)'),
                      )),
                      _box(TextField(
                        controller: _discount,
                        textDirection: TextDirection.ltr,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'الخصم (ر.س)'),
                      )),
                      _box(DropdownButtonFormField<String>(
                        initialValue: _paymentStatus,
                        decoration: const InputDecoration(labelText: 'حالة الدفع'),
                        items: [for (final e in paymentStatusLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                        onChanged: (v) => setState(() => _paymentStatus = v ?? 'unpaid'),
                      )),
                      if (_paymentStatus != 'unpaid')
                        _box(TextField(
                          controller: _paid,
                          textDirection: TextDirection.ltr,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(labelText: 'المبلغ المدفوع (ر.س)'),
                        )),
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

  // --- Phone field with spinner suffix ---
  Widget _phoneField() => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: TextField(
          controller: _clientPhone,
          textDirection: TextDirection.ltr,
          keyboardType: TextInputType.phone,
          decoration: InputDecoration(
            labelText: 'رقم الجوال *',
            suffixIcon: _lookingUp
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.brand)),
                  )
                : _phoneChecked
                    ? Icon(_foundClient != null ? Icons.check_circle : Icons.person_add_alt_1,
                        color: _foundClient != null ? AppColors.emerald : AppColors.brand, size: 22)
                    : null,
          ),
        ),
      );

  // --- Chip showing "existing customer" or "new customer" ---
  Widget _clientStatusBadge() {
    if (!_phoneChecked || _lookingUp) return const SizedBox.shrink();
    if (_foundClient != null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.emerald.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.emerald, width: 1),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.check_circle_outline, color: AppColors.emerald, size: 15),
              const SizedBox(width: 4),
              Text('عميل مسجّل', style: const TextStyle(color: AppColors.emerald, fontWeight: FontWeight.w700, fontSize: 12)),
            ]),
          ),
        ]),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.brand.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.brand, width: 1),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.person_add_alt_1, color: AppColors.brand, size: 15),
            const SizedBox(width: 4),
            const Text('عميل جديد', style: TextStyle(color: AppColors.brand, fontWeight: FontWeight.w700, fontSize: 12)),
          ]),
        ),
      ]),
    );
  }

  // --- Name field: read-only (auto-filled) for existing, editable for new ---
  Widget _nameField() => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: TextField(
          controller: _clientName,
          readOnly: _nameReadOnly,
          style: _nameReadOnly ? const TextStyle(color: AppColors.ink) : null,
          decoration: InputDecoration(
            labelText: 'اسم العميل *',
            filled: _nameReadOnly,
            fillColor: _nameReadOnly ? const Color(0xFFF0EDE8) : null,
            suffixIcon: _nameReadOnly
                ? const Tooltip(
                    message: 'الاسم مسحوب من سجل العميل',
                    child: Icon(Icons.lock_outline, size: 16, color: Colors.black38),
                  )
                : null,
          ),
        ),
      );

  Widget _dynField(FieldDef f) {
    final label = f.label + (f.required ? ' *' : '');
    if (f.type == 'select') {
      final val = _selectVals[f.key] ?? '';
      return _box(DropdownButtonFormField<String>(
        initialValue: val.isEmpty ? null : val,
        decoration: InputDecoration(labelText: label),
        items: [for (final o in f.options) DropdownMenuItem(value: o, child: Text(o))],
        onChanged: (v) => setState(() => _selectVals[f.key] = v ?? ''),
      ));
    }
    return _box(TextField(
      controller: _textCtrls[f.key],
      textDirection: f.type == 'number' ? TextDirection.ltr : null,
      keyboardType: f.type == 'number' ? TextInputType.number : null,
      decoration: InputDecoration(labelText: label),
    ));
  }

  Widget _section(String t) => Padding(
        padding: const EdgeInsets.only(top: 14, bottom: 6),
        child: Text(t, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.brand, fontSize: 16)),
      );

  Widget _box(Widget child) => Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: child);

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
