import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/ride_service.dart';
import '../services/video_service.dart';
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
  List<Map<String, dynamic>> _photos = []; // {url, lat, lon}
  List<Map<String, double>> _routePoints = [];
  List<Map<String, dynamic>> _municipios = [];

  final _videoService = VideoService();
  final _rideService = RideService();
  String _videoStatus = 'idle'; // idle | rendering | done | error
  String? _videoUrl;
  String? _videoError;
  int _videoProgress = 0;
  String? _rideStartedAt;
  List<Map<String, dynamic>> _groupRiders = [];

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
          .order('recorded_at', ascending: true);

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

      // Cargar fotos propias de la rodada (con coordenadas para el video)
      final photos = await _db
          .from('ride_photos')
          .select('url, lat, lon')
          .eq('ride_id', widget.rideId)
          .eq('uid', uid)
          .order('created_at'); // ascendente = orden cronológico

      // Puntos de ruta para el mapa del video (con velocidad para heatmap y cámara dinámica)
      final routePts = points
          .map<Map<String, double>>((p) => {
                'lat': (p['lat'] as num).toDouble(),
                'lon': (p['lon'] as num).toDouble(),
                'speed_kmh': ((p['speed_kmh'] as num?) ?? 0).toDouble(),
              })
          .toList();

      // Hora de inicio de la rodada (para iluminación horaria en el video)
      String? startedAt;
      try {
        final rideRow = await _db
            .from('rides')
            .select('created_at')
            .eq('id', widget.rideId)
            .maybeSingle();
        startedAt = rideRow?['created_at'] as String?;
      } catch (_) {}

      // Otros riders del grupo (para video grupal) — batch query
      List<Map<String, dynamic>> groupRiders = [];
      try {
        final otherMembers = await _db
            .from('members')
            .select('uid, nombre')
            .eq('ride_id', widget.rideId)
            .neq('uid', uid)
            .limit(7);
        if (otherMembers.isNotEmpty) {
          final otherUids = otherMembers.map((m) => m['uid'] as String).toList();
          final allMemberPts = await _db
              .from('route_points')
              .select('uid, lat, lon, speed_kmh')
              .eq('ride_id', widget.rideId)
              .inFilter('uid', otherUids)
              .order('recorded_at', ascending: true)
              .limit(2100);
          final byUid = <String, List<Map<String, dynamic>>>{};
          for (final p in allMemberPts) {
            final pUid = p['uid'] as String;
            (byUid[pUid] ??= []).add(p);
          }
          for (final member in otherMembers) {
            final memberUid = member['uid'] as String;
            final memberPts = (byUid[memberUid] ?? []).take(300).toList();
            if (memberPts.length >= 2) {
              groupRiders.add({
                'uid': memberUid,
                'name': member['nombre'] ?? 'Rider',
                'routePoints': memberPts
                    .map<Map<String, double>>((p) => {
                          'lat': (p['lat'] as num).toDouble(),
                          'lon': (p['lon'] as num).toDouble(),
                          'speed_kmh': ((p['speed_kmh'] as num?) ?? 0).toDouble(),
                        })
                    .toList(),
              });
            }
          }
        }
      } catch (_) {}

      // Cargar municipios de Antioquia para sellos en el video
      List<Map<String, dynamic>> munis = [];
      try {
        final muniRows = await _db
            .from('municipios')
            .select('nombre, subregion, lat, lon, puntos_sello');
        munis = List<Map<String, dynamic>>.from(muniRows.map((m) =>
          <String, dynamic>{
            'nombre': m['nombre'],
            'departamento': m['subregion'] ?? 'Antioquia',
            'lat': (m['lat'] as num).toDouble(),
            'lon': (m['lon'] as num).toDouble(),
            'puntos_sello': m['puntos_sello'] ?? 10,
          }
        ));
      } catch (_) {}

      // Verificar si ya existe un video generado para esta rodada
      String? existingVideo;
      try {
        final memberRow = await _db
            .from('members')
            .select('video_url')
            .eq('ride_id', widget.rideId)
            .eq('uid', uid)
            .maybeSingle();
        existingVideo = memberRow?['video_url'] as String?;
      } catch (_) {}

      if (mounted) {
        setState(() {
          _distanceKm = dist;
          _maxSpeedKmh = maxSpd;
          _photoCount = photos.length;
          _photoUrls = photos.map<String>((p) => p['url'] as String).toList();
          _photos = List<Map<String, dynamic>>.from(photos);
          _routePoints = routePts;
          _municipios = munis;
          _rideStartedAt = startedAt;
          _groupRiders = groupRiders;
          _loading = false;
          if (existingVideo != null && existingVideo.isNotEmpty) {
            _videoStatus = 'done';
            _videoUrl = existingVideo;
          }
        });
        // Guardar el resumen en la fila del member para el historial
        try {
          await _rideService.saveRideSummary(
            rideId: widget.rideId,
            distanceKm: dist,
            durationSeconds: widget.elapsed.inSeconds,
            maxSpeedKmh: maxSpd,
          );
        } catch (_) {}

        // Auto-trigger: si hay ruta y no hay video previo, generar automáticamente.
        // Mínimo 1 km: rodadas más cortas (pruebas, GPS sin arrancar) no
        // justifican ~15 min de render en el servidor.
        if (existingVideo == null && routePts.length >= 2 && dist >= 1.0) {
          _generateVideo();
        }
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

  Future<void> _generateVideo() async {
    setState(() { _videoStatus = 'rendering'; _videoError = null; _videoProgress = 0; });
    try {
      final url = await _videoService.renderVideo(
        rideId: widget.rideId,
        uid: _db.auth.currentUser?.id,
        rideName: widget.rideName,
        elapsed: _hms(widget.elapsed),
        distanceKm: _distanceKm.toStringAsFixed(1),
        maxSpeedKmh: _maxSpeedKmh.toStringAsFixed(0),
        photos: _photos,
        routePoints: _routePoints,
        municipios: _municipios,
        rideStartedAt: _rideStartedAt,
        groupRiders: _groupRiders,
        onProgress: (p) {
          if (mounted) setState(() { _videoProgress = p; });
        },
      );
      // Guardar la URL SIEMPRE, aunque el usuario ya haya salido de la
      // pantalla — el render tarda minutos y el video no puede perderse
      try { await _rideService.saveRideVideo(widget.rideId, url); } catch (_) {}
      if (!mounted) return;
      setState(() { _videoStatus = 'done'; _videoUrl = url; });
    } catch (e) {
      if (mounted) setState(() { _videoStatus = 'error'; _videoError = e.toString(); });
    }
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

                const SizedBox(height: 28),
                _videoButton(),

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

  Widget _videoButton() {
    switch (_videoStatus) {
      case 'idle':
        return SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _generateVideo,
            icon: const Icon(Icons.videocam_rounded),
            label: const Text('GENERAR VIDEO DE LA RODADA',
                style: TextStyle(fontSize: 14, letterSpacing: 1.5)),
            style: FilledButton.styleFrom(
              backgroundColor: RColors.brand,
              minimumSize: const Size(0, 56),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
          ),
        );
      case 'rendering':
        return Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: RColors.asphalt2,
            border: Border.all(color: RColors.line),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              SizedBox(width: 20, height: 20,
                  child: CircularProgressIndicator(color: RColors.brand, strokeWidth: 2)),
              const SizedBox(width: 14),
              const Text('Generando video…', style: TextStyle(color: RColors.ink, fontSize: 15)),
              const Spacer(),
              Text('$_videoProgress%',
                  style: const TextStyle(color: RColors.brand, fontSize: 15, fontWeight: FontWeight.w800)),
            ]),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: _videoProgress / 100,
                backgroundColor: RColors.asphalt,
                color: RColors.brand,
                minHeight: 6,
              ),
            ),
            const SizedBox(height: 10),
            const Text('Generando automáticamente tu video 1080p.\nPuedes salir — quedará guardado en Mis rodadas.',
                style: TextStyle(color: RColors.inkDim, fontSize: 12)),
          ]),
        );
      case 'done':
        return Column(children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF0d2b1a),
              border: Border.all(color: RColors.ok),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(children: [
              const Icon(Icons.check_circle, color: RColors.ok),
              const SizedBox(width: 10),
              const Expanded(child: Text('¡Video listo!',
                  style: TextStyle(color: RColors.ok, fontWeight: FontWeight.w700))),
            ]),
          ),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: () => launchUrl(Uri.parse(_videoUrl!),
                    mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.download_rounded),
                label: const Text('DESCARGAR',
                    style: TextStyle(fontSize: 13, letterSpacing: 1.2)),
                style: FilledButton.styleFrom(
                  backgroundColor: RColors.ok,
                  minimumSize: const Size(0, 52),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: _videoUrl!));
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Enlace copiado al portapapeles'),
                        duration: Duration(seconds: 2),
                      ),
                    );
                  }
                },
                icon: const Icon(Icons.link_rounded, color: RColors.brand),
                label: const Text('COMPARTIR',
                    style: TextStyle(fontSize: 13, letterSpacing: 1.2, color: RColors.brand)),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: RColors.brand),
                  minimumSize: const Size(0, 52),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ),
          ]),
        ]);
      default:
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFF2b0d0d),
            border: Border.all(color: RColors.sos),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(children: [
            const Icon(Icons.error_outline, color: RColors.sos),
            const SizedBox(width: 10),
            Expanded(child: Text(
                _videoError ?? 'Error generando el video. Intenta de nuevo.',
                style: const TextStyle(color: RColors.sos, fontSize: 11))),
            TextButton(
              onPressed: () => setState(() => _videoStatus = 'idle'),
              child: const Text('Reintentar', style: TextStyle(color: RColors.brand)),
            ),
          ]),
        );
    }
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
