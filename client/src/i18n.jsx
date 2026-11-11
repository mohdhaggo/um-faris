import { createContext, Fragment, useContext, useEffect, useRef, useState } from 'react';
import { Languages, Check } from 'lucide-react';
import TI from './locales/ti';

// Arabic is the source language: every UI string is written in Arabic and passed through t().
// Other languages map the Arabic string to a translation; anything missing falls back to Arabic.
export const LANGS = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'ti', label: 'ትግርኛ', dir: 'ltr' },
];
const DICTS = { ti: TI };
const KEY = 'umfaris_lang';

let current = (() => {
  try {
    const v = localStorage.getItem(KEY);
    return LANGS.some((l) => l.code === v) ? v : 'ar';
  } catch {
    return 'ar';
  }
})();

export const getLang = () => current;
export const getDir = () => LANGS.find((l) => l.code === current).dir;

export function t(s, params) {
  if (typeof s !== 'string') return s;
  let out = (current !== 'ar' && DICTS[current]?.[s]) || s;
  if (params) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  return out;
}

function applyToDocument() {
  document.documentElement.lang = current;
  document.documentElement.dir = getDir();
  document.title = t('نظام إدارة الحجوزات — أم فارس');
}
applyToDocument();

const LangCtx = createContext({ lang: current, setLang: () => {} });
export const useLang = () => useContext(LangCtx);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(current);
  const setLang = (code) => {
    current = code;
    try { localStorage.setItem(KEY, code); } catch {}
    applyToDocument();
    setLangState(code);
  };
  // t() reads module state, so remount the tree on change to re-render every string.
  return (
    <LangCtx.Provider value={{ lang, setLang }}>
      <Fragment key={lang}>{children}</Fragment>
    </LangCtx.Provider>
  );
}

export function LanguageSwitcher({ className = '', light = false }) {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h, { passive: true });
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('touchstart', h);
    };
  }, []);

  return (
    <div className={className || 'relative'} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t('اللغة')}
        className={`flex items-center gap-1 rounded-lg p-2 text-sm font-bold ${
          light ? 'text-brand-50 hover:bg-white/10' : 'text-stone-600 hover:bg-stone-100'
        }`}
      >
        <Languages size={20} />
        <span className="hidden sm:inline">{LANGS.find((l) => l.code === lang).label}</span>
      </button>
      {open && (
        <div className="absolute end-0 z-50 mt-2 w-40 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-xl">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              dir={l.dir}
              onClick={() => { setOpen(false); if (l.code !== lang) setLang(l.code); }}
              className={`flex w-full items-center justify-between px-4 py-2 text-sm font-bold hover:bg-stone-50 ${
                l.code === lang ? 'text-brand-700' : 'text-stone-700'
              }`}
            >
              {l.label}
              {l.code === lang && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
