# Agent Spec — system prompt + tools

This is the core of the automation: what Claude is told, and the exact set of actions it can take.
The tools map 1:1 to the Firestore schema in `app/lib/models.dart` and the queries in
`app/lib/firestore_service.dart`.

---

## System prompt (give this to Claude)

```
أنتِ مساعدة إدارة حجوزات شركة "أم فارس" للضيافة والمناسبات. تتلقّين الطلبات عبر واتساب من
صاحبة العمل وتنفّذينها على نظام الحجوزات.

دورك:
- تفهمين الطلب بالعربية العامية أو الفصحى (مثل: "احجزي يوم ١٥ يوليو لمنيرة، ٥٠ معزوم").
- تختارين الأداة المناسبة من القائمة المتاحة فقط. لا تنفّذين أي شيء خارج هذه الأدوات.
- إذا نقص أي معلومة ضرورية (الاسم، التاريخ)، تسألين سؤالاً قصيراً واحداً قبل التنفيذ.

قواعد مهمة:
1. التواريخ: حوّلي أي تاريخ إلى صيغة YYYY-MM-DD الميلادية. اليوم هو {{TODAY}}. إذا ذُكر تاريخ
   هجري حوّليه للميلادي. إذا كان التاريخ غامضاً اسألي.
2. قبل أي إنشاء/تعديل/إلغاء: اعرضي ملخصاً واطلبي تأكيداً ("أأكّد الحجز؟ ردّي ✅ أو تأكيد").
   لا تكتبي في النظام إلا بعد التأكيد. عمليات القراءة (التوفّر/عرض الحجوزات) نفّذيها فوراً.
3. لو كان اليوم ممتلئاً (تجاوز الحد), النظام سيضع الحجز في قائمة الانتظار (pending) — أخبري
   المستخدمة بذلك بوضوح.
4. ردودك قصيرة وعملية بالعربية. أكّدي النتيجة بعد التنفيذ ("تم الحجز ✅ — منيرة، ١٥ يوليو، ٥٠ معزوم").
5. لو طُلب منك شيء خارج صلاحياتك (تعديل المستخدمين، الإعدادات، الإكراميات/الإغلاق المالي,
   حذف نهائي)، اعتذري واشرحي أنه غير متاح عبر واتساب.

تتعاملين فقط مع: التوفّر، إنشاء الحجوزات، تعديلها، إلغاؤها، وإدارة قائمة الانتظار.
```

> Replace `{{TODAY}}` at runtime with the current date (n8n can inject `{{$now}}`).

---

## Tools (the allowed actions)

All tools operate on the `bookings` collection. IDs are Firestore document IDs.
Date format everywhere is `YYYY-MM-DD`.

### 1. `check_availability`
Read-only. Is a date free, and how many slots remain?

```json
{
  "name": "check_availability",
  "description": "تتحقق من توفّر يوم معيّن: كم حجز نشط فيه وكم يتبقّى حسب الحد الأقصى لليوم.",
  "input_schema": {
    "type": "object",
    "properties": { "date": { "type": "string", "description": "YYYY-MM-DD" } },
    "required": ["date"]
  }
}
```
**Implementation:** query `bookings where date == {date}` → count those with `status == "active"`.
Read `settings/config` → effective cap = `dayOverrides[date] ?? maxPerDay` (-1 = unlimited).
Return `{ active_count, cap, remaining, is_full }`.

### 2. `list_bookings`
Read-only. List bookings on a date (or a small range).

```json
{
  "name": "list_bookings",
  "description": "تعرض حجوزات يوم معيّن (الاسم، الهاتف، الوقت، الحالة).",
  "input_schema": {
    "type": "object",
    "properties": {
      "date": { "type": "string", "description": "YYYY-MM-DD" },
      "to_date": { "type": "string", "description": "اختياري: نهاية المدى YYYY-MM-DD" }
    },
    "required": ["date"]
  }
}
```
**Implementation:** `bookings where date >= {date} and date <= {to_date||date} orderBy date`.
Return id, clientName, clientPhone, eventTime, status, guests for each.

### 3. `create_booking`
Write (needs confirmation). Adds a booking, honoring the waiting-list rule.

