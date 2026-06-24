import 'package:cloud_firestore/cloud_firestore.dart';

/// A service or package offered (إدارة الخدمات).
class ServiceItem {
  final String id;
  final String name;
  final String kind; // 'service' | 'package'
  final num price;
  final String description;

  ServiceItem({
    required this.id,
    required this.name,
    required this.kind,
    required this.price,
    required this.description,
  });

  factory ServiceItem.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return ServiceItem(
      id: doc.id,
      name: d['name'] ?? '',
      kind: d['kind'] ?? 'service',
      price: d['price'] ?? 0,
      description: d['description'] ?? '',
    );
  }

  Map<String, dynamic> toMap() => {
        'name': name,
        'kind': kind,
        'price': price,
        'description': description,
      };
}

/// A system user (إدارة المستخدمين). Doc id == Firebase Auth uid.
class AppUser {
  final String uid;
  final String name;
  final String email;
  final String phone;
  final String role; // 'admin' | 'user'
  final String status; // 'active' | 'inactive'
  final bool isRoot;

  AppUser({
    required this.uid,
    required this.name,
    required this.email,
    required this.phone,
    required this.role,
    required this.status,
    required this.isRoot,
  });

  bool get isActive => status == 'active';
  bool get isAdmin => role == 'admin';

  factory AppUser.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return AppUser(
      uid: doc.id,
      name: d['name'] ?? '',
      email: d['email'] ?? '',
      phone: d['phone'] ?? '',
      role: d['role'] ?? 'user',
      status: d['status'] ?? 'active',
      isRoot: d['isRoot'] == true,
    );
  }
}

/// A client (إدارة العملاء).
class ClientModel {
  final String id;
  final String name;
  final String phone;

  ClientModel({required this.id, required this.name, required this.phone});

  factory ClientModel.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return ClientModel(id: doc.id, name: d['name'] ?? '', phone: d['phone'] ?? '');
  }

  Map<String, dynamic> toMap() => {'name': name, 'phone': phone};
}

/// An employee (إدارة الموظفين) — may hold several job types.
class EmployeeModel {
  final String id;
  final String name;
  final String phone;
  final List<String> jobTypes;
  final bool active;
  final num wage; // optional default; actual pay is set per booking

  EmployeeModel({
    required this.id,
    required this.name,
    required this.phone,
    required this.jobTypes,
    required this.active,
    required this.wage,
  });

  factory EmployeeModel.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return EmployeeModel(
      id: doc.id,
      name: d['name'] ?? '',
      phone: d['phone'] ?? '',
      jobTypes: List<String>.from(d['jobTypes'] ?? const []),
      active: d['active'] != false,
      wage: d['wage'] ?? 0,
    );
  }

  Map<String, dynamic> toMap() => {
        'name': name,
        'phone': phone,
        'jobTypes': jobTypes,
        'active': active,
        'wage': wage,
      };
}

/// An assigned staff member embedded inside a booking.
class StaffMember {
  final String employeeId;
  final String name;
  final String role;
  final num paidAmount;
  final num tipAmount;

  StaffMember({
    required this.employeeId,
    required this.name,
    required this.role,
    this.paidAmount = 0,
    this.tipAmount = 0,
  });

  factory StaffMember.fromMap(Map<String, dynamic> m) => StaffMember(
        employeeId: m['employeeId'] ?? '',
        name: m['name'] ?? '',
        role: m['role'] ?? '',
        paidAmount: m['paidAmount'] ?? 0,
        tipAmount: m['tipAmount'] ?? 0,
      );

  Map<String, dynamic> toMap() => {
        'employeeId': employeeId,
        'name': name,
        'role': role,
        'paidAmount': paidAmount,
        'tipAmount': tipAmount,
      };
}

/// A booking (حجز).
class BookingModel {
  final String id;
  final String clientId;
  final String clientName;
  final String clientPhone;
  final String date; // 'YYYY-MM-DD'
  final String eventTime;
  final String eventType;
  final String city;
  final String locationType;
  final int guests;
  final String materialType;
  final String materialColor;
  final int sabbabatCount;
  final int workersCount;
  final String clothesType;
  final String clothesColor;
  final num amount;
  final num discount;
  final num paidAmount;
  final String paymentStatus; // paid | deposit | unpaid
  final String status; // active | pending | cancelled | rejected
  final num tipsAmount;
  final bool tipsDistributed;
  final bool paymentCompleted;
  final bool closed;
  final String notes;
  final List<StaffMember> staff;

