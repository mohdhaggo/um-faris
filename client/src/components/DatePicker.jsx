import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { fmtDate, fmtHijri } from '../constants';
import {
  GREG_MONTHS, HIJRI_MONTHS, hijriParts, hijriToISO, hijriMonthLength,
  gregMonthLength, isoFromGreg, currentHijriYear,
} from '../dateUtils';

const todayISO = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();

// Specific-date picker: نوع التقويم -> السنة -> الشهر -> اليوم (Hijri or Gregorian).
// variant="field" renders an input-like trigger showing the value; variant="button" renders a soft button.
// disablePast=true prevents selecting any date before today.
export default function DatePicker({ value, onChange, variant = 'field', label = 'اختر التاريخ', buttonLabel = 'اختيار التاريخ', clearable = false, disablePast = false }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('greg');
  const [step, setStep] = useState('type');
  const [yearBase, setYearBase] = useState(2020);
  const [sel, setSel] = useState({});
  const ref = useRef();

  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    // touchstart covers mobile/WebView where synthetic mousedown target may be wrong
    document.addEventListener('touchstart', h, { passive: true });
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('touchstart', h);
    };
  }, []);

  const openPicker = () => { setStep('type'); setSel({}); setOpen(true); };

  const chooseType = (t) => {
    setType(t);
    let center;
    if (t === 'greg') center = value ? new Date(value + 'T00:00:00').getFullYear() : new Date().getFullYear();
    else center = value ? hijriParts(new Date(value + 'T12:00:00Z')).y : currentHijriYear();
    setYearBase(center - 5);
    setStep('year');
  };
  const chooseYear = (y) => { setSel({ y }); setStep('month'); };
  const chooseMonth = (m) => { setSel((s) => ({ ...s, m })); setStep('day'); };
  const chooseDay = (d) => {
    const iso = type === 'greg' ? isoFromGreg(sel.y, sel.m, d) : hijriToISO(sel.y, sel.m + 1, d);
    onChange(iso);
    setOpen(false);
    setStep('type');
  };

  const months = type === 'greg' ? GREG_MONTHS : HIJRI_MONTHS;
  const years = Array.from({ length: 12 }, (_, i) => yearBase + i);
  const dayCount = step === 'day'
    ? (type === 'greg' ? gregMonthLength(sel.y, sel.m) : hijriMonthLength(sel.y, sel.m + 1))
    : 0;

  // Min-date helpers (only active when disablePast=true)
  const todayParts = (() => {
    const d = new Date();
    const gY = d.getFullYear(), gM = d.getMonth(), gD = d.getDate();
    const hp = hijriParts(d);
    return { gY, gM, gD, hY: hp.y, hM: hp.m - 1, hD: hp.d };
  })();
  const isYearDisabled = (y) => {
    if (!disablePast) return false;
    return type === 'greg' ? y < todayParts.gY : y < todayParts.hY;
  };
  const isMonthDisabled = (i) => {
    if (!disablePast) return false;
    if (type === 'greg') return sel.y === todayParts.gY && i < todayParts.gM;
    return sel.y === todayParts.hY && i < todayParts.hM;
  };
  const isDayDisabled = (d) => {
    if (!disablePast) return false;
    if (type === 'greg') return sel.y === todayParts.gY && sel.m === todayParts.gM && d < todayParts.gD;
    return sel.y === todayParts.hY && sel.m === todayParts.hM && d < todayParts.hD;
  };

  const Tab = ({ active, children }) => (
    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${active ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-500'}`}>{children}</span>
  );

  return (
    <div className="relative" ref={ref}>
      {variant === 'button' ? (
        <button type="button" className="btn-soft" onClick={openPicker}>
          <CalendarDays size={18} className="text-brand-500" /> {buttonLabel}
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <button type="button" onClick={openPicker} className="input flex items-center justify-between text-right">
            {value ? (
              <span className="flex flex-wrap items-center gap-x-2">
                <span className="font-bold text-maroon-700">{fmtDate(value)}</span>
                <span className="text-xs text-emerald-600">{fmtHijri(value)}</span>
              </span>
            ) : (
              <span className="text-stone-400">{label}</span>
            )}
            <CalendarDays size={16} className="shrink-0 text-stone-400" />
          </button>
          {clearable && value && (
            <button type="button" className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100" onClick={() => onChange('')}><X size={16} /></button>
          )}
        </div>
      )}

      {/* Mobile backdrop: closes on tap-away and dims the screen behind the centered card */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 sm:hidden"
          onClick={() => setOpen(false)}
          onTouchEnd={(e) => { e.stopPropagation(); setOpen(false); }}
        />
      )}

      {open && (
        <div
          className="fixed left-1/2 top-1/2 z-50 w-[18rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-xl sm:absolute sm:left-0 sm:top-auto sm:z-40 sm:mt-2 sm:w-72 sm:translate-x-0 sm:translate-y-0"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* breadcrumb */}
          <div className="mb-3 flex items-center gap-1">
            <button type="button" onClick={() => setStep('type')}><Tab active={step === 'type'}>{type === 'greg' ? 'ميلادي' : 'هجري'}</Tab></button>
            {sel.y != null && <button type="button" onClick={() => setStep('year')}><Tab active={step === 'year'}>{sel.y}</Tab></button>}
            {sel.m != null && <button type="button" onClick={() => setStep('month')}><Tab active={step === 'month'}>{months[sel.m]}</Tab></button>}
          </div>

          {step === 'type' && (
            <div>
              <div className="mb-2 text-xs font-bold text-stone-500">نوع التقويم</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => chooseType('greg')}
                  className={`rounded-lg px-3 py-2.5 font-bold ${type === 'greg' ? 'bg-maroon-600 text-white' : 'border border-stone-200 text-stone-600'}`}>ميلادي</button>
                <button type="button" onClick={() => chooseType('hijri')}
                  className={`rounded-lg px-3 py-2.5 font-bold ${type === 'hijri' ? 'bg-emerald-600 text-white' : 'border border-stone-200 text-stone-600'}`}>هجري</button>
              </div>
            </div>
          )}

          {step === 'year' && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <button type="button" className="rounded p-1 hover:bg-stone-100" onClick={() => setYearBase((b) => b - 12)}><ChevronRight size={16} /></button>
                <span className="text-xs font-bold text-stone-500">السنة ({type === 'greg' ? 'ميلادي' : 'هجري'})</span>
                <button type="button" className="rounded p-1 hover:bg-stone-100" onClick={() => setYearBase((b) => b + 12)}><ChevronLeft size={16} /></button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {years.map((y) => {
                  const disabled = isYearDisabled(y);
                  return (
                    <button type="button" key={y} onClick={() => !disabled && chooseYear(y)} disabled={disabled}
                      className={`rounded-lg px-2 py-2 text-sm font-bold ${disabled ? 'cursor-not-allowed border border-stone-100 text-stone-300' : y === sel.y ? 'bg-brand-600 text-white' : 'border border-stone-200 text-stone-700 hover:bg-stone-50'}`}>{y}</button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 'month' && (
            <div>
              <div className="mb-2 text-xs font-bold text-stone-500">الشهر ({type === 'greg' ? 'ميلادي' : 'هجري'})</div>
              <div className="grid grid-cols-3 gap-2">
                {months.map((mn, i) => {
                  const disabled = isMonthDisabled(i);
                  return (
                    <button type="button" key={mn} onClick={() => !disabled && chooseMonth(i)} disabled={disabled}
                      className={`rounded-lg px-2 py-2 text-[13px] font-bold ${disabled ? 'cursor-not-allowed border border-stone-100 text-stone-300' : i === sel.m ? 'bg-brand-600 text-white' : 'border border-stone-200 text-stone-700 hover:bg-stone-50'}`}>{mn}</button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 'day' && (
            <div>
              <div className="mb-2 text-xs font-bold text-stone-500">اليوم</div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => {
                  const disabled = isDayDisabled(d);
                  return (
                    <button type="button" key={d} onClick={() => !disabled && chooseDay(d)} disabled={disabled}
                      className={`rounded-lg py-1.5 text-sm font-bold ${disabled ? 'cursor-not-allowed text-stone-300' : 'text-stone-700 hover:bg-brand-600 hover:text-white'}`}>{d}</button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
