import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../store/Auth';
import { Spinner, PasswordInput } from '../components/ui';
import { t, LanguageSwitcher } from '../i18n';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('login'); // login | forgot
  const [sent, setSent] = useState(false);

  const switchMode = (m) => { setMode(m); setErr(''); setSent(false); };

  const sendReset = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (e) {
      // Unknown emails get the same response, so the form can't be used to discover accounts.
      if (e.code === 'auth/user-not-found') setSent(true);
      else if (e.code === 'auth/invalid-email') setErr(t('البريد الإلكتروني غير صالح'));
      else if (e.code === 'auth/too-many-requests') setErr(t('محاولات كثيرة، حاول مرة أخرى لاحقاً'));
      else setErr(t('تعذّر إرسال الرابط، حاول مرة أخرى'));
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-bl from-brand-800 via-brand-700 to-brand-900 p-4">
      <LanguageSwitcher light className="absolute end-4 top-4" />
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-brand-50">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-400 text-3xl">☕</div>
          <h1 className="text-3xl font-extrabold">{t('أم فارس')}</h1>
          <p className="text-brand-200">{t('نظام إدارة الحجوزات والمناسبات')}</p>
        </div>
        {mode === 'forgot' ? (
          <form onSubmit={sendReset} className="card space-y-4 p-6">
            <h2 className="text-xl font-extrabold text-stone-800">{t('نسيت كلمة المرور')}</h2>
            {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{err}</div>}
            {sent ? (
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                {t('إذا كان البريد مسجلاً لدينا، فستصلك رسالة تحتوي على رابط لتعيين كلمة مرور جديدة. تحقق من صندوق الوارد والبريد غير المرغوب فيه.')}
              </div>
            ) : (
              <>
                <p className="text-sm text-stone-500">{t('أدخل بريدك الإلكتروني وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.')}</p>
                <label className="block">
                  <span className="label">{t('البريد الإلكتروني')}</span>
                  <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </label>
                <button className="btn-primary w-full" disabled={loading}>
                  {loading ? <Spinner className="h-5 w-5" /> : t('إرسال رابط إعادة التعيين')}
                </button>
              </>
            )}
            <button type="button" className="w-full text-center text-sm font-bold text-brand-700 hover:underline" onClick={() => switchMode('login')}>
              {t('العودة لتسجيل الدخول')}
            </button>
          </form>
        ) : (
          <form onSubmit={submit} className="card space-y-4 p-6">
            <h2 className="text-xl font-extrabold text-stone-800">{t('تسجيل الدخول')}</h2>
            {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{err}</div>}
            <label className="block">
              <span className="label">{t('البريد الإلكتروني')}</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="label">{t('كلمة المرور')}</label>
                <button type="button" className="mb-1 text-xs font-bold text-brand-700 hover:underline" onClick={() => switchMode('forgot')}>
                  {t('نسيت كلمة المرور؟')}
                </button>
              </div>
              <PasswordInput id="login-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? <Spinner className="h-5 w-5" /> : t('دخول')}
            </button>
            <p className="text-center text-xs text-stone-400">{t('الدخول بدعوة فقط — تواصل مع المدير لإنشاء حساب')}</p>
          </form>
        )}
      </div>
    </div>
  );
}
