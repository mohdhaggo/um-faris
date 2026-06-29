// Local (on-device) notifications for the Android APK: OS popups + doorbell sound.
// No server / no cost. Reminders are scheduled in advance so they fire even when the
// app is closed; "due now" alerts fire once (guarded so they don't re-pop every launch).
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { api } from '../api';

const CHANNEL = 'umfaris-alerts';
const SOUND = 'doorbell.wav'; // android/app/src/main/res/raw/doorbell.wav
const FIRED_KEY = 'umfaris_fired_notifs';
const isNative = Capacitor.isNativePlatform();

let _ready = false;

export async function initNotifications() {
  if (!isNative) return false;
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return false;
    // High-importance channel => heads-up popup; channel owns the custom sound.
    await LocalNotifications.createChannel({
      id: CHANNEL,
      name: 'تنبيهات أم فارس',
      description: 'تذكيرات الحجوزات والتنبيهات',
      importance: 5, // MAX -> heads-up popup
      visibility: 1, // public on lock screen
      sound: SOUND,
      vibration: true,
      lights: true,
    });
    _ready = true;
    return true;
  } catch {
    return false;
  }
}

const pad = (n) => String(n).padStart(2, '0');

// concrete fire time: booking_date shifted by addDays, at hour:minute local
function fireAt(dateStr, addDays, hour, minute) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// stable positive 31-bit int id from a string (Capacitor needs integer ids)
function intId(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 2000000000) + 1;
}

const staffCount = (b) => Object.values(b.employees || {}).reduce((s, arr) => s + (arr?.length || 0), 0);

function loadFired() {
  try { return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || '[]')); } catch { return new Set(); }
}
function saveFired(set) {
  try { localStorage.setItem(FIRED_KEY, JSON.stringify([...set].slice(-500))); } catch { /* ignore */ }
}

// Recompute and (re)schedule all reminders from current bookings.
export async function syncReminders() {
  if (!isNative || !_ready) return;
  try {
    const today = new Date();
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const from = new Date(today); from.setDate(from.getDate() - 30);
    const to = new Date(today); to.setDate(to.getDate() + 90);
    const bookings = await api.get('/api/bookings', { from: iso(from), to: iso(to) });

    const now = new Date();
    const fired = loadFired();
    const toSchedule = [];

    const push = (b, type, title, body, when) => {
      // future-dated reminder -> schedule at that time; due now -> fire shortly, once only
      let at = when;
      const key = `${type}-${b.id}`;
      if (when <= now) {
        if (fired.has(key)) return;            // already popped this one
        fired.add(key);
        at = new Date(now.getTime() + 4000);   // fire ~4s from now
      }
      toSchedule.push({
        id: intId(key),
        title,
        body,
        channelId: CHANNEL,
        sound: SOUND,
        schedule: { at, allowWhileIdle: true },
      });
    };

    for (const b of bookings) {
      if (!b.booking_date) continue;
      const name = b.client_name || 'عميل';
      if (b.status === 'pending') {
        push(b, 'pending', 'حجز بانتظار التأكيد', `تم بلوغ الحد الأقصى يوم ${b.booking_date}. حجز انتظار للعميل ${name}.`, now);
        continue;
      }
      if (b.status !== 'active') continue;
      push(b, 'reminder_3', 'تذكير بحجز', `حجز ${name} بعد ٣ أيام (${b.booking_date}).`, fireAt(b.booking_date, -3, 9, 0));
      push(b, 'reminder_1', 'تذكير بحجز الغد', `حجز ${name} غداً (${b.booking_date}).`, fireAt(b.booking_date, -1, 9, 0));
      if (staffCount(b) === 0) {
        push(b, 'no_staff', 'لم يتم حجز الموظفين', `حجز ${name} بعد يومين (${b.booking_date}) بلا موظفين.`, fireAt(b.booking_date, -2, 9, 0));
      }
      if (!b.closed) {
        push(b, 'close_day', 'إنهاء الحجز مطلوب', `انتهى موعد حجز ${name} (${b.booking_date}). يرجى إنهاء الحجز وتوزيع الإكراميات.`, fireAt(b.booking_date, 1, 20, 0));
      }
    }

    // cancel previously-pending (not-yet-fired) ones, then reschedule fresh
    const pending = await LocalNotifications.getPending();
    if (pending?.notifications?.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((p) => ({ id: p.id })) });
    }
    if (toSchedule.length) {
      await LocalNotifications.schedule({ notifications: toSchedule });
    }
    saveFired(fired);
  } catch {
    /* ignore — notifications are best-effort */
  }
}
