import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, Plus, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Spinner, SuccessToast } from '../components/ui';
import Modal from '../components/Modal';
import DatePicker from '../components/DatePicker';
import BookingForm from '../components/BookingForm';
import BookingDetails from '../components/BookingDetails';
import {
  PAYMENT_COLORS, PAYMENT_STATUS, fmtDate, fmtHijri, fmtFull, fmtDayTitle, hijriDay, hijriMonthYear,
  staffStatus, STAFF_CLS, STAFF_LABEL,
} from '../constants';

const WEEKDAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// week starts Saturday (Gulf): JS getDay() Sat=6
const startOfWeek = (d) => addDays(d, -((d.getDay() + 1) % 7));
const todayIso = iso(new Date());

export default function Home() {
  const [view, setView] = useState('month');
  const [calType, setCalType] = useState('greg'); // greg | hijri
  const [cursor, setCursor] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [overflowMsg, setOverflowMsg] = useState('');

  const days = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [view, cursor]);

  const range = { from: iso(days[0]), to: iso(days[days.length - 1]) };

  const load = () => {
    setLoading(true);
    api.get('/api/bookings', range).then(setBookings).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, [range.from, range.to]);

  const byDay = useMemo(() => {
    const m = {};
    for (const b of bookings) (m[b.booking_date] ||= []).push(b);
    return m;
  }, [bookings]);

  // open a day (marks it as the selected/current date too)
  const openDay = (isoDate) => {
    setSelectedDate(isoDate);
    setDayOpen(isoDate);
  };
  // jump to a chosen specific day and open it
  const jumpToDay = (isoDate) => {
    if (!isoDate) return;
    setCursor(new Date(isoDate + 'T00:00:00'));
    openDay(isoDate);
  };


  const move = (dir) => {
    if (view === 'week') setCursor((c) => addDays(c, dir * 7));
    else setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
  };

  const periodLabel =
    view === 'week'
      ? `${fmtDate(iso(days[0]))} — ${fmtDate(iso(days[6]))}`
      : `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const periodHijri =
    view === 'week'
      ? `${fmtHijri(iso(days[0]))} — ${fmtHijri(iso(days[6]))}`
      : hijriMonthYear(cursor);

  return (
    <div>
      <PageHeader title="الرئيسية" subtitle="تقويم الحجوزات">
        <button className="btn-primary" onClick={() => setAddOpen(true)}><Plus size={18} /> إضافة حجز جديد</button>
      </PageHeader>

      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <button className="btn-soft" onClick={() => move(-1)}><ChevronRight size={18} /></button>
          {/* current period being viewed */}
          <div className="min-w-44 text-center">
            <div className="font-extrabold text-maroon-700">{periodLabel}</div>
            <div className="text-xs font-bold text-emerald-600">{periodHijri}</div>
          </div>
          <button className="btn-soft" onClick={() => move(1)}><ChevronLeft size={18} /></button>
          {/* today button + today's date in both calendars (#1) */}
          <button className="btn-ghost" onClick={() => setCursor(new Date())}>اليوم</button>
          <div className="text-xs font-bold leading-tight">
            <div className="text-maroon-700">{fmtFull(todayIso)}</div>
            <div className="text-emerald-600">{fmtHijri(todayIso)}</div>
          </div>
        </div>

        {/* selected date — shown in the middle (#2) */}
        {selectedDate && (
          <div className="rounded-lg bg-maroon-50 px-4 py-1.5 text-center ring-1 ring-maroon-200">
            <div className="text-[11px] font-bold text-stone-500">التاريخ المحدّد</div>
            <div className="text-sm font-extrabold text-maroon-700">{fmtDate(selectedDate)}</div>
            <div className="text-[11px] font-bold text-emerald-600">{fmtHijri(selectedDate)}</div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {/* display calendar type toggle — external (#3) */}
          <div className="flex rounded-lg border border-stone-200 p-0.5">
            {[['greg', 'ميلادي'], ['hijri', 'هجري']].map(([v, l]) => (
              <button key={v} onClick={() => setCalType(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-bold ${calType === v ? (v === 'hijri' ? 'bg-emerald-600 text-white' : 'bg-maroon-600 text-white') : 'text-stone-600'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* specific-date picker -> jump to that day (#4) */}
          <DatePicker variant="button" buttonLabel="اختيار التاريخ" onChange={jumpToDay} />

          <div className="flex rounded-lg border border-stone-200 p-0.5">
            {[['week', 'أسبوع'], ['month', 'شهر']].map(([v, l]) => (
              <button key={v} onClick={() => setView(v)}
                className={`rounded-md px-4 py-1.5 text-sm font-bold ${view === v ? 'bg-brand-600 text-white' : 'text-stone-600'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-500" /></div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-1 text-center text-xs font-extrabold text-stone-500">{w}</div>
          ))}
          {days.map((d) => {
            const key = iso(d);
            const list = (byDay[key] || []).filter((b) => b.status === 'active');
            const otherMonth = view === 'month' && d.getMonth() !== cursor.getMonth();
            const gNum = d.getDate();
            const hNum = hijriDay(d);
            const primary = calType === 'hijri' ? hNum : gNum;
            const secondary = calType === 'hijri' ? gNum : hNum;
            // Gregorian = maroon (عنابي), Hijri = green
            const primaryColor = calType === 'hijri' ? 'text-emerald-600' : 'text-maroon-700';
            const secondaryColor = calType === 'hijri' ? 'text-maroon-700' : 'text-emerald-600';
            return (
              <button
                key={key}
                onClick={() => openDay(key)}
                className={`min-h-24 rounded-xl border p-1.5 text-right transition hover:border-brand-400 hover:shadow-sm ${
                  otherMonth ? 'border-stone-100 bg-stone-50/50 opacity-60' : 'border-stone-200 bg-white'
                } ${key === selectedDate ? 'bg-maroon-50 ring-2 ring-maroon-500' : key === todayIso ? 'ring-2 ring-brand-400' : ''}`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-baseline gap-1">
                    <span className={`text-base font-extrabold ${primaryColor}`}>{primary}</span>
                    <span className={`text-[10px] font-bold ${secondaryColor}`}>{secondary}</span>
                  </div>
                  {list.length > 0 && (
                    <span className="chip bg-brand-100 text-brand-700">{list.length} حجز</span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {list.slice(0, 3).map((b) => (
                    <div key={b.id} className="truncate rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-800">
                      {b.client_name}
                    </div>
                  ))}
                  {list.length > 3 && <div className="text-[11px] text-stone-400">+{list.length - 3} المزيد</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* add booking */}
      {addOpen && (
        <Modal open title="إضافة حجز جديد" size="lg" onClose={() => setAddOpen(false)}>
          <BookingForm
            initial={{ booking_date: dayOpen || todayIso }}
            onCancel={() => setAddOpen(false)}
            onSaved={(saved) => {
              setAddOpen(false);
              load();
              if (saved?.overflow)
                setOverflowMsg('تم بلوغ الحد الأقصى لهذا اليوم — تمت إضافة الحجز إلى قائمة الانتظار بانتظار التأكيد.');
            }}
          />
        </Modal>
      )}

      {/* day cards */}
      {dayOpen && !detailId && (
        <Modal open title={`حجوزات ${fmtDayTitle(dayOpen)}`} size="md" onClose={() => setDayOpen(null)}>
          <DayCards
            date={dayOpen}
            bookings={(byDay[dayOpen] || []).filter((b) => b.status === 'active')}
            onOpen={(id) => setDetailId(id)}
            onAdd={() => { setAddOpen(true); }}
          />
        </Modal>
      )}

      {/* booking details */}
      {detailId && (
        <Modal open title="تفاصيل الحجز" size="lg" onClose={() => setDetailId(null)}>
          <BookingDetails bookingId={detailId} onClose={() => setDetailId(null)} onChanged={load} />
        </Modal>
      )}

      <SuccessToast open={!!overflowMsg} message={overflowMsg} onClose={() => setOverflowMsg('')} duration={3500} />
    </div>
  );
}

function DayCards({ bookings, onOpen, onAdd }) {
  if (bookings.length === 0)
    return (
      <div className="py-8 text-center">
        <p className="mb-4 text-stone-400">لا توجد حجوزات في هذا اليوم</p>
        <button className="btn-primary" onClick={onAdd}><Plus size={16} /> إضافة حجز</button>
      </div>
    );
  return (
    <div className="space-y-3">
      {bookings.map((b) => (
        <button
          key={b.id}
          onClick={() => onOpen(b.id)}
          className={`block w-full rounded-xl border p-4 text-right transition hover:border-brand-400 hover:shadow ${
            b.status === 'cancelled' ? 'border-red-200 bg-red-50/40 opacity-70' : 'border-stone-200 bg-white'
          }`}
        >
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-base font-extrabold text-stone-800">{b.client_name}</div>
              <div className="text-sm text-stone-500">{b.client_phone} · {b.event_type} · {b.event_time}</div>
            </div>
            <span className={`chip ${PAYMENT_COLORS[b.payment_status]}`}>{PAYMENT_STATUS[b.payment_status]}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Flag status={staffStatus(b, 'صبابة')} label="صبابات" />
            <Flag status={staffStatus(b, 'عاملة')} label="عاملات" />
            <Flag status={staffStatus(b, 'سائق')} label="سائق" />
          </div>
        </button>
      ))}
    </div>
  );
}

function Flag({ status, label }) {
  const Icon = status === 'done' ? CheckCircle2 : status === 'partial' ? AlertCircle : XCircle;
  return (
    <span className={`chip ${STAFF_CLS[status]}`}>
      <Icon size={13} /> {label} ({STAFF_LABEL[status]})
    </span>
  );
}
