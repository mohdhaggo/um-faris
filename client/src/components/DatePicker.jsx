import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { fmtDate, fmtHijri } from '../constants';
import {
  GREG_MONTHS, HIJRI_MONTHS, hijriParts, hijriToISO, hijriMonthLength,
  gregMonthLength, isoFromGreg, currentHijriYear,
} from '../dateUtils';

// Specific-date picker: نوع التقويم -> السنة -> الشهر -> اليوم (Hijri or Gregorian).
// variant="field" renders an input-like trigger; variant="button" renders a soft button.
// disablePast=true prevents selecting any date before today.
// Mobile overlay uses createPortal onto document.body to escape any z-index / backdrop-filter
// stacking-context issues created by ancestor elements (sidebar transform, header backdrop-blur).
export default function DatePicker({ value, onChange, variant = 'field', label = 'اختر التاريخ', buttonLabel = 'اختيار التاريخ', clearable = false, disablePast = false }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('greg');
  const [step, setStep] = useState('type');
  const [yearBase, setYearBase] = useState(2020);
  const [sel, setSel] = useState({});
  const wrapperRef = useRef();    // outer div with the trigger
  const portalCardRef = useRef(); // mobile portal card (outside the wrapper DOM tree)

  useEffect(() => {
    const h = (e) => {
      if (wrapperRef.current?.contains(e.target)) return;
      if (portalCardRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h, { passive: true });
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('touchstart', h);
    };
  }, []);

  const openPicker = () => { setStep('type'); setSel({}); setOpen(true); };

  const chooseType = (t) => {
    setType(t);
    const center = t === 'greg'
      ? (value ? new Date(value + 'T00:00:00').getFullYear() : new Date().getFullYear())
      : (value ? hijriParts(new Date(value + 'T12:00:00Z')).y : currentHijriYear());
    setYearBase(center - 5);
    setStep('year');
  };
  const chooseYear = (y) => { setSel({ y }); setStep('month'); };
  const chooseMonth = (m) => { setSel((s) => ({ ...s, m })); setStep('day'); };
  const chooseDay = (d) => {
    onChange(type === 'greg' ? isoFromGreg(sel.y, sel.m, d) : hijriToISO(sel.y, sel.m + 1, d));
    setOpen(false);
    setStep('type');
  };

  const months = type === 'greg' ? GREG_MONTHS : HIJRI_MONTHS;
  const years = Array.from({ length: 12 }, (_, i) => yearBase + i);
  const dayCount = step === 'day'
    ? (type === 'greg' ? gregMonthLength(sel.y, sel.m) : hijriMonthLength(sel.y, sel.m + 1))
    : 0;

  // Which weekday does the 1st of the selected month fall on? (0=Sun … 6=Sat, Sunday-first grid)
  const dayStartOffset = step === 'day' ? (() => {
    if (type === 'greg') return new Date(sel.y, sel.m, 1).getDay();
    return new Date(hijriToISO(sel.y, sel.m + 1, 1) + 'T00:00:00').getDay();
  })() : 0;

  const todayParts = (() => {
    const d = new Date();
    const hp = hijriParts(d);
    return { gY: d.getFullYear(), gM: d.getMonth(), gD: d.getDate(), hY: hp.y, hM: hp.m - 1, hD: hp.d };
  })();
  const isYearDisabled = (y) => {
    if (!disablePast) return false;
    return type === 'greg' ? y < todayParts.gY : y < todayParts.hY;
  };
  const isMonthDisabled = (i) => {
    if (!disablePast) return false;
    return type === 'greg' ? sel.y === todayParts.gY && i < todayParts.gM : sel.y === todayParts.hY && i < todayParts.hM;
  };
  const isDayDisabled = (d) => {
    if (!disablePast) return false;
    return type === 'greg' ? sel.y === todayParts.gY && sel.m === todayParts.gM && d < todayParts.gD : sel.y === todayParts.hY && sel.m === todayParts.hM && d < todayParts.hD;
  };

  // Picker body — a plain JSX value (not a component) reused in both mobile portal and desktop dropdown.
  const pickerBody = (
    <>
      {/* breadcrumb */}
      <div className="mb-3 flex items-center gap-1">
        <button type="button" onClick={() => setStep('type')}>
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${step === 'type' ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-500'}`}>
            {type === 'greg' ? 'ميلادي' : 'هجري'}
          </span>
        </button>
        {sel.y != null && (
          <button type="button" onClick={() => setStep('year')}>
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${step === 'year' ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-500'}`}>{sel.y}</span>
          </button>
        )}
        {sel.m != null && (
          <button type="button" onClick={() => setStep('month')}>
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${step === 'month' ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-500'}`}>{months[sel.m]}</span>
          </button>
        )}
      </div>

      {step === 'type' && (
        <div>
          <div className="mb-2 text-xs font-bold text-stone-500">نوع التقويم</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => chooseType('greg')}
              className={`rounded-lg px-3 py-2.5 font-bold ${type === 'greg' ? 'bg-maroon-600 text-white' : 'border border-stone-200 text-stone-600'}`}>
              ميلادي
            </button>
            <button type="button" onClick={() => chooseType('hijri')}
              className={`rounded-lg px-3 py-2.5 font-bold ${type === 'hijri' ? 'bg-emerald-600 text-white' : 'border border-stone-200 text-stone-600'}`}>
              هجري
            </button>
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
                  className={`rounded-lg px-2 py-2 text-sm font-bold ${disabled ? 'cursor-not-allowed border border-stone-100 text-stone-300' : y === sel.y ? 'bg-brand-600 text-white' : 'border border-stone-200 text-stone-700 hover:bg-stone-50'}`}>
                  {y}
                </button>
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
                  className={`rounded-lg px-2 py-2 text-[13px] font-bold ${disabled ? 'cursor-not-allowed border border-stone-100 text-stone-300' : i === sel.m ? 'bg-brand-600 text-white' : 'border border-stone-200 text-stone-700 hover:bg-stone-50'}`}>
                  {mn}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 'day' && (
        <div>
          {/* weekday headers: Sun→Sat, single-char Arabic abbreviations */}
          <div className="mb-1 grid grid-cols-7 gap-1">
            {['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map((d) => (
              <div key={d} className="py-0.5 text-center text-[10px] font-extrabold text-stone-400">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {/* empty cells to align day 1 to the correct weekday column */}
            {Array.from({ length: dayStartOffset }, (_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => {
              const disabled = isDayDisabled(d);
              return (
                <button type="button" key={d} onClick={() => !disabled && chooseDay(d)} disabled={disabled}
                  className={`rounded-lg py-1.5 text-center text-sm font-bold ${disabled ? 'cursor-not-allowed text-stone-300' : 'text-stone-700 hover:bg-brand-600 hover:text-white'}`}>
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="relative" ref={wrapperRef}>
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

      {/* Mobile: portal onto document.body — completely escapes sidebar transform + header backdrop-filter stacking contexts */}
      {open && createPortal(
        <>
          <div
            className="fixed inset-0 sm:hidden"
            style={{ zIndex: 9998, background: 'rgba(0,0,0,0.3)' }}
            onClick={() => setOpen(false)}
          />
          <div
            ref={portalCardRef}
            className="fixed left-1/2 top-1/2 w-[18rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-xl sm:hidden"
            style={{ zIndex: 9999 }}
          >
            {pickerBody}
          </div>
        </>,
        document.body
      )}

      {/* Desktop: inline absolute dropdown — no portal needed, stacking contexts are not an issue on desktop */}
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 hidden w-72 rounded-xl border border-stone-200 bg-white p-3 shadow-xl sm:block">
          {pickerBody}
        </div>
      )}
    </div>
  );
}
