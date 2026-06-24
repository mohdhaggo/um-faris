import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../theme.dart';
import '../models.dart';
import '../firestore_service.dart';

class UsersScreen extends StatelessWidget {
  final AppUser? currentUser;
  const UsersScreen({super.key, this.currentUser});

  bool get _isAdmin => currentUser?.isAdmin ?? false;
  String? get _myUid => FirebaseAuth.instance.currentUser?.uid;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(children: [
                const Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('إدارة المستخدمين', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                    Text('الدخول بدعوة فقط — المدير يضيف المستخدمين', style: TextStyle(color: Colors.black54)),
                  ]),
                ),
                if (_isAdmin)
                  FilledButton.icon(
                    onPressed: () => _addUser(context),
                    icon: const Icon(Icons.person_add),
                    label: const Text('إضافة مستخدم'),
                  ),
              ]),
              const SizedBox(height: 16),
              Expanded(
                child: StreamBuilder<List<AppUser>>(
                  stream: Db.usersStream(),
                  builder: (context, snap) {
                    if (snap.hasError) return Center(child: Text('تعذّر التحميل: ${snap.error}'));
                    if (!snap.hasData) return const Center(child: CircularProgressIndicator(color: AppColors.brand));
                    final users = snap.data!;
                    if (users.isEmpty) return const Center(child: Text('لا يوجد مستخدمون'));
                    return ListView.separated(
                      itemCount: users.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, i) => _tile(context, users[i]),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tile(BuildContext context, AppUser u) {
    final isSelf = u.uid == _myUid;
    final active = u.isActive;
    return Card(
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(children: [
          CircleAvatar(
            backgroundColor: AppColors.brand,
            child: Text(u.name.isNotEmpty ? u.name.substring(0, 1) : '?',
                style: const TextStyle(color: Colors.white)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text(u.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                if (u.isRoot) const Padding(
                  padding: EdgeInsets.only(right: 6),
                  child: _Chip('المدير الأساسي', Color(0xFFF4E9D2), AppColors.brandDark),
                ),
              ]),
              Text(u.email, textDirection: TextDirection.ltr, style: const TextStyle(color: Colors.black54, fontSize: 12)),
              if (u.phone.isNotEmpty)
                Text(u.phone, textDirection: TextDirection.ltr, style: const TextStyle(color: Colors.black45, fontSize: 12)),
            ]),
          ),
          // status toggle
          InkWell(
            onTap: (_isAdmin && !isSelf && !u.isRoot)
                ? () => Db.setUserStatus(u.uid, active ? 'inactive' : 'active')
                : null,
            child: _Chip(active ? 'مفعّل' : 'موقوف',
                active ? const Color(0xFFD1FAE5) : const Color(0xFFFEE2E2),
                active ? const Color(0xFF047857) : const Color(0xFFB91C1C)),
          ),
          if (_isAdmin) ...[
            IconButton(
              tooltip: 'تعديل',
              icon: const Icon(Icons.edit, size: 20),
              onPressed: () => _editUser(context, u),
            ),
            IconButton(
              tooltip: 'إرسال رابط إعادة تعيين كلمة المرور',
              icon: const Icon(Icons.key, size: 20),
              onPressed: () async {
                await Db.sendPasswordReset(u.email);
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('تم إرسال رابط إعادة التعيين إلى ${u.email}')));
                }
              },
            ),
            if (!isSelf && !u.isRoot)
              IconButton(
                tooltip: 'حذف',
                icon: const Icon(Icons.delete, size: 20, color: Colors.red),
                onPressed: () => _confirmDelete(context, u),
              ),
          ],
        ]),
      ),
    );
  }

  void _addUser(BuildContext context) {
    final name = TextEditingController();
    final email = TextEditingController();
    final phone = TextEditingController();
    final pass = TextEditingController();
    String role = 'user';
    String? error;
    bool busy = false;
    bool obscure = true;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setState) {
        return AlertDialog(
          title: const Text('إضافة مستخدم'),
          content: SizedBox(
            width: 380,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(error!, style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.bold)),
                  ),
                TextField(controller: name, decoration: const InputDecoration(labelText: 'اسم المستخدم')),
                const SizedBox(height: 10),
                TextField(controller: email, textDirection: TextDirection.ltr, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'البريد الإلكتروني')),
                const SizedBox(height: 10),
                TextField(controller: phone, textDirection: TextDirection.ltr, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'رقم الجوال')),
                const SizedBox(height: 10),
                TextField(
                  controller: pass,
                  textDirection: TextDirection.ltr,
                  obscureText: obscure,
                  decoration: InputDecoration(
                    labelText: 'كلمة المرور (٦ أحرف على الأقل)',
                    suffixIcon: IconButton(
                      icon: Icon(obscure ? Icons.visibility : Icons.visibility_off),
                      onPressed: () => setState(() => obscure = !obscure),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: role,
                  decoration: const InputDecoration(labelText: 'الصلاحية'),
                  items: const [
                    DropdownMenuItem(value: 'user', child: Text('مستخدم')),
                    DropdownMenuItem(value: 'admin', child: Text('مدير')),
                  ],
                  onChanged: (v) => role = v ?? 'user',
                ),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: busy ? null : () => Navigator.pop(ctx), child: const Text('إلغاء')),
            FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      final e = email.text.trim();
                      if (name.text.trim().isEmpty || e.isEmpty || pass.text.length < 6) {
                        setState(() => error = 'أكمل الاسم والبريد وكلمة مرور ٦ أحرف فأكثر');
                        return;
                      }
                      setState(() { busy = true; error = null; });
                      try {
                        await Db.createUser(
                          name: name.text.trim(),
                          email: e,
                          phone: phone.text.trim(),
                          password: pass.text,
                          role: role,
                        );
                        if (ctx.mounted) Navigator.pop(ctx);
                      } on FirebaseAuthException catch (ex) {
                        setState(() {
                          busy = false;
                          error = ex.code == 'email-already-in-use'
                              ? 'البريد مستخدم مسبقاً'
                              : ex.code == 'weak-password'
                                  ? 'كلمة المرور ضعيفة'
                                  : ex.code == 'invalid-email'
                                      ? 'بريد غير صالح'
                                      : 'خطأ: ${ex.code}';
                        });
                      } catch (ex) {
                        setState(() { busy = false; error = 'خطأ: $ex'; });
                      }
                    },
              child: busy
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('إضافة'),
            ),
          ],
        );
      }),
    );
  }

  void _editUser(BuildContext context, AppUser u) {
    final name = TextEditingController(text: u.name);
    final phone = TextEditingController(text: u.phone);
    String role = u.role;
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setState) {
        return AlertDialog(
          title: Text('تعديل: ${u.name}'),
          content: SizedBox(
            width: 360,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: name, decoration: const InputDecoration(labelText: 'الاسم')),
              const SizedBox(height: 10),
              TextField(controller: phone, textDirection: TextDirection.ltr, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'رقم الجوال')),
              const SizedBox(height: 10),
              Text(u.email, textDirection: TextDirection.ltr, style: const TextStyle(color: Colors.black45, fontSize: 12)),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: role,
                decoration: const InputDecoration(labelText: 'الصلاحية'),
                items: const [
                  DropdownMenuItem(value: 'user', child: Text('مستخدم')),
                  DropdownMenuItem(value: 'admin', child: Text('مدير')),
                ],
                onChanged: u.isRoot ? null : (v) => setState(() => role = v ?? 'user'),
              ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
            FilledButton(
              onPressed: () async {
                if (name.text.trim().isEmpty) return;
                await Db.updateUserProfile(u.uid, name: name.text.trim(), phone: phone.text.trim(), role: role);
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('حفظ'),
            ),
          ],
        );
      }),
    );
  }

  void _confirmDelete(BuildContext context, AppUser u) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('حذف المستخدم'),
        content: Text('سيتم منع ${u.name} من الوصول للنظام. متابعة؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () async {
              await Db.deleteUserDoc(u.uid);
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('حذف'),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String text;
  final Color bg;
  final Color fg;
  const _Chip(this.text, this.bg, this.fg);
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
        child: Text(text, style: TextStyle(color: fg, fontWeight: FontWeight.bold, fontSize: 12)),
      );
}
