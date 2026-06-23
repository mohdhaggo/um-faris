import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Package, Coffee } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Spinner, Empty, Field, Input, Select } from '../components/ui';
import Modal from '../components/Modal';
import { SAR } from '../constants';

export default function Services() {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);

  const load = () => api.get('/api/services').then(setList);
  useEffect(() => {
    load();
  }, []);

  const remove = async (id) => {
    if (!confirm('حذف هذا العنصر؟')) return;
    await api.del(`/api/services/${id}`);
    load();
  };

  const services = (list || []).filter((s) => s.kind === 'service');
  const packages = (list || []).filter((s) => s.kind === 'package');

  return (
    <div>
      <PageHeader title="إدارة الخدمات" subtitle="الخدمات والباقات والأسعار">
        <button className="btn-primary" onClick={() => setEdit({})}><Plus size={16} /> إضافة خدمة أو باقة</button>
      </PageHeader>

      {!list ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-500" /></div>
      ) : list.length === 0 ? (
        <Empty>لا توجد خدمات بعد</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Group title="الخدمات" icon={<Coffee size={18} />} items={services} onEdit={setEdit} onDelete={remove} />
          <Group title="الباقات" icon={<Package size={18} />} items={packages} onEdit={setEdit} onDelete={remove} />
        </div>
      )}

      {edit && <ServiceModal item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function Group({ title, icon, items, onEdit, onDelete }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 font-extrabold text-brand-700">{icon} {title}</h3>
      <div className="space-y-2">
        {items.length === 0 && <Empty>لا يوجد</Empty>}
        {items.map((s) => (
          <div key={s.id} className="card flex items-center justify-between p-4">
            <div>
              <div className="font-extrabold text-stone-800">{s.name}</div>
              {s.description && <div className="text-sm text-stone-500">{s.description}</div>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-extrabold text-brand-600">{SAR(s.price)}</span>
              <button className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" onClick={() => onEdit(s)}><Pencil size={16} /></button>
              <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={() => onDelete(s.id)}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceModal({ item, onClose, onSaved }) {
  const [f, setF] = useState({ name: '', kind: 'service', price: '', description: '', ...item });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    const payload = { ...f, price: Number(f.price) || 0 };
    if (item.id) await api.put(`/api/services/${item.id}`, payload);
    else await api.post('/api/services', payload);
    onSaved();
  };
  return (
    <Modal open title={item.id ? 'تعديل' : 'إضافة خدمة / باقة'} size="sm" onClose={onClose}>
      <div className="space-y-3">
        <Field label="الاسم"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="النوع">
          <Select value={f.kind} onChange={set('kind')}>
            <option value="service">خدمة</option>
            <option value="package">باقة</option>
          </Select>
        </Field>
        <Field label="السعر (ر.س)"><Input type="number" min="0" value={f.price} onChange={set('price')} /></Field>
        <Field label="الوصف"><textarea className="input" rows="2" value={f.description || ''} onChange={set('description')} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-soft" onClick={onClose}>إلغاء</button>
        <button className="btn-primary" onClick={save}>حفظ</button>
      </div>
    </Modal>
  );
}
