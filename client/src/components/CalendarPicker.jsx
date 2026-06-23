import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';

const G_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

// Tabbed date picker: calendar type / year / month. Used by the calendar pages.
export default function CalendarPicker({ calType, setCalType, cursor, setCursor }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('type');
  const ref = useRef();

  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const years = Array.from({ length: 12 }, (_, i) => year - 6 + i);
  const pick = (y, m) => setCursor(new Date(y, m, 1));

  const TabBtn = ({ k, label }) => (
    <button
      onClick={() => setTab(k)}
      className={`flex-1 rounded-md px-2 py-1.5 text-sm font-bold ${tab === k ? 'bg-brand-600 text-white' : 'text-stone-600'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button className="btn-soft" onClick={() => setOpen((o) => !o)}>
        <CalendarDays size={18} className="text-brand-500" /> اختيار التاريخ
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-2 w-72 rounded-xl border border-stone-200 bg-white p-3 shadow-xl">
          <div className="mb-3 flex rounded-lg border border-stone-200 p-0.5">
            <TabBtn k="type" label="نوع التقويم" />
            <TabBtn k="year" label="السنة" />
            <TabBtn k="month" label="الشهر" />
          </div>

          {tab === 'type' && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setCalType('greg')}
                className={`rounded-lg px-3 py-2.5 font-bold ${calType === 'greg' ? 'bg-maroon-600 text-white' : 'border border-stone-200 text-stone-600'}`}>
                ميلادي
              </button>
              <button onClick={() => setCalType('hijri')}
                className={`rounded-lg px-3 py-2.5 font-bold ${calType === 'hijri' ? 'bg-emerald-600 text-white' : 'border border-stone-200 text-stone-600'}`}>
                هجري
              </button>
            </div>
          )}

          {tab === 'year' && (
            <div className="grid grid-cols-3 gap-2">
              {years.map((y) => (
                <button key={y} onClick={() => pick(y, month)}
                  className={`rounded-lg px-2 py-2 text-sm font-bold ${y === year ? 'bg-brand-600 text-white' : 'border border-stone-200 text-stone-700 hover:bg-stone-50'}`}>
                  {y}
                </button>
              ))}
            </div>
          )}

          {tab === 'month' && (
            <div className="grid grid-cols-3 gap-2">
              {G_MONTHS.map((mn, i) => (
                <button key={mn} onClick={() => pick(year, i)}
                  className={`rounded-lg px-2 py-2 text-sm font-bold ${i === month ? 'bg-brand-600 text-white' : 'border border-stone-200 text-stone-700 hover:bg-stone-50'}`}>
                  {mn}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
