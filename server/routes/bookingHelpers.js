import { db } from '../db.js';

const empByBooking = db.prepare(`
  SELECT be.role, be.employee_id, be.paid_amount, be.tip_amount, e.name
  FROM booking_employees be JOIN employees e ON e.id = be.employee_id
  WHERE be.booking_id = ?
`);

export function hydrateBooking(row) {
  if (!row) return null;
  const emps = empByBooking.all(row.id);
  const byRole = {};
  let empCost = 0;
  let tipsFromEmps = 0;
  for (const e of emps) {
    (byRole[e.role] ||= []).push({
      id: e.employee_id,
      name: e.name,
      role: e.role,
      paid_amount: e.paid_amount || 0,
      tip_amount: e.tip_amount || 0,
    });
    empCost += e.paid_amount || 0;
    tipsFromEmps += e.tip_amount || 0;
  }
  const total = (row.amount || 0) - (row.discount || 0);
  return {
    ...row,
    tips_distributed: !!row.tips_distributed,
    payment_completed: !!row.payment_completed,
    closed: !!row.closed,
    extra_drinks: safeParse(row.extra_drinks, []),
    custom_fields: safeParse(row.custom_fields, {}),
    employees: byRole,
    has_sabbabat: (byRole['صبابة'] || []).length > 0,
    has_workers: (byRole['عاملة'] || []).length > 0,
    has_driver: (byRole['سائق'] || []).length > 0,
    employee_cost: empCost,
    tips_from_employees: tipsFromEmps,
    net_total: total,
    remaining: Math.max(total - (row.paid_amount || 0), 0),
  };
}

export function safeParse(v, fallback) {
  try {
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
