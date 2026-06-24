import 'package:flutter/material.dart';
import '../theme.dart';
import '../constants.dart';
import '../models.dart';
import '../firestore_service.dart';
import 'booking_form.dart';
import 'booking_details.dart';

class BookingsListScreen extends StatefulWidget {
  const BookingsListScreen({super.key});

  @override
  State<BookingsListScreen> createState() => _BookingsListScreenState();
}

class _BookingsListScreenState extends State<BookingsListScreen> {
  String _filter = 'all';

  bool _match(BookingModel b) {
    final today = iso(DateTime.now());
    switch (_filter) {
      case 'upcoming':
        return b.status == 'active' && b.date.compareTo(today) >= 0;
      case 'completed':
        return b.status == 'active' && b.date.compareTo(today) < 0;
      case 'waiting':
        return b.status == 'pending';
      case 'cancelled':
        return b.status == 'cancelled' || b.status == 'rejected';
      default:
        return true;
    }
  }

  @override
  Widget build(BuildContext context) {
    const filters = {'all': 'الكل', 'upcoming': 'المستقبلية', 'completed': 'المكتملة', 'waiting': 'الانتظار', 'cancelled': 'الملغية'};
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              const Expanded(child: Text('إدارة الحجوزات', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800))),
              FilledButton.icon(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const BookingFormScreen())),
                icon: const Icon(Icons.add),
                label: const Text('حجز جديد'),
              ),
            ]),
            const SizedBox(height: 12),
            Wrap(spacing: 8, children: [
              for (final e in filters.entries)
                ChoiceChip(
                  label: Text(e.value),
                  selected: _filter == e.key,
                  onSelected: (_) => setState(() => _filter = e.key),
                ),
            ]),
            const SizedBox(height: 12),
            Expanded(
              child: StreamBuilder<List<BookingModel>>(
                stream: Db.allBookings(),
                builder: (context, snap) {
                  if (snap.hasError) return Center(child: Text('تعذّر التحميل: ${snap.error}'));
                  if (!snap.hasData) return const Center(child: CircularProgressIndicator(color: AppColors.brand));
                  final items = snap.data!.where(_match).toList()..sort((a, b) => b.date.compareTo(a.date));
                  if (items.isEmpty) return const Center(child: Text('لا توجد حجوزات', style: TextStyle(color: Colors.black45)));
                  return ListView.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, i) {
                      final b = items[i];
                      return Card(
                        margin: EdgeInsets.zero,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        child: ListTile(
                          title: Text(b.clientName, style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text('${gregLabel(parseIso(b.date))} · ${b.eventType} · ${sar(b.netTotal)}'),
                          trailing: b.status == 'pending'
                              ? Row(mainAxisSize: MainAxisSize.min, children: [
                                  IconButton(
                                    tooltip: 'تأكيد',
                                    icon: const Icon(Icons.check_circle, color: AppColors.emerald),
                                    onPressed: () => Db.setBookingStatus(b.id, 'active'),
                                  ),
                                  IconButton(
                                    tooltip: 'رفض',
                                    icon: const Icon(Icons.cancel, color: Colors.red),
                                    onPressed: () => Db.setBookingStatus(b.id, 'rejected'),
                                  ),
                                ])
                              : const Icon(Icons.chevron_left),
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => BookingDetailsScreen(bookingId: b.id))),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ]),
        ),
      ),
    );
  }
}
