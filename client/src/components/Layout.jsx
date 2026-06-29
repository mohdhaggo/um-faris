import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  CalendarDays, ClipboardList, Coffee, Users2, Wallet, UserCog, ShieldCheck,
  LogOut, Bell, Menu, X, AlertTriangle, Info, AlertCircle, Settings as SettingsIcon,
} from 'lucide-react';
import { useAuth } from '../store/Auth';
import { api } from '../api';
import { initNotifications, syncReminders } from '../native/notifications';

const NAV = [
  { to: '/', label: 'الرئيسية', icon: CalendarDays },
  { to: '/bookings', label: 'إدارة الحجوزات', icon: ClipboardList },
  { to: '/services', label: 'إدارة الخدمات', icon: Coffee },
  { to: '/clients', label: 'إدارة العملاء', icon: Users2 },
  { to: '/finance', label: 'إدارة المالية', icon: Wallet },
  { to: '/employees', label: 'إدارة الموظفين', icon: UserCog },
  { to: '/users', label: 'إدارة المستخدمين', icon: ShieldCheck },
  { to: '/settings', label: 'الإعدادات', icon: SettingsIcon },
];

const SEV = {
  danger: { icon: AlertCircle, cls: 'text-red-600 bg-red-50' },
  warning: { icon: AlertTriangle, cls: 'text-amber-600 bg-amber-50' },
  info: { icon: Info, cls: 'text-sky-600 bg-sky-50' },
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location]);

  // Native (APK) local notifications: request permission + doorbell channel once,
  // then schedule booking reminders and re-sync periodically.
  useEffect(() => {
    let timer;
    (async () => {
      const ok = await initNotifications();
      if (!ok) return;
      await syncReminders();
      timer = setInterval(() => { syncReminders(); }, 15 * 60 * 1000);
    })();
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* sidebar */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-64 flex-col transform bg-brand-900 text-brand-50 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        {/* logo */}
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <img src="/icon.png" alt="أم فارس" className="h-10 w-10 rounded-xl object-cover" />
          <div>
            <div className="text-lg font-extrabold">أم فارس</div>
            <div className="text-xs text-brand-200">نظام إدارة الحجوزات</div>
          </div>
        </div>

        {/* nav — grows to fill space */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                  isActive ? 'bg-brand-400 text-brand-900' : 'text-brand-100 hover:bg-white/10'
                }`
              }
            >
              <n.icon size={19} />
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* user + logout — pinned to bottom */}
        <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-400 font-bold text-brand-900">
              {user?.name?.[0]}
            </span>
            <span className="truncate text-sm font-bold text-brand-100">{user?.name}</span>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-red-200 hover:bg-red-500/20"
          >
            <LogOut size={19} />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-stone-200 bg-white/80 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 lg:hidden" onClick={() => setOpen(true)}>
              <Menu size={22} />
            </button>
            <span className="font-bold text-stone-700">{NAV.find((n) => n.to === location.pathname)?.label || 'الرئيسية'}</span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 font-bold text-white">
              {user?.name?.[0]}
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function NotificationBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef();

  const load = () => api.get('/api/notifications').then(setItems).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => {
      clearInterval(t);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-stone-600 hover:bg-stone-100">
        <Bell size={22} />
        {items.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
            <span className="font-extrabold text-stone-700">الإشعارات</span>
            <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-600"><X size={16} /></button>
          </div>
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-stone-400">لا توجد إشعارات</div>
          ) : (
            items.map((it) => {
              const s = SEV[it.severity] || SEV.info;
              return (
                <div key={it.id} className="flex items-start gap-3 border-b border-stone-50 px-4 py-3 last:border-0">
                  <span className={`mt-0.5 rounded-lg p-1.5 ${s.cls}`}>
                    <s.icon size={16} />
                  </span>
                  <p className="text-sm leading-relaxed text-stone-700">{it.message}</p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
