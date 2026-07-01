import 'dart:math';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme.dart';

class RideSummaryScreen extends StatefulWidget {
  const RideSummaryScreen({
    super.key,
    required this.rideId,
    required this.rideName,
    required this.elapsed,
  });

  final String rideId;
  final String rideName;
  final Duration elapsed;

  @override
  State<RideSummaryScreen> createState() => _RideSummaryScreenState();
}

class _RideSummaryScreenState extends State<RideSummaryScreen> {
  final _db = Supabase.instance.client;
  bool _loading = true;
  double _distanceKm = 0;
  double _maxSpeedKmh = 0;
  int _photoCount = 0;
  List<String> _photoUrls = [];

  @override
  void initState() {
    super.initState();
    _loadSummary();
  }

  Future<void> _loadSummary() async {
    final uid = _db.auth.currentUser!.id;
    try {
      // Cargar puntos de ruta propios
      final points = await _db
          .from('route_points')
          .select('lat, lon, speed_kmh')
          .eq('ride_id', widget.rideId)
          .eq('uid', uid)
          .order('recorded_at');

      double dist = 0;
      double maxSpd = 0;
      for (int i = 1; i < points.length; i++) {
        final lat1 = (points[i - 1]['lat'] as num).toDouble();
        final lon1 = (points[i - 1]['lon'] as num).toDouble();
        final lat2 = (points[i]['lat'] as num).toDouble();
        final lon2 = (points[i]['lon'] as num).toDouble();
        dist += _haversineKm(lat1, lon1, lat2, lon2);
        final spd = (points[i]['speed_kmh'] as num?)?.toDouble() ?? 0;
        if (spd > maxSpd) maxSpd = spd;
      }

      // Cargar fotos propias de la rodada
      final photos = await _db
          .from('ride_photos')
          .select('url')
          .eq('ride_id', widget.rideId)
          .eq('uid', uid)
          .order('created_at');

      if (mounted) {
        setState(() {
          _distanceKm = dist;
          _maxSpeedKmh = maxSpd;
          _photoCount = photos.length;
          _photoUrls = photos.map<String>((p) => p['url'] as String).toList();
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  double _haversineKm(double lat1, double lon1, double lat2, double lon2) {
    const r = 6371.0;
    final dLat = (lat2 - lat1) * pi / 180;
    final dLon = (lon2 - lon1) * pi / 180;
    final a = sin(dLat / 2) * sin(dLat / 2) +
        cos(lat1 * pi / 180) * cos(lat2 * pi / 180) *
        sin(dLon / 2) * sin(dLon / 2);
    return r * 2 * asin(sqrt(a));
  }

  String _hms(Duration d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.inHours)}:${two(d.inMinutes % 60)}:${two(d.inSeconds % 60)}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: RColors.asphalt,
      appBar: AppBar(
        backgroundColor: RColors.asphalt,
        foregroundColor: Colors.white,
        automaticallyImplyLeading: false,
        title: const Text('Resumen de rodada'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
            child: const Text('Salir', style: TextStyle(color: RColors.brand)),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: RColors.brand))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                // Nombre de la rodada
                Center(
                  child: Text(widget.rideName,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.w800)),
                ),
                const SizedBox(height: 24),

                // Stats
                Row(children: [
                  _stat(Icons.straighten, '${_distanceKm.toStringAsFixed(1)} km', 'Distancia'),
                  const SizedBox(width: 12),
                  _stat(Icons.timer_outlined, _hms(widget.elapsed), 'Tiempo'),
                ]),
                const SizedBox(height: 12),
                Row(children: [
                  _stat(Icons.speed, '${_maxSpeedKmh.toStringAsFixed(0)} km/h', 'Vel. máxima'),
                  const SizedBox(width: 12),
                  _stat(Icons.camera_alt_outlined, '$_photoCount', 'Fotos'),
                ]),

                if (_photoUrls.isNotEmpty) ...[
                  const SizedBox(height: 28),
                  const Text('FOTOS DE LA RODADA',
                      style: TextStyle(
                          color: RColors.inkFaint,
                          fontSize: 10,
                          letterSpacing: 2.5,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      crossAxisSpacing: 6,
                      mainAxisSpacing: 6,
                    ),
                    itemCount: _photoUrls.length,
                    itemBuilder: (_, i) => ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.network(
                        _photoUrls[i],
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          color: RColors.asphalt2,
                          child: const Icon(Icons.broken_image, color: RColors.inkDim),
                        ),
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 32),
              ],
            ),
    );
  }

  Widget _stat(IconData icon, String value, String label) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: RColors.asphalt2,
            border: Border.all(color: RColors.line),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(children: [
            Icon(icon, color: RColors.brand, size: 22),
            const SizedBox(height: 8),
            Text(value,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(label,
                style: const TextStyle(color: RColors.inkDim, fontSize: 11)),
          ]),
        ),
      );
}
