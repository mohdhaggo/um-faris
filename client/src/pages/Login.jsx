import { useState } from 'react';
import { useAuth } from '../store/Auth';
import { Spinner, PasswordInput } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-bl from-brand-800 via-brand-700 to-brand-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-brand-50">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-400 text-3xl">☕</div>
          <h1 className="text-3xl font-extrabold">أم فارس</h1>
          <p className="text-brand-200">نظام إدارة الحجوزات والمناسبات</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <h2 className="text-xl font-extrabold text-stone-800">تسجيل الدخول</h2>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{err}</div>}
          <label className="block">
            <span className="label">البريد الإلكتروني</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block">
            <span className="label">كلمة المرور</span>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? <Spinner className="h-5 w-5" /> : 'دخول'}
          </button>
          <p className="text-center text-xs text-stone-400">الدخول بدعوة فقط — تواصل مع المدير لإنشاء حساب</p>
        </form>
      </div>
    </div>
  );
}
