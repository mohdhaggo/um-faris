import { useEffect, useMemo, useState } from 'react';
import { Plus, ChevronLeft, Search, Check, X } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Spinner, Empty } from '../components/ui';
import Modal from '../components/Modal';
import BookingForm from '../components/BookingForm';
import BookingDetails from '../components/BookingDetails';
import { SAR, fmtDate, fmtHijri, PAYMENT_COLORS, PAYMENT_STATUS, staffStatus, STAFF_CLS, STAFF_LABEL } from '../constants';

const pad = (n) => String(n).padStart(2, '0');
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();

const TABS = [
  { key: 'upcoming', label: 'المستقبلية', test: (b) => b.status === 'active' && b.booking_date >= today && !b.closed },
  { key: 'completed', label: 'المكتملة', test: (b) => b.status === 'active' && (b.closed || b.booking_date < today) },
  { key: 'waiting', label: 'حجوزات الانتظار', test: (b) => b.status === 'pending' },
  { key: 'cancelled', label: 'الملغية والمرفوضة', test: (b) => b.status === 'cancelled' || b.status === 'rejected' },
];

export default function Bookings() {
  const [all, setAll] = useState(null);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('upcoming');
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const load = () => api.get('/api/bookings', { q }).then(setAll);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q]);

  const counts = useMemo(() => {
    const c = {};
    for (const t of TABS) c[t.key] = (all || []).filter(t.test).length;
    return c;
  }, [all]);

  const list = useMemo(() => (all || []).filter(TABS.find((t) => t.key === tab).test), [all, tab]);

  const confirm = async (id) => { await api.post(`/api/bookings/${id}/confirm`); load(); };
  const reject = async (id) => { await api.post(`/api/bookings/${id}/reject`); load(); };

  return (
    <div>
      <PageHeader title="إدارة الحجوزات" subtitle="جميع الحجوزات">
        <button className="btn-primary" onClick={() => setAddOpen(true)}><Plus size={16} /> حجز جديد</button>
      </PageHeader>

      {/* tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              tab === t.key ? 'bg-brand-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-50 border border-stone-200'
            }`}
          >
            {t.label}
            <span className={`me-1 rounded-full px-1.5 text-xs ${tab === t.key ? 'bg-white/25' : 'bg-stone-100'}`}>{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="card mb-4 flex items-center gap-2 p-2">
        <Search size={18} className="text-stone-400" />
        <input className="w-full bg-transparent text-sm outline-none" placeholder="بحث باسم العميل أو الجوال..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!all ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-500" /></div>
      ) : list.length === 0 ? (
        <Empty>لا توجد حجوزات في هذا التبويب</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-stone-50 text-xs font-bold text-stone-500">
              <tr>
                <th className="px-4 py-3">تاريخ الحجز</th>
                <th className="px-4 py-3">العميل</th>
                <th className="px-4 py-3">التاقات</th>
                <th className="px-4 py-3">السعر</th>
                <th className="px-4 py-3">المدينة</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {list.map((b) => (
                <tr key={b.id} className="hover:bg-stone-50/60">
                  <td className="px-4 py-3">
                    <div className="font-bold text-maroon-700">{fmtDate(b.booking_date)}</div>
                    <div className="text-xs text-emerald-600">{fmtHijri(b.booking_date)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-stone-800">{b.client_name}</div>
                    <div className="text-xs text-stone-400">{b.client_phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Tag status={staffStatus(b, 'صبابة')}>صبابات</Tag>
                      <Tag status={staffStatus(b, 'عاملة')}>عاملات</Tag>
                      <Tag status={staffStatus(b, 'سائق')}>سائق</Tag>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-stone-700">{SAR(b.net_total)}</div>
                    <span className={`chip ${PAYMENT_COLORS[b.payment_status]} mt-0.5`}>{PAYMENT_STATUS[b.payment_status]}</span>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{b.city || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {tab === 'waiting' && (
                        <>
                          <button className="btn-primary !px-2 !py-1" onClick={() => confirm(b.id)} title="تأكيد"><Check size={15} /> تأكيد</button>
                          <button className="btn-danger !px-2 !py-1" onClick={() => reject(b.id)} title="رفض"><X size={15} /> رفض</button>
                        </>
                      )}
                      <button className="btn-ghost" onClick={() => setDetailId(b.id)}>المزيد <ChevronLeft size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <Modal open title="إضافة حجز جديد" size="lg" onClose={() => setAddOpen(false)}>
          <BookingForm onCancel={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
        </Modal>
      )}
      {detailId && (
        <Modal open title="تفاصيل الحجز" size="lg" onClose={() => setDetailId(null)}>
          <BookingDetails bookingId={detailId} onClose={() => setDetailId(null)} onChanged={load} />
        </Modal>
      )}
    </div>
  );
}

function Tag({ status, children }) {
  return <span className={`chip ${STAFF_CLS[status]}`}>{children} ({STAFF_LABEL[status]})</span>;
}
