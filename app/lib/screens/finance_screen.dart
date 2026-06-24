import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../theme.dart';
import '../constants.dart';
import '../models.dart';
import '../firestore_service.dart';

class FinanceScreen extends StatelessWidget {
  const FinanceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: StreamBuilder<List<BookingModel>>(
          stream: Db.allBookings(),
          builder: (context, snap) {
            if (snap.hasError) return Center(child: Text('تعذّر التحميل: ${snap.error}'));
            if (!snap.hasData) return const Center(child: CircularProgressIndicator(color: AppColors.brand));
            final active = snap.data!.where((b) => b.status == 'active').toList();

            num revenue = 0, collected = 0, empCost = 0, tips = 0, profit = 0;
            final byMonthProfit = <String, num>{};
            final byMonthIncome = <String, num>{};
            for (final b in active) {
              final ec = b.staff.fold<num>(0, (s, m) => s + m.paidAmount);
              final p = b.paidAmount - ec; // tip is pass-through, neutral
              revenue += b.netTotal;
              collected += b.paidAmount + b.tipsAmount;
              empCost += ec;
              tips += b.tipsAmount;
              profit += p;
              final mk = b.date.length >= 7 ? b.date.substring(0, 7) : b.date;
              byMonthProfit[mk] = (byMonthProfit[mk] ?? 0) + p;
              byMonthIncome[mk] = (byMonthIncome[mk] ?? 0) + b.paidAmount;
            }
            final months = (byMonthProfit.keys.toList()..sort());

            return ListView(
              padding: const EdgeInsets.all(20),
              children: [
                const Text('إدارة المالية', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                const Text('الأرباح والمدخول', style: TextStyle(color: Colors.black54)),
                const SizedBox(height: 16),
                Wrap(spacing: 12, runSpacing: 12, children: [
                  _stat('صافي الربح', sar(profit), AppColors.emerald, Icons.trending_up),
                  _stat('إجمالي المدخول', sar(revenue), AppColors.brand, Icons.account_balance_wallet),
                  _stat('المحصّل', sar(collected), AppColors.maroon, Icons.payments),
                  _stat('حساب الموظفين', sar(empCost), Colors.blueGrey, Icons.groups),
                  _stat('الإكراميات', sar(tips), Colors.orange, Icons.volunteer_activism),
                ]),
                const SizedBox(height: 20),
                _chartCard('صافي الربح الشهري', months.isEmpty
                    ? const _EmptyChart()
                    : _BarChart(months: months, values: months.map((m) => byMonthProfit[m] ?? 0).toList())),
                const SizedBox(height: 16),
                _chartCard('المدخول الشهري (المحصّل)', months.isEmpty
                    ? const _EmptyChart()
                    : _BarChart(months: months, values: months.map((m) => byMonthIncome[m] ?? 0).toList(), color: AppColors.brand)),
                const SizedBox(height: 16),
                _ordersCard(active),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _stat(String label, String value, Color color, IconData icon) => Container(
        width: 220,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE7E3DC))),
        child: Row(children: [
          CircleAvatar(backgroundColor: color.withValues(alpha: 0.12), child: Icon(icon, color: color, size: 20)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(color: Colors.black54, fontSize: 12, fontWeight: FontWeight.bold)),
              Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color)),
            ]),
          ),
        ]),
      );

  Widget _chartCard(String title, Widget child) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE7E3DC))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.brandDark)),
          const SizedBox(height: 12),
          SizedBox(height: 220, child: child),
        ]),
      );

  Widget _ordersCard(List<BookingModel> bookings) {
    final sorted = [...bookings]..sort((a, b) => b.date.compareTo(a.date));
    return Container(
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE7E3DC))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Padding(padding: EdgeInsets.all(16), child: Text('الطلبات وحالة الدفع', style: TextStyle(fontWeight: FontWeight.w800))),
        for (final b in sorted.take(50))
          ListTile(
            dense: true,
            title: Text(b.clientName, style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Text('${gregLabel(parseIso(b.date))} · ${sar(b.netTotal)}'),
            trailing: Text(paymentStatusLabels[b.paymentStatus] ?? '',
                style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: b.paymentStatus == 'paid' ? AppColors.emerald : b.paymentStatus == 'deposit' ? Colors.orange : Colors.red)),
          ),
        if (sorted.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('لا توجد طلبات', style: TextStyle(color: Colors.black45))),
      ]),
    );
  }
}

class _EmptyChart extends StatelessWidget {
  const _EmptyChart();
  @override
  Widget build(BuildContext context) => const Center(child: Text('لا توجد بيانات بعد', style: TextStyle(color: Colors.black45)));
}

class _BarChart extends StatelessWidget {
  final List<String> months;
  final List<num> values;
  final Color color;
  const _BarChart({required this.months, required this.values, this.color = AppColors.emerald});

  @override
  Widget build(BuildContext context) {
    final maxV = values.fold<num>(0, (m, v) => v > m ? v : m);
    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceAround,
        maxY: (maxV == 0 ? 1 : maxV * 1.2).toDouble(),
        borderData: FlBorderData(show: false),
        gridData: const FlGridData(show: true, drawVerticalLine: false),
        titlesData: FlTitlesData(
          leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 44)),
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (v, meta) {
                final i = v.toInt();
                if (i < 0 || i >= months.length) return const SizedBox.shrink();
                return Padding(padding: const EdgeInsets.only(top: 6), child: Text(months[i].substring(5), style: const TextStyle(fontSize: 10)));
              },
            ),
          ),
        ),
        barGroups: [
          for (int i = 0; i < values.length; i++)
            BarChartGroupData(x: i, barRods: [
              BarChartRodData(toY: values[i].toDouble(), color: color, width: 18, borderRadius: BorderRadius.circular(4)),
            ]),
        ],
      ),
    );
  }
}
