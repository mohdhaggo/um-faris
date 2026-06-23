import { useEffect } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';

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

export function Select({ children, ...props }) {
  return (
    <select className="input" {...props}>
      {children}
    </select>
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
