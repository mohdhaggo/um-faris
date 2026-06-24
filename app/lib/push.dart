import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:firebase_messaging/firebase_messaging.dart';
import 'firestore_service.dart';

/// Background message handler (must be a top-level function).
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // System tray displays "notification" payloads automatically; nothing needed here.
}

/// Sets up FCM device push on Android. On web we rely on the in-app bell only.
Future<void> initPush(String uid) async {
  if (kIsWeb) return;
  try {
    final messaging = FirebaseMessaging.instance;
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await messaging.requestPermission(alert: true, badge: true, sound: true);
    final token = await messaging.getToken();
    if (token != null && token.isNotEmpty) {
      await Db.addFcmToken(uid, token);
    }
    messaging.onTokenRefresh.listen((t) => Db.addFcmToken(uid, t));
    // owner can broadcast reminders to this topic from the Firebase console
    await messaging.subscribeToTopic('reminders');
  } catch (_) {
    // ignore — push is best-effort; the in-app bell still works
  }
}
