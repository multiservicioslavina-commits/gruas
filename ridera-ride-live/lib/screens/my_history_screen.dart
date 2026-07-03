import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/ride_service.dart';
import '../theme.dart';
import 'ride_summary_screen.dart';

class MyHistoryScreen extends StatefulWidget {
  const MyHistoryScreen({super.key});

  @override
  State<MyHistoryScreen> createState() => _MyHistoryScreenState();
}

class _MyHistoryScreenState extends State<MyHistoryScreen> {
  final _rideService = RideService();
  bool _loading = true;
  List<Map<String, dynamic>> _rides = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await _rideService.getMyHistory();
      if (mounted) setState(() { _rides = data; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _hms(int seconds) {
    if (seconds <= 0) return '—';
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    if (h > 0) return '${h}h ${m}m';
    return '${m}min';
  }

  String _fecha(String? iso) {
    if (iso == null) return '';
    final d = DateTime.tryParse(iso)?.toLocal();
    if (d == null) return '';
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return '${d.day} ${meses[d.month - 1]} ${d.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: RColors.asphalt,
      appBar: AppBar(
        backgroundColor: RColors.asphalt,
        foregroundColor: Colors.white,
        title: const Text('Mis rodadas'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: RColors.brand))
          : _rides.isEmpty
              ? const _EmptyState()
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: _rides.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (_, i) => _RideCard(
                    data: _rides[i],
                    hms: _hms,
                    fecha: _fecha,
                  ),
                ),
    );
  }
}

class _RideCard extends StatelessWidget {
  const _RideCard({
    required this.data,
    required this.hms,
    required this.fecha,
  });
  final Map<String, dynamic> data;
  final String Function(int) hms;
  final String Function(String?) fecha;

  @override
  Widget build(BuildContext context) {
    final ride = data['rides'] as Map<String, dynamic>? ?? {};
    final nombre = ride['nombre'] ?? 'Rodada';
    final createdAt = ride['created_at'] as String?;
    final rideId = data['ride_id'] as String;
    final rol = data['rol'] as String? ?? 'rider';
    final distance = (data['distance_km'] as num?)?.toDouble() ?? 0;
    final duration = (data['duration_seconds'] as num?)?.toInt() ?? 0;
    final maxSpeed = (data['max_speed_kmh'] as num?)?.toDouble() ?? 0;
    final videoUrl = data['video_url'] as String?;

    return InkWell(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => RideSummaryScreen(
              rideId: rideId,
              rideName: nombre,
              elapsed: Duration(seconds: duration),
            ),
          ),
        );
      },
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: RColors.asphalt2,
          border: Border.all(color: RColors.line),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    nombre,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (rol == 'lider')
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: RColors.brand.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: RColors.brand),
                    ),
                    child: const Text('LÍDER',
                        style: TextStyle(
                            color: RColors.brand,
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.2)),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(fecha(createdAt),
                style: const TextStyle(color: RColors.inkDim, fontSize: 12)),
            const SizedBox(height: 14),
            Row(children: [
              _mini(Icons.straighten, '${distance.toStringAsFixed(1)} km'),
              const SizedBox(width: 14),
              _mini(Icons.timer_outlined, hms(duration)),
              const SizedBox(width: 14),
              _mini(Icons.speed, '${maxSpeed.toStringAsFixed(0)} km/h'),
            ]),
            if (videoUrl != null) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.play_circle_outline, size: 18),
                  label: const Text('VER VIDEO'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: RColors.brand,
                    side: const BorderSide(color: RColors.brand),
                    minimumSize: const Size(0, 42),
                  ),
                  onPressed: () => launchUrl(Uri.parse(videoUrl),
                      mode: LaunchMode.externalApplication),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _mini(IconData icon, String txt) => Row(children: [
        Icon(icon, size: 14, color: RColors.brand),
        const SizedBox(width: 4),
        Text(txt, style: const TextStyle(color: Colors.white, fontSize: 13)),
      ]);
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.motorcycle, size: 80, color: RColors.brand.withValues(alpha: 0.5)),
            const SizedBox(height: 16),
            const Text('Aún no tienes rodadas',
                style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            const Text(
                'Cuando finalices tu primera rodada aparecerá aquí con su resumen y video.',
                textAlign: TextAlign.center,
                style: TextStyle(color: RColors.inkDim, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}
