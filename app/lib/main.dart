import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:hijri/hijri_calendar.dart';
import 'firebase_options.dart';
import 'theme.dart';
import 'models.dart';
import 'firestore_service.dart';
import 'push.dart';
import 'screens/login_screen.dart';
import 'screens/home_shell.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  HijriCalendar.setLocal('ar'); // Arabic Hijri month names
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const UmfarisApp());
}

class UmfarisApp extends StatelessWidget {
  const UmfarisApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'أم فارس',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      locale: const Locale('ar'),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('ar'), Locale('en')],
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child!,
      ),
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const _Loading();
        }
        final user = snapshot.data;
        if (user == null) return const LoginScreen();
        return _ProfileGate(user: user);
      },
    );
  }
}

/// Ensures the user's profile exists, then enforces active status.
class _ProfileGate extends StatefulWidget {
  final User user;
  const _ProfileGate({required this.user});

  @override
  State<_ProfileGate> createState() => _ProfileGateState();
}

class _ProfileGateState extends State<_ProfileGate> {
  late final Future<void> _ensured =
      Db.ensureProfile(widget.user).then((_) => initPush(widget.user.uid));

  @override
  Widget build(BuildContext context) {
    return FutureBuilder(
      future: _ensured,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const _Loading();
        return StreamBuilder<AppUser?>(
          stream: Db.profileStream(widget.user.uid),
          builder: (context, ps) {
            if (!ps.hasData && ps.connectionState == ConnectionState.waiting) {
              return const _Loading();
            }
            final profile = ps.data;
            if (profile != null && !profile.isActive) {
              return _Suspended();
            }
            return HomeShell(profile: profile);
          },
        );
      },
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator(color: AppColors.brand)));
}

class _Suspended extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.lock_outline, size: 56, color: Colors.redAccent),
          const SizedBox(height: 12),
          const Text('الحساب موقوف', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text('تواصل مع المدير لتفعيل حسابك', style: TextStyle(color: Colors.black54)),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => FirebaseAuth.instance.signOut(),
            child: const Text('تسجيل الخروج'),
          ),
        ]),
      ),
    );
  }
}
