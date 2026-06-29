import { useEffect, useState } from 'react';
import { verifyPasswordResetCode, confirmPasswordReset, applyActionCode } from 'firebase/auth';
import { CheckCircle2, XCircle } from 'lucide-react';
import { auth } from '../firebase';
import { Spinner, PasswordInput } from '../components/ui';
import { PASSWORD_RULES, validatePassword } from '../utils/password';

const params = () => new URLSearchParams(window.location.search);

export default function AuthAction() {
  const mode = params().get('mode');
  const oobCode = params().get('oobCode');

  const [phase, setPhase] = useState('loading'); // loading | form | done | error | verified-email
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!oobCode) { setErr('رابط غير صالح'); setPhase('error'); return; }
    (async () => {
      try {
        if (mode === 'resetPassword') {
          const mail = await verifyPasswordResetCode(auth, oobCode);
          setEmail(mail);
          setPhase('form');
        } else if (mode === 'verifyEmail') {
          await applyActionCode(auth, oobCode);
          setPhase('verified-email');
        } else {
          setErr('نوع الطلب غير مدعوم');
          setPhase('error');
        }
      } catch {
        setErr('انتهت صلاحية الرابط أو أنه غير صالح. اطلب رابطاً جديداً.');
        setPhase('error');
      }
    })();
  }, [mode, oobCode]);

  const policyOk = validatePassword(pwd);
  const match = pwd && pwd === confirm;
  const canSubmit = policyOk && match && !saving;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!policyOk) { setErr('كلمة المرور لا تطابق الشروط'); return; }
    if (!match) { setErr('كلمتا المرور غير متطابقتين'); return; }
    setSaving(true);
    try {
      await confirmPasswordReset(auth, oobCode, pwd);
      setPhase('done');
    } catch {
      setErr('تعذّر تعيين كلمة المرور. قد يكون الرابط منتهي الصلاحية.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-bl from-brand-800 via-brand-700 to-brand-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-brand-50">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-400 text-3xl">☕</div>
          <h1 className="text-3xl font-extrabold">أم فارس</h1>
          <p className="text-brand-200">تعيين كلمة مرور جديدة</p>
        </div>

        <div className="card space-y-4 p-6">
          {phase === 'loading' && (
            <div className="flex justify-center py-8"><Spinner className="h-8 w-8 text-brand-500" /></div>
          )}

          {phase === 'error' && (
            <div className="space-y-4 text-center">
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{err}</div>
              <a href="/" className="btn-primary inline-flex">العودة لتسجيل الدخول</a>
            </div>
          )}

          {phase === 'verified-email' && (
            <div className="space-y-4 text-center">
              <p className="font-bold text-emerald-600">تم تأكيد بريدك الإلكتروني ✓</p>
              <a href="/" className="btn-primary inline-flex">تسجيل الدخول</a>
            </div>
          )}

          {phase === 'done' && (
            <div className="space-y-4 text-center">
              <p className="text-base font-extrabold text-emerald-600">تم تعيين كلمة المرور بنجاح ✓</p>
              <p className="text-sm text-stone-500">يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.</p>
              <a href="/" className="btn-primary inline-flex">تسجيل الدخول</a>
            </div>
          )}

          {phase === 'form' && (
            <form onSubmit={submit} className="space-y-4">
              {email && (
                <p className="text-center text-sm text-stone-500">
                  الحساب: <span dir="ltr" className="font-bold text-stone-700">{email}</span>
                </p>
              )}
              {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{err}</div>}

              <label className="block">
                <span className="label">كلمة المرور الجديدة</span>
                <PasswordInput value={pwd} onChange={(e) => setPwd(e.target.value)} autoFocus required />
              </label>

              <label className="block">
                <span className="label">تأكيد كلمة المرور</span>
                <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                {confirm && !match && <span className="mt-1 block text-xs font-bold text-red-600">كلمتا المرور غير متطابقتين</span>}
              </label>

              {/* live policy checklist */}
              <ul className="space-y-1 rounded-lg bg-stone-50 p-3">
                {PASSWORD_RULES.map((r) => {
                  const ok = r.test(pwd);
                  return (
                    <li key={r.label} className={`flex items-center gap-2 text-xs font-bold ${ok ? 'text-emerald-600' : 'text-stone-400'}`}>
                      {ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {r.label}
                    </li>
                  );
                })}
              </ul>

              <button className="btn-primary w-full" disabled={!canSubmit}>
                {saving ? <Spinner className="h-5 w-5" /> : 'تعيين كلمة المرور'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
