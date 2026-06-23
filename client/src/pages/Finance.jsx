import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { TrendingUp, Wallet, Coins, Users } from 'lucide-react';
import { api } from '../api';
import { PageHeader, Spinner, Stat, Empty, Field, Select } from '../components/ui';
import DatePicker from '../components/DatePicker';
import { SAR, fmtDate, PAYMENT_STATUS, PAYMENT_COLORS } from '../constants';

export default function Finance() {
  const [filters, setFilters] = useState({ from: '', to: '', payment_status: '', tips: '', group: 'month' });
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const set = (k) => (e) => setFilters((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    api.get('/api/finance/summary', filters).then(setSummary);
    api.get('/api/bookings', { from: filters.from, to: filters.to, payment_status: filters.payment_status, tips: filters.tips }).then(setOrders);
  }, [filters]);

  const chartData = useMemo(
    () => (summary?.series || []).map((s) => ({ ...s, label: filters.group === 'month' ? s.period : s.period?.slice(5) })),
    [summary, filters.group]
  );

  if (!summary) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-500" /></div>;
  const t = summary.totals;

  return (
    <div>
      <PageHeader title="إدارة المالية" subtitle="الأرباح والمدخول وحالة الدفع" />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="صافي الربح" value={SAR(t.net_profit)} color="text-emerald-600" icon={<TrendingUp size={20} />} />
        <Stat label="إجمالي المدخول" value={SAR(t.revenue)} icon={<Wallet size={20} />} />
        <Stat label="حساب الموظفين" value={SAR(t.employee_cost)} color="text-stone-600" icon={<Users size={20} />} />
        <Stat label="الإكراميات" value={SAR(t.tips)} color="text-amber-600" icon={<Coins size={20} />} />
      </div>

      {/* filters */}
      <div className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="من تاريخ"><DatePicker value={filters.from} clearable label="الكل" onChange={(iso) => setFilters((s) => ({ ...s, from: iso }))} /></Field>
        <Field label="إلى تاريخ"><DatePicker value={filters.to} clearable label="الكل" onChange={(iso) => setFilters((s) => ({ ...s, to: iso }))} /></Field>
        <Field label="حالة الدفع">
          <Select value={filters.payment_status} onChange={set('payment_status')}>
            <option value="">الكل</option>
            {Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="الإكراميات">
          <Select value={filters.tips} onChange={set('tips')}>
            <option value="">الكل</option>
            <option value="1">فيها إكراميات</option>
          </Select>
        </Field>
        <Field label="التجميع">
          <Select value={filters.group} onChange={set('group')}>
            <option value="month">شهري</option>
            <option value="day">يومي</option>
          </Select>
        </Field>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <ChartCard title="صافي الربح بعد حساب الموظفين">
          {chartData.length === 0 ? <Empty>لا توجد بيانات</Empty> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={40} />
                <Tooltip formatter={(v) => SAR(v)} />
                <Bar dataKey="profit" name="صافي الربح" fill="#a3672c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={filters.group === 'month' ? 'المدخول الشهري' : 'المدخول اليومي'}>
          {chartData.length === 0 ? <Empty>لا توجد بيانات</Empty> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={40} />
                <Tooltip formatter={(v) => SAR(v)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="المدخول" stroke="#bd8035" strokeWidth={2} />
                <Line type="monotone" dataKey="collected" name="المحصّل" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* orders */}
      <div className="card overflow-hidden">
        <div className="border-b border-stone-100 px-4 py-3 font-extrabold text-stone-700">الطلبات وحالة الدفع</div>
        {orders.length === 0 ? <Empty>لا توجد طلبات</Empty> : (
          <table className="w-full text-right text-sm">
            <thead className="bg-stone-50 text-xs font-bold text-stone-500">
              <tr>
                <th className="px-4 py-3">التاريخ</th>
                <th className="px-4 py-3">العميل</th>
                <th className="px-4 py-3">المبلغ</th>
                <th className="px-4 py-3">المدفوع</th>
                <th className="px-4 py-3">المتبقي</th>
                <th className="px-4 py-3">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {orders.map((b) => (
                <tr key={b.id} className="hover:bg-stone-50/60">
                  <td className="px-4 py-3 text-stone-600">{fmtDate(b.booking_date)}</td>
                  <td className="px-4 py-3 font-bold text-stone-800">{b.client_name}</td>
                  <td className="px-4 py-3 font-bold">{SAR(b.net_total)}</td>
                  <td className="px-4 py-3 text-emerald-600">{SAR(b.paid_amount)}</td>
                  <td className="px-4 py-3 text-red-600">{SAR(b.remaining)}</td>
                  <td className="px-4 py-3"><span className={`chip ${PAYMENT_COLORS[b.payment_status]}`}>{PAYMENT_STATUS[b.payment_status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="card p-4">
      <h3 className="mb-3 font-extrabold text-stone-700">{title}</h3>
      {children}
    </div>
  );
}
