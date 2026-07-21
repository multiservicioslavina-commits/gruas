import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../rita_config.dart';
import '../services/auth_service.dart';
import '../services/update_service.dart';
import '../theme.dart';
import 'login_screen.dart';
import 'my_history_screen.dart';
import 'ride_entry_screen.dart';
import 'profile_screen.dart';

class RideHomeScreen extends StatefulWidget {
  const RideHomeScreen({super.key});

  @override
  State<RideHomeScreen> createState() => _RideHomeScreenState();
}

class _RideHomeScreenState extends State<RideHomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      UpdateService.checkForUpdate(context);
    });
  }

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
              if (context.mounted) {
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                  (_) => false,
                );
              }
            },
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
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
              const SizedBox(height: 14),
              _BigButton(
                icon: Icons.history,
                label: 'Mis rodadas',
                sub: 'Historial, resúmenes y videos',
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const MyHistoryScreen()),
                ),
                dark: true,
              ),
              const SizedBox(height: 14),
              _BigButton(
                icon: Icons.share_rounded,
                label: 'Invitar moteros',
                sub: 'Comparte la app por WhatsApp o redes',
                onTap: () {
                  Share.share('🏍️ Descarga Ridera Aventura y rodemos juntos.\n'
                      'GPS grupal en vivo, detección de caídas y video resumen de cada rodada.\n\n'
                      'https://aventura.ridera.com.co');
                },
                dark: true,
              ),
              const SizedBox(height: 14),
              _BigButton(
                icon: Icons.smart_toy_outlined,
                label: 'Pregúntale a Rita',
                sub: 'Tu asistente de rutas y aventuras',
                onTap: () {
                  final uri = Uri.parse(
                    'https://wa.me/$kRitaWhatsAppNumber?text=${Uri.encodeComponent(kRitaGreeting)}',
                  );
                  launchUrl(uri, mode: LaunchMode.externalApplication);
                },
                dark: true,
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
    this.dark = false,
  });

  final IconData icon;
  final String label;
  final String sub;
  final VoidCallback onTap;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: dark ? RColors.asphalt2 : RColors.brand,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: dark
              ? BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: RColors.line),
                )
              : null,
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
