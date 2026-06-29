import 'package:flutter/material.dart';
import 'create_ride_screen.dart';
import 'join_ride_screen.dart';

class RideHomeScreen extends StatelessWidget {
  const RideHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0e0e0e),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.sports_motorsports,
                  size: 80, color: Color(0xFFE85D20)),
              const SizedBox(height: 16),
              const Text(
                'RIDERA',
                style: TextStyle(
                  color: Color(0xFFE85D20),
                  fontSize: 36,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 4,
                ),
                textAlign: TextAlign.center,
              ),
              const Text(
                'RIDE LIVE',
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
                style: TextStyle(color: Color(0xFFe6e3de), fontSize: 14),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 48),
              _BigButton(
                icon: Icons.add_road,
                label: 'Crear rodada',
                sub: 'Eres el líder del convoy',
                onTap: () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const CreateRideScreen())),
              ),
              const SizedBox(height: 16),
              _BigButton(
                icon: Icons.group_add,
                label: 'Unirme a rodada',
                sub: 'Tengo el código del líder',
                outlined: true,
                onTap: () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const JoinRideScreen())),
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
    this.outlined = false,
  });

  final IconData icon;
  final String label;
  final String sub;
  final VoidCallback onTap;
  final bool outlined;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: outlined ? Colors.transparent : const Color(0xFFE85D20),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: outlined
              ? BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFF2a2a2a), width: 2),
                )
              : null,
          child: Row(
            children: [
              Icon(icon,
                  size: 32,
                  color: outlined
                      ? const Color(0xFFE85D20)
                      : Colors.white),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label,
                        style: TextStyle(
                          color: outlined
                              ? Colors.white
                              : Colors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                        )),
                    Text(sub,
                        style: TextStyle(
                          color: outlined
                              ? const Color(0xFFe6e3de)
                              : Colors.white70,
                          fontSize: 13,
                        )),
                  ],
                ),
              ),
              Icon(Icons.chevron_right,
                  color: outlined
                      ? const Color(0xFFE85D20)
                      : Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}
