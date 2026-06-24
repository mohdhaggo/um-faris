import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../theme.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.brandDark,
        foregroundColor: Colors.white,
        title: const Text('أم فارس', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          IconButton(
            tooltip: 'تسجيل الخروج',
            icon: const Icon(Icons.logout),
            onPressed: () => FirebaseAuth.instance.signOut(),
          ),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle, color: AppColors.emerald, size: 56),
            const SizedBox(height: 12),
            const Text('تم تسجيل الدخول بنجاح',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text(user?.email ?? '', style: const TextStyle(color: Colors.black54)),
            const SizedBox(height: 16),
            const Text('سيتم بناء التقويم وبقية الشاشات في الخطوات التالية',
                style: TextStyle(color: Colors.black45)),
          ],
        ),
      ),
    );
  }
}
