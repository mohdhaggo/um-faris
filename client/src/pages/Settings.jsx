import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, CalendarPlus, Briefcase, ListChecks, SlidersHorizontal, ChevronUp, ChevronDown } from 'lucide-react';
import { api } from '../api';
import { useSettings } from '../store/Settings';
import { PageHeader, Spinner, Field, Input, Select, SuccessToast, Empty } from '../components/ui';
import DatePicker from '../components/DatePicker';
import { fmtDate, fmtHijri } from '../constants';

export default function SettingsPage() {
  const { raw, reload } = useSettings();
  const [toast, setToast] = useState(false);
  const done = () => { reload(); setToast(true); };

  if (!raw) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-500" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="الإعدادات" subtitle="إعدادات الحجوزات والوظائف وخانات الطلب" />
      <BookingSettings onSaved={done} />
      <JobSettings onSaved={done} />
      <FieldSettings onSaved={done} />
      <SuccessToast open={toast} onClose={() => setToast(false)} />
    </div>
  );
}

function CardBox({ title, icon, desc, children }) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-lg bg-brand-50 p-2 text-brand-600">{icon}</span>
        <div>
          <h3 className="font-extrabold text-stone-800">{title}</h3>
          {desc && <p className="text-xs text-stone-500">{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ---------- booking settings: global max + per-day overrides (#7) ---------- */
function BookingSettings({ onSaved }) {
  const { raw, dayOverrides } = useSettings();
  const [max, setMax] = useState('');
  const [rows, setRows] = useState([]);
  const [nd, setNd] = useState('');
  const [nm, setNm] = useState('');

  useEffect(() => { setMax(raw?.max_bookings_per_day ?? ''); }, [raw]);
  useEffect(() => { setRows(Object.entries(dayOverrides || {}).map(([date, m]) => ({ date, max: m }))); }, [dayOverrides]);

  const addRow = () => {
    if (!nd || nm === '') return;
    setRows((r) => [...r.filter((x) => x.date !== nd), { date: nd, max: nm }]);
    setNd(''); setNm('');
  };
  const rmRow = (date) => setRows((r) => r.filter((x) => x.date !== date));

  const save = async () => {
    const obj = {};
    for (const r of rows) if (r.date && r.max !== '') obj[r.date] = Number(r.max);
    await api.put('/api/settings', { max_bookings_per_day: max === '' ? '' : (Number(max) || 0), day_overrides: obj });
    onSaved();
  };

  return (
    <CardBox title="إعدادات الحجوزات" icon={<SlidersHorizontal size={18} />} desc="الحد الأقصى للحجوزات المؤكدة يومياً وتخصيص أيام معينة (ما يزيد عن الحد يذهب لقائمة الانتظار)">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الحد الأقصى للحجوزات المؤكدة لكل يوم (0 = لا تُقبل حجوزات، اتركه فارغاً = بلا حد)">
          <Input type="number" min="0" value={max} onChange={(e) => setMax(e.target.value)} />
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-sm font-extrabold text-stone-700">تخصيص أيام معينة</div>
        <p className="mb-3 text-xs text-stone-500">مثال: حد عام ٨ حجوزات، لكن يوم العيد ٤ فقط أو يوم آخر ١٢. حدّد التاريخ والعدد.</p>

        <div className="mb-3 space-y-2">
          {rows.length === 0 && <Empty>لا توجد أيام مخصّصة</Empty>}
          {rows.map((r) => (
            <div key={r.date} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2">
              <div>
                <span className="font-bold text-stone-800">{fmtDate(r.date)}</span>
                <span className="me-2 text-xs text-emerald-600"> · {fmtHijri(r.date)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="chip bg-brand-100 text-brand-700">الحد: {r.max}</span>
                <button className="text-red-500 hover:text-red-700" onClick={() => rmRow(r.date)}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-12 items-end gap-2">
          <div className="col-span-6"><Field label="التاريخ"><DatePicker value={nd} onChange={setNd} /></Field></div>
          <div className="col-span-4"><Field label="الحد الأقصى"><Input type="number" min="0" value={nm} onChange={(e) => setNm(e.target.value)} /></Field></div>
          <button type="button" className="btn-ghost col-span-2" onClick={addRow}><CalendarPlus size={16} /> إضافة</button>
        </div>
      </div>

      <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={save}><Save size={16} /> حفظ</button></div>
    </CardBox>
  );
}

/* ---------- job types (#6) ---------- */
function JobSettings({ onSaved }) {
  const { jobTypes } = useSettings();
  const [list, setList] = useState([]);
  const [nv, setNv] = useState('');
  useEffect(() => { setList(jobTypes || []); }, [jobTypes]);

  const add = () => { const v = nv.trim(); if (v && !list.includes(v)) { setList((l) => [...l, v]); setNv(''); } };
  const rm = (v) => setList((l) => l.filter((x) => x !== v));
  const save = async () => { await api.put('/api/settings', { job_types: list }); onSaved(); };

  return (
    <CardBox title="إعدادات الوظائف" icon={<Briefcase size={18} />} desc="تصنيفات الموظفين (صبابة، عاملة، سائق...) — يمكن إضافة وظائف أخرى">
      <div className="mb-3 flex flex-wrap gap-2">
        {list.map((j) => (
          <span key={j} className="chip border border-brand-200 bg-brand-50 text-brand-700">
            {j}
            <button className="text-red-400 hover:text-red-600" onClick={() => rm(j)}><Trash2 size={13} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="اسم وظيفة جديدة" value={nv} onChange={(e) => setNv(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
        <button type="button" className="btn-ghost whitespace-nowrap" onClick={add}><Plus size={16} /> إضافة</button>
      </div>
      <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={save}><Save size={16} /> حفظ</button></div>
    </CardBox>
  );
}

/* ---------- order field builder (#6) ---------- */
const TYPE_LABELS = { text: 'نص', number: 'أرقام', select: 'خيارات', time: 'وقت' };

function FieldSettings({ onSaved }) {
  const { fieldConfig } = useSettings();
  const [fields, setFields] = useState([]);
  useEffect(() => {
    setFields((fieldConfig || []).map((f) => ({ ...f, optionsText: (f.options || []).join('، ') })));
  }, [fieldConfig]);

  const upd = (i, k, v) => setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, [k]: v } : f)));
  const rm = (i) => setFields((fs) => fs.filter((_, idx) => idx !== i));
  const move = (i, dir) => setFields((fs) => {
    const j = i + dir;
    if (j < 0 || j >= fs.length) return fs;
    const next = [...fs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const add = () => {
    const key = 'custom_' + Date.now();
    setFields((fs) => [...fs, { key, label: 'خانة جديدة', type: 'text', required: false, enabled: true, system: false, optionsText: '' }]);
  };

  const save = async () => {
    const out = fields.map((f) => {
      const { optionsText, ...rest } = f;
      if (f.type === 'select') rest.options = (optionsText || '').split(/[،,\n]/).map((s) => s.trim()).filter(Boolean);
      else delete rest.options;
      return rest;
    });
    await api.put('/api/settings', { field_config: out });
    onSaved();
  };

  return (
    <CardBox title="إعدادات خانات الطلب" icon={<ListChecks size={18} />} desc="تحكّم في خانات نموذج الحجز: الترتيب، الإضافة/الحذف، الإلزامية، ونوع الإدخال. (رقم الجوال والاسم وتاريخ الحجز إلزامية دائماً ولا تظهر هنا)">
      <div className="space-y-3">
        {fields.map((f, i) => (
          <div key={f.key} className="rounded-xl border border-stone-200 p-3">
            <div className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-12 sm:col-span-1 flex items-center gap-1 pb-1">
                <button type="button" className="rounded p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} title="تحريك لأعلى"><ChevronUp size={16} /></button>
                <button type="button" className="rounded p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30" disabled={i === fields.length - 1} onClick={() => move(i, 1)} title="تحريك لأسفل"><ChevronDown size={16} /></button>
              </div>
              <div className="col-span-12 sm:col-span-3">
                <Field label="اسم الخانة"><Input value={f.label} onChange={(e) => upd(i, 'label', e.target.value)} /></Field>
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Field label="نوع الإدخال">
                  <Select value={f.type} onChange={(e) => upd(i, 'type', e.target.value)}>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
              </div>
              <label className="col-span-3 sm:col-span-2 flex items-center gap-1.5 pb-2 text-sm font-bold text-stone-600">
                <input type="checkbox" checked={f.enabled} onChange={(e) => upd(i, 'enabled', e.target.checked)} /> مفعّلة
              </label>
              <label className="col-span-3 sm:col-span-2 flex items-center gap-1.5 pb-2 text-sm font-bold text-stone-600">
                <input type="checkbox" checked={f.required} onChange={(e) => upd(i, 'required', e.target.checked)} /> إلزامية
              </label>
              <div className="col-span-12 sm:col-span-1 flex pb-1">
                <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={() => rm(i)} title="حذف"><Trash2 size={16} /></button>
              </div>
              {f.type === 'select' && (
                <div className="col-span-12">
                  <Field label="الخيارات (افصل بينها بفاصلة)">
                    <Input value={f.optionsText} onChange={(e) => upd(i, 'optionsText', e.target.value)} placeholder="خيار ١، خيار ٢، خيار ٣" />
                  </Field>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <button type="button" className="btn-ghost" onClick={add}><Plus size={16} /> إضافة خانة</button>
        <button className="btn-primary" onClick={save}><Save size={16} /> حفظ</button>
      </div>
    </CardBox>
  );
}
