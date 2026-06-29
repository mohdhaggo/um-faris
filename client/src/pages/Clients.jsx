import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, List } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Spinner, Empty, Field, Input, PhoneInput } from '../components/ui';
import Modal from '../components/Modal';
import BookingDetails from '../components/BookingDetails';
import { SAR, fmtDate } from '../constants';

export default function Clients() {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [more, setMore] = useState(null);

  const load = () => api.get('/api/clients').then(setList);
  useEffect(() => {
    load();
  }, []);

  const remove = async (id) => {
    if (!confirm('حذف العميل؟')) return;
    await api.del(`/api/clients/${id}`);
    load();
  };

  return (
    <div>
      <PageHeader title="إدارة العملاء" subtitle="بيانات العملاء المسجلين">
        <button className="btn-primary" onClick={() => setEdit({})}><Plus size={16} /> إضافة عميل</button>
      </PageHeader>

      {!list ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-500" /></div>
      ) : list.length === 0 ? (
        <Empty>لا يوجد عملاء</Empty>
      ) : (
        <>
          {/* desktop table */}
          <div className="card hidden overflow-hidden sm:block">
            <table className="w-full text-right text-sm">
              <thead className="bg-stone-50 text-xs font-bold text-stone-500">
                <tr>
                  <th className="px-4 py-3">اسم العميل</th>
                  <th className="px-4 py-3">رقم الجوال</th>
                  <th className="px-4 py-3">عدد الحجوزات</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {list.map((c) => (
                  <tr key={c.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-3 font-bold text-stone-800">{c.name}</td>
                    <td className="px-4 py-3 text-stone-600" dir="ltr">{c.phone || '—'}</td>
                    <td className="px-4 py-3"><span className="chip bg-brand-100 text-brand-700">{c.bookings_count}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost" onClick={() => setMore(c)}><List size={15} /> المزيد</button>
                        <button className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" onClick={() => setEdit(c)}><Pencil size={16} /></button>
                        <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={() => remove(c.id)}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <div className="space-y-3 sm:hidden">
            {list.map((c) => (
              <div key={c.id} className="card p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-stone-800">{c.name}</div>
                    {c.phone && <div className="text-sm text-stone-500" dir="ltr">{c.phone}</div>}
                  </div>
                  <span className="chip shrink-0 bg-brand-100 text-brand-700">{c.bookings_count} حجز</span>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5 border-t border-stone-100 pt-2">
                  <button className="btn-ghost" onClick={() => setMore(c)}><List size={15} /> المزيد</button>
                  <button className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" onClick={() => setEdit(c)}><Pencil size={16} /></button>
                  <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={() => remove(c.id)}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {edit && <ClientModal item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {more && <ClientHistory client={more} onClose={() => setMore(null)} />}
    </div>
  );
}

function ClientModal({ item, onClose, onSaved }) {
  const [f, setF] = useState({ name: '', phone: '', ...item });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    if (item.id) await api.put(`/api/clients/${item.id}`, f);
    else await api.post('/api/clients', f);
    onSaved();
  };
  return (
    <Modal open title={item.id ? 'تعديل العميل' : 'إضافة عميل'} size="sm" onClose={onClose}>
      <div className="space-y-3">
        <Field label="اسم العميل"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="رقم الجوال"><PhoneInput value={f.phone || ''} onChange={(v) => setF((s) => ({ ...s, phone: v }))} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-soft" onClick={onClose}>إلغاء</button>
        <button className="btn-primary" onClick={save}>حفظ</button>
      </div>
    </Modal>
  );
}

function ClientHistory({ client, onClose }) {
  const [data, setData] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const load = () => api.get(`/api/clients/${client.id}`).then(setData);
  useEffect(() => {
    load();
  }, [client.id]);

  return (
    <Modal open title={`طلبات العميل: ${client.name}`} size="md" onClose={onClose}>
      {!data ? (
        <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-brand-500" /></div>
      ) : data.bookings.length === 0 ? (
        <Empty>لا توجد طلبات سابقة</Empty>
      ) : detailId ? (
        <div>
          <button className="btn-soft mb-3" onClick={() => setDetailId(null)}>← رجوع للقائمة</button>
          <BookingDetails bookingId={detailId} onClose={() => setDetailId(null)} onChanged={load} />
        </div>
      ) : (
        <div className="space-y-2">
          {data.bookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-xl border border-stone-200 p-3">
              <div>
                <div className="font-bold text-stone-800">{b.event_type} — {fmtDate(b.booking_date)}</div>
                <div className="text-sm text-stone-500">{b.city}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-extrabold text-brand-600">{SAR(b.net_total)}</span>
                <button className="btn-ghost" onClick={() => setDetailId(b.id)}>تفاصيل أكثر</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
