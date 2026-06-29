import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react';

// auto-closing success popup
export function SuccessToast({ open, message = 'تم حفظ التغييرات بنجاح', onClose, duration = 1800 }) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => onClose?.(), duration);
    return () => clearTimeout(t);
  }, [open, duration, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 p-4">
      <div className="mt-24 flex items-center gap-3 rounded-2xl bg-white px-6 py-4 shadow-2xl ring-1 ring-emerald-100">
        <CheckCircle2 className="text-emerald-500" size={28} />
        <span className="text-base font-extrabold text-stone-800">{message}</span>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Input(props) {
  return <input className="input" {...props} />;
}

export function PasswordInput({ className = '', ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input className={`input w-full pl-9 ${className}`} type={show ? 'text' : 'password'} {...props} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function Select({ children, ...props }) {
  return (
    <select className="input" {...props}>
      {children}
    </select>
  );
}

// Country dial codes (Gulf + common Arab region). value stored as `${code}${digits}`.
export const COUNTRY_CODES = [
  { code: '+966', label: '🇸🇦 +966' },
  { code: '+971', label: '🇦🇪 +971' },
  { code: '+965', label: '🇰🇼 +965' },
  { code: '+974', label: '🇶🇦 +974' },
  { code: '+973', label: '🇧🇭 +973' },
  { code: '+968', label: '🇴🇲 +968' },
  { code: '+962', label: '🇯🇴 +962' },
  { code: '+961', label: '🇱🇧 +961' },
  { code: '+20', label: '🇪🇬 +20' },
  { code: '+964', label: '🇮🇶 +964' },
  { code: '+963', label: '🇸🇾 +963' },
  { code: '+967', label: '🇾🇪 +967' },
  { code: '+970', label: '🇵🇸 +970' },
];
const DEFAULT_DIAL = '+966';

export function splitPhone(v) {
  const s = String(v || '').trim();
  for (const c of COUNTRY_CODES) {
    if (s.startsWith(c.code)) return { code: c.code, number: s.slice(c.code.length).replace(/\D/g, '') };
  }
  return { code: DEFAULT_DIAL, number: s.replace(/\D/g, '') };
}

// Phone field: country-code dropdown + numbers-only input. Emits the combined `${code}${digits}` string.
export function PhoneInput({ value = '', onChange, placeholder = 'رقم الجوال', autoFocus, required }) {
  const { code, number } = splitPhone(value);
  return (
    <div className="flex gap-1.5" dir="ltr">
      <select
        className="input w-24 shrink-0 px-2 text-sm"
        value={code}
        onChange={(e) => onChange(e.target.value + number)}
      >
        {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
      </select>
      <input
        className="input flex-1"
        type="tel"
        inputMode="numeric"
        dir="ltr"
        placeholder={placeholder}
        autoFocus={autoFocus}
        required={required}
        value={number}
        onChange={(e) => onChange(code + e.target.value.replace(/\D/g, ''))}
      />
    </div>
  );
}

export function Spinner({ className = '' }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold text-stone-800">{title}</h1>
        {subtitle && <p className="text-sm text-stone-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function Empty({ children }) {
  return <div className="rounded-xl border border-dashed border-stone-300 bg-white/50 p-10 text-center text-stone-400">{children}</div>;
}

export function Stat({ label, value, color = 'text-stone-800', icon }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      {icon && <div className="rounded-lg bg-brand-50 p-2 text-brand-600">{icon}</div>}
      <div>
        <div className="text-xs font-bold text-stone-500">{label}</div>
        <div className={`text-xl font-extrabold ${color}`}>{value}</div>
      </div>
    </div>
  );
}
