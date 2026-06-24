import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    final pass = _password.text;
    if (email.isEmpty || pass.isEmpty) {
      setState(() => _error = 'أدخل البريد وكلمة المرور');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(email: email, password: pass);
      // AuthGate handles navigation automatically.
    } on FirebaseAuthException catch (e) {
      setState(() => _error = _msg(e.code));
    } catch (e) {
      setState(() => _error = 'تعذّر الاتصال: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _msg(String code) {
    switch (code) {
      case 'invalid-credential':
      case 'wrong-password':
      case 'user-not-found':
        return 'بيانات الدخول غير صحيحة';
      case 'invalid-email':
        return 'بريد إلكتروني غير صالح';
      case 'user-disabled':
        return 'الحساب موقوف — تواصل مع المدير';
      case 'too-many-requests':
        return 'محاولات كثيرة، حاول لاحقاً';
      default:
        return 'حدث خطأ: $code';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [AppColors.brandDark, AppColors.brand],
          ),
        ),
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: AppColors.brand,
                      borderRadius: BorderRadius.circular(18),
                    ),
                    alignment: Alignment.center,
                    child: const Text('☕', style: TextStyle(fontSize: 30)),
                  ),
                  const SizedBox(height: 12),
                  const Text('أم فارس',
                      style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: Colors.white)),
                  const Text('نظام إدارة الحجوزات والمناسبات',
                      style: TextStyle(color: Color(0xFFF4E9D2))),
                  const SizedBox(height: 24),
                  Card(
                    elevation: 8,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('تسجيل الدخول',
                              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 16),
                          if (_error != null) ...[
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFEECEC),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(_error!,
                                  style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.bold)),
                            ),
                            const SizedBox(height: 12),
                          ],
                          const Text('البريد الإلكتروني',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                          const SizedBox(height: 6),
                          TextField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            textDirection: TextDirection.ltr,
                          ),
                          const SizedBox(height: 14),
                          const Text('كلمة المرور',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                          const SizedBox(height: 6),
                          TextField(
                            controller: _password,
                            obscureText: _obscure,
                            textDirection: TextDirection.ltr,
                            onSubmitted: (_) => _submit(),
                            decoration: InputDecoration(
                              suffixIcon: IconButton(
                                tooltip: _obscure ? 'إظهار كلمة المرور' : 'إخفاء كلمة المرور',
                                icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                                onPressed: () => setState(() => _obscure = !_obscure),
                              ),
                            ),
                          ),
                          const SizedBox(height: 20),
                          FilledButton(
                            onPressed: _loading ? null : _submit,
                            child: _loading
                                ? const SizedBox(
                                    height: 20, width: 20,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Text('دخول'),
                          ),
                          const SizedBox(height: 6),
                          const Text('الدخول بدعوة فقط — تواصل مع المدير لإنشاء حساب',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.black38, fontSize: 11)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
