import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, KeyRound } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../store/Auth';
import { PageHeader, Spinner, Empty, Field, Input, Select, PasswordInput, PhoneInput } from '../components/ui';
import Modal from '../components/Modal';

const STATUS_CHIP = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-stone-200 text-stone-600',
  pending_activation: 'bg-amber-100 text-amber-700',
};
const STATUS_LABEL = {
  active: 'مفعّل',
  inactive: 'موقوف',
  pending_activation: 'في انتظار التفعيل',
};

export default function Users() {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [pwd, setPwd] = useState(null);

  const load = () => api.get('/api/users').then(setList);
  useEffect(() => { load(); }, []);

  const toggle = async (u) => {
    await api.post(`/api/users/${u.id}/status`, { status: u.status === 'active' ? 'inactive' : 'active' });
    load();
  };

  const resendActivation = async (u) => {
    try {
      await api.post(`/api/users/${u.id}/password`, {});
      alert('تم إرسال رابط التفعيل إلى ' + u.email);
    } catch (e) {
      alert(e.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('حذف المستخدم؟')) return;
    try {
      await api.del(`/api/users/${id}`);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div>
      <PageHeader title="إدارة المستخدمين" subtitle="مستخدمو النظام">
        <button className="btn-primary" onClick={() => setEdit({})}><Plus size={16} /> إضافة مستخدم</button>
      </PageHeader>

      {!list ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-500" /></div>
      ) : list.length === 0 ? (
        <Empty>لا يوجد مستخدمون</Empty>
      ) : (
        <>
          {/* desktop table */}
          <div className="card hidden overflow-hidden sm:block">
            <table className="w-full text-right text-sm">
              <thead className="bg-stone-50 text-xs font-bold text-stone-500">
                <tr>
                  <th className="px-4 py-3">اسم المستخدم</th>
                  <th className="px-4 py-3">البريد الإلكتروني</th>
                  <th className="px-4 py-3">رقم الجوال</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {list.map((u) => (
                  <tr key={u.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-3 font-bold text-stone-800">
                      {u.name} {u.id === user.id && <span className="chip bg-brand-100 text-brand-700">أنت</span>}
                    </td>
                    <td className="px-4 py-3 text-stone-600" dir="ltr">{u.email}</td>
                    <td className="px-4 py-3 text-stone-600" dir="ltr">{u.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`chip ${STATUS_CHIP[u.status] || 'bg-stone-100 text-stone-500'}`}>
                        {STATUS_LABEL[u.status] || u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <UserActions u={u} me={user.id} {...{ toggle, resendActivation, setPwd, setEdit, remove }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <div className="space-y-3 sm:hidden">
            {list.map((u) => (
              <div key={u.id} className="card p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-stone-800">
                      {u.name} {u.id === user.id && <span className="chip bg-brand-100 text-brand-700">أنت</span>}
                    </div>
                    <div className="truncate text-sm text-stone-500" dir="ltr">{u.email}</div>
                    {u.phone && <div className="text-sm text-stone-500" dir="ltr">{u.phone}</div>}
                  </div>
                  <span className={`chip shrink-0 ${STATUS_CHIP[u.status] || 'bg-stone-100 text-stone-500'}`}>
                    {STATUS_LABEL[u.status] || u.status}
                  </span>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5 border-t border-stone-100 pt-2">
                  <UserActions u={u} me={user.id} {...{ toggle, resendActivation, setPwd, setEdit, remove }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {edit && <UserModal item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {pwd && <PasswordModal user={pwd} onClose={() => setPwd(null)} />}
    </div>
  );
}

function UserActions({ u, me, toggle, resendActivation, setPwd, setEdit, remove }) {
  return (
    <>
      {u.status === 'pending_activation' ? (
        <button
          className="rounded-lg border border-amber-200 px-2 py-1 text-xs font-bold text-amber-600 hover:bg-amber-50"
          onClick={() => resendActivation(u)}
          title="إعادة إرسال رابط التفعيل"
        >
          إرسال رابط التفعيل
        </button>
      ) : (
        <>
          <button
            className={`rounded-lg border px-2 py-1 text-xs font-bold ${
              u.status === 'active'
                ? 'border-stone-200 text-stone-600 hover:bg-stone-100'
                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
            }`}
            onClick={() => toggle(u)}
            disabled={u.id === me}
            title={u.status === 'active' ? 'إيقاف المستخدم' : 'تفعيل المستخدم'}
          >
            {u.status === 'active' ? 'إيقاف' : 'تفعيل'}
          </button>
          <button className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" title="تغيير كلمة السر" onClick={() => setPwd(u)}>
            <KeyRound size={16} />
          </button>
        </>
      )}
      <button className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" title="تعديل" onClick={() => setEdit(u)}>
        <Pencil size={16} />
      </button>
      <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="حذف" onClick={() => remove(u.id)}>
        <Trash2 size={16} />
      </button>
    </>
  );
}

function UserModal({ item, onClose, onSaved }) {
  const isNew = !item.id;
  const [f, setF] = useState({ name: '', email: '', phone: '', role: 'user', status: 'active', password: '', ...item });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    setErr('');
    try {
      if (isNew) await api.post('/api/users', f);
      else await api.put(`/api/users/${item.id}`, f);
      onSaved();
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <Modal open title={isNew ? 'إضافة مستخدم' : 'تعديل المستخدم'} size="sm" onClose={onClose}>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{err}</div>}
      <div className="space-y-3">
        <Field label="اسم المستخدم"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="البريد الإلكتروني"><Input type="email" dir="ltr" value={f.email} onChange={set('email')} /></Field>
        <Field label="رقم الجوال"><PhoneInput value={f.phone || ''} onChange={(v) => setF((s) => ({ ...s, phone: v }))} /></Field>
        <Field label="الصلاحية">
          <Select value={f.role} onChange={set('role')}>
            <option value="admin">مدير</option>
            <option value="user">مستخدم</option>
          </Select>
        </Field>
        {isNew && <Field label="كلمة المرور"><PasswordInput value={f.password} onChange={set('password')} /></Field>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-soft" onClick={onClose}>إلغاء</button>
        <button className="btn-primary" onClick={save}>حفظ</button>
      </div>
    </Modal>
  );
}

function PasswordModal({ user, onClose }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    setErr('');
    try {
      await api.post(`/api/users/${user.id}/password`, {});
      setDone(true);
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <Modal open title={`تغيير كلمة السر — ${user.name}`} size="sm" onClose={onClose}>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{err}</div>}
      {done ? (
        <p className="text-sm font-bold text-emerald-600">
          تم إرسال رابط تعيين كلمة المرور إلى {user.email} ✓
        </p>
      ) : (
        <p className="text-sm text-stone-600">
          سيُرسَل رابط تعيين كلمة المرور إلى{' '}
          <span dir="ltr" className="font-bold text-stone-800">{user.email}</span>
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-soft" onClick={onClose}>إغلاق</button>
        {!done && <button className="btn-primary" onClick={send}>إرسال الرابط</button>}
      </div>
    </Modal>
  );
}
