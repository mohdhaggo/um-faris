import 'package:flutter/material.dart';
import '../theme.dart';
import '../models.dart';
import '../firestore_service.dart';

class ClientsScreen extends StatelessWidget {
  const ClientsScreen({super.key});

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
                    Text('إدارة العملاء', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                    Text('بيانات العملاء المسجلين', style: TextStyle(color: Colors.black54)),
                  ]),
                ),
                FilledButton.icon(
                  onPressed: () => _edit(context, null),
                  icon: const Icon(Icons.add),
                  label: const Text('إضافة عميل'),
                ),
              ]),
              const SizedBox(height: 16),
              Expanded(
                child: StreamBuilder<List<ClientModel>>(
                  stream: Db.clientsStream(),
                  builder: (context, snap) {
                    if (snap.hasError) return Center(child: Text('تعذّر التحميل: ${snap.error}'));
                    if (!snap.hasData) return const Center(child: CircularProgressIndicator(color: AppColors.brand));
                    final items = snap.data!;
                    if (items.isEmpty) return const Center(child: Text('لا يوجد عملاء بعد', style: TextStyle(color: Colors.black45)));
                    return ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, i) {
                        final c = items[i];
                        return Card(
                          margin: EdgeInsets.zero,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          child: ListTile(
                            leading: const CircleAvatar(backgroundColor: AppColors.brand, child: Icon(Icons.person, color: Colors.white)),
                            title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                            subtitle: Text(c.phone, textDirection: TextDirection.ltr),
                            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                              IconButton(icon: const Icon(Icons.edit, size: 20), onPressed: () => _edit(context, c)),
                              IconButton(icon: const Icon(Icons.delete, size: 20, color: Colors.red), onPressed: () => Db.deleteClient(c.id)),
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

  void _edit(BuildContext context, ClientModel? c) {
    final name = TextEditingController(text: c?.name ?? '');
    final phone = TextEditingController(text: c?.phone ?? '');
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(c == null ? 'إضافة عميل' : 'تعديل العميل'),
        content: SizedBox(
          width: 340,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'اسم العميل')),
            const SizedBox(height: 12),
            TextField(controller: phone, textDirection: TextDirection.ltr, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'رقم الجوال')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          FilledButton(
            onPressed: () async {
              if (name.text.trim().isEmpty) return;
              final m = ClientModel(id: c?.id ?? '', name: name.text.trim(), phone: phone.text.trim());
              if (c == null) {
                await Db.addClient(m);
              } else {
                await Db.updateClient(c.id, m);
              }
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('حفظ'),
          ),
        ],
      ),
    );
  }
}
