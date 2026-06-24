import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../theme.dart';
import '../models.dart';
import '../widgets/notifications_bell.dart';
import 'calendar_screen.dart';
import 'bookings_list_screen.dart';
import 'finance_screen.dart';
import 'services_screen.dart';
import 'clients_screen.dart';
import 'employees_screen.dart';
import 'users_screen.dart';
import 'settings_screen.dart';

class _Dest {
  final String label;
  final IconData icon;
  final WidgetBuilder builder;
  const _Dest(this.label, this.icon, this.builder);
}

class HomeShell extends StatefulWidget {
  final AppUser? profile;
  const HomeShell({super.key, this.profile});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  late final List<_Dest> _dests = [
    _Dest('الرئيسية', Icons.calendar_month, (_) => const CalendarScreen()),
    _Dest('إدارة الحجوزات', Icons.event_note, (_) => const BookingsListScreen()),
    _Dest('إدارة الخدمات', Icons.coffee, (_) => const ServicesScreen()),
    _Dest('إدارة العملاء', Icons.groups, (_) => const ClientsScreen()),
    _Dest('إدارة المالية', Icons.account_balance_wallet, (_) => const FinanceScreen()),
    _Dest('إدارة الموظفين', Icons.badge, (_) => const EmployeesScreen()),
    _Dest('إدارة المستخدمين', Icons.manage_accounts, (_) => UsersScreen(currentUser: widget.profile)),
    _Dest('الإعدادات', Icons.settings, (_) => const SettingsScreen()),
  ];

  Widget _sidebar({bool inDrawer = false}) {
    return Container(
      width: 260,
      color: AppColors.brandDark,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 6, 8),
              child: Row(children: const [
                CircleAvatar(backgroundColor: AppColors.brand, child: Text('☕')),
                SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('أم فارس', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
                    Text('نظام إدارة الحجوزات', style: TextStyle(color: Color(0xFFE8D0A3), fontSize: 11)),
                  ]),
                ),
                NotificationsBell(),
              ]),
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                itemCount: _dests.length,
                itemBuilder: (context, i) {
                  final selected = i == _index;
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Material(
                      color: selected ? AppColors.brand : Colors.transparent,
                      borderRadius: BorderRadius.circular(10),
                      child: ListTile(
                        dense: true,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        leading: Icon(_dests[i].icon, color: selected ? Colors.white : const Color(0xFFE8D0A3), size: 20),
                        title: Text(_dests[i].label,
                            style: TextStyle(color: selected ? Colors.white : const Color(0xFFF4E9D2), fontWeight: FontWeight.w700, fontSize: 14)),
                        onTap: () {
                          setState(() => _index = i);
                          if (inDrawer) Navigator.pop(context);
                        },
                      ),
                    ),
                  );
                },
              ),
            ),
            const Divider(color: Colors.white24, height: 1),
            Builder(builder: (context) {
              final email = widget.profile?.email ?? FirebaseAuth.instance.currentUser?.email ?? '';
              final name = (widget.profile?.name.isNotEmpty == true)
                  ? widget.profile!.name
                  : (email.contains('@') ? email.split('@').first : 'مستخدم');
              return Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
                child: Row(children: [
                  CircleAvatar(
                    radius: 16,
                    backgroundColor: AppColors.brand,
                    child: Text(name.isNotEmpty ? name.substring(0, 1) : '?', style: const TextStyle(color: Colors.white)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14)),
                  ),
                ]),
              );
            }),
            ListTile(
              leading: const Icon(Icons.logout, color: Color(0xFFFCA5A5), size: 20),
              title: const Text('تسجيل الخروج', style: TextStyle(color: Color(0xFFFCA5A5), fontWeight: FontWeight.w700, fontSize: 14)),
              onTap: () => FirebaseAuth.instance.signOut(),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.of(context).size.width >= 900;
    final content = _dests[_index].builder(context);
    if (wide) {
      return Scaffold(
        body: Row(children: [
          _sidebar(),
          Expanded(child: content),
        ]),
      );
    }
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.brandDark,
        foregroundColor: Colors.white,
        title: Text(_dests[_index].label, style: const TextStyle(fontWeight: FontWeight.w800)),
        actions: const [NotificationsBell()],
      ),
      drawer: Drawer(child: _sidebar(inDrawer: true)),
      body: content,
    );
  }
}

