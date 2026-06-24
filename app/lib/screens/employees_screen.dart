import 'package:flutter/material.dart';
import '../theme.dart';
import '../constants.dart';
import '../models.dart';
import '../firestore_service.dart';

class EmployeesScreen extends StatelessWidget {
  const EmployeesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(children: [
                const Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('إدارة الموظفين', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                    Text('الموظفون المسجلون للعمل', style: TextStyle(color: Colors.black54)),
                  ]),
                ),
                FilledButton.icon(
                  onPressed: () => _edit(context, null),
                  icon: const Icon(Icons.add),
                  label: const Text('إضافة موظف'),
                ),
              ]),
              const SizedBox(height: 16),
              Expanded(
                child: StreamBuilder<List<EmployeeModel>>(
                  stream: Db.employeesStream(),
                  builder: (context, snap) {
                    if (snap.hasError) return Center(child: Text('تعذّر التحميل: ${snap.error}'));
                    if (!snap.hasData) return const Center(child: CircularProgressIndicator(color: AppColors.brand));
                    final items = snap.data!;
                    if (items.isEmpty) return const Center(child: Text('لا يوجد موظفون بعد', style: TextStyle(color: Colors.black45)));
                    return ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, i) {
                        final e = items[i];
                        return Card(
                          margin: EdgeInsets.zero,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            child: Row(children: [
                              CircleAvatar(
                                backgroundColor: e.active ? AppColors.brand : Colors.grey,
                                child: const Icon(Icons.badge, color: Colors.white, size: 20),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(e.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                                  if (e.phone.isNotEmpty)
                                    Text(e.phone, textDirection: TextDirection.ltr, style: const TextStyle(color: Colors.black54, fontSize: 12)),
                                  const SizedBox(height: 4),
                                  Wrap(spacing: 6, runSpacing: 4, children: [
                                    for (final j in e.jobTypes)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                        decoration: BoxDecoration(color: const Color(0xFFF4E9D2), borderRadius: BorderRadius.circular(20)),
                                        child: Text(j, style: const TextStyle(color: AppColors.brandDark, fontSize: 11, fontWeight: FontWeight.bold)),
                                      ),
                                  ]),
                                ]),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: e.active ? const Color(0xFFD1FAE5) : const Color(0xFFEEEEEE),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(e.active ? 'متاح' : 'متوقف',
                                    style: TextStyle(color: e.active ? const Color(0xFF047857) : Colors.black54, fontWeight: FontWeight.bold, fontSize: 12)),
                              ),
                              IconButton(icon: const Icon(Icons.edit, size: 20), onPressed: () => _edit(context, e)),
                              IconButton(icon: const Icon(Icons.delete, size: 20, color: Colors.red), onPressed: () => Db.deleteEmployee(e.id)),
                            ]),
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _edit(BuildContext context, EmployeeModel? e) {
    final name = TextEditingController(text: e?.name ?? '');
    final phone = TextEditingController(text: e?.phone ?? '');
    final wage = TextEditingController(text: e == null ? '' : (e.wage == 0 ? '' : e.wage.toString()));
    final selected = <String>{...?e?.jobTypes};
    bool active = e?.active ?? true;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setState) {
        return AlertDialog(
          title: Text(e == null ? 'إضافة موظف' : 'تعديل موظف'),
          content: SizedBox(
            width: 380,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                TextField(controller: name, decoration: const InputDecoration(labelText: 'اسم الموظف')),
                const SizedBox(height: 10),
                TextField(controller: phone, textDirection: TextDirection.ltr, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'رقم الجوال')),
                const SizedBox(height: 12),
                const Text('نوع الوظيفة (يمكن اختيار أكثر من واحدة)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                const SizedBox(height: 6),
                Wrap(spacing: 8, children: [
                  for (final j in defaultJobTypes)
                    FilterChip(
                      label: Text(j),
                      selected: selected.contains(j),
                      onSelected: (v) => setState(() => v ? selected.add(j) : selected.remove(j)),
                    ),
                ]),
                const SizedBox(height: 12),
                TextField(controller: wage, textDirection: TextDirection.ltr, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'أجر مبدئي اختياري (يُحدّد فعلياً عند الإنهاء)')),
                const SizedBox(height: 8),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('متاح للعمل'),
                  value: active,
                  onChanged: (v) => setState(() => active = v),
                ),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
            FilledButton(
              onPressed: () async {
                if (name.text.trim().isEmpty) return;
                final m = EmployeeModel(
                  id: e?.id ?? '',
                  name: name.text.trim(),
                  phone: phone.text.trim(),
                  jobTypes: selected.toList(),
                  active: active,
                  wage: num.tryParse(wage.text.trim()) ?? 0,
                );
                if (e == null) {
                  await Db.addEmployee(m);
                } else {
                  await Db.updateEmployee(e.id, m);
                }
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('حفظ'),
            ),
          ],
        );
      }),
    );
  }
}
