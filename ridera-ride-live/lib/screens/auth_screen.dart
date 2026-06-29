import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'ride_home_screen.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _loading = false;
  bool _isLogin = true;

  Future<void> _submit() async {
    final email = _emailCtrl.text.trim();
    final pass = _passCtrl.text.trim();
    if (email.isEmpty || pass.isEmpty) return;

    setState(() => _loading = true);
    try {
      if (_isLogin) {
        await Supabase.instance.client.auth.signInWithPassword(
          email: email,
          password: pass,
        );
      } else {
        await Supabase.instance.client.auth.signUp(
          email: email,
          password: pass,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const RideHomeScreen()),
      );
    } on AuthException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0e0e0e),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 60),
              const Icon(Icons.sports_motorsports,
                  size: 72, color: Color(0xFFE85D20)),
              const SizedBox(height: 12),
              const Text(
                'RIDERA',
                style: TextStyle(
                  color: Color(0xFFE85D20),
                  fontSize: 32,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 4,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 40),
              Text(
                _isLogin ? 'Iniciar sesión' : 'Crear cuenta',
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                style: const TextStyle(color: Colors.white),
                decoration: _inputDecor('Correo electrónico'),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _passCtrl,
                obscureText: true,
                style: const TextStyle(color: Colors.white),
                decoration: _inputDecor('Contraseña'),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _loading ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFE85D20),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: _loading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : Text(_isLogin ? 'Entrar' : 'Registrarse',
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w600)),
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => setState(() => _isLogin = !_isLogin),
                child: Text(
                  _isLogin
                      ? '¿No tienes cuenta? Regístrate'
                      : '¿Ya tienes cuenta? Inicia sesión',
                  style: const TextStyle(color: Color(0xFFe6e3de)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDecor(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Color(0xFF666666)),
        filled: true,
        fillColor: const Color(0xFF171717),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFF2a2a2a)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFF2a2a2a)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE85D20)),
        ),
      );
}
