import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'firebase_options.dart';
import 'models.dart';

/// Thin Firestore data layer. Collections are added here as screens are built.
class Db {
  static final _fs = FirebaseFirestore.instance;

  // ---- services / packages ----
  static CollectionReference<Map<String, dynamic>> get _services => _fs.collection('services');

  static Stream<List<ServiceItem>> servicesStream() => _services
      .orderBy('kind')
      .snapshots()
      .map((s) => s.docs.map(ServiceItem.fromDoc).toList());

  static Future<void> addService(ServiceItem s) => _services.add(s.toMap());
  static Future<void> updateService(String id, ServiceItem s) => _services.doc(id).update(s.toMap());
  static Future<void> deleteService(String id) => _services.doc(id).delete();

  // ---- users (إدارة المستخدمين) ----
  static CollectionReference<Map<String, dynamic>> get _users => _fs.collection('users');

  static Stream<List<AppUser>> usersStream() => _users
      .orderBy('createdAt')
      .snapshots()
      .map((s) => s.docs.map(AppUser.fromDoc).toList());

  static Stream<AppUser?> profileStream(String uid) =>
      _users.doc(uid).snapshots().map((d) => d.exists ? AppUser.fromDoc(d) : null);

  /// Ensures a profile doc exists for the signed-in user. The very first user
  /// becomes the root admin.
  static Future<void> ensureProfile(User u) async {
    final ref = _users.doc(u.uid);
    final snap = await ref.get();
    if (snap.exists) return;
    final existing = await _users.limit(1).get();
    final isFirst = existing.docs.isEmpty;
    await ref.set({
      'name': u.displayName ?? (u.email?.split('@').first ?? 'مستخدم'),
      'email': u.email ?? '',
      'phone': '',
      'role': isFirst ? 'admin' : 'user',
      'status': 'active',
      'isRoot': isFirst,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  /// Creates an auth account (via a temporary secondary app so the current
  /// admin session is preserved) and its profile doc.
  static Future<void> createUser({
    required String name,
    required String email,
    required String phone,
    required String password,
    String role = 'user',
  }) async {
    FirebaseApp? temp;
    try {
      temp = await Firebase.initializeApp(
        name: 'userCreator_${DateTime.now().microsecondsSinceEpoch}',
        options: DefaultFirebaseOptions.currentPlatform,
      );
      final cred = await FirebaseAuth.instanceFor(app: temp)
          .createUserWithEmailAndPassword(email: email, password: password);
      final uid = cred.user!.uid;
      await FirebaseAuth.instanceFor(app: temp).signOut();
      await _users.doc(uid).set({
        'name': name,
        'email': email,
        'phone': phone,
        'role': role,
        'status': 'active',
        'isRoot': false,
        'createdAt': FieldValue.serverTimestamp(),
      });
    } finally {
      await temp?.delete();
    }
  }

  static Future<void> updateUserProfile(String uid, {
    required String name,
    required String phone,
    required String role,
  }) =>
      _users.doc(uid).update({'name': name, 'phone': phone, 'role': role});

  static Future<void> setUserStatus(String uid, String status) =>
      _users.doc(uid).update({'status': status});

  static Future<void> deleteUserDoc(String uid) => _users.doc(uid).delete();

  static Future<void> sendPasswordReset(String email) =>
      FirebaseAuth.instance.sendPasswordResetEmail(email: email);

  // ---- clients (إدارة العملاء) ----
  static CollectionReference<Map<String, dynamic>> get _clients => _fs.collection('clients');

  static Stream<List<ClientModel>> clientsStream() =>
      _clients.orderBy('name').snapshots().map((s) => s.docs.map(ClientModel.fromDoc).toList());

  static Future<void> addClient(ClientModel c) => _clients.add(c.toMap());
  static Future<void> updateClient(String id, ClientModel c) => _clients.doc(id).update(c.toMap());
  static Future<void> deleteClient(String id) => _clients.doc(id).delete();

  // ---- employees (إدارة الموظفين) ----
  static CollectionReference<Map<String, dynamic>> get _employees => _fs.collection('employees');

  static Stream<List<EmployeeModel>> employeesStream() =>
      _employees.orderBy('name').snapshots().map((s) => s.docs.map(EmployeeModel.fromDoc).toList());

  static Future<void> addEmployee(EmployeeModel e) => _employees.add(e.toMap());
  static Future<void> updateEmployee(String id, EmployeeModel e) => _employees.doc(id).update(e.toMap());
  static Future<void> deleteEmployee(String id) => _employees.doc(id).delete();

  // ---- bookings (الحجوزات) ----
  static CollectionReference<Map<String, dynamic>> get _bookings => _fs.collection('bookings');

  /// Bookings within an inclusive ISO date range, ordered by date.
  static Stream<List<BookingModel>> bookingsInRange(String from, String to) => _bookings
      .where('date', isGreaterThanOrEqualTo: from)
      .where('date', isLessThanOrEqualTo: to)
      .orderBy('date')
      .snapshots()
      .map((s) => s.docs.map(BookingModel.fromDoc).toList());

  static Stream<List<BookingModel>> allBookings() =>
      _bookings.orderBy('date').snapshots().map((s) => s.docs.map(BookingModel.fromDoc).toList());

  static Stream<BookingModel?> bookingStream(String id) =>
      _bookings.doc(id).snapshots().map((d) => d.exists ? BookingModel.fromDoc(d) : null);

  static Future<String> addBooking(BookingModel b) async => (await _bookings.add(b.toMap())).id;
  static Future<void> updateBooking(String id, Map<String, dynamic> data) => _bookings.doc(id).update(data);
  static Future<void> setBookingStatus(String id, String status) => _bookings.doc(id).update({'status': status});
  static Future<void> deleteBooking(String id) => _bookings.doc(id).delete();
}
