import { useEffect, useState } from 'react';
import {
  Pencil, Trash2, CalendarX, BadgePercent, Check, UserPlus, CheckCircle2, XCircle, AlertCircle, CircleDot, Coins, Clock, Calculator,
} from 'lucide-react';
import { api } from '../api';
import { useSettings } from '../store/Settings';
import { SAR, fmtDate, fmtHijri, fmtTime, PAYMENT_STATUS, PAYMENT_COLORS, BOOKING_STATUS, staffStatus, STAFF_CLS, STAFF_LABEL } from '../constants';
import Modal from './Modal';
import BookingForm, { toList } from './BookingForm';
import { Spinner, Input, Field, Select, SuccessToast } from './ui';
import { t } from '../i18n';

const roleLabel = (role) => t({ 'صبابة': 'الصبابات', 'عاملة': 'العاملات', 'سائق': 'السائق' }[role] || role);

export default function BookingDetails({ bookingId, onClose, onChanged }) {
  const { jobTypes, fieldConfig } = useSettings();
  const [b, setB] = useState(null);
  const [prevCount, setPrevCount] = useState(null);
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [toast, setToast] = useState(false);

  const load = () =>
    api.get(`/api/bookings/${bookingId}`).then((data) => {
      setB(data);
      if (data.client_id)
        api.get(`/api/clients/${data.client_id}`).then((c) => setPrevCount(Math.max((c.bookings?.length || 1) - 1, 0))).catch(() => {});
    });
  useEffect(() => {
    load();
  }, [bookingId]);

  const refresh = (data) => {
    if (data) setB(data);
    else load();
    onChanged?.();
  };

  if (!b)
    return <div className="flex justify-center py-10"><Spinner className="h-7 w-7 text-brand-500" /></div>;

  const cancel = async () => {
    if (!confirm(t('تأكيد إلغاء الموعد؟'))) return;
    refresh(await api.post(`/api/bookings/${b.id}/cancel`));
  };
  const remove = async () => {
    if (!confirm(t('حذف الحجز نهائياً؟'))) return;
    await api.del(`/api/bookings/${b.id}`);
    onChanged?.();
    onClose();
  };

  // Only show fields that are currently enabled in settings — same set, same order as the form.
  const fields = (fieldConfig || []).filter((f) => f.enabled);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip ${b.status === 'active' ? 'bg-emerald-100 text-emerald-700' : b.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
          {t(BOOKING_STATUS[b.status] || b.status)}
        </span>
        <button className="btn-primary" onClick={() => setCloseOpen(true)}>
          <Calculator size={16} /> {b.closed ? t('تعديل الإنهاء') : t('إنهاء الحجز وحساب الموظفين')}
        </button>
        <button className="btn-soft" onClick={() => setEditing(true)}><Pencil size={16} /> {t('تعديل')}</button>
        <button className="btn-soft" onClick={() => setDiscountOpen(true)}><BadgePercent size={16} /> {t('إضافة خصم')}</button>
        <button className="btn-soft" onClick={cancel} disabled={b.status === 'cancelled'}>
          <CalendarX size={16} /> {b.status === 'cancelled' ? t('ملغي') : t('إلغاء الموعد')}
        </button>
        <button className="btn-danger" onClick={remove}><Trash2 size={16} /> {t('حذف')}</button>
      </div>

      <Card title={t('بيانات العميل')}>
        <Row label={t('اسم العميل')} value={b.client_name} />
        <Row label={t('رقم الجوال')} value={b.client_phone || '—'} />
        <Row label={t('عدد الحجوزات السابقة')} value={prevCount ?? '—'} />
      </Card>

      <Card title={t('بيانات الطلب')}>
        <Row label={t('تاريخ الحجز (ميلادي)')} value={<span className="text-maroon-700">{fmtDate(b.booking_date)}</span>} />
        <Row label={t('تاريخ الحجز (هجري)')} value={<span className="text-emerald-600">{fmtHijri(b.booking_date)}</span>} />
        {fields.map((field) => {
          const raw = field.system ? b[field.key] : (b.custom_fields || {})[field.key];
          if (raw === '' || raw === null || raw === undefined) return null;
          if (field.type === 'multiselect' || Array.isArray(raw)) {
            const items = toList(raw);
            if (!items.length) return null;
            return (
              <Row key={field.key} label={t(field.label)} value={
                <span className="flex flex-wrap gap-1">
                  {items.map((o) => <span key={o} className="chip bg-brand-100 text-brand-700">{t(o)}</span>)}
                </span>
              } />
            );
          }
          const display = field.type === 'select' ? t(String(raw)) : String(raw);
          if (field.key === 'notes') return (
            <div key="notes" className="col-span-full text-sm text-stone-600"><b>{t(field.label)}:</b> {display}</div>
          );
          return <Row key={field.key} label={t(field.label)} value={display} />;
        })}
        <Row label={t('المبلغ')} value={SAR(b.amount)} />
        {b.discount > 0 && <Row label={t('الخصم')} value={SAR(b.discount)} />}
        <Row label={t('الإجمالي بعد الخصم')} value={SAR(b.net_total)} />
        <Row label={t('حالة الدفع')} value={<span className={`chip ${PAYMENT_COLORS[b.payment_status]}`}>{t(PAYMENT_STATUS[b.payment_status])}</span>} />
        {b.payment_status === 'deposit' && (
          <>
            <Row label={t('المدفوع')} value={SAR(b.paid_amount)} />
            <Row label={t('المتبقي')} value={<span className="font-bold text-red-600">{SAR(b.remaining)}</span>} />
          </>
        )}
        {b.extra_drinks?.length > 0 && (
          <div className="col-span-full">
            <div className="mb-1 text-xs font-bold text-stone-500">{t('مشروبات إضافية')}</div>
            <div className="flex flex-wrap gap-2">
              {b.extra_drinks.map((d, i) => (
                <span key={i} className="chip bg-stone-100 text-stone-700">{d.name} ×{d.count} — {SAR(d.cost)}</span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* staff cards by configured job types */}
      <div className="grid gap-4 md:grid-cols-3">
        {(jobTypes || []).map((role) => (
          <StaffCard key={role} role={role} list={b.employees[role] || []} status={staffStatus(b, role)} onPick={() => setPicker(role)} />
        ))}
      </div>

      {/* settlement summary (only once the booking has been closed) */}
      {b.closed && (
        <div className="card border-emerald-200 bg-emerald-50/40 p-4">
          <h4 className="flex items-center gap-2 text-sm font-extrabold text-stone-700">
            <CircleDot size={16} /> {t('ملخص المحاسبة')}
            <span className="chip bg-emerald-100 text-emerald-700">{t('منتهٍ')}</span>
          </h4>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Row label={t('حساب الموظفين')} value={SAR(b.employee_cost)} />
            <Row label={t('الإكرامية')} value={SAR(b.tips_amount)} />
            <Row label={t('إجمالي المدفوع (شامل الإكرامية)')} value={SAR((b.paid_amount || 0) + (b.tips_amount || 0))} />
            <Row label={t('دخلي (الصافي)')} value={<span className="font-extrabold text-emerald-600">{SAR((b.paid_amount || 0) - (b.employee_cost || 0))}</span>} />
          </div>
        </div>
      )}

      {editing && (
        <Modal open title={t('تعديل الحجز')} size="lg" onClose={() => setEditing(false)}>
          <BookingForm initial={b} onCancel={() => setEditing(false)} onSaved={(data) => { setEditing(false); refresh(data); }} />
        </Modal>
      )}
      {picker && (
        <EmployeePicker role={picker} booking={b} onClose={() => setPicker(null)} onSaved={(data) => { setPicker(null); refresh(data); }} />
      )}
      {discountOpen && (
        <DiscountModal booking={b} onClose={() => setDiscountOpen(false)} onSaved={(d) => { setDiscountOpen(false); refresh(d); }} />
      )}
      {closeOpen && (
        <CloseModal booking={b} onClose={() => setCloseOpen(false)}
          onSaved={(d) => { setCloseOpen(false); refresh(d); setToast(true); }} />
      )}
      <SuccessToast open={toast} onClose={() => setToast(false)} />
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="card p-4">
      <h4 className="mb-3 text-sm font-extrabold text-brand-700">{title}</h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">{children}</div>
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div>
      <div className="text-xs font-bold text-stone-400">{label}</div>
      <div className="text-sm font-bold text-stone-800">{value}</div>
    </div>
  );
}

function StaffCard({ role, list, status, onPick }) {
  const has = list.length > 0;
  const Icon = status === 'done' ? CheckCircle2 : status === 'partial' ? AlertCircle : XCircle;
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-extrabold text-brand-700">{t('بيانات {role}', { role: roleLabel(role) })}</h4>
        <span className={`chip ${STAFF_CLS[status]}`}><Icon size={13} /> {t(STAFF_LABEL[status])}</span>
      </div>
      {has ? (
        <div className="mb-2 space-y-1">
          {list.map((e) => (
            <div key={e.id} className="rounded-lg bg-stone-50 px-3 py-1.5 text-sm font-bold text-stone-700">
              <div className="flex items-center justify-between gap-2">
                <span>{e.temp ? e.name || t('موظف مؤقت') : e.name}</span>
                {e.time && <span className="chip bg-sky-100 text-sky-700"><Clock size={12} /> {fmtTime(e.time)}</span>}
              </div>
              {e.temp && <div className="mt-0.5 text-xs font-bold text-violet-600">{tempLabel(e)}</div>}
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-2 text-sm text-stone-400">{t('لم يتم الاختيار بعد')}</p>
      )}
      <button className="btn-ghost w-full" onClick={onPick}><UserPlus size={16} /> {has ? t('تعديل الاختيار') : t('اختر {role}', { role: roleLabel(role) })}</button>
    </div>
  );
}

function tempLabel(e) {
  return e.temp_type === 'referred'
    ? t('مؤقت — بترشيح من {name}', { name: e.referred_by_name || '—' })
    : t('مؤقت — عشوائي');
}

const otherKey = (bookingId, employeeId, role) => `${bookingId}|${employeeId}|${role}`;
const EMPTY_TEMP = { temp_type: 'random', referred_by_id: '', name: '', time: '' };

function EmployeePicker({ role, booking, onClose, onSaved }) {
  const current = booking.employees[role] || [];
  const [list, setList] = useState(null);
  const [allEmps, setAllEmps] = useState([]);
  // selected regular employees: id -> time ('' when not set)
  const [sel, setSel] = useState(() => new Map(current.filter((e) => !e.temp).map((e) => [e.id, e.time || ''])));
  // times for the same employee in other bookings that day
  const [otherTimes, setOtherTimes] = useState({});
  const [temps, setTemps] = useState(() => current.filter((e) => e.temp).map((e) => ({
    employee_id: e.id, temp_type: e.temp_type || 'random', referred_by_id: e.referred_by_id || '', name: e.name || '', time: e.time || '',
  })));
  const [tempForm, setTempForm] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  // employees already assigned to OTHER roles in this same booking
  const otherRoleMap = {};
  for (const [r, arr] of Object.entries(booking.employees || {})) {
    if (r === role) continue;
    for (const e of arr) otherRoleMap[e.id] = r;
  }

  useEffect(() => {
    api.get('/api/employees', { role, date: booking.booking_date, exclude_booking: booking.id }).then((rows) => {
      setList(rows);
      const init = {};
      for (const e of rows) for (const d of e.busy_details || []) init[otherKey(d.booking_id, e.id, d.role)] = d.time || '';
      setOtherTimes(init);
    });
    api.get('/api/employees').then((rows) => setAllEmps(rows.filter((e) => e.active)));
  }, []);

  const toggle = (id, disabled) => {
    if (disabled) return;
    setErr('');
    setSel((s) => { const n = new Map(s); n.has(id) ? n.delete(id) : n.set(id, ''); return n; });
  };
  const setTime = (id, v) => setSel((s) => new Map(s).set(id, v));

  // client-side mirror of the server rule: a double-booked employee needs a distinct time in every booking
  const validate = () => {
    for (const e of list || []) {
      if (!sel.has(e.id) || !e.busy) continue;
      const mine = sel.get(e.id);
      if (!mine) return t('يرجى إدخال وقت {name} في هذا الطلب', { name: e.name });
      const seen = new Set([mine]);
      for (const d of e.busy_details) {
        const tm = otherTimes[otherKey(d.booking_id, e.id, d.role)];
        if (!tm) return t('يرجى إدخال وقت {name} في طلب {client}', { name: e.name, client: d.client });
        if (seen.has(tm)) return t('لا يمكن حجز {name} في نفس الوقت ({time}) لطلبين', { name: e.name, time: fmtTime(tm) });
        seen.add(tm);
      }
    }
    return '';
  };

  const save = async () => {
    const v = validate();
    if (v) { setErr(v); return; }
    const other_times = [];
    for (const e of list || []) {
      if (!sel.has(e.id) || !e.busy) continue;
      for (const d of e.busy_details)
        other_times.push({ booking_id: d.booking_id, employee_id: e.id, role: d.role, time: otherTimes[otherKey(d.booking_id, e.id, d.role)] });
    }
    setSaving(true);
    setErr('');
    try {
      const data = await api.put(`/api/bookings/${booking.id}/employees/${encodeURIComponent(role)}`, {
        members: [...sel].map(([employee_id, time]) => ({ employee_id, time })),
        temps, other_times,
      });
      onSaved(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const addTemp = () => {
    if (tempForm.temp_type === 'referred' && !tempForm.referred_by_id) {
      setErr(t('يرجى اختيار الموظف الذي رشّح الموظف المؤقت'));
      return;
    }
    setErr('');
    setTemps((ts) => [...ts, { ...tempForm }]);
    setTempForm(null);
  };

  // referral list grouped by each employee's primary task
  const byPrimary = {};
  for (const e of allEmps) (byPrimary[e.primary_job || t('بدون وظيفة')] ||= []).push(e);
  const empName = (id) => allEmps.find((e) => e.id === id)?.name || '—';

  return (
    <Modal open title={t('اختيار {role}', { role: roleLabel(role) })} size="sm" onClose={onClose}>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{err}</div>}
      {!list ? (
        <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-brand-500" /></div>
      ) : (
        <div className="space-y-2">
          {list.length === 0 && (
            <p className="py-3 text-center text-sm text-stone-400">{t('لا يوجد موظفون بهذا التصنيف. أضفهم من إدارة الموظفين.')}</p>
          )}
          {list.map((e) => {
            const isSelected = sel.has(e.id);
            const inOtherRole = otherRoleMap[e.id];
            const isDisabled = !!inOtherRole;
            return (
              <div key={e.id}
                className={`rounded-lg border px-3 py-2 ${
                  isSelected ? 'border-brand-400 bg-brand-50'
                  : inOtherRole ? 'border-amber-300 bg-amber-50/60'
                  : e.busy ? 'border-red-200 bg-red-50/50'
                  : 'border-stone-200'
                }`}>
                <div onClick={() => toggle(e.id, isDisabled)}
                  className={`flex items-start justify-between gap-2 ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={isSelected} disabled={isDisabled} readOnly />
                    <div>
                      <span className="font-bold text-stone-800">{e.name}</span>
                      <span className={`ms-1.5 chip ${e.primary_job === role ? 'bg-brand-100 text-brand-700' : 'bg-stone-100 text-stone-500'}`}>
                        {e.primary_job === role ? t('وظيفة أساسية') : t('وظيفة إضافية')}
                      </span>
                      {e.phone && <span className="block text-xs text-stone-400" dir="ltr">{e.phone}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {inOtherRole && (
                      <span className="chip bg-amber-100 text-amber-700">{t('مختار كـ {role} في هذا الطلب', { role: t(inOtherRole) })}</span>
                    )}
                    {e.busy && (e.busy_details || []).map((d, i) => (
                      <span key={i} className="chip bg-red-100 text-red-700">
                        {t('محجوز لطلب: {client} كـ {role}', { client: d.client, role: t(d.role) })}
                        {d.time ? ` · ${fmtTime(d.time)}` : ''}
                      </span>
                    ))}
                  </div>
                </div>

                {isSelected && (
                  <div className="mt-2 space-y-2 border-t border-stone-200/70 pt-2">
                    {e.busy && <p className="text-xs font-bold text-red-600">{t('الموظف محجوز لطلب آخر في نفس اليوم — حدّد وقتاً مختلفاً لكل طلب.')}</p>}
                    <TimeRow
                      label={e.busy ? t('الوقت في هذا الطلب') : t('الوقت في هذا الطلب (اختياري)')}
                      value={sel.get(e.id)} onChange={(v) => setTime(e.id, v)} />
                    {e.busy && (e.busy_details || []).map((d) => {
                      const k = otherKey(d.booking_id, e.id, d.role);
                      return (
                        <TimeRow key={k}
                          label={t('الوقت في طلب {client} ({role})', { client: d.client, role: t(d.role) })}
                          value={otherTimes[k] || ''} onChange={(v) => setOtherTimes((s) => ({ ...s, [k]: v }))} />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* temporary staff */}
          <div className="rounded-lg border border-dashed border-violet-300 bg-violet-50/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-extrabold text-violet-700">{t('موظفون مؤقتون')}</span>
              {!tempForm && (
                <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setErr(''); setTempForm({ ...EMPTY_TEMP }); }}>
                  <UserPlus size={14} /> {t('إضافة موظف مؤقت')}
                </button>
              )}
            </div>

            {temps.length === 0 && !tempForm && <p className="text-xs text-stone-400">{t('لا يوجد موظفون مؤقتون')}</p>}
            <div className="space-y-1.5">
              {temps.map((tp, i) => (
                <div key={tp.employee_id || i} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-sm">
                  <div>
                    <span className="font-bold text-stone-800">{tp.name || t('موظف مؤقت')}</span>
                    <span className="block text-xs font-bold text-violet-600">
                      {tempLabel({ ...tp, referred_by_name: empName(tp.referred_by_id) })}{tp.time ? ` · ${fmtTime(tp.time)}` : ''}
                    </span>
                  </div>
                  <button type="button" className="rounded p-1 text-red-500 hover:bg-red-50" onClick={() => setTemps((ts) => ts.filter((_, j) => j !== i))}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            {tempForm && (
              <div className="mt-2 space-y-2 rounded-lg bg-white p-3">
                <div className="flex gap-4 text-sm font-bold text-stone-700">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={tempForm.temp_type === 'random'} onChange={() => setTempForm((f) => ({ ...f, temp_type: 'random', referred_by_id: '' }))} />
                    {t('عشوائي')}
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={tempForm.temp_type === 'referred'} onChange={() => setTempForm((f) => ({ ...f, temp_type: 'referred' }))} />
                    {t('بترشيح من موظف')}
                  </label>
                </div>
                {tempForm.temp_type === 'referred' && (
                  <Field label={t('الموظف الذي رشّحه')}>
                    <Select value={tempForm.referred_by_id} onChange={(e) => setTempForm((f) => ({ ...f, referred_by_id: e.target.value }))}>
                      <option value="">{t('اختر…')}</option>
                      {Object.entries(byPrimary).map(([job, emps]) => (
                        <optgroup key={job} label={t(job)}>
                          {emps.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                        </optgroup>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label={t('اسم الموظف المؤقت (اختياري)')}>
                  <Input value={tempForm.name} onChange={(e) => setTempForm((f) => ({ ...f, name: e.target.value }))} />
                </Field>
                <TimeRow label={t('الوقت في هذا الطلب (اختياري)')} value={tempForm.time} onChange={(v) => setTempForm((f) => ({ ...f, time: v }))} />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-soft !py-1" onClick={() => setTempForm(null)}>{t('إلغاء')}</button>
                  <button type="button" className="btn-primary !py-1" onClick={addTemp}>{t('إضافة')}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-soft" onClick={onClose}>{t('إلغاء')}</button>
        <button className="btn-primary" onClick={save} disabled={saving || !list}>{saving ? <Spinner className="h-5 w-5" /> : t('حفظ')}</button>
      </div>
    </Modal>
  );
}

function TimeRow({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs font-bold text-stone-600">
      <span>{label}</span>
      <input type="time" className="input !w-36 !py-1" value={value || ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function DiscountModal({ booking, onClose, onSaved }) {
  const [val, setVal] = useState(booking.discount || 0);
  const save = async () => onSaved(await api.put(`/api/bookings/${booking.id}`, { discount: Number(val) || 0 }));
  return (
    <Modal open title={t('إضافة / تعديل الخصم')} size="sm" onClose={onClose}>
      <Field label={t('قيمة الخصم (ر.س)')}><Input type="number" min="0" value={val} onChange={(e) => setVal(e.target.value)} autoFocus /></Field>
      <div className="mt-2 text-sm text-stone-500">{t('الإجمالي الحالي: {a} → بعد الخصم: {b}', { a: SAR(booking.amount), b: SAR((booking.amount || 0) - (Number(val) || 0)) })}</div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-soft" onClick={onClose}>{t('إلغاء')}</button>
        <button className="btn-primary" onClick={save}>{t('حفظ')}</button>
      </div>
    </Modal>
  );
}

/* full close flow (#9, #10): payment + per-employee pay + tips split */
function CloseModal({ booking, onClose, onSaved }) {
  const flat = Object.entries(booking.employees).flatMap(([role, arr]) => arr.map((e) => ({ ...e, role, k: `${role}:${e.id}` })));
  const [paymentStatus, setPaymentStatus] = useState(booking.payment_status || 'unpaid');
  const [paidAmount, setPaidAmount] = useState(booking.payment_status === 'paid' ? booking.net_total : booking.paid_amount || 0);
  const [amounts, setAmounts] = useState(() => Object.fromEntries(flat.map((e) => [e.k, e.paid_amount || ''])));
  const [tips, setTips] = useState(booking.tips_amount || 0);
  const [hasTips, setHasTips] = useState((booking.tips_amount || 0) > 0);
  const [tipsMode, setTipsMode] = useState('all'); // all | specific
  const [tipSel, setTipSel] = useState(new Set(flat.filter((e) => e.tip_amount > 0).map((e) => e.k)));
  const [saving, setSaving] = useState(false);

  const setAmount = (k, v) => setAmounts((s) => ({ ...s, [k]: v }));
  const toggleTip = (k) => setTipSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const save = async () => {
    setSaving(true);
    const tipsTotal = hasTips ? Number(tips) || 0 : 0;
    const recipients = tipsMode === 'all' ? flat.map((e) => e.k) : [...tipSel];
    const per = recipients.length ? tipsTotal / recipients.length : 0;
    const employees = flat.map((e) => ({
      id: e.id,
      role: e.role,
      paid_amount: Number(amounts[e.k]) || 0,
      tip_amount: recipients.includes(e.k) ? per : 0,
    }));
    const data = await api.post(`/api/bookings/${booking.id}/close`, {
      payment_status: paymentStatus,
      paid_amount: paymentStatus === 'unpaid' ? 0 : Number(paidAmount) || 0,
      payment_completed: paymentStatus === 'paid',
      tips_amount: tipsTotal,
      tips_distributed: tipsTotal > 0,
      employees,
      closed: true,
    });
    setSaving(false);
    onSaved(data);
  };

  const empTotal = flat.reduce((s, e) => s + (Number(amounts[e.k]) || 0), 0);

  return (
    <Modal open title={t('إنهاء الحجز وحساب الموظفين')} size="md" onClose={onClose}>
      <div className="space-y-5">
        {/* payment */}
        <Section title={t('حالة الدفع')}>
          <Field label={t('الحالة')}>
            <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
              {Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
            </Select>
          </Field>
          {paymentStatus !== 'unpaid' && (
            <Field label={t('المبلغ المدفوع (ر.س)')}>
              <Input type="number" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
            </Field>
          )}
          {paymentStatus === 'deposit' && (
            <div className="col-span-full text-sm font-bold text-red-600">{t('المتبقي: {x}', { x: SAR((booking.net_total || 0) - (Number(paidAmount) || 0)) })}</div>
          )}
        </Section>

        {/* per-employee amounts */}
        <div>
          <h4 className="mb-2 text-sm font-extrabold text-brand-700">{t('حساب الموظفين (مبلغ كل موظف على حدة)')}</h4>
          {flat.length === 0 ? (
            <p className="text-sm text-stone-400">{t('لم يتم اختيار موظفين لهذا الحجز.')}</p>
          ) : (
            <div className="space-y-2">
              {flat.map((e) => (
                <div key={e.k} className="flex items-center gap-3">
                  <span className="w-40 truncate text-sm font-bold text-stone-700">{e.name || t('موظف مؤقت')} <span className="text-xs text-stone-400">({roleLabel(e.role)})</span></span>
                  <Input type="number" min="0" placeholder={t('المبلغ')} value={amounts[e.k]} onChange={(ev) => setAmount(e.k, ev.target.value)} />
                </div>
              ))}
              <div className="text-sm font-bold text-stone-600">{t('إجمالي حساب الموظفين: {x}', { x: SAR(empTotal) })}</div>
            </div>
          )}
        </div>

        {/* tips */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-extrabold text-brand-700">
            <Coins size={16} /> <input type="checkbox" checked={hasTips} onChange={(e) => setHasTips(e.target.checked)} /> {t('يوجد إكرامية')}
          </label>
          {hasTips && (
            <div className="space-y-3">
              <Field label={t('مبلغ الإكرامية الكلي (ر.س)')}>
                <Input type="number" min="0" value={tips} onChange={(e) => setTips(e.target.value)} />
              </Field>
              <div className="flex gap-4 text-sm font-bold text-stone-700">
                <label className="flex items-center gap-1.5"><input type="radio" checked={tipsMode === 'all'} onChange={() => setTipsMode('all')} /> {t('توزيع على الجميع بالتساوي')}</label>
                <label className="flex items-center gap-1.5"><input type="radio" checked={tipsMode === 'specific'} onChange={() => setTipsMode('specific')} /> {t('لموظفين محددين')}</label>
              </div>
              {tipsMode === 'specific' && (
                <div className="space-y-1.5">
                  {flat.map((e) => (
                    <label key={e.k} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${tipSel.has(e.k) ? 'border-brand-400 bg-brand-50' : 'border-stone-200'}`}>
                      <input type="checkbox" checked={tipSel.has(e.k)} onChange={() => toggleTip(e.k)} />
                      <span className="font-bold text-stone-700">{e.name || t('موظف مؤقت')}</span>
                      <span className="text-xs text-stone-400">({roleLabel(e.role)})</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="text-sm text-stone-500">
                {t('نصيب كل موظف: {x}', { x: SAR((Number(tips) || 0) / Math.max((tipsMode === 'all' ? flat.length : tipSel.size) || 1, 1)) })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-stone-100 pt-4">
        <button className="btn-soft" onClick={onClose}>{t('إلغاء')}</button>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? <Spinner className="h-5 w-5" /> : <><Check size={16} /> {t('حفظ وإنهاء')}</>}
        </button>
      </div>
    </Modal>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-extrabold text-brand-700">{title}</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}
