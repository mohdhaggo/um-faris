import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// employee cost per booking = sum of the per-booking amounts entered at closing
function employeeCost(bookingId) {
  return db.prepare(
    'SELECT COALESCE(SUM(paid_amount),0) AS c FROM booking_employees WHERE booking_id = ?'
  ).get(bookingId).c;
}

// GET /api/finance/summary?from=&to=&payment_status=&tips=&group=day|month
router.get('/summary', (req, res) => {
  const { from, to, payment_status, tips, group = 'day' } = req.query;
  const where = ["status = 'active'"];
  const params = [];
  if (from) { where.push('booking_date >= ?'); params.push(from); }
  if (to) { where.push('booking_date <= ?'); params.push(to); }
  if (payment_status) { where.push('payment_status = ?'); params.push(payment_status); }
  if (tips === '1') where.push('tips_amount > 0');

  const rows = db.prepare(
    `SELECT * FROM bookings WHERE ${where.join(' AND ')} ORDER BY booking_date`
  ).all(...params);

  let revenue = 0, paidSum = 0, collected = 0, empCostTotal = 0, tipsTotal = 0, discountTotal = 0;
  const buckets = new Map();

  for (const b of rows) {
    const net = (b.amount || 0) - (b.discount || 0);
    const cost = employeeCost(b.id);
    const tip = b.tips_amount || 0;
    const paid = b.paid_amount || 0;
    // a customer tip is added on top of the collected amount and passed to staff (neutral to owner)
    const collectedThis = paid + tip;
    const key = group === 'month' ? (b.booking_date || '').slice(0, 7) : b.booking_date;
    const profit = collectedThis - cost - tip; // = paid - employee_cost
    revenue += net;
    paidSum += paid;
    collected += collectedThis;
    empCostTotal += cost;
    tipsTotal += tip;
    discountTotal += b.discount || 0;
    const cur = buckets.get(key) || { period: key, revenue: 0, collected: 0, employee_cost: 0, tips: 0, profit: 0, count: 0 };
    cur.revenue += net;
    cur.collected += collectedThis;
    cur.employee_cost += cost;
    cur.tips += tip;
    cur.profit += profit;
    cur.count += 1;
    buckets.set(key, cur);
  }

  const series = [...buckets.values()].sort((a, b) => (a.period < b.period ? -1 : 1));
  res.json({
    totals: {
      revenue,
      collected,
      remaining: revenue - paidSum,
      employee_cost: empCostTotal,
      tips: tipsTotal,
      discount: discountTotal,
      net_profit: collected - empCostTotal - tipsTotal,
      count: rows.length,
    },
    series,
  });
});

export default router;