```json
{
  "name": "create_booking",
  "description": "تنشئ حجزاً جديداً. إن كان اليوم ممتلئاً يُحفظ في قائمة الانتظار (pending).",
  "input_schema": {
    "type": "object",
    "properties": {
      "clientName":  { "type": "string" },
      "clientPhone": { "type": "string" },
      "date":        { "type": "string", "description": "YYYY-MM-DD" },
      "eventTime":   { "type": "string" },
      "eventType":   { "type": "string" },
      "city":        { "type": "string" },
      "guests":      { "type": "integer" },
      "amount":      { "type": "number" },
      "notes":       { "type": "string" }
    },
    "required": ["clientName", "date"]
  }
}
```
**Implementation:** read cap for `date` (as in `check_availability`). If `cap != -1` and
`active_count >= cap` → set `status = "pending"`, else `status = "active"`. Build a document with
all `BookingModel` defaults (see below) and POST to `bookings`. Return the new id + final status.

### 4. `edit_booking`
Write (needs confirmation). Updates fields of an existing booking.

```json
{
  "name": "edit_booking",
  "description": "تعدّل حقول حجز قائم (مثل التاريخ، عدد المعازيم، الوقت، المبلغ).",
  "input_schema": {
    "type": "object",
    "properties": {
      "id":      { "type": "string", "description": "معرّف الحجز" },
      "changes": {
        "type": "object",
        "description": "الحقول المراد تغييرها فقط",
        "properties": {
          "date": {"type":"string"}, "eventTime": {"type":"string"},
          "guests": {"type":"integer"}, "city": {"type":"string"},
          "amount": {"type":"number"}, "notes": {"type":"string"},
          "eventType": {"type":"string"}
        }
      }
    },
    "required": ["id", "changes"]
  }
}
```
**Implementation:** PATCH `bookings/{id}` with only the given fields.
If the agent doesn't know the id, it must first `list_bookings` to find it by name+date.

### 5. `cancel_booking`
Write (needs confirmation). Soft-cancels (sets status, never hard-deletes).

```json
{
  "name": "cancel_booking",
  "description": "تلغي حجزاً (تحوّل حالته إلى cancelled). لا تحذفه نهائياً.",
  "input_schema": {
    "type": "object",
    "properties": { "id": { "type": "string" } },
    "required": ["id"]
  }
}
```
**Implementation:** PATCH `bookings/{id}` → `status = "cancelled"`.

### 6. `set_waiting_status`
Write (needs confirmation). Confirm or reject a waiting-list (pending) booking.

```json
{
  "name": "set_waiting_status",
  "description": "تؤكّد أو ترفض حجزاً في قائمة الانتظار. confirm → active، reject → rejected.",
  "input_schema": {
    "type": "object",
    "properties": {
      "id":     { "type": "string" },
      "action": { "type": "string", "enum": ["confirm", "reject"] }
    },
    "required": ["id", "action"]
  }
}
```
**Implementation:** PATCH `bookings/{id}` → `status = action == "confirm" ? "active" : "rejected"`.

---

## New-booking document defaults

When `create_booking` builds a doc, fill every `BookingModel` field so the Flutter app reads it
cleanly (the app tolerates missing keys, but be explicit):

```json
{
  "clientId": "", "clientName": "<req>", "clientPhone": "",
  "date": "<req>", "eventTime": "", "eventType": "", "city": "",
  "locationType": "", "guests": 0, "materialType": "", "materialColor": "",
  "sabbabatCount": 0, "workersCount": 0, "clothesType": "", "clothesColor": "",
  "amount": 0, "discount": 0, "paidAmount": 0, "paymentStatus": "unpaid",
  "status": "active | pending",
  "tipsAmount": 0, "tipsDistributed": false, "paymentCompleted": false,
  "closed": false, "notes": "", "staff": [], "customFields": {}
}
```

## Explicitly NOT exposed (out of scope by design)

- `users` collection (auth/roles) — never touched.
- `settings/config` — agent reads the cap but never writes settings.
- Financial close-out (`paidAmount`, `tipsAmount`, `closed`) — too sensitive for chat.
- Hard delete (`deleteBooking`) — cancel is soft only.
- Staff assignment — done in the app UI.

## Firestore REST cheat-sheet (for the n8n HTTP nodes)

Base: `https://firestore.googleapis.com/v1/projects/umfaris-1efca/databases/(default)/documents`

- Read a date:  `:runQuery` with a structured query `where date == {date}`.
- Create:       `POST /bookings` with `{ "fields": { ... } }` (typed values, e.g. `{"stringValue": "..."}`).
- Update:       `PATCH /bookings/{id}?updateMask.fieldPaths=status&...`.
- Auth header:  `Authorization: Bearer <OAuth token from the service account>`
  (n8n's Google Service Account credential mints this automatically).
