import 'package:flutter/material.dart';
import '../theme.dart';
import '../constants.dart';
import '../models.dart';
import '../firestore_service.dart';
import 'booking_form.dart';

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
                    IconButton(
                      onPressed: () => _delete(context, b),
                      icon: const Icon(Icons.delete, color: Colors.red),
                    ),
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
                  _staffCard(b),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

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
          Expanded(
            child: Text(value,
                textDirection: ltr ? TextDirection.ltr : null,
                style: TextStyle(fontWeight: FontWeight.bold, color: color)),
          ),
        ]),
      );

  Widget _staffCard(BookingModel b) => _card('الموظفون', [
        Wrap(spacing: 8, runSpacing: 8, children: [
          _staffFlag('الصبابات', b.roleStatus('صبابة')),
          _staffFlag('العاملات', b.roleStatus('عاملة')),
          _staffFlag('السائق', b.roleStatus('سائق')),
        ]),
        const Padding(
          padding: EdgeInsets.only(top: 10),
          child: Text('اختيار الموظفين وحساب المستحقات يُضاف قريباً', style: TextStyle(color: Colors.black38, fontSize: 12)),
        ),
      ]);

  Widget _staffFlag(String label, String status) {
    final m = {
      'done': [const Color(0xFFD1FAE5), const Color(0xFF047857), 'تم'],
      'partial': [const Color(0xFFFEF3C7), const Color(0xFFB45309), 'لم'],
      'none': [const Color(0xFFFEE2E2), const Color(0xFFB91C1C), 'لا'],
    }[status]!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(color: m[0] as Color, borderRadius: BorderRadius.circular(20)),
      child: Text('$label (${m[2]})', style: TextStyle(color: m[1] as Color, fontWeight: FontWeight.bold)),
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
