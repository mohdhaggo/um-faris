# النشر على Oracle Cloud (OCI) — طبقة Always Free

نشر بحاوية واحدة: الخادم + الويب خلف Caddy (HTTPS تلقائي). قاعدة SQLite على قرص دائم.

## أولاً: تجهيز OCI (مرة واحدة)
1. أنشئ حساباً على https://www.oracle.com/cloud/free/ (بطاقة للتحقق، بلا رسوم على Always Free).
2. **Compute → Create Instance**:
   - **Shape**: `VM.Standard.A1.Flex` (Ampere — Always Free)، مثلاً 1–2 OCPU و6–12GB RAM.
     إن ظهرت رسالة عدم توفّر السعة، جرّب منطقة/نطاق توفّر آخر، أو استخدم `VM.Standard.E2.1.Micro` (Always Free).
   - **Image**: Ubuntu 22.04.
   - **SSH**: ارفع مفتاحك العام (أو ولّد زوجاً واحفظ المفتاح الخاص).
   - الـ Boot volume الافتراضي (~47GB) كافٍ (الحدّ المجاني 200GB).
3. **Networking (Security List أو NSG)** — أضف قواعد Ingress:
   - TCP 22 (SSH) من `0.0.0.0/0`
   - TCP 80 و TCP 443 من `0.0.0.0/0`
4. **النطاق (DNS)**: أضف سجل `A` لنطاقك يشير إلى **IP العام** للخادم.
   - لا تملك نطاقاً؟ استخدم نطاقاً فرعياً مجانياً عبر DuckDNS وضعه في `DOMAIN`.

## ثانياً: التشغيل على الخادم
```bash
ssh ubuntu@<PUBLIC_IP>
# انسخ المشروع (git clone أو scp) ثم:
cd application/deploy
cp .env.example .env
nano .env            # املأ DOMAIN و JWT_SECRET
chmod +x setup.sh
./setup.sh
```
بعد دقيقة، افتح: `https://<DOMAIN>` — وستظهر شاشة الدخول.
> غيّر كلمة مرور المدير الافتراضية فوراً من «إدارة المستخدمين».

## ثالثاً: تطبيق أندرويد
اضبط عنوان الـ API على نطاقك ثم ابنِ الـ APK (سحابياً عبر GitHub Actions أو محلياً عبر Android Studio):
```
VITE_API_BASE=https://<DOMAIN>
```

## ما أحتاجه منك لإكمال النشر
1. **النطاق** الذي ستستخدمه (أو موافقتك على DuckDNS مجاني).
2. بعد إنشاء الخادم: **IP العام** + تأكيد أن DNS يشير إليه.
3. خياري: إن رغبت أن أنفّذ النشر مباشرةً، زوّدني بوصول SSH؛ وإلا تشغّل `setup.sh` بنفسك وأرشدك.

> قاعدة البيانات: اعتمدنا **SQLite على قرص دائم** (مناسب لحجمك). عند الحاجة للتوسّع أرقّيها إلى PostgreSQL.
