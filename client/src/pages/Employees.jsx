import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Spinner, Empty, Field, Input, PhoneInput } from '../components/ui';
import Modal from '../components/Modal';
import { useSettings } from '../store/Settings';
import { SAR } from '../constants';

export default function Employees() {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);

  const load = () => api.get('/api/employees').then(setList);
  useEffect(() => {
    load();
  }, []);

  const remove = async (id) => {
    if (!confirm('حذف الموظف؟')) return;
    await api.del(`/api/employees/${id}`);
    load();
  };

  return (
    <div>
      <PageHeader title="إدارة الموظفين" subtitle="الموظفون المسجلون للعمل">
        <button className="btn-primary" onClick={() => setEdit({})}><Plus size={16} /> إضافة موظف</button>
      </PageHeader>

      {!list ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-500" /></div>
      ) : list.length === 0 ? (
        <Empty>لا يوجد موظفون</Empty>
      ) : (
        <>
          {/* desktop table */}
          <div className="card hidden overflow-hidden sm:block">
            <table className="w-full text-right text-sm">
              <thead className="bg-stone-50 text-xs font-bold text-stone-500">
                <tr>
                  <th className="px-4 py-3">اسم الموظف</th>
                  <th className="px-4 py-3">رقم الجوال</th>
                  <th className="px-4 py-3">نوع الوظيفة</th>
                  <th className="px-4 py-3">أجر مبدئي</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {list.map((e) => (
                  <tr key={e.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-3 font-bold text-stone-800">{e.name}</td>
                    <td className="px-4 py-3 text-stone-600" dir="ltr">{e.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {e.job_types.map((j) => <span key={j} className="chip bg-brand-100 text-brand-700">{j}</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-stone-700">{SAR(e.wage)}</td>
                    <td className="px-4 py-3">
                      <span className={`chip ${e.active ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                        {e.active ? 'متاح' : 'متوقف'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" onClick={() => setEdit(e)}><Pencil size={16} /></button>
                        <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={() => remove(e.id)}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <div className="space-y-3 sm:hidden">
            {list.map((e) => (
              <div key={e.id} className="card p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-stone-800">{e.name}</div>
                    {e.phone && <div className="text-sm text-stone-500" dir="ltr">{e.phone}</div>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {e.job_types.map((j) => <span key={j} className="chip bg-brand-100 text-brand-700">{j}</span>)}
                    </div>
                  </div>
                  <span className={`chip shrink-0 ${e.active ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                    {e.active ? 'متاح' : 'متوقف'}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-stone-100 pt-2">
                  <span className="text-sm font-bold text-stone-700">{SAR(e.wage)}</span>
                  <div className="flex gap-1">
                    <button className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" onClick={() => setEdit(e)}><Pencil size={16} /></button>
                    <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={() => remove(e.id)}><Trash2 size={16} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {edit && <EmployeeModal item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function EmployeeModal({ item, onClose, onSaved }) {
  const { jobTypes } = useSettings();
  const [f, setF] = useState({ name: '', phone: '', job_types: [], wage: '', active: true, ...item });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const toggleJob = (j) =>
    setF((s) => ({ ...s, job_types: s.job_types.includes(j) ? s.job_types.filter((x) => x !== j) : [...s.job_types, j] }));
  const save = async () => {
    const payload = { ...f, wage: Number(f.wage) || 0 };
    if (item.id) await api.put(`/api/employees/${item.id}`, payload);
    else await api.post('/api/employees', payload);
    onSaved();
  };
  return (
    <Modal open title={item.id ? 'تعديل موظف' : 'إضافة موظف'} size="sm" onClose={onClose}>
      <div className="space-y-3">
        <Field label="اسم الموظف"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="رقم الجوال"><PhoneInput value={f.phone || ''} onChange={(v) => setF((s) => ({ ...s, phone: v }))} /></Field>
        <div>
          <span className="label">نوع الوظيفة (يمكن اختيار أكثر من واحدة)</span>
          <div className="flex flex-wrap gap-2">
            {jobTypes.map((j) => (
              <button
                type="button"
                key={j}
                onClick={() => toggleJob(j)}
                className={`chip border ${f.job_types.includes(j) ? 'border-brand-400 bg-brand-100 text-brand-700' : 'border-stone-200 bg-white text-stone-500'}`}
              >
                {j}
              </button>
            ))}
          </div>
        </div>
        <Field label="أجر مبدئي اختياري (يُحدّد فعلياً عند إنهاء كل حجز)"><Input type="number" min="0" value={f.wage} onChange={set('wage')} /></Field>
        <label className="flex items-center gap-2 text-sm font-bold text-stone-700">
          <input type="checkbox" checked={f.active} onChange={(e) => setF((s) => ({ ...s, active: e.target.checked }))} /> متاح للعمل
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-soft" onClick={onClose}>إلغاء</button>
        <button className="btn-primary" onClick={save}>حفظ</button>
      </div>
    </Modal>
  );
}
