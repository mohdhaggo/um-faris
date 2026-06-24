import 'package:flutter/material.dart';
import '../theme.dart';
import '../constants.dart';
import '../models.dart';
import '../firestore_service.dart';

class ServicesScreen extends StatelessWidget {
  const ServicesScreen({super.key});

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
              Row(
                children: [
                  const Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('إدارة الخدمات', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                      Text('الخدمات والباقات والأسعار', style: TextStyle(color: Colors.black54)),
                    ]),
                  ),
                  FilledButton.icon(
                    onPressed: () => _edit(context, null),
                    icon: const Icon(Icons.add),
                    label: const Text('إضافة خدمة أو باقة'),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Expanded(
                child: StreamBuilder<List<ServiceItem>>(
                  stream: Db.servicesStream(),
                  builder: (context, snap) {
                    if (snap.hasError) {
                      return Center(child: Text('تعذّر تحميل البيانات: ${snap.error}'));
                    }
                    if (!snap.hasData) {
                      return const Center(child: CircularProgressIndicator(color: AppColors.brand));
                    }
                    final items = snap.data!;
                    if (items.isEmpty) {
                      return const Center(child: Text('لا توجد خدمات بعد', style: TextStyle(color: Colors.black45)));
                    }
                    return ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, i) {
                        final s = items[i];
                        return Card(
                          margin: EdgeInsets.zero,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          child: ListTile(
                            leading: Icon(s.kind == 'package' ? Icons.inventory_2 : Icons.coffee, color: AppColors.brand),
                            title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                            subtitle: s.description.isEmpty ? null : Text(s.description),
                            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                              Text(sar(s.price), style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.brand)),
                              IconButton(icon: const Icon(Icons.edit, size: 20), onPressed: () => _edit(context, s)),
                              IconButton(icon: const Icon(Icons.delete, size: 20, color: Colors.red), onPressed: () => Db.deleteService(s.id)),
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

  void _edit(BuildContext context, ServiceItem? item) {
    final nameC = TextEditingController(text: item?.name ?? '');
    final priceC = TextEditingController(text: item == null ? '' : item.price.toString());
    final descC = TextEditingController(text: item?.description ?? '');
    String kind = item?.kind ?? 'service';

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: Text(item == null ? 'إضافة خدمة / باقة' : 'تعديل'),
          content: SizedBox(
            width: 360,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: nameC, decoration: const InputDecoration(labelText: 'الاسم')),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: kind,
                decoration: const InputDecoration(labelText: 'النوع'),
                items: const [
                  DropdownMenuItem(value: 'service', child: Text('خدمة')),
                  DropdownMenuItem(value: 'package', child: Text('باقة')),
                ],
                onChanged: (v) => setState(() => kind = v ?? 'service'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: priceC,
                keyboardType: TextInputType.number,
                textDirection: TextDirection.ltr,
                decoration: const InputDecoration(labelText: 'السعر (ر.س)'),
              ),
              const SizedBox(height: 12),
              TextField(controller: descC, decoration: const InputDecoration(labelText: 'الوصف'), maxLines: 2),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
            FilledButton(
              onPressed: () async {
                final s = ServiceItem(
                  id: item?.id ?? '',
                  name: nameC.text.trim(),
                  kind: kind,
                  price: num.tryParse(priceC.text.trim()) ?? 0,
                  description: descC.text.trim(),
                );
                if (s.name.isEmpty) return;
                if (item == null) {
                  await Db.addService(s);
                } else {
                  await Db.updateService(item.id, s);
                }
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('حفظ'),
            ),
          ],
        ),
      ),
    );
  }
}
