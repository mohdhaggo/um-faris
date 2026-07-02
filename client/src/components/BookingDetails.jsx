import { useEffect, useState } from 'react';
import {
  Pencil, Trash2, CalendarX, BadgePercent, Check, UserPlus, CheckCircle2, XCircle, AlertCircle, CircleDot, Coins,
} from 'lucide-react';
import { api } from '../api';
import { useSettings } from '../store/Settings';
import { SAR, fmtDate, fmtHijri, PAYMENT_STATUS, PAYMENT_COLORS, BOOKING_STATUS, staffStatus, STAFF_CLS, STAFF_LABEL } from '../constants';
import Modal from './Modal';
import BookingForm from './BookingForm';
import { Spinner, Input, Field, Select, SuccessToast } from './ui';

const roleLabel = (role) => ({ 'صبابة': 'الصبابات', 'عاملة': 'العاملات', 'سائق': 'السائق' }[role] || role);

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
    if (!confirm('تأكيد إلغاء الموعد؟')) return;
    refresh(await api.post(`/api/bookings/${b.id}/cancel`));
  };
  const remove = async () => {
    if (!confirm('حذف الحجز نهائياً؟')) return;
    await api.del(`/api/bookings/${b.id}`);
    onChanged?.();
    onClose();
  };

  const customLabels = Object.fromEntries((fieldConfig || []).map((f) => [f.key, f.label]));
  const customEntries = Object.entries(b.custom_fields || {}).filter(([, v]) => v !== '' && v != null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip ${b.status === 'active' ? 'bg-emerald-100 text-emerald-700' : b.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
          {BOOKING_STATUS[b.status] || b.status}
        </span>
        <button className="btn-soft" onClick={() => setEditing(true)}><Pencil size={16} /> تعديل</button>
        <button className="btn-soft" onClick={() => setDiscountOpen(true)}><BadgePercent size={16} /> إضافة خصم</button>
        <button className="btn-soft" onClick={cancel} disabled={b.status === 'cancelled'}>
          <CalendarX size={16} /> {b.status === 'cancelled' ? 'ملغي' : 'إلغاء الموعد'}
        </button>
        <button className="btn-danger" onClick={remove}><Trash2 size={16} /> حذف</button>
      </div>

      <Card title="بيانات العميل">
        <Row label="اسم العميل" value={b.client_name} />
        <Row label="رقم الجوال" value={b.client_phone || '—'} />
        <Row label="عدد الحجوزات السابقة" value={prevCount ?? '—'} />
      </Card>

      <Card title="بيانات الطلب">
        <Row label="تاريخ الحجز (ميلادي)" value={<span className="text-maroon-700">{fmtDate(b.booking_date)}</span>} />
        <Row label="تاريخ الحجز (هجري)" value={<span className="text-emerald-600">{fmtHijri(b.booking_date)}</span>} />
        <Row label="وقت المناسبة" value={b.event_time || '—'} />
        <Row label="نوع المناسبة" value={b.event_type || '—'} />
        <Row label="المدينة" value={b.city || '—'} />
        <Row label="نوع الموقع" value={b.location_type || '—'} />
        <Row label="عدد المعازيم" value={b.guests_count} />
        <Row label="المعاميل" value={`${b.material_type || ''} ${b.material_color || ''}`} />
        <Row label="عدد الصبابات" value={b.sabbabat_count} />
        <Row label="عدد العاملات" value={b.workers_count} />
        <Row label="الملابس" value={`${b.clothes_type || ''} ${b.clothes_color || ''}`} />
        {customEntries.map(([k, v]) => <Row key={k} label={customLabels[k] || k} value={String(v)} />)}
        <Row label="المبلغ" value={SAR(b.amount)} />
        {b.discount > 0 && <Row label="الخصم" value={SAR(b.discount)} />}
        <Row label="الإجمالي بعد الخصم" value={SAR(b.net_total)} />
        <Row label="حالة الدفع" value={<span className={`chip ${PAYMENT_COLORS[b.payment_status]}`}>{PAYMENT_STATUS[b.payment_status]}</span>} />
        {b.payment_status === 'deposit' && (
          <>
            <Row label="المدفوع" value={SAR(b.paid_amount)} />
            <Row label="المتبقي" value={<span className="font-bold text-red-600">{SAR(b.remaining)}</span>} />
          </>
        )}
        {b.extra_drinks?.length > 0 && (
          <div className="col-span-full">
            <div className="mb-1 text-xs font-bold text-stone-500">مشروبات إضافية</div>
            <div className="flex flex-wrap gap-2">
              {b.extra_drinks.map((d, i) => (
                <span key={i} className="chip bg-stone-100 text-stone-700">{d.name} ×{d.count} — {SAR(d.cost)}</span>
              ))}
            </div>
          </div>
        )}
        {b.notes && <div className="col-span-full text-sm text-stone-600"><b>ملاحظات:</b> {b.notes}</div>}
      </Card>

      {/* staff cards by configured job types */}
      <div className="grid gap-4 md:grid-cols-3">
        {(jobTypes || []).map((role) => (
          <StaffCard key={role} role={role} list={b.employees[role] || []} status={staffStatus(b, role)} onPick={() => setPicker(role)} />
        ))}
      </div>

      {/* finalize summary / button */}
      <div className={`card p-4 ${b.closed ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="flex items-center gap-2 text-sm font-extrabold text-stone-700">
            <CircleDot size={16} /> إنهاء الحجز وحساب الموظفين
            {b.closed && <span className="chip bg-emerald-100 text-emerald-700">منتهٍ</span>}
          </h4>
          <button className="btn-primary" onClick={() => setCloseOpen(true)}>
            <Check size={16} /> {b.closed ? 'تعديل الإنهاء' : 'إنهاء الحجز'}
          </button>
        </div>
        {b.closed && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Row label="حساب الموظفين" value={SAR(b.employee_cost)} />
            <Row label="الإكرامية" value={SAR(b.tips_amount)} />
            <Row label="إجمالي المدفوع (شامل الإكرامية)" value={SAR((b.paid_amount || 0) + (b.tips_amount || 0))} />
            <Row label="دخلي (الصافي)" value={<span className="font-extrabold text-emerald-600">{SAR((b.paid_amount || 0) - (b.employee_cost || 0))}</span>} />
          </div>
        )}
      </div>

      {editing && (
        <Modal open title="تعديل الحجز" size="lg" onClose={() => setEditing(false)}>
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
        <h4 className="text-sm font-extrabold text-brand-700">بيانات {roleLabel(role)}</h4>
        <span className={`chip ${STAFF_CLS[status]}`}><Icon size={13} /> {STAFF_LABEL[status]}</span>
      </div>
      {has ? (
        <div className="mb-2 space-y-1">
          {list.map((e) => (
            <div key={e.id} className="rounded-lg bg-stone-50 px-3 py-1.5 text-sm font-bold text-stone-700">{e.name}</div>
          ))}
        </div>
      ) : (
        <p className="mb-2 text-sm text-stone-400">لم يتم الاختيار بعد</p>
      )}
      <button className="btn-ghost w-full" onClick={onPick}><UserPlus size={16} /> {has ? 'تعديل الاختيار' : `اختر ${roleLabel(role)}`}</button>
    </div>
  );
}

function EmployeePicker({ role, booking, onClose, onSaved }) {
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(new Set((booking.employees[role] || []).map((e) => e.id)));
  const [saving, setSaving] = useState(false);

  // employees already assigned to OTHER roles in this same booking
  const otherRoleMap = {};
  for (const [r, arr] of Object.entries(booking.employees || {})) {
    if (r === role) continue;
    for (const e of arr) otherRoleMap[e.id] = r;
  }

  useEffect(() => {
    api.get('/api/employees', { role, date: booking.booking_date, exclude_booking: booking.id }).then(setList);
  }, []);

  const toggle = (id, disabled) => {
    if (disabled) return;
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const save = async () => {
    setSaving(true);
    const data = await api.put(`/api/bookings/${booking.id}/employees/${encodeURIComponent(role)}`, { employee_ids: [...sel] });
    setSaving(false);
    onSaved(data);
  };

  return (
    <Modal open title={`اختيار ${roleLabel(role)}`} size="sm" onClose={onClose}>
      {!list ? (
        <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-brand-500" /></div>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-stone-400">لا يوجد موظفون بهذا التصنيف. أضفهم من إدارة الموظفين.</p>
      ) : (
        <div className="space-y-2">
          {list.map((e) => {
            const isSelected = sel.has(e.id);
            const inOtherRole = otherRoleMap[e.id];
            const busyElsewhere = e.busy && !isSelected;
            const isDisabled = !!inOtherRole || busyElsewhere;
            return (
              <label key={e.id}
                onClick={() => toggle(e.id, isDisabled)}
                className={`flex items-start justify-between rounded-lg border px-3 py-2 ${
                  isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                } ${
                  isSelected ? 'border-brand-400 bg-brand-50'
                  : inOtherRole ? 'border-amber-300 bg-amber-50/60'
                  : busyElsewhere ? 'border-red-200 bg-red-50/50'
                  : 'border-stone-200'
                }`}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={isSelected} disabled={isDisabled} readOnly />
                  <div>
                    <span className="font-bold text-stone-800">{e.name}</span>
                    {e.phone && <span className="block text-xs text-stone-400">{e.phone}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {inOtherRole && (
                    <span className="chip bg-amber-100 text-amber-700">مختار كـ {inOtherRole} في هذا الطلب</span>
                  )}
                  {busyElsewhere && (e.busy_details || []).map((d, i) => (
                    <span key={i} className="chip bg-red-100 text-red-700">
                      محجوز لطلب: {d.client} كـ {d.role}
                    </span>
                  ))}
                </div>
              </label>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-soft" onClick={onClose}>إلغاء</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner className="h-5 w-5" /> : 'حفظ'}</button>
      </div>
    </Modal>
  );
}

function DiscountModal({ booking, onClose, onSaved }) {
  const [val, setVal] = useState(booking.discount || 0);
  const save = async () => onSaved(await api.put(`/api/bookings/${booking.id}`, { discount: Number(val) || 0 }));
  return (
    <Modal open title="إضافة / تعديل الخصم" size="sm" onClose={onClose}>
      <Field label="قيمة الخصم (ر.س)"><Input type="number" min="0" value={val} onChange={(e) => setVal(e.target.value)} autoFocus /></Field>
      <div className="mt-2 text-sm text-stone-500">الإجمالي الحالي: {SAR(booking.amount)} → بعد الخصم: {SAR((booking.amount || 0) - (Number(val) || 0))}</div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-soft" onClick={onClose}>إلغاء</button>
        <button className="btn-primary" onClick={save}>حفظ</button>
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
    <Modal open title="إنهاء الحجز وحساب المستحقات" size="md" onClose={onClose}>
      <div className="space-y-5">
        {/* payment */}
        <Section title="حالة الدفع">
          <Field label="الحالة">
            <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
              {Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          {paymentStatus !== 'unpaid' && (
            <Field label="المبلغ المدفوع (ر.س)">
              <Input type="number" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
            </Field>
          )}
          {paymentStatus === 'deposit' && (
            <div className="col-span-full text-sm font-bold text-red-600">المتبقي: {SAR((booking.net_total || 0) - (Number(paidAmount) || 0))}</div>
          )}
        </Section>

        {/* per-employee amounts */}
        <div>
          <h4 className="mb-2 text-sm font-extrabold text-brand-700">حساب الموظفين (مبلغ كل موظف على حدة)</h4>
          {flat.length === 0 ? (
            <p className="text-sm text-stone-400">لم يتم اختيار موظفين لهذا الحجز.</p>
          ) : (
            <div className="space-y-2">
              {flat.map((e) => (
                <div key={e.k} className="flex items-center gap-3">
                  <span className="w-40 truncate text-sm font-bold text-stone-700">{e.name} <span className="text-xs text-stone-400">({roleLabel(e.role)})</span></span>
                  <Input type="number" min="0" placeholder="المبلغ" value={amounts[e.k]} onChange={(ev) => setAmount(e.k, ev.target.value)} />
                </div>
              ))}
              <div className="text-sm font-bold text-stone-600">إجمالي حساب الموظفين: {SAR(empTotal)}</div>
            </div>
          )}
        </div>

        {/* tips */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-extrabold text-brand-700">
            <Coins size={16} /> <input type="checkbox" checked={hasTips} onChange={(e) => setHasTips(e.target.checked)} /> يوجد إكرامية
          </label>
          {hasTips && (
            <div className="space-y-3">
              <Field label="مبلغ الإكرامية الكلي (ر.س)">
                <Input type="number" min="0" value={tips} onChange={(e) => setTips(e.target.value)} />
              </Field>
              <div className="flex gap-4 text-sm font-bold text-stone-700">
                <label className="flex items-center gap-1.5"><input type="radio" checked={tipsMode === 'all'} onChange={() => setTipsMode('all')} /> توزيع على الجميع بالتساوي</label>
                <label className="flex items-center gap-1.5"><input type="radio" checked={tipsMode === 'specific'} onChange={() => setTipsMode('specific')} /> لموظفين محددين</label>
              </div>
              {tipsMode === 'specific' && (
                <div className="space-y-1.5">
                  {flat.map((e) => (
                    <label key={e.k} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${tipSel.has(e.k) ? 'border-brand-400 bg-brand-50' : 'border-stone-200'}`}>
                      <input type="checkbox" checked={tipSel.has(e.k)} onChange={() => toggleTip(e.k)} />
                      <span className="font-bold text-stone-700">{e.name}</span>
                      <span className="text-xs text-stone-400">({roleLabel(e.role)})</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="text-sm text-stone-500">
                نصيب كل موظف: {SAR((Number(tips) || 0) / Math.max((tipsMode === 'all' ? flat.length : tipSel.size) || 1, 1))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-stone-100 pt-4">
        <button className="btn-soft" onClick={onClose}>إلغاء</button>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? <Spinner className="h-5 w-5" /> : <><Check size={16} /> حفظ وإنهاء</>}
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
