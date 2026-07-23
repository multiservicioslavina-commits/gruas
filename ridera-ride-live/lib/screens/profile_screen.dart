import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/auth_service.dart';
import '../theme.dart';
import 'login_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _auth = AuthService();
  final _sb = Supabase.instance.client;
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _editing = false;
  bool _busy = false;
  String? _error;
  int _totalRides = 0;
  double _totalKm = 0;

  final _nombre = TextEditingController();
  final _apellido = TextEditingController();
  final _telefono = TextEditingController();
  final _tipoMoto = TextEditingController();
  final _marca = TextEditingController();
  final _modelo = TextEditingController();
  final _cc = TextEditingController();
  final _placa = TextEditingController();
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
      _nombre.text = d['nombre'] ?? '';
      _apellido.text = d['apellido'] ?? '';
      _telefono.text = d['telefono'] ?? '';
      _tipoMoto.text = d['tipo_moto'] ?? '';
      _marca.text = d['moto_marca'] ?? '';
      _modelo.text = d['moto_modelo'] ?? '';
      _cc.text = (d['moto_cc'] ?? '').toString();
      _placa.text = d['placa'] ?? '';
      _soatVence = d['soat_vence'] != null
          ? DateTime.tryParse(d['soat_vence'])
          : null;
      _tecnoVence = d['tecno_vence'] != null
          ? DateTime.tryParse(d['tecno_vence'])
          : null;
    }
    await _loadStats();
    if (mounted) setState(() { _data = d; _loading = false; });
  }

  Future<void> _loadStats() async {
    final uid = _auth.uid;
    if (uid == null) return;
    try {
      final rows = await _sb
          .from('rides')
          .select('distance_km')
          .eq('created_by', uid);
      double km = 0;
      for (final r in rows) {
        km += (double.tryParse('${r['distance_km'] ?? 0}') ?? 0);
      }
      _totalRides = rows.length;
      _totalKm = km;
    } catch (_) {}
  }

  Future<void> _save() async {
    setState(() { _busy = true; _error = null; });
    try {
      await _auth.updateProfile({
        'nombre': _nombre.text.trim(),
        'apellido': _apellido.text.trim(),
        'telefono': _telefono.text.trim(),
        'tipo_moto': _tipoMoto.text.trim(),
        'moto_marca': _marca.text.trim(),
        'moto_modelo': _modelo.text.trim(),
        'moto_cc': int.tryParse(_cc.text.trim()),
        'placa': _placa.text.trim().toUpperCase(),
        'soat_vence': _soatVence?.toIso8601String().split('T').first,
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
    if (picked != null) {
      setState(() {
        if (isSoat) _soatVence = picked; else _tecnoVence = picked;
      });
    }
  }

  String _fmt(DateTime? d) => d == null
      ? '—'
      : '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  String _soatStatus() {
    if (_soatVence == null) return 'Sin registrar';
    final diff = _soatVence!.difference(DateTime.now()).inDays;
    if (diff < 0) return 'Vencido';
    if (diff <= 30) return 'Vence pronto';
    return 'Vigente';
  }

  Color _soatColor() {
    if (_soatVence == null) return RColors.inkDim;
    final diff = _soatVence!.difference(DateTime.now()).inDays;
    if (diff < 0) return RColors.sos;
    if (diff <= 30) return RColors.warn;
    return RColors.ok;
  }

  String _tecnoStatus() {
    if (_tecnoVence == null) return 'Sin registrar';
    final diff = _tecnoVence!.difference(DateTime.now()).inDays;
    if (diff < 0) return 'Vencido';
    if (diff <= 30) return 'Vence pronto';
    return 'Vigente';
  }

  Color _tecnoColor() {
    if (_tecnoVence == null) return RColors.inkDim;
    final diff = _tecnoVence!.difference(DateTime.now()).inDays;
    if (diff < 0) return RColors.sos;
    if (diff <= 30) return RColors.warn;
    return RColors.ok;
  }

  String get _displayName {
    final n = _nombre.text.trim();
    final a = _apellido.text.trim();
    if (n.isEmpty && a.isEmpty) return 'Motero';
    return '$n $a'.trim();
  }

  String get _initials {
    final n = _nombre.text.trim();
    final a = _apellido.text.trim();
    if (n.isEmpty && a.isEmpty) return 'R';
    final i1 = n.isNotEmpty ? n[0].toUpperCase() : '';
    final i2 = a.isNotEmpty ? a[0].toUpperCase() : '';
    return '$i1$i2';
  }

  String get _motoSummary {
    final parts = <String>[];
    if (_marca.text.trim().isNotEmpty) parts.add(_marca.text.trim());
    if (_modelo.text.trim().isNotEmpty) parts.add(_modelo.text.trim());
    if (_cc.text.trim().isNotEmpty && _cc.text.trim() != '0') {
      parts.add('${_cc.text.trim()}cc');
    }
    return parts.isEmpty ? 'Sin moto registrada' : parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: RColors.asphalt,
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: RColors.brand))
          : CustomScrollView(
              slivers: [
                // ── Header con avatar y stats ──
                SliverToBoxAdapter(child: _buildHeader()),
                // ── Contenido ──
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      const SizedBox(height: 24),
                      _sectionHeader('MI MOTO', Icons.two_wheeler),
                      const SizedBox(height: 12),
                      _buildMotoCard(),
                      const SizedBox(height: 24),
                      _sectionHeader('DATOS PERSONALES', Icons.person_outline),
                      const SizedBox(height: 12),
                      _buildPersonalCard(),
                      const SizedBox(height: 24),
                      _sectionHeader('DOCUMENTOS', Icons.verified_user_outlined),
                      const SizedBox(height: 12),
                      _buildDocumentsCard(),
                      const SizedBox(height: 24),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(_error!,
                              style: const TextStyle(color: RColors.sos)),
                        ),
                      if (_editing)
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: _busy ? null : _save,
                            style: FilledButton.styleFrom(
                              backgroundColor: RColors.brand,
                              minimumSize: const Size(0, 52),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14)),
                            ),
                            child: _busy
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                        color: Colors.white, strokeWidth: 2))
                                : const Text('GUARDAR CAMBIOS',
                                    style: TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 1.5)),
                          ),
                        ),
                      const SizedBox(height: 16),
                      _buildLogoutButton(),
                      const SizedBox(height: 40),
                    ]),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildHeader() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF1c1008), RColors.asphalt],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            // Top bar
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back, color: Colors.white),
                    onPressed: () => Navigator.pop(context),
                  ),
                  const Expanded(
                    child: Text('Mi cuenta',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w700)),
                  ),
                  if (!_editing && !_loading)
                    IconButton(
                      icon: const Icon(Icons.edit_outlined,
                          color: RColors.brand),
                      onPressed: () => setState(() => _editing = true),
                      tooltip: 'Editar',
                    ),
                  if (_editing)
                    TextButton(
                      onPressed: () =>
                          setState(() { _editing = false; _load(); }),
                      child: const Text('Cancelar',
                          style: TextStyle(color: RColors.inkDim)),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            // Avatar
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFFE85D20), Color(0xFFD44A10)],
                ),
                boxShadow: [
                  BoxShadow(
                      color: RColors.brand.withValues(alpha: 0.4),
                      blurRadius: 20,
                      spreadRadius: 2),
                ],
              ),
              child: Center(
                child: Text(_initials,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 32,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 2)),
              ),
            ),
            const SizedBox(height: 14),
            Text(_displayName,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.two_wheeler,
                    color: RColors.brand, size: 16),
                const SizedBox(width: 6),
                Text(_motoSummary,
                    style: const TextStyle(
                        color: RColors.inkDim, fontSize: 13)),
              ],
            ),
            if (_placa.text.trim().isNotEmpty) ...[
              const SizedBox(height: 6),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(6),
                  border:
                      Border.all(color: Colors.white.withValues(alpha: 0.15)),
                ),
                child: Text(_placa.text.trim().toUpperCase(),
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 3)),
              ),
            ],
            const SizedBox(height: 24),
            // Stats row
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 20),
              padding: const EdgeInsets.symmetric(vertical: 18),
              decoration: BoxDecoration(
                color: RColors.asphalt2,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: RColors.line),
              ),
              child: Row(
                children: [
                  _statItem('$_totalRides', 'Rodadas'),
                  Container(width: 1, height: 36, color: RColors.line),
                  _statItem('${_totalKm.toStringAsFixed(0)}', 'Km totales'),
                  Container(width: 1, height: 36, color: RColors.line),
                  _statItem(
                      _data?['tipo_moto'] ?? '—', 'Tipo'),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _statItem(String value, String label) {
    return Expanded(
      child: Column(
        children: [
          Text(value,
              style: const TextStyle(
                  color: RColors.brand,
                  fontSize: 22,
                  fontWeight: FontWeight.w900),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
          const SizedBox(height: 2),
          Text(label,
              style: const TextStyle(
                  color: RColors.inkDim,
                  fontSize: 11,
                  letterSpacing: 1)),
        ],
      ),
    );
  }

  Widget _sectionHeader(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, color: RColors.brand, size: 18),
        const SizedBox(width: 8),
        Text(title,
            style: const TextStyle(
                color: RColors.inkDim,
                fontSize: 11,
                letterSpacing: 3,
                fontWeight: FontWeight.w700)),
      ],
    );
  }

  Widget _buildMotoCard() {
    return Container(
      decoration: BoxDecoration(
        color: RColors.asphalt2,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: RColors.line),
      ),
      child: Column(
        children: [
          _cardRow('Tipo', _tipoMoto, Icons.category_outlined,
              editing: _editing),
          _divider(),
          _cardRow('Marca', _marca, Icons.branding_watermark_outlined,
              editing: _editing),
          _divider(),
          _cardRow('Modelo', _modelo, Icons.directions_bike_outlined,
              editing: _editing),
          _divider(),
          _cardRow('Cilindraje', _cc, Icons.speed,
              editing: _editing,
              suffix: 'cc',
              type: const TextInputType.numberWithOptions(decimal: false)),
          _divider(),
          _cardRow('Placa', _placa, Icons.confirmation_number_outlined,
              editing: _editing),
        ],
      ),
    );
  }

  Widget _buildPersonalCard() {
    return Container(
      decoration: BoxDecoration(
        color: RColors.asphalt2,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: RColors.line),
      ),
      child: Column(
        children: [
          _cardRow('Nombre', _nombre, Icons.person_outline,
              editing: _editing),
          _divider(),
          _cardRow('Apellido', _apellido, Icons.person_outline,
              editing: _editing),
          _divider(),
          _cardRow('Teléfono', _telefono, Icons.phone_outlined,
              editing: _editing, type: TextInputType.phone),
          _divider(),
          _infoRow(
              'Correo', _auth.user?.email ?? '—', Icons.email_outlined),
        ],
      ),
    );
  }

  Widget _buildDocumentsCard() {
    return Container(
      decoration: BoxDecoration(
        color: RColors.asphalt2,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: RColors.line),
      ),
      child: Column(
        children: [
          _editing
              ? _dateRow('SOAT', _soatVence, () => _pickDate(true))
              : _docRow('SOAT', _fmt(_soatVence), _soatStatus(), _soatColor()),
          _divider(),
          _editing
              ? _dateRow(
                  'Tecnomecánica', _tecnoVence, () => _pickDate(false))
              : _docRow('Tecnomecánica', _fmt(_tecnoVence), _tecnoStatus(),
                  _tecnoColor()),
        ],
      ),
    );
  }

  Widget _buildLogoutButton() {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () async {
          await _auth.signOut();
          if (mounted) {
            Navigator.of(context).pushAndRemoveUntil(
              MaterialPageRoute(builder: (_) => const LoginScreen()),
              (_) => false,
            );
          }
        },
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: RColors.sos.withValues(alpha: 0.3)),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.logout, color: RColors.sos, size: 18),
              SizedBox(width: 8),
              Text('Cerrar sesión',
                  style: TextStyle(
                      color: RColors.sos,
                      fontSize: 15,
                      fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }

  // ── Card row helpers ──

  Widget _divider() =>
      Divider(height: 1, color: RColors.line, indent: 48, endIndent: 16);

  Widget _cardRow(
      String label, TextEditingController ctrl, IconData icon,
      {bool editing = false, TextInputType? type, String? suffix}) {
    if (!editing) {
      String val = ctrl.text.isEmpty ? '—' : ctrl.text;
      if (suffix != null && ctrl.text.isNotEmpty) val = '$val $suffix';
      return _infoRow(label, val, icon);
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      child: Row(
        children: [
          Icon(icon, color: RColors.inkDim, size: 18),
          const SizedBox(width: 12),
          Expanded(
            child: TextField(
              controller: ctrl,
              keyboardType: type,
              textCapitalization: TextCapitalization.words,
              style: const TextStyle(color: RColors.ink, fontSize: 14),
              decoration: InputDecoration(
                labelText: label,
                labelStyle:
                    const TextStyle(color: RColors.inkDim, fontSize: 12),
                suffixText: suffix,
                suffixStyle:
                    const TextStyle(color: RColors.inkDim, fontSize: 13),
                isDense: true,
                contentPadding:
                    const EdgeInsets.symmetric(vertical: 10),
                border: InputBorder.none,
                focusedBorder: const UnderlineInputBorder(
                    borderSide: BorderSide(color: RColors.brand)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value, IconData icon) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      child: Row(
        children: [
          Icon(icon, color: RColors.inkDim, size: 18),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        color: RColors.inkDim, fontSize: 11)),
                const SizedBox(height: 2),
                Text(value,
                    style:
                        const TextStyle(color: RColors.ink, fontSize: 14)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _docRow(
      String label, String date, String status, Color statusColor) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      child: Row(
        children: [
          Icon(Icons.shield_outlined, color: statusColor, size: 18),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        color: RColors.inkDim, fontSize: 11)),
                const SizedBox(height: 2),
                Text(date,
                    style:
                        const TextStyle(color: RColors.ink, fontSize: 14)),
              ],
            ),
          ),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(status,
                style: TextStyle(
                    color: statusColor,
                    fontSize: 11,
                    fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }

  Widget _dateRow(String label, DateTime? value, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        child: Row(
          children: [
            const Icon(Icons.calendar_today,
                color: RColors.inkDim, size: 18),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style: const TextStyle(
                          color: RColors.inkDim, fontSize: 11)),
                  const SizedBox(height: 2),
                  Text(_fmt(value),
                      style: TextStyle(
                          color:
                              value != null ? RColors.ink : RColors.inkFaint,
                          fontSize: 14)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right,
                color: RColors.inkDim, size: 18),
          ],
        ),
      ),
    );
  }
}
