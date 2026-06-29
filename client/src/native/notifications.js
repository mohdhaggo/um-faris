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

// Waiting-list alerts repeat every 3 hours until the booking is confirmed/rejected.
const PENDING_REPEAT_MS = 3 * 60 * 60 * 1000;

let _ready = false;

export async function initNotifications() {
  if (!isNative) return false;
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return false;
    await LocalNotifications.createChannel({
      id: CHANNEL,
      name: 'تنبيهات أم فارس',
      description: 'تذكيرات الحجوزات والتنبيهات',
      importance: 5, // MAX -> heads-up popup
      visibility: 1,
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

// Fire time: booking_date shifted by addDays, at hour:minute local time.
function fireAt(dateStr, addDays, hour, minute) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Next occurrence of hour:minute — today if not yet reached, tomorrow if already past.
function nextOccurrenceAt(hour, minute) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d <= new Date()) d.setDate(d.getDate() + 1);
  return d;
}

// Stable positive 31-bit int id from a string (Capacitor needs integer ids).
function intId(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 2000000000) + 1;
}

const staffCount = (b) => Object.values(b.employees || {}).reduce((s, arr) => s + (arr?.length || 0), 0);

// fired: { [key]: timestamp_ms }
// One-time notifications: skip if any timestamp stored.
// Repeating notifications: skip only if last fired within the repeat interval.
function loadFired() {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) || '{}');
    // Migrate old array format (pre-update) → object with timestamps
    if (Array.isArray(raw)) {
      const now = Date.now();
      return Object.fromEntries(raw.map((k) => [k, now]));
    }
    return raw;
  } catch { return {}; }
}
function saveFired(obj) {
  // Keep only the 500 most recently fired entries
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 500);
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(Object.fromEntries(entries))); } catch { /* ignore */ }
}

export async function syncReminders() {
  if (!isNative || !_ready) return;
  try {
    const now = new Date();
    const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const todayStr = isoDate(now);

    const from = new Date(now); from.setDate(from.getDate() - 30);
    const to = new Date(now); to.setDate(to.getDate() + 90);
    const bookings = await api.get('/api/bookings', { from: isoDate(from), to: isoDate(to) });

    const fired = loadFired();
    const toSchedule = [];

    // Schedule a notification.
    // when <= now  → "due now" path: fire ~4 s from now, guarded by fired map.
    //   repeatEveryMs = 0  → one-time (skip if ever fired before).
    //   repeatEveryMs > 0  → repeat (skip only if fired within that interval).
    // when > now   → scheduled path: always add (cancel+reschedule loop handles duplicates).
    const push = (key, title, body, when, repeatEveryMs = 0) => {
      let at = when;
      if (when <= now) {
        const lastFired = fired[key];
        if (repeatEveryMs > 0) {
          if (lastFired && (now.getTime() - lastFired) < repeatEveryMs) return;
        } else {
          if (lastFired) return;
        }
        fired[key] = now.getTime();
        at = new Date(now.getTime() + 4000);
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

    // Collect no-staff bookings in the next 1–3 days for the nightly digest (Rule 3).
    const noStaffUpcoming = [];

    for (const b of bookings) {
      if (!b.booking_date) continue;
      const name = b.client_name || 'عميل';

      // ── Rule 5: Waiting-list alert ─────────────────────────────────────────
      // Fires immediately; repeats every 3 hours while booking is still pending.
      if (b.status === 'pending') {
        push(
          `pending-${b.id}`,
          'حجز بانتظار التأكيد',
          `تم بلوغ الحد الأقصى يوم ${b.booking_date}. حجز انتظار للعميل ${name}.`,
          now,
          PENDING_REPEAT_MS,
        );
        continue;
      }
      if (b.status !== 'active') continue;

      // ── Rule 1: Today's booking ────────────────────────────────────────────
      // Fires at 1:30 PM on the booking day itself.
      push(
        `today-${b.id}`,
        'تذكير حجز اليوم',
        `لديك حجز اليوم للعميل ${name} (${b.booking_date}).`,
        fireAt(b.booking_date, 0, 13, 30),
      );

      // ── Rule 2: Tomorrow's booking ─────────────────────────────────────────
      // Fires at 11:00 PM the night before.
      push(
        `tomorrow-${b.id}`,
        'تذكير حجز الغد',
        `لديك حجز غداً للعميل ${name} (${b.booking_date}).`,
        fireAt(b.booking_date, -1, 23, 0),
      );

      // ── Rule 3: No-staff collection ────────────────────────────────────────
      // Bookings 1–3 days ahead with no employees assigned → grouped digest at 10 PM.
      if (staffCount(b) === 0) {
        const bookingDay = new Date(b.booking_date + 'T00:00:00');
        const todayDay = new Date(todayStr + 'T00:00:00');
        const daysAhead = Math.round((bookingDay - todayDay) / 86400000);
        if (daysAhead >= 1 && daysAhead <= 3) {
          noStaffUpcoming.push(b);
        }
      }

      // ── Rule 4: Close-out reminder ─────────────────────────────────────────
      // Fires at 2:00 AM the morning after the booking, if not yet closed.
      if (!b.closed) {
        push(
          `close_day-${b.id}`,
          'إنهاء الحجز مطلوب',
          `انتهى موعد حجز ${name} (${b.booking_date}). يرجى إنهاء الحجز وتوزيع الإكراميات.`,
          fireAt(b.booking_date, 1, 2, 0),
        );
      }
    }

    // ── Rule 3: Nightly no-staff digest at 10:00 PM ───────────────────────────
    // One grouped notification listing ALL upcoming bookings (next 1–3 days) with no staff.
    // Reschedules itself every sync; fires once each night at 10 PM.
    if (noStaffUpcoming.length > 0) {
      const names = noStaffUpcoming
        .map((b) => `${b.client_name || 'عميل'} (${b.booking_date})`)
        .join('، ');
      toSchedule.push({
        id: intId(`nostaff-digest-${todayStr}`),
        title: `حجوزات بلا موظفين (${noStaffUpcoming.length})`,
        body: `الحجوزات التالية بلا موظفين: ${names}`,
        channelId: CHANNEL,
        sound: SOUND,
        schedule: { at: nextOccurrenceAt(22, 0), allowWhileIdle: true },
      });
    }

    // Cancel all previously-pending scheduled notifications, then reschedule fresh.
    const pending = await LocalNotifications.getPending();
    if (pending?.notifications?.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((p) => ({ id: p.id })) });
    }
    if (toSchedule.length) {
      await LocalNotifications.schedule({ notifications: toSchedule });
    }
    saveFired(fired);
  } catch {
    /* notifications are best-effort */
  }
}
