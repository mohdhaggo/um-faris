import 'package:flutter/material.dart';
import '../theme.dart';
import '../constants.dart';
import '../models.dart';
import '../firestore_service.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  AppSettings? _loaded;
  final _jobTypes = <String>[];
  final _newJob = TextEditingController();
  bool _limitEnabled = false;
  final _maxC = TextEditingController();
  final _overrides = <String, int>{};
  final _fields = <FieldDef>[];
  final _labelCtrls = <String, TextEditingController>{};
  final _optCtrls = <String, TextEditingController>{};
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    Db.settingsOnce().then((s) {
      setState(() {
        _loaded = s;
        _jobTypes.addAll(s.jobTypes);
        _limitEnabled = s.maxPerDay >= 0;
        _maxC.text = s.maxPerDay >= 0 ? s.maxPerDay.toString() : '';
        _overrides.addAll(s.dayOverrides);
        for (final f in s.fieldConfig) {
          _fields.add(f);
          _labelCtrls[f.key] = TextEditingController(text: f.label);
          _optCtrls[f.key] = TextEditingController(text: f.options.join('، '));
        }
      });
    });
  }

  void _moveField(int i, int dir) {
    final j = i + dir;
    if (j < 0 || j >= _fields.length) return;
    setState(() { final t = _fields[i]; _fields[i] = _fields[j]; _fields[j] = t; });
  }

  void _addField() {
    final key = 'custom_${DateTime.now().millisecondsSinceEpoch}';
    final f = FieldDef(key: key, label: 'خانة جديدة', type: 'text', system: false);
    setState(() {
      _fields.add(f);
      _labelCtrls[key] = TextEditingController(text: f.label);
      _optCtrls[key] = TextEditingController();
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final fc = _fields.map((f) {
      final label = _labelCtrls[f.key]!.text.trim();
      final opts = f.type == 'select'
          ? _optCtrls[f.key]!.text.split(RegExp(r'[،,\n]')).map((e) => e.trim()).where((e) => e.isNotEmpty).toList()
          : <String>[];
      return f.copyWith(label: label.isEmpty ? f.label : label, options: opts).toMap();
    }).toList();
    await Db.saveSettings({
      'jobTypes': _jobTypes,
      'maxPerDay': _limitEnabled ? (int.tryParse(_maxC.text.trim()) ?? 0) : -1,
      'dayOverrides': _overrides,
      'fieldConfig': fc,
    });
    if (mounted) {
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم حفظ الإعدادات')));
    }
  }

  Future<void> _addOverride() async {
    final d = await showDatePicker(context: context, initialDate: DateTime.now(), firstDate: DateTime(2020), lastDate: DateTime(2035));
    if (d == null || !mounted) return;
    final capC = TextEditingController();
    final cap = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('الحد الأقصى ليوم ${gregLabel(d)}'),
        content: TextField(controller: capC, textDirection: TextDirection.ltr, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'عدد الحجوزات (0 = لا تُقبل)')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, int.tryParse(capC.text.trim()) ?? 0), child: const Text('إضافة')),
        ],
      ),
    );
    if (cap != null) setState(() => _overrides[iso(d)] = cap);
  }

  @override
  Widget build(BuildContext context) {
    if (_loaded == null) {
      return const Scaffold(backgroundColor: AppColors.bg, body: Center(child: CircularProgressIndicator(color: AppColors.brand)));
    }
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                const Text('الإعدادات', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                const SizedBox(height: 16),

                _section('الوظائف', 'تصنيفات الموظفين — يمكن إضافة وظائف أخرى'),
                Wrap(spacing: 8, runSpacing: 6, children: [
                  for (final j in _jobTypes)
                    Chip(label: Text(j), onDeleted: () => setState(() => _jobTypes.remove(j))),
                ]),
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(child: TextField(controller: _newJob, decoration: const InputDecoration(labelText: 'اسم وظيفة جديدة', isDense: true))),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: () {
                      final v = _newJob.text.trim();
                      if (v.isNotEmpty && !_jobTypes.contains(v)) setState(() { _jobTypes.add(v); _newJob.clear(); });
                    },
                    child: const Text('إضافة'),
                  ),
                ]),
                const SizedBox(height: 20),

                _section('حدود الحجوزات', 'الحد الأقصى للحجوزات المؤكدة في اليوم — ما يزيد يذهب لقائمة الانتظار'),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('تفعيل حد أقصى يومي'),
                  subtitle: const Text('إن كان مغلقاً = بلا حد'),
                  value: _limitEnabled,
                  onChanged: (v) => setState(() => _limitEnabled = v),
                ),
                if (_limitEnabled)
                  TextField(controller: _maxC, textDirection: TextDirection.ltr, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'الحد الأقصى لكل يوم (0 = لا تُقبل حجوزات مؤكدة)')),
                const SizedBox(height: 12),
                Row(children: [
                  const Expanded(child: Text('تخصيص أيام معينة', style: TextStyle(fontWeight: FontWeight.bold))),
                  OutlinedButton.icon(onPressed: _addOverride, icon: const Icon(Icons.add, size: 18), label: const Text('إضافة يوم')),
                ]),
                for (final e in _overrides.entries)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(gregLabel(parseIso(e.key))),
                    subtitle: Text(hijriLabel(parseIso(e.key)), style: const TextStyle(color: AppColors.emerald, fontSize: 11)),
                    trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                      Text('الحد: ${e.value}', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.brand)),
                      IconButton(icon: const Icon(Icons.delete, color: Colors.red, size: 20), onPressed: () => setState(() => _overrides.remove(e.key))),
                    ]),
                  ),
                if (_overrides.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('لا توجد أيام مخصّصة', style: TextStyle(color: Colors.black45))),
                const SizedBox(height: 20),

                _section('خانات الطلب', 'خانات نموذج الحجز — الترتيب، الإلزامية، نوع الإدخال (رقم الجوال والاسم والتاريخ إلزامية دائماً)'),
                ..._fields.asMap().entries.map((e) => _fieldEditor(e.key, e.value)),
                const SizedBox(height: 8),
                OutlinedButton.icon(onPressed: _addField, icon: const Icon(Icons.add, size: 18), label: const Text('إضافة خانة')),

                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('حفظ الإعدادات'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _section(String t, String sub) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(t, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.brand, fontSize: 16)),
          Text(sub, style: const TextStyle(color: Colors.black54, fontSize: 12)),
        ]),
      );

  Widget _fieldEditor(int i, FieldDef f) => Card(
        margin: const EdgeInsets.only(bottom: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(children: [
            Row(children: [
              Column(children: [
                InkWell(onTap: () => _moveField(i, -1), child: const Icon(Icons.keyboard_arrow_up, size: 20)),
                InkWell(onTap: () => _moveField(i, 1), child: const Icon(Icons.keyboard_arrow_down, size: 20)),
              ]),
              const SizedBox(width: 6),
              Expanded(child: TextField(controller: _labelCtrls[f.key], decoration: const InputDecoration(labelText: 'اسم الخانة', isDense: true))),
              const SizedBox(width: 8),
              SizedBox(
                width: 110,
                child: DropdownButtonFormField<String>(
                  initialValue: f.type,
                  decoration: const InputDecoration(labelText: 'النوع', isDense: true),
                  items: const [
                    DropdownMenuItem(value: 'text', child: Text('نص')),
                    DropdownMenuItem(value: 'number', child: Text('أرقام')),
                    DropdownMenuItem(value: 'select', child: Text('خيارات')),
                  ],
                  onChanged: (v) => setState(() => _fields[i] = f.copyWith(type: v ?? 'text')),
                ),
              ),
            ]),
            const SizedBox(height: 6),
            Row(children: [
              FilterChip(label: const Text('مفعّلة'), selected: f.enabled, onSelected: (v) => setState(() => _fields[i] = f.copyWith(enabled: v))),
              const SizedBox(width: 8),
              FilterChip(label: const Text('إلزامية'), selected: f.required, onSelected: (v) => setState(() => _fields[i] = f.copyWith(required: v))),
              const Spacer(),
              if (!f.system)
                IconButton(icon: const Icon(Icons.delete, color: Colors.red, size: 20), onPressed: () => setState(() => _fields.removeAt(i)))
              else
                const Text('أساسية', style: TextStyle(color: Colors.black38, fontSize: 11)),
            ]),
            if (f.type == 'select')
              TextField(controller: _optCtrls[f.key], decoration: const InputDecoration(labelText: 'الخيارات (افصل بفاصلة)', isDense: true)),
          ]),
        ),
      );
}
