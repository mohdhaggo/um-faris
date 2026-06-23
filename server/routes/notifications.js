import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

function daysBetween(a, b) {
  const ms = new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00');
  return Math.round(ms / 86400000);
}

// Dynamically computed in-app notifications based on booking dates / state
router.get('/', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = db.prepare("SELECT * FROM bookings WHERE status IN ('active','pending')").all();
  const list = [];

  for (const b of rows) {
    if (!b.booking_date) continue;

    if (b.status === 'pending') {
      list.push(
        n(b, 'pending', 'warning',
          `تم بلوغ الحد الأقصى للحجوزات يوم ${b.booking_date}. حجز انتظار للعميل ${b.client_name} بانتظار التأكيد أو الرفض.`)
      );
      continue;
    }

    const diff = daysBetween(today, b.booking_date); // >0 future, 0 today, <0 past
    const empCount = db.prepare('SELECT COUNT(*) AS c FROM booking_employees WHERE booking_id = ?').get(b.id).c;

    if (diff === 3) {
      list.push(n(b, 'reminder_3', 'info', `تذكير: حجز ${b.client_name} بعد ٣ أيام (${b.booking_date}).`));
    }
    if (diff === 1) {
      list.push(n(b, 'reminder_1', 'info', `تذكير: حجز ${b.client_name} غداً (${b.booking_date}).`));
    }
    if (diff === 2 && empCount === 0) {
      list.push(n(b, 'no_staff', 'warning', `لم يتم حجز الموظفين لحجز ${b.client_name} بعد يومين (${b.booking_date}).`));
    }
    if (diff < 0 && !b.closed) {
      list.push(
        n(b, 'close_day', 'danger',
          `انتهى موعد حجز ${b.client_name} (${b.booking_date}). يرجى تأكيد إنهاء الحجز، اكتمال الدفع، وتوزيع الإكراميات.`)
      );
    }
  }

  // newest / most urgent first
  const order = { danger: 0, warning: 1, info: 2 };
  list.sort((a, b) => order[a.severity] - order[b.severity] || (a.booking_date < b.booking_date ? 1 : -1));
  res.json(list);
});

function n(b, type, severity, message) {
  return { id: `${type}-${b.id}`, booking_id: b.id, type, severity, message, booking_date: b.booking_date, client_name: b.client_name };
}

export default router;
