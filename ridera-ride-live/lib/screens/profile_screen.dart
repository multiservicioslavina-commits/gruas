import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../theme.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _auth = AuthService();
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _editing = false;
  bool _busy = false;
  String? _error;

  final _nombre    = TextEditingController();
  final _apellido  = TextEditingController();
  final _telefono  = TextEditingController();
  final _tipoMoto  = TextEditingController();
  final _marca     = TextEditingController();
  final _modelo    = TextEditingController();
  final _cc        = TextEditingController();
  final _placa     = TextEditingController();
  DateTime? _soatVence;
  DateTime? _tecnoVence;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final d = await _auth.getProfile();
    if (d != null) {
      _nombre.text   = d['nombre']    ?? '';
      _apellido.text = d['apellido']  ?? '';
      _telefono.text = d['telefono']  ?? '';
      _tipoMoto.text = d['tipo_moto'] ?? '';
      _marca.text    = d['moto_marca'] ?? '';
      _modelo.text   = d['moto_modelo'] ?? '';
      _cc.text       = (d['moto_cc'] ?? '').toString();
      _placa.text    = d['placa'] ?? '';
      _soatVence     = d['soat_vence'] != null ? DateTime.tryParse(d['soat_vence']) : null;
      _tecnoVence    = d['tecno_vence'] != null ? DateTime.tryParse(d['tecno_vence']) : null;
    }
    if (mounted) setState(() { _data = d; _loading = false; });
  }

  Future<void> _save() async {
    setState(() { _busy = true; _error = null; });
    try {
      await _auth.updateProfile({
        'nombre':      _nombre.text.trim(),
        'apellido':    _apellido.text.trim(),
        'telefono':    _telefono.text.trim(),
        'tipo_moto':   _tipoMoto.text.trim(),
        'moto_marca':  _marca.text.trim(),
        'moto_modelo': _modelo.text.trim(),
        'moto_cc':     int.tryParse(_cc.text.trim()),
        'placa':       _placa.text.trim().toUpperCase(),
        'soat_vence':  _soatVence?.toIso8601String().split('T').first,
        'tecno_vence': _tecnoVence?.toIso8601String().split('T').first,
      });
      setState(() => _editing = false);
      await _load();
    } catch (e) {
      setState(() => _error = 'Error al guardar: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickDate(bool isSoat) async {
    final now = DateTime.now();
    final initial = (isSoat ? _soatVence : _tecnoVence) ?? now;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 10),
      builder: (ctx, child) => Theme(
        data: ThemeData.dark().copyWith(
          colorScheme: const ColorScheme.dark(primary: RColors.brand),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() {
      if (isSoat) _soatVence = picked; else _tecnoVence = picked;
    });
  }

  String _fmt(DateTime? d) => d == null ? '—' :
      '${d.day.toString().padLeft(2,'0')}/${d.month.toString().padLeft(2,'0')}/${d.year}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: RColors.asphalt,
      appBar: AppBar(
        backgroundColor: RColors.asphalt,
        foregroundColor: Colors.white,
        title: const Text('Mi perfil'),
        actions: [
          if (!_editing && !_loading)
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              onPressed: () => setState(() => _editing = true),
              tooltip: 'Editar perfil',
            ),
          if (_editing)
            TextButton(
              onPressed: () => setState(() { _editing = false; _load(); }),
              child: const Text('Cancelar', style: TextStyle(color: RColors.inkDim)),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: RColors.brand))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                _section('DATOS PERSONALES'),
                _row('Nombre',   _nombre,   Icons.person_outline,        editing: _editing),
                _gap(),
                _row('Apellido', _apellido, Icons.person_outline,        editing: _editing),
                _gap(),
                _row('Teléfono', _telefono, Icons.phone_outlined,        editing: _editing,
                    type: TextInputType.phone),
                _gap(),
                _infoTile('Correo', _auth.user?.email ?? '—', Icons.email_outlined),

                const SizedBox(height: 24),
                _section('MI MOTO'),
                _row('Tipo de moto',  _tipoMoto, Icons.two_wheeler,      editing: _editing),
                _gap(),
                _row('Marca',         _marca,    Icons.branding_watermark_outlined, editing: _editing),
                _gap(),
                _row('Modelo',        _modelo,   Icons.directions_bike_outlined,    editing: _editing),
                _gap(),
                _row('Cilindraje (cc)', _cc,     Icons.speed,            editing: _editing,
                    type: const TextInputType.numberWithOptions(decimal: false)),
                _gap(),
                _row('Placa',          _placa,  Icons.confirmation_number_outlined, editing: _editing),

                const SizedBox(height: 24),
                _section('DOCUMENTOS'),
                _editing
                    ? Column(children: [
                        _dateTile('Vencimiento SOAT', _soatVence, () => _pickDate(true)),
                        _gap(),
                        _dateTile('Vencimiento Tecnomecánica', _tecnoVence, () => _pickDate(false)),
                      ])
                    : Column(children: [
                        _infoTile('SOAT vence', _fmt(_soatVence), Icons.calendar_today),
                        _gap(),
                        _infoTile('Tecno vence', _fmt(_tecnoVence), Icons.calendar_today),
                      ]),

                const SizedBox(height: 28),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_error!, style: const TextStyle(color: RColors.sos)),
                  ),
                if (_editing)
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _busy ? null : _save,
                      style: FilledButton.styleFrom(
                          backgroundColor: RColors.brand, minimumSize: const Size(0, 52)),
                      child: _busy
                          ? const SizedBox(width: 20, height: 20,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Text('GUARDAR CAMBIOS',
                              style: TextStyle(fontSize: 15, letterSpacing: 1.5)),
                    ),
                  ),
                const SizedBox(height: 30),
              ],
            ),
    );
  }

  Widget _section(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Text(t, style: const TextStyle(
        color: RColors.inkFaint, fontSize: 10, letterSpacing: 2.5, fontWeight: FontWeight.w700)),
  );

  Widget _gap() => const SizedBox(height: 10);

  Widget _row(String label, TextEditingController ctrl, IconData icon,
      {bool editing = false, TextInputType? type}) {
    if (!editing) return _infoTile(label, ctrl.text.isEmpty ? '—' : ctrl.text, icon);
    return TextField(
      controller: ctrl,
      keyboardType: type,
      textCapitalization: TextCapitalization.words,
      style: const TextStyle(color: RColors.ink),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: RColors.inkDim, fontSize: 13),
        prefixIcon: Icon(icon, color: RColors.inkDim, size: 20),
        filled: true,
        fillColor: RColors.asphalt2,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: RColors.line)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: RColors.line)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: RColors.brand)),
      ),
    );
  }

  Widget _infoTile(String label, String value, IconData icon) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    decoration: BoxDecoration(
      color: RColors.asphalt2,
      border: Border.all(color: RColors.line),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(children: [
      Icon(icon, color: RColors.inkDim, size: 18),
      const SizedBox(width: 12),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(color: RColors.inkDim, fontSize: 11)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(color: RColors.ink, fontSize: 14)),
      ])),
    ]),
  );

  Widget _dateTile(String label, DateTime? value, VoidCallback onTap) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(12),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      decoration: BoxDecoration(
        color: RColors.asphalt2,
        border: Border.all(color: RColors.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        const Icon(Icons.calendar_today, color: RColors.inkDim, size: 18),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(color: RColors.inkDim, fontSize: 11)),
          const SizedBox(height: 2),
          Text(_fmt(value), style: TextStyle(
              color: value != null ? RColors.ink : RColors.inkFaint, fontSize: 14)),
        ])),
        const Icon(Icons.chevron_right, color: RColors.inkDim, size: 18),
      ]),
    ),
  );
}
