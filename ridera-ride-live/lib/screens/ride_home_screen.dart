import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../theme.dart';
import 'ride_entry_screen.dart';
import 'profile_screen.dart';

class RideHomeScreen extends StatelessWidget {
  const RideHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: RColors.asphalt,
      appBar: AppBar(
        backgroundColor: RColors.asphalt,
        elevation: 0,
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.person_outline, color: RColors.inkDim),
            tooltip: 'Mi perfil',
            onPressed: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => const ProfileScreen())),
          ),
          IconButton(
            icon: const Icon(Icons.logout, color: RColors.inkDim),
            tooltip: 'Cerrar sesión',
            onPressed: () async {
              await AuthService().signOut();
            },
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.sports_motorsports,
                  size: 80, color: RColors.brand),
              const SizedBox(height: 16),
              const Text(
                'RIDERA',
                style: TextStyle(
                  color: RColors.brand,
                  fontSize: 36,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 4,
                ),
                textAlign: TextAlign.center,
              ),
              const Text(
                'AVENTURA',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w300,
                  letterSpacing: 8,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text(
                'Sigue a tu convoy en tiempo real',
                style: TextStyle(color: RColors.ink, fontSize: 14),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 48),
              _BigButton(
                icon: Icons.add_road,
                label: 'Iniciar rodada',
                sub: 'Crear o unirte a un convoy',
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const RideEntryScreen()),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BigButton extends StatelessWidget {
  const _BigButton({
    required this.icon,
    required this.label,
    required this.sub,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String sub;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: RColors.brand,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(20),
          child: Row(
            children: [
              Icon(icon, size: 32, color: Colors.white),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                        )),
                    Text(sub,
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 13,
                        )),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}
