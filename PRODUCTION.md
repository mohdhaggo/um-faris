# دليل الإنتاج — تطبيق الويب + أندرويد (حساب موحّد)

## البنية
```
                 ┌─────────────────────────────┐
   متصفح الويب ──▶│                             │
                 │   خادم Express واحد (API)    │──▶ قاعدة بيانات (SQLite على قرص دائم)
 تطبيق أندرويد ──▶│   + يقدّم واجهة الويب         │
   (Capacitor)    └─────────────────────────────┘
```
- **خادم واحد مشترك** ⟵ نفس الحساب (JWT) يعمل من الويب والأندرويد بلا فرق.
- **الويب**: يقدّمه الخادم نفسه على نطاقك.
- **أندرويد**: نفس واجهة React مغلّفة بـ Capacitor، تتصل بنفس الـ API عبر `VITE_API_BASE`.

---

## 1) نشر الخادم (الويب + API)
يعمل على أي مزوّد يدعم Docker (Oracle OCI / Render / Railway / Fly.io / Cloud Run …).

```bash
docker build -t umfaris .
docker run -p 4000:4000 \
  -e JWT_SECRET="ضع-سراً-قوياً-هنا" \
  -e CORS_ORIGINS="https://app.example.com" \
  -v umfaris_data:/data \
  umfaris
```
متغيّرات البيئة:
| المتغيّر | الغرض |
|---|---|
| `JWT_SECRET` | **إلزامي في الإنتاج** — سرّ توقيع الجلسات |
| `CORS_ORIGINS` | نطاقات مسموح لها (افصل بفاصلة). فارغ = الكل |
| `DB_PATH` | مسار ملف قاعدة البيانات (افتراضي `/data/data.db` داخل Docker) |
| `PORT` | منفذ الخادم (افتراضي 4000) |

> الواجهة تُقدَّم من نفس الخادم، لذا تعمل بمسار `/api` نسبي بلا إعداد إضافي.

---

## 2) بناء تطبيق أندرويد
الواجهة جاهزة كمشروع Capacitor في `client/android`.

### الطريقة (أ) — البناء سحابياً عبر GitHub Actions (موصى به، لا يحتاج أدوات محلية)
1. ارفع المشروع إلى مستودع GitHub.
2. من تبويب **Actions** شغّل **Build Android APK** وأدخل عنوان الـ API العام.
3. نزّل ملف `app-debug.apk` من نتائج التشغيل وثبّته للتجربة.

### الطريقة (ب) — محلياً عبر Android Studio
يتطلب **JDK 17+** و**Android Studio** (يثبّتان الـ SDK وGradle). الجهاز الحالي عليه Java 8 فقط، لذا تحتاج تثبيت Android Studio.
```bash
# عند بناء الأندرويد، مرّر عنوان الـ API العام:
# Windows PowerShell:
$env:VITE_API_BASE="https://api.example.com"; npm --prefix client run android:build
npm --prefix client run cap:open:android   # يفتح المشروع في Android Studio
```
ثم من Android Studio: Build APK / Bundle.

### للنشر على Google Play (إصدار release)
- حساب **Google Play Developer** (رسوم لمرة واحدة).
- مفتاح توقيع (keystore) — أُنشئه وأرشدك، ثم `./gradlew bundleRelease` لإنتاج ملف `.aab`.

---

## 3) إشعارات Push (مرحلة لاحقة عبر Firebase)
لتفعيل التذكيرات كإشعارات حقيقية على الجوال:
- مشروع **Firebase** مجاني + ملف `google-services.json`.
- إضافة `@capacitor/push-notifications` + FCM، والخادم يرسل عبر FCM HTTP v1.

---

## ما أحتاجه منك لإكمال النشر
1. **مزوّد استضافة الخادم** + نطاق وHTTPS (أو اختر مزوّداً وأمنحني الوصول/الاعتمادات).
2. **قرار قاعدة البيانات**: SQLite على قرص دائم (مناسب لحجمك الآن) أم الترقية إلى PostgreSQL (أنفّذها عند الحاجة للتوسّع).
3. **للنشر على Play**: حساب Google Play Developer + موافقتك لإنشاء مفتاح التوقيع.
4. **للإشعارات**: مشروع Firebase + `google-services.json`.

## قائمة أمان قبل الإطلاق
- [ ] ضبط `JWT_SECRET` قوي.
- [ ] ضبط `CORS_ORIGINS` على نطاقاتك فقط.
- [ ] HTTPS على الـ API والويب.
- [ ] تغيير كلمة مرور المدير الافتراضية (`admin123`).
- [ ] نسخ احتياطي دوري لملف قاعدة البيانات (`/data`).
