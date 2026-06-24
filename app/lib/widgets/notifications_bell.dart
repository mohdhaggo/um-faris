import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../theme.dart';
import '../constants.dart';
import '../models.dart';
import '../firestore_service.dart';
import '../screens/booking_details.dart';

class _Note {
  final String id;
  final String bookingId;
  final String text;
  final Color color;
  final IconData icon;
  _Note(this.id, this.bookingId, this.text, this.color, this.icon);
}

List<_Note> _compute(List<BookingModel> bookings) {
  final notes = <_Note>[];
  final today = dateOnly(DateTime.now());
  for (final b in bookings) {
    if (b.status == 'cancelled' || b.status == 'rejected') continue;
    if (b.status == 'pending') {
      notes.add(_Note('pending:${b.id}', b.id, 'حجز انتظار للعميل ${b.clientName} بانتظار التأكيد (${gregLabel(parseIso(b.date))})', const Color(0xFFB45309), Icons.hourglass_top));
      continue;
    }
    if (b.date.isEmpty) continue;
    final diff = dateOnly(parseIso(b.date)).difference(today).inDays;
    if (diff == 3) notes.add(_Note('r3:${b.id}', b.id, 'تذكير: حجز ${b.clientName} بعد ٣ أيام (${gregLabel(parseIso(b.date))})', AppColors.brand, Icons.event));
    if (diff == 1) notes.add(_Note('r1:${b.id}', b.id, 'تذكير: حجز ${b.clientName} غداً (${gregLabel(parseIso(b.date))})', AppColors.brand, Icons.event));
    if (diff == 2 && b.staff.isEmpty) notes.add(_Note('nostaff:${b.id}', b.id, 'لم يتم حجز الموظفين لحجز ${b.clientName} بعد يومين', const Color(0xFFB45309), Icons.group_off));
    if (diff < 0 && !b.closed) notes.add(_Note('endday:${b.id}', b.id, 'انتهى موعد ${b.clientName} — أكّد الإنهاء والدفع والإكراميات', const Color(0xFFB91C1C), Icons.task_alt));
  }
  return notes;
}

class NotificationsBell extends StatelessWidget {
  final Color iconColor;
  const NotificationsBell({super.key, this.iconColor = Colors.white});

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    return StreamBuilder<List<BookingModel>>(
      stream: Db.allBookings(),
      builder: (context, bs) {
        final notes = _compute(bs.data ?? const []);
        return StreamBuilder<Set<String>>(
          stream: uid == null ? Stream<Set<String>>.value(<String>{}) : Db.readNotificationsStream(uid),
          builder: (context, rs) {
            final read = rs.data ?? <String>{};
            final unread = notes.where((n) => !read.contains(n.id)).length;
            return Stack(clipBehavior: Clip.none, children: [
              IconButton(
                icon: Icon(Icons.notifications, color: iconColor),
                tooltip: 'الإشعارات',
                onPressed: () => _open(context, notes, read, uid),
              ),
              if (unread > 0)
                Positioned(
                  right: 4,
                  top: 4,
                  child: Container(
                    padding: const EdgeInsets.all(3),
                    decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                    constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                    child: Text('$unread', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
                ),
            ]);
          },
        );
      },
    );
  }

  // Opening the panel does NOT mark anything read; only tapping a message does.
  void _open(BuildContext context, List<_Note> notes, Set<String> read, String? uid) {
    final localRead = {...read};
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: const Text('الإشعارات', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          contentPadding: const EdgeInsets.fromLTRB(8, 12, 8, 8),
          content: SizedBox(
            width: 400,
            child: notes.isEmpty
                ? const Padding(padding: EdgeInsets.all(16), child: Text('لا توجد إشعارات', style: TextStyle(color: Colors.black45)))
                : ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 440),
                    child: ListView(shrinkWrap: true, children: [
                      for (final n in notes)
                        _tile(n, localRead.contains(n.id), () {
                          if (uid != null) Db.markNotificationRead(uid, n.id);
                          Navigator.pop(ctx);
                          Navigator.push(context, MaterialPageRoute(builder: (_) => BookingDetailsScreen(bookingId: n.bookingId)));
                        }),
                    ]),
                  ),
          ),
          actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إغلاق'))],
        ),
      ),
    );
  }

  Widget _tile(_Note n, bool isRead, VoidCallback onTap) => Container(
        margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
        decoration: BoxDecoration(
          color: isRead ? Colors.transparent : const Color(0xFFFBF7EF),
          borderRadius: BorderRadius.circular(8),
        ),
        child: ListTile(
          dense: true,
          leading: Icon(n.icon, color: isRead ? Colors.black26 : n.color, size: 20),
          title: Text(n.text, style: TextStyle(fontSize: 13, fontWeight: isRead ? FontWeight.normal : FontWeight.bold, color: isRead ? Colors.black45 : Colors.black87)),
          trailing: isRead ? null : const CircleAvatar(radius: 4, backgroundColor: Colors.red),
          onTap: onTap,
        ),
      );
}
