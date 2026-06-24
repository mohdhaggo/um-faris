import 'package:flutter/material.dart';
import '../theme.dart';
import '../constants.dart';
import '../models.dart';
import '../firestore_service.dart';
import 'booking_form.dart';

String roleLabel(String role) =>
    {'صبابة': 'الصبابات', 'عاملة': 'العاملات', 'سائق': 'السائق'}[role] ?? role;

class BookingDetailsScreen extends StatelessWidget {
  final String bookingId;
  const BookingDetailsScreen({super.key, required this.bookingId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.brandDark,
        foregroundColor: Colors.white,
        title: const Text('تفاصيل الحجز'),
      ),
      body: StreamBuilder<BookingModel?>(
        stream: Db.bookingStream(bookingId),
        builder: (context, snap) {
          if (!snap.hasData) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator(color: AppColors.brand));
            }
            return const Center(child: Text('الحجز غير موجود'));
          }
          final b = snap.data!;
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Row(children: [
                    _statusChip(b.status),
                    const Spacer(),
                    if (b.status == 'pending') ...[
                      FilledButton.icon(
                        onPressed: () => Db.setBookingStatus(b.id, 'active'),
                        icon: const Icon(Icons.check, size: 18),
                        label: const Text('تأكيد'),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: () => Db.setBookingStatus(b.id, 'rejected'),
                        icon: const Icon(Icons.close, size: 18),
                        label: const Text('رفض'),
                      ),
                      const SizedBox(width: 8),
                    ],
                    OutlinedButton.icon(
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => BookingFormScreen(initial: b))),
                      icon: const Icon(Icons.edit, size: 18),
                      label: const Text('تعديل'),
                    ),
                    const SizedBox(width: 8),
                    if (b.status != 'cancelled')
                      OutlinedButton.icon(
                        onPressed: () => _cancel(context, b),
                        icon: const Icon(Icons.event_busy, size: 18),
                        label: const Text('إلغاء الموعد'),
                      ),
                    const SizedBox(width: 8),
                    IconButton(onPressed: () => _delete(context, b), icon: const Icon(Icons.delete, color: Colors.red)),
                  ]),
                  const SizedBox(height: 12),
                  _card('بيانات العميل', [
                    _row('اسم العميل', b.clientName),
                    _row('رقم الجوال', b.clientPhone.isEmpty ? '—' : b.clientPhone, ltr: true),
                  ]),
                  _card('بيانات الطلب', [
                    _row('التاريخ (ميلادي)', gregLabel(parseIso(b.date)), color: AppColors.maroon),
                    _row('التاريخ (هجري)', hijriLabel(parseIso(b.date)), color: AppColors.emerald),
                    _row('وقت المناسبة', b.eventTime.isEmpty ? '—' : b.eventTime),
                    _row('نوع المناسبة', b.eventType),
                    _row('المدينة', b.city.isEmpty ? '—' : b.city),
                    _row('نوع الموقع', b.locationType),
                    _row('عدد المعازيم', '${b.guests}'),
                    _row('المعاميل', '${b.materialType} ${b.materialColor}'),
                    _row('عدد الصبابات', '${b.sabbabatCount}'),
                    _row('عدد العاملات', '${b.workersCount}'),
                    _row('الملابس', '${b.clothesType} ${b.clothesColor}'),
                    if (b.notes.isNotEmpty) _row('ملاحظات', b.notes),
                  ]),
                  _card('المبلغ والدفع', [
                    _row('المبلغ', sar(b.amount)),
                    if (b.discount > 0) _row('الخصم', sar(b.discount)),
                    _row('الإجمالي بعد الخصم', sar(b.netTotal)),
                    _row('حالة الدفع', paymentStatusLabels[b.paymentStatus] ?? b.paymentStatus),
                    if (b.paymentStatus == 'deposit') ...[
                      _row('المدفوع', sar(b.paidAmount)),
                      _row('المتبقي', sar(b.remaining), color: Colors.red),
                    ],
                  ]),
                  if (b.customFields.isNotEmpty) _customFieldsCard(b),
                  _staffCard(context, b),
                  _closeCard(context, b),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _customFieldsCard(BookingModel b) => StreamBuilder<AppSettings>(
        stream: Db.settingsStream(),
        builder: (context, s) {
          final labels = {for (final f in (s.data?.fieldConfig ?? const <FieldDef>[])) f.key: f.label};
          final entries = b.customFields.entries.where((e) => e.value != null && '${e.value}'.trim().isNotEmpty).toList();
          if (entries.isEmpty) return const SizedBox.shrink();
          return _card('حقول إضافية', [for (final e in entries) _row(labels[e.key] ?? e.key, '${e.value}')]);
        },
      );

  // ---- staff assignment ----
  Widget _staffCard(BuildContext context, BookingModel b) {
    return StreamBuilder<AppSettings>(
      stream: Db.settingsStream(),
      builder: (context, s) {
        final roles = s.data?.jobTypes ?? AppSettings.defaults;
        return _card('الموظفون', [
          for (final role in roles) _roleRow(context, b, role),
        ]);
      },
    );
  }

  Widget _roleRow(BuildContext context, BookingModel b, String role) {
    final members = b.staffByRole(role);
    final status = b.roleStatus(role);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text('بيانات ${roleLabel(role)}', style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(width: 8),
          _staffFlag(status),
          const Spacer(),
          TextButton.icon(
            onPressed: () => _assignStaff(context, b, role),
            icon: const Icon(Icons.person_add_alt, size: 18),
            label: Text(members.isEmpty ? 'اختر' : 'تعديل'),
          ),
        ]),
        if (members.isNotEmpty)
          Wrap(spacing: 6, runSpacing: 4, children: [
            for (final m in members)
              Chip(label: Text(m.name), visualDensity: VisualDensity.compact, backgroundColor: const Color(0xFFFBF7EF)),
          ]),
        const Divider(height: 14),
      ]),
    );
  }

  void _assignStaff(BuildContext context, BookingModel b, String role) {
    showDialog(
      context: context,
      builder: (ctx) => FutureBuilder<List<List<dynamic>>>(
        future: Future.wait([Db.employeesOnce(), Db.bookingsOnDate(b.date)]),
        builder: (ctx, snap) {
          if (!snap.hasData) {
            return const AlertDialog(content: SizedBox(height: 80, child: Center(child: CircularProgressIndicator(color: AppColors.brand))));
          }
          final employees = (snap.data![0] as List<EmployeeModel>).where((e) => e.active && e.jobTypes.contains(role)).toList();
          final sameDay = snap.data![1] as List<BookingModel>;
          final busy = <String, List<String>>{};
          for (final ob in sameDay) {
            if (ob.id == b.id || (ob.status != 'active' && ob.status != 'pending')) continue;
            for (final m in ob.staff) {
              (busy[m.employeeId] ??= []).add(ob.clientName);
            }
          }
          final selected = {...b.staffByRole(role).map((m) => m.employeeId)};
          return StatefulBuilder(builder: (ctx, setState) {
            return AlertDialog(
              title: Text('اختيار ${roleLabel(role)}'),
              content: SizedBox(
                width: 380,
                child: employees.isEmpty
                    ? const Padding(padding: EdgeInsets.all(16), child: Text('لا يوجد موظفون بهذا التصنيف. أضفهم من إدارة الموظفين.'))
                    : SingleChildScrollView(
                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                          for (final e in employees)
                            CheckboxListTile(
                              dense: true,
                              value: selected.contains(e.id),
                              onChanged: (v) => setState(() => v == true ? selected.add(e.id) : selected.remove(e.id)),
                              title: Text(e.name),
                              subtitle: (busy[e.id] != null && !selected.contains(e.id))
                                  ? Text('محجوز مع: ${busy[e.id]!.join('، ')}', style: const TextStyle(color: Color(0xFFB45309), fontSize: 11))
                                  : (e.phone.isNotEmpty ? Text(e.phone, textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 11)) : null),
                            ),
                        ]),
                      ),
              ),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
                FilledButton(
                  onPressed: () async {
                    final others = b.staff.where((m) => m.role != role).toList();
                    final byId = {for (final m in b.staffByRole(role)) m.employeeId: m};
                    final picked = employees.where((e) => selected.contains(e.id)).map((e) {
                      final existing = byId[e.id];
                      return StaffMember(
                        employeeId: e.id, name: e.name, role: role,
                        paidAmount: existing?.paidAmount ?? 0, tipAmount: existing?.tipAmount ?? 0,
                      );
                    });
                    final newStaff = [...others, ...picked].map((m) => m.toMap()).toList();
                    await Db.updateBooking(b.id, {'staff': newStaff});
                    if (ctx.mounted) Navigator.pop(ctx);
                  },
                  child: const Text('حفظ'),
                ),
              ],
            );
          });
        },
      ),
    );
  }

  // ---- close-out (per-employee pay + tips) ----
  Widget _closeCard(BuildContext context, BookingModel b) {
    final empCost = b.staff.fold<num>(0, (s, m) => s + m.paidAmount);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: b.closed ? const Color(0xFFECFDF5) : const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: b.closed ? const Color(0xFFA7F3D0) : const Color(0xFFFDE68A)),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Text('إنهاء الحجز وحساب المستحقات', style: TextStyle(fontWeight: FontWeight.w800)),
          if (b.closed) const Padding(padding: EdgeInsets.only(right: 8), child: Icon(Icons.check_circle, color: AppColors.emerald, size: 18)),
          const Spacer(),
          FilledButton.icon(
            onPressed: () => _closeOut(context, b),
            icon: const Icon(Icons.task_alt, size: 18),
            label: Text(b.closed ? 'تعديل الإنهاء' : 'إنهاء الحجز'),
          ),
        ]),
        if (b.closed) ...[
          const SizedBox(height: 10),
          Wrap(spacing: 20, runSpacing: 8, children: [
            _summary('حساب الموظفين', sar(empCost)),
            _summary('الإكرامية', sar(b.tipsAmount)),
            _summary('إجمالي المدفوع', sar(b.paidAmount + b.tipsAmount)),
            _summary('دخلي (الصافي)', sar(b.paidAmount - empCost), color: AppColors.emerald),
          ]),
        ],
      ]),
    );
  }

  Widget _summary(String label, String value, {Color? color}) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(color: Colors.black54, fontSize: 12)),
        Text(value, style: TextStyle(fontWeight: FontWeight.w800, color: color)),
      ]);

  void _closeOut(BuildContext context, BookingModel b) {
    String paymentStatus = b.paymentStatus;
    final paidC = TextEditingController(text: (b.paymentStatus == 'paid' ? b.netTotal : b.paidAmount).toString());
    final amountCtrls = {for (final m in b.staff) '${m.role}:${m.employeeId}': TextEditingController(text: m.paidAmount == 0 ? '' : m.paidAmount.toString())};
    bool hasTips = b.tipsAmount > 0;
    final tipsC = TextEditingController(text: b.tipsAmount == 0 ? '' : b.tipsAmount.toString());
    String tipsMode = 'all';
    final tipSel = {for (final m in b.staff.where((m) => m.tipAmount > 0)) '${m.role}:${m.employeeId}'};

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (ctx) => Directionality(
        textDirection: TextDirection.rtl,
        child: Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
          child: DraggableScrollableSheet(
            expand: false,
            initialChildSize: 0.75,
            maxChildSize: 0.95,
            builder: (ctx, scroll) => StatefulBuilder(builder: (ctx, setState) {
              num key(String k) => num.tryParse(amountCtrls[k]!.text.trim()) ?? 0;
              final empTotal = b.staff.fold<num>(0, (s, m) => s + key('${m.role}:${m.employeeId}'));
              final recipientsCount = tipsMode == 'all' ? b.staff.length : tipSel.length;
              return ListView(controller: scroll, padding: const EdgeInsets.all(16), children: [
                const Text('إنهاء الحجز وحساب المستحقات', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 12),
                const Text('حالة الدفع', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.brand)),
                DropdownButtonFormField<String>(
                  initialValue: paymentStatus,
                  items: [for (final e in paymentStatusLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                  onChanged: (v) => setState(() => paymentStatus = v ?? 'unpaid'),
                ),
                if (paymentStatus != 'unpaid')
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: TextField(controller: paidC, textDirection: TextDirection.ltr, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'المبلغ المدفوع (ر.س)')),
                  ),
                const SizedBox(height: 16),
                const Text('حساب الموظفين (مبلغ كل موظف)', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.brand)),
                if (b.staff.isEmpty) const Padding(padding: EdgeInsets.all(8), child: Text('لم يتم اختيار موظفين.', style: TextStyle(color: Colors.black45))),
                for (final m in b.staff)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(children: [
                      SizedBox(width: 150, child: Text('${m.name} (${roleLabel(m.role)})', style: const TextStyle(fontSize: 13))),
                      Expanded(
                        child: TextField(
                          controller: amountCtrls['${m.role}:${m.employeeId}'],
                          textDirection: TextDirection.ltr,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(isDense: true, hintText: 'المبلغ'),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                    ]),
                  ),
                if (b.staff.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('إجمالي حساب الموظفين: ${sar(empTotal)}', style: const TextStyle(fontWeight: FontWeight.bold))),
                const SizedBox(height: 16),
                Row(children: [
                  Checkbox(value: hasTips, onChanged: (v) => setState(() => hasTips = v ?? false)),
                  const Text('يوجد إكرامية', style: TextStyle(fontWeight: FontWeight.bold)),
                ]),
                if (hasTips) ...[
                  TextField(controller: tipsC, textDirection: TextDirection.ltr, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'مبلغ الإكرامية الكلي (ر.س)'), onChanged: (_) => setState(() {})),
                  const SizedBox(height: 8),
                  Wrap(spacing: 12, children: [
                    ChoiceChip(label: const Text('توزيع على الجميع'), selected: tipsMode == 'all', onSelected: (_) => setState(() => tipsMode = 'all')),
                    ChoiceChip(label: const Text('لموظفين محددين'), selected: tipsMode == 'specific', onSelected: (_) => setState(() => tipsMode = 'specific')),
                  ]),
                  if (tipsMode == 'specific')
                    for (final m in b.staff)
                      CheckboxListTile(
                        dense: true,
                        value: tipSel.contains('${m.role}:${m.employeeId}'),
                        onChanged: (v) => setState(() => v == true ? tipSel.add('${m.role}:${m.employeeId}') : tipSel.remove('${m.role}:${m.employeeId}')),
                        title: Text('${m.name} (${roleLabel(m.role)})'),
                      ),
                  Text('نصيب كل موظف: ${sar(recipientsCount == 0 ? 0 : (num.tryParse(tipsC.text.trim()) ?? 0) / recipientsCount)}',
                      style: const TextStyle(color: Colors.black54, fontSize: 12)),
                ],
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: () async {
                    final tipsTotal = hasTips ? (num.tryParse(tipsC.text.trim()) ?? 0) : 0;
                    final recipients = tipsMode == 'all'
                        ? b.staff.map((m) => '${m.role}:${m.employeeId}').toSet()
                        : tipSel;
                    final per = recipients.isEmpty ? 0 : tipsTotal / recipients.length;
                    final newStaff = b.staff.map((m) {
                      final k = '${m.role}:${m.employeeId}';
                      return StaffMember(
                        employeeId: m.employeeId, name: m.name, role: m.role,
                        paidAmount: key(k),
                        tipAmount: recipients.contains(k) ? per : 0,
                      ).toMap();
                    }).toList();
                    await Db.updateBooking(b.id, {
                      'paymentStatus': paymentStatus,
                      'paidAmount': paymentStatus == 'unpaid' ? 0 : (num.tryParse(paidC.text.trim()) ?? 0),
                      'paymentCompleted': paymentStatus == 'paid',
                      'tipsAmount': tipsTotal,
                      'tipsDistributed': tipsTotal > 0,
                      'closed': true,
                      'staff': newStaff,
                    });
                    if (ctx.mounted) {
                      Navigator.pop(ctx);
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم حفظ التغييرات بنجاح')));
                    }
                  },
                  icon: const Icon(Icons.check),
                  label: const Text('حفظ وإنهاء'),
                ),
              ]);
            }),
          ),
        ),
      ),
    );
  }

  // ---- shared ----
  Widget _card(String title, List<Widget> rows) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.brand)),
            const SizedBox(height: 8),
            ...rows,
          ]),
        ),
      );

  Widget _row(String label, String value, {Color? color, bool ltr = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 150, child: Text(label, style: const TextStyle(color: Colors.black54, fontSize: 13))),
          Expanded(child: Text(value, textDirection: ltr ? TextDirection.ltr : null, style: TextStyle(fontWeight: FontWeight.bold, color: color))),
        ]),
      );

  Widget _staffFlag(String status) {
    final m = {
      'done': [const Color(0xFFD1FAE5), const Color(0xFF047857), 'تم'],
      'partial': [const Color(0xFFFEF3C7), const Color(0xFFB45309), 'لم'],
      'none': [const Color(0xFFFEE2E2), const Color(0xFFB91C1C), 'لا'],
    }[status]!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: m[0] as Color, borderRadius: BorderRadius.circular(20)),
      child: Text(m[2] as String, style: TextStyle(color: m[1] as Color, fontWeight: FontWeight.bold, fontSize: 12)),
    );
  }

  Widget _statusChip(String status) {
    final active = status == 'active';
    final cancelled = status == 'cancelled' || status == 'rejected';
    final bg = active ? const Color(0xFFD1FAE5) : cancelled ? const Color(0xFFFEE2E2) : const Color(0xFFFEF3C7);
    final fg = active ? const Color(0xFF047857) : cancelled ? const Color(0xFFB91C1C) : const Color(0xFFB45309);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(bookingStatusLabels[status] ?? status, style: TextStyle(color: fg, fontWeight: FontWeight.bold)),
    );
  }

  void _cancel(BuildContext context, BookingModel b) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('إلغاء الموعد'),
        content: const Text('تأكيد إلغاء هذا الحجز؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('تراجع')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('إلغاء الموعد')),
        ],
      ),
    );
    if (ok == true) await Db.setBookingStatus(b.id, 'cancelled');
  }

  void _delete(BuildContext context, BookingModel b) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('حذف الحجز'),
        content: const Text('حذف نهائي للحجز؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('تراجع')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: Colors.red), onPressed: () => Navigator.pop(ctx, true), child: const Text('حذف')),
        ],
      ),
    );
    if (ok == true) {
      await Db.deleteBooking(b.id);
      if (context.mounted) Navigator.pop(context);
    }
  }
}
