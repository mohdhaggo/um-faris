import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, KeyRound, Power } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../store/Auth';
import { PageHeader, Spinner, Empty, Field, Input, Select, PasswordInput } from '../components/ui';
import Modal from '../components/Modal';

export default function Users() {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [pwd, setPwd] = useState(null);

  const load = () => api.get('/api/users').then(setList);
  useEffect(() => {
    load();
  }, []);

  const toggle = async (u) => {
    await api.post(`/api/users/${u.id}/status`, { status: u.status === 'active' ? 'inactive' : 'active' });
    load();
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
        <div className="card overflow-hidden">
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
                  <td className="px-4 py-3 text-stone-600">{u.phone || '—'}</td>
                  <td className="px-4 py-3">
                    {u.status === 'pending_activation' ? (
                      <span className="chip bg-amber-100 text-amber-700">في انتظار التفعيل</span>
                    ) : (
                      <button onClick={() => toggle(u)} className={`chip ${u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-600'}`}>
                        <Power size={13} /> {u.status === 'active' ? 'مفعّل' : 'موقوف'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" title="تغيير كلمة السر" onClick={() => setPwd(u)}><KeyRound size={16} /></button>
                      <button className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" title="تعديل" onClick={() => setEdit(u)}><Pencil size={16} /></button>
                      <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="حذف" onClick={() => remove(u.id)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && <UserModal item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {pwd && <PasswordModal user={pwd} onClose={() => setPwd(null)} />}
    </div>
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
        <Field label="رقم الجوال"><Input type="tel" value={f.phone || ''} onChange={set('phone')} /></Field>
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
  const [val, setVal] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      await api.post(`/api/users/${user.id}/password`, { password: val });
      setDone(true);
      setTimeout(onClose, 800);
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <Modal open title={`تغيير كلمة السر — ${user.name}`} size="sm" onClose={onClose}>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{err}</div>}
      <Field label="كلمة المرور الجديدة"><PasswordInput value={val} onChange={(e) => setVal(e.target.value)} autoFocus /></Field>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-soft" onClick={onClose}>إلغاء</button>
        <button className="btn-primary" onClick={save}>{done ? 'تم ✓' : 'حفظ'}</button>
      </div>
    </Modal>
  );
}
