import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../theme.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _pass = TextEditingController();
  final _auth = AuthService();
  bool _busy = false;
  bool _showPass = false;
  String? _error;

  Future<void> _login() async {
    setState(() { _busy = true; _error = null; });
    try {
      await _auth.signIn(email: _email.text.trim(), password: _pass.text);
    } catch (e) {
      setState(() => _error = _friendlyError(e.toString()));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _forgot() async {
    final email = _email.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'Escribe tu email primero.');
      return;
    }
    try {
      await _auth.resetPassword(email);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Te enviamos un correo para restablecer tu clave.'),
          backgroundColor: Color(0xFF16a34a),
        ));
      }
    } catch (e) {
      setState(() => _error = _friendlyError(e.toString()));
    }
  }

  String _friendlyError(String e) {
    if (e.contains('Invalid login') || e.contains('invalid_credentials')) {
      return 'Email o contraseña incorrectos.';
    }
    if (e.contains('Email not confirmed')) {
      return 'Confirma tu email antes de entrar.';
    }
    return 'Error: $e';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: RColors.asphalt,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              children: [
                const Icon(Icons.sports_motorsports, size: 64, color: RColors.brand),
                const SizedBox(height: 8),
                const Text('RIDERA', style: TextStyle(
                  color: RColors.brand, fontSize: 30, fontWeight: FontWeight.w900, letterSpacing: 4)),
                const Text('AVENTURA', style: TextStyle(
                  color: Colors.white, fontSize: 13, fontWeight: FontWeight.w300, letterSpacing: 8)),
                const SizedBox(height: 40),
                _field(_email, 'Correo electrónico', icon: Icons.email_outlined,
                    type: TextInputType.emailAddress),
                const SizedBox(height: 14),
                _field(_pass, 'Contraseña', icon: Icons.lock_outline,
                    obscure: !_showPass,
                    suffix: IconButton(
                      icon: Icon(_showPass ? Icons.visibility_off : Icons.visibility,
                          color: RColors.inkDim, size: 20),
                      onPressed: () => setState(() => _showPass = !_showPass),
                    )),
                const SizedBox(height: 6),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: _forgot,
                    child: const Text('Olvidé mi contraseña',
                        style: TextStyle(color: RColors.brand, fontSize: 13)),
                  ),
                ),
                const SizedBox(height: 6),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_error!, style: const TextStyle(color: RColors.sos, fontSize: 13)),
                  ),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _busy ? null : _login,
                    style: FilledButton.styleFrom(
                        backgroundColor: RColors.brand,
                        minimumSize: const Size(0, 52)),
                    child: _busy
                        ? const SizedBox(width: 20, height: 20,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : const Text('ENTRAR', style: TextStyle(fontSize: 16, letterSpacing: 2)),
                  ),
                ),
                const SizedBox(height: 20),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  const Text('¿No tienes cuenta? ', style: TextStyle(color: RColors.inkDim)),
                  GestureDetector(
                    onTap: () => Navigator.push(context,
                        MaterialPageRoute(builder: (_) => const RegisterScreen())),
                    child: const Text('Regístrate',
                        style: TextStyle(color: RColors.brand, fontWeight: FontWeight.w600)),
                  ),
                ]),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(TextEditingController ctrl, String hint,
      {IconData? icon, TextInputType? type, bool obscure = false, Widget? suffix}) =>
      TextField(
        controller: ctrl,
        keyboardType: type,
        obscureText: obscure,
        style: const TextStyle(color: RColors.ink),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: RColors.inkDim),
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
}
