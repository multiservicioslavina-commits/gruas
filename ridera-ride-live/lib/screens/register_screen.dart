import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../theme.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _auth = AuthService();
  bool _busy = false;
  String? _error;
  bool _showPass = false;

  // Datos personales
  final _nombre    = TextEditingController();
  final _apellido  = TextEditingController();
  final _telefono  = TextEditingController();
  final _email     = TextEditingController();
  final _pass      = TextEditingController();

  // Datos de la moto
  final _tipoMoto  = TextEditingController();
  final _marca     = TextEditingController();
  final _modelo    = TextEditingController();
  final _cc        = TextEditingController();

  // Documentos
  DateTime? _soatVence;
  DateTime? _tecnoVence;

  Future<void> _pickDate(bool isSoat) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: now,
      lastDate: DateTime(now.year + 5),
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

  Future<void> _register() async {
    final nombre   = _nombre.text.trim();
    final apellido = _apellido.text.trim();
    final email    = _email.text.trim();
    final pass     = _pass.text;

    if (nombre.isEmpty || apellido.isEmpty || email.isEmpty || pass.isEmpty) {
      setState(() => _error = 'Nombre, apellido, email y contraseña son obligatorios.');
      return;
    }
    if (pass.length < 6) {
      setState(() => _error = 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setState(() { _busy = true; _error = null; });
    try {
      await _auth.signUp(
        email: email,
        password: pass,
        profile: {
          'nombre': nombre,
          'apellido': apellido,
          'telefono': _telefono.text.trim(),
          'tipo_moto': _tipoMoto.text.trim(),
          'moto_marca': _marca.text.trim(),
          'moto_modelo': _modelo.text.trim(),
          'moto_cc': int.tryParse(_cc.text.trim()),
          'soat_vence': _soatVence?.toIso8601String().split('T').first,
          'tecno_vence': _tecnoVence?.toIso8601String().split('T').first,
        },
      );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() => _error = _friendlyError(e.toString()));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _friendlyError(String e) {
    if (e.contains('already registered') || e.contains('already exists')) {
      return 'Ese email ya está registrado. Intenta iniciar sesión.';
    }
    if (e.contains('weak_password')) return 'Contraseña muy débil.';
    return 'Error: $e';
  }

  String _fmt(DateTime? d) => d == null ? 'Seleccionar fecha' :
      '${d.day.toString().padLeft(2,'0')}/${d.month.toString().padLeft(2,'0')}/${d.year}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: RColors.asphalt,
      appBar: AppBar(
        backgroundColor: RColors.asphalt,
        title: const Text('Crear cuenta'),
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _section('DATOS PERSONALES'),
          _field(_nombre,   'Nombre *',    icon: Icons.person_outline),
          _gap(),
          _field(_apellido, 'Apellido *',  icon: Icons.person_outline),
          _gap(),
          _field(_telefono, 'Teléfono / celular', icon: Icons.phone_outlined,
              type: TextInputType.phone),
          _gap(),
          _field(_email, 'Correo electrónico *', icon: Icons.email_outlined,
              type: TextInputType.emailAddress),
          _gap(),
          _field(_pass, 'Contraseña * (mín. 6 caracteres)', icon: Icons.lock_outline,
              obscure: !_showPass,
              suffix: IconButton(
                icon: Icon(_showPass ? Icons.visibility_off : Icons.visibility,
                    color: RColors.inkDim, size: 20),
                onPressed: () => setState(() => _showPass = !_showPass),
              )),

          const SizedBox(height: 24),
          _section('DATOS DE LA MOTO'),
          _field(_tipoMoto, 'Tipo de moto  (ej: Enduro, Deportiva, Touring…)',
              icon: Icons.two_wheeler),
          _gap(),
          _field(_marca,  'Marca  (ej: Honda, Yamaha…)',  icon: Icons.branding_watermark_outlined),
          _gap(),
          _field(_modelo, 'Modelo  (ej: CB500F)',          icon: Icons.directions_bike_outlined),
          _gap(),
          _field(_cc, 'Cilindraje (cc)', icon: Icons.speed,
              type: const TextInputType.numberWithOptions(decimal: false)),

          const SizedBox(height: 24),
          _section('DOCUMENTOS'),
          _dateTile('Vencimiento SOAT', _soatVence, () => _pickDate(true)),
          _gap(),
          _dateTile('Vencimiento Tecnomecánica', _tecnoVence, () => _pickDate(false)),

          const SizedBox(height: 28),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(_error!, style: const TextStyle(color: RColors.sos)),
            ),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _busy ? null : _register,
              style: FilledButton.styleFrom(
                  backgroundColor: RColors.brand, minimumSize: const Size(0, 52)),
              child: _busy
                  ? const SizedBox(width: 20, height: 20,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('REGISTRARME', style: TextStyle(fontSize: 16, letterSpacing: 2)),
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

  Widget _gap() => const SizedBox(height: 12);

  Widget _field(TextEditingController ctrl, String hint,
      {IconData? icon, TextInputType? type, bool obscure = false, Widget? suffix}) =>
      TextField(
        controller: ctrl,
        keyboardType: type,
        obscureText: obscure,
        textCapitalization: TextCapitalization.words,
        style: const TextStyle(color: RColors.ink),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: RColors.inkDim, fontSize: 13),
          prefixIcon: icon != null ? Icon(icon, color: RColors.inkDim, size: 20) : null,
          suffixIcon: suffix,
          filled: true,
          fillColor: RColors.asphalt2,
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: RColors.line)),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: RColors.line)),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: RColors.brand)),
        ),
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