  BookingModel({
    required this.id,
    this.clientId = '',
    required this.clientName,
    this.clientPhone = '',
    required this.date,
    this.eventTime = '',
    this.eventType = '',
    this.city = '',
    this.locationType = '',
    this.guests = 0,
    this.materialType = '',
    this.materialColor = '',
    this.sabbabatCount = 0,
    this.workersCount = 0,
    this.clothesType = '',
    this.clothesColor = '',
    this.amount = 0,
    this.discount = 0,
    this.paidAmount = 0,
    this.paymentStatus = 'unpaid',
    this.status = 'active',
    this.tipsAmount = 0,
    this.tipsDistributed = false,
    this.paymentCompleted = false,
    this.closed = false,
    this.notes = '',
    this.staff = const [],
  });

  num get netTotal => amount - discount;
  num get remaining => (netTotal - paidAmount) > 0 ? netTotal - paidAmount : 0;
  List<StaffMember> staffByRole(String role) => staff.where((s) => s.role == role).toList();

  /// 'done' | 'partial' | 'none' for a role.
  String roleStatus(String role) {
    final n = staffByRole(role).length;
    final required = role == 'صبابة' ? sabbabatCount : role == 'عاملة' ? workersCount : null;
    if (n == 0) return 'none';
    if (required != null && required > 0 && n < required) return 'partial';
    return 'done';
  }

  factory BookingModel.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return BookingModel(
      id: doc.id,
      clientId: d['clientId'] ?? '',
      clientName: d['clientName'] ?? '',
      clientPhone: d['clientPhone'] ?? '',
      date: d['date'] ?? '',
      eventTime: d['eventTime'] ?? '',
      eventType: d['eventType'] ?? '',
      city: d['city'] ?? '',
      locationType: d['locationType'] ?? '',
      guests: (d['guests'] ?? 0) is int ? d['guests'] ?? 0 : (d['guests'] as num).toInt(),
      materialType: d['materialType'] ?? '',
      materialColor: d['materialColor'] ?? '',
      sabbabatCount: (d['sabbabatCount'] ?? 0) is int ? d['sabbabatCount'] ?? 0 : (d['sabbabatCount'] as num).toInt(),
      workersCount: (d['workersCount'] ?? 0) is int ? d['workersCount'] ?? 0 : (d['workersCount'] as num).toInt(),
      clothesType: d['clothesType'] ?? '',
      clothesColor: d['clothesColor'] ?? '',
      amount: d['amount'] ?? 0,
      discount: d['discount'] ?? 0,
      paidAmount: d['paidAmount'] ?? 0,
      paymentStatus: d['paymentStatus'] ?? 'unpaid',
      status: d['status'] ?? 'active',
      tipsAmount: d['tipsAmount'] ?? 0,
      tipsDistributed: d['tipsDistributed'] == true,
      paymentCompleted: d['paymentCompleted'] == true,
      closed: d['closed'] == true,
      notes: d['notes'] ?? '',
      staff: (d['staff'] as List?)?.map((e) => StaffMember.fromMap(Map<String, dynamic>.from(e))).toList() ?? const [],
    );
  }

  Map<String, dynamic> toMap() => {
        'clientId': clientId,
        'clientName': clientName,
        'clientPhone': clientPhone,
        'date': date,
        'eventTime': eventTime,
        'eventType': eventType,
        'city': city,
        'locationType': locationType,
        'guests': guests,
        'materialType': materialType,
        'materialColor': materialColor,
        'sabbabatCount': sabbabatCount,
        'workersCount': workersCount,
        'clothesType': clothesType,
        'clothesColor': clothesColor,
        'amount': amount,
        'discount': discount,
        'paidAmount': paidAmount,
        'paymentStatus': paymentStatus,
        'status': status,
        'tipsAmount': tipsAmount,
        'tipsDistributed': tipsDistributed,
        'paymentCompleted': paymentCompleted,
        'closed': closed,
        'notes': notes,
        'staff': staff.map((s) => s.toMap()).toList(),
      };
}
