import { useEffect, useState } from 'react';
import { Plus, Trash2, UserCheck, UserPlus } from 'lucide-react';
import { Field, Input, Select, Spinner } from './ui';
import DatePicker from './DatePicker';
import { PAYMENT_STATUS } from '../constants';
import { useSettings } from '../store/Settings';
import { api } from '../api';

const base = {
  client_name: '', client_phone: '', booking_date: '',
  event_time: '', event_type: '', city: '', location_type: '',
  guests_count: '', material_type: '', material_color: '',
  sabbabat_count: '', workers_count: '', clothes_type: '', clothes_color: '', notes: '',
  amount: '', discount: 0, payment_status: 'unpaid', paid_amount: 0,
  extra_drinks: [], custom_fields: {},
};

export default function BookingForm({ initial, onSaved, onCancel }) {
  const { fieldConfig } = useSettings();
  const fields = (fieldConfig || []).filter((x) => x.enabled);

  const [f, setF] = useState({
    ...base,
    ...(initial || {}),
    custom_fields: { ...(initial?.custom_fields || {}) },
  });
  const [clientStatus, setClientStatus] = useState(initial?.id ? { found: true } : null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setCustom = (k) => (e) =>
    setF((s) => ({ ...s, custom_fields: { ...s.custom_fields, [k]: e.target.value } }));

  // auto-detect existing client by phone (#1)
  useEffect(() => {
    const phone = (f.client_phone || '').trim();
    if (!phone) { setClientStatus(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api.get('/api/clients/lookup', { phone });
        if (r.found) {
          setClientStatus({ found: true, count: r.client.bookings_count });
          setF((s) => ({ ...s, client_name: s.client_name || r.client.name }));
        } else {
          setClientStatus({ found: false });
        }
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [f.client_phone]);

  // extra drinks
  const hasDrinks = f.extra_drinks.length > 0;
  const toggleDrinks = (on) => setF((s) => ({ ...s, extra_drinks: on ? [{ name: '', count: 1, cost: 0 }] : [] }));
  const setDrink = (i, k, v) => setF((s) => ({ ...s, extra_drinks: s.extra_drinks.map((d, idx) => (idx === i ? { ...d, [k]: v } : d)) }));
  const addDrink = () => setF((s) => ({ ...s, extra_drinks: [...s.extra_drinks, { name: '', count: 1, cost: 0 }] }));
  const rmDrink = (i) => setF((s) => ({ ...s, extra_drinks: s.extra_drinks.filter((_, idx) => idx !== i) }));

  const renderField = (field) => {
    const val = field.system ? f[field.key] ?? '' : f.custom_fields[field.key] ?? '';
    const onCh = field.system ? set(field.key) : setCustom(field.key);
    const label = field.label + (field.required ? ' *' : '');
    let control;
    if (field.type === 'select') {
      control = (
        <Select value={val} onChange={onCh} required={field.required}>
          <option value="">اختر…</option>
          {(field.options || []).map((o) => <option key={o}>{o}</option>)}
        </Select>
      );
    } else if (field.type === 'number') {
      control = <Input type="number" min="0" value={val} onChange={onCh} required={field.required} />;
    } else if (field.type === 'time') {
      control = <Input type="time" value={val} onChange={onCh} required={field.required} />;
    } else {
      control = <Input type="text" value={val} onChange={onCh} required={field.required} />;
    }
    return <Field key={field.key} label={label}>{control}</Field>;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!f.booking_date) { setErr('يرجى اختيار تاريخ الحجز'); return; }
    setErr('');
    setSaving(true);
    const payload = {
      client_name: f.client_name,
      client_phone: f.client_phone,
      booking_date: f.booking_date,
      amount: Number(f.amount) || 0,
      discount: Number(f.discount) || 0,
      payment_status: f.payment_status,
      paid_amount: Number(f.paid_amount) || 0,
      extra_drinks: f.extra_drinks
        .filter((d) => d.name)
        .map((d) => ({ name: d.name, count: Number(d.count) || 0, cost: Number(d.cost) || 0 })),
      custom_fields: {},
    };
    for (const field of fields) {
      const raw = field.system ? f[field.key] : f.custom_fields[field.key];
      const value = field.type === 'number' ? (Number(raw) || 0) : (raw ?? '');
      if (field.system) payload[field.key] = value;
      else payload.custom_fields[field.key] = value;
    }
    try {
      const saved = initial?.id
        ? await api.put(`/api/bookings/${initial.id}`, payload)
        : await api.post('/api/bookings', payload);
      onSaved(saved);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{err}</div>}

      <Section title="بيانات العميل">
        <Field label="رقم الجوال *">
          <Input type="tel" value={f.client_phone} onChange={set('client_phone')} required autoFocus placeholder="أدخل رقم الجوال أولاً" />
        </Field>
        <div>
          <span className="label">اسم العميل *</span>
          <Input value={f.client_name} onChange={set('client_name')} required />
          {clientStatus && !initial?.id && (
            clientStatus.found ? (
              <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                <UserCheck size={14} /> عميل مسجّل مسبقاً{clientStatus.count != null ? ` · ${clientStatus.count} حجوزات سابقة` : ''}
              </span>
            ) : (
              <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-sky-600">
                <UserPlus size={14} /> عميل جديد — أدخل الاسم
              </span>
            )
          )}
        </div>
      </Section>

      <Section title="بيانات الطلب">
        <Field label="تاريخ الحجز *">
          <DatePicker value={f.booking_date} onChange={(iso) => setF((s) => ({ ...s, booking_date: iso }))} />
        </Field>
        {fields.map(renderField)}
      </Section>

      <div>
        <div className="mb-2 flex items-center gap-3">
          <span className="text-sm font-extrabold text-stone-700">مشروبات إضافية</span>
          <label className="flex items-center gap-1.5 text-sm text-stone-600">
            <input type="checkbox" checked={hasDrinks} onChange={(e) => toggleDrinks(e.target.checked)} /> يوجد
          </label>
        </div>
        {hasDrinks && (
          <div className="space-y-2">
            {f.extra_drinks.map((d, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <input className="input col-span-5" placeholder="نوع المشروب" value={d.name} onChange={(e) => setDrink(i, 'name', e.target.value)} />
                <input className="input col-span-3" type="number" min="0" placeholder="العدد" value={d.count} onChange={(e) => setDrink(i, 'count', e.target.value)} />
                <input className="input col-span-3" type="number" min="0" placeholder="التكلفة" value={d.cost} onChange={(e) => setDrink(i, 'cost', e.target.value)} />
                <button type="button" onClick={() => rmDrink(i)} className="col-span-1 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50">
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            <button type="button" onClick={addDrink} className="btn-ghost"><Plus size={16} /> إضافة مشروب</button>
          </div>
        )}
      </div>

      <Section title="المبلغ والدفع">
        <Field label="المبلغ (ر.س)"><Input type="number" min="0" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="خصم (ر.س)"><Input type="number" min="0" value={f.discount} onChange={set('discount')} /></Field>
        <Field label="حالة الدفع">
          <Select value={f.payment_status} onChange={set('payment_status')}>
            {Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        {f.payment_status !== 'unpaid' && (
          <Field label="المبلغ المدفوع (ر.س)"><Input type="number" min="0" value={f.paid_amount} onChange={set('paid_amount')} /></Field>
        )}
      </Section>

      <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
        <button type="button" className="btn-soft" onClick={onCancel}>إلغاء</button>
        <button className="btn-primary" disabled={saving}>{saving ? <Spinner className="h-5 w-5" /> : 'حفظ'}</button>
      </div>
    </form>
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
