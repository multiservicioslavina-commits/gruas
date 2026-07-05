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

  // Totales acumulados para el header
  double get _totalKm => _rides.fold(0, (s, r) =>
      s + ((r['distance_km'] as num?)?.toDouble() ?? 0));
  int get _totalSeconds => _rides.fold(0, (s, r) =>
      s + ((r['duration_seconds'] as num?)?.toInt() ?? 0));
  double get _bestSpeed => _rides.fold(0.0, (m, r) {
    final v = (r['max_speed_kmh'] as num?)?.toDouble() ?? 0;
    return v > m ? v : m;
  });

  String _hTotal(int seconds) {
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    if (h == 0) return '${m}min';
    return '${h}h ${m}m';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: RColors.asphalt,
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: RColors.brand))
          : _rides.isEmpty
              ? _emptyState()
              : CustomScrollView(
                  slivers: [
                    _header(),
                    _statsBar(),
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                      sliver: SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (_, i) => Padding(
                            padding: const EdgeInsets.only(bottom: 20),
                            child: _DiaryEntry(
                              data: _rides[i],
                              index: _rides.length - i,
                              rideService: _rideService,
                            ),
                          ),
                          childCount: _rides.length,
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }

  SliverAppBar _header() => SliverAppBar(
        expandedHeight: 160,
        pinned: true,
        backgroundColor: RColors.asphalt,
        surfaceTintColor: Colors.transparent,
        flexibleSpace: FlexibleSpaceBar(
          background: Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF1a0a00), RColors.asphalt],
              ),
            ),
            padding: const EdgeInsets.fromLTRB(20, 60, 20, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Row(children: [
                  const Text('🏍', style: TextStyle(fontSize: 22)),
                  const SizedBox(width: 10),
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('MIS RODADAS',
                        style: TextStyle(
                            color: RColors.brand,
                            fontSize: 11,
                            letterSpacing: 4,
                            fontWeight: FontWeight.w700)),
                    Text('${_rides.length} ${_rides.length == 1 ? "aventura" : "aventuras"} registradas',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.w900)),
                  ]),
                ]),
              ],
            ),
          ),
        ),
        title: const Text('Mis Rodadas',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
      );

  SliverToBoxAdapter _statsBar() => SliverToBoxAdapter(
        child: Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 4),
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 12),
          decoration: BoxDecoration(
            color: RColors.asphalt2,
            border: Border.all(color: RColors.line),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(children: [
            _totalStat('${_totalKm.toStringAsFixed(0)} km', 'Total recorrido', Icons.route),
            _divider(),
            _totalStat(_hTotal(_totalSeconds), 'En la moto', Icons.schedule),
            _divider(),
            _totalStat('${_bestSpeed.toStringAsFixed(0)} km/h', 'Vel. récord', Icons.flash_on),
          ]),
        ),
      );

  Widget _totalStat(String val, String lbl, IconData icon) => Expanded(
        child: Column(children: [
          Icon(icon, color: RColors.brand, size: 18),
          const SizedBox(height: 4),
          Text(val,
              style: const TextStyle(
                  color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800)),
          Text(lbl,
              style: const TextStyle(
                  color: RColors.inkDim, fontSize: 10, letterSpacing: 0.5)),
        ]),
      );

  Widget _divider() => Container(width: 1, height: 36, color: RColors.line);

  Widget _emptyState() => Center(
        child: Padding(
          padding: const EdgeInsets.all(40),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: RColors.brand.withValues(alpha: 0.1),
                border: Border.all(color: RColors.brand.withValues(alpha: 0.3), width: 2),
              ),
              child: const Icon(Icons.motorcycle, size: 48, color: RColors.brand),
            ),
            const SizedBox(height: 24),
            const Text('Tu diario de aventuras\nestá vacío',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800,
                    height: 1.3)),
            const SizedBox(height: 12),
            const Text(
                'Cada rodada que termines quedará aquí\ncomo un recuerdo que puedes revivir.',
                textAlign: TextAlign.center,
                style: TextStyle(color: RColors.inkDim, fontSize: 14, height: 1.5)),
            const SizedBox(height: 32),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              decoration: BoxDecoration(
                border: Border.all(color: RColors.brand),
                borderRadius: BorderRadius.circular(30),
              ),
              child: const Text('Sal a rodar y vuelve aquí 🏍',
                  style: TextStyle(color: RColors.brand, fontWeight: FontWeight.w700)),
            ),
          ]),
        ),
      );
}

// ──────────────────────────────────────────────────────────────────────────────
// Entrada del diario — cada rodada
// ──────────────────────────────────────────────────────────────────────────────
class _DiaryEntry extends StatefulWidget {
  const _DiaryEntry({
    required this.data,
    required this.index,
    required this.rideService,
  });
  final Map<String, dynamic> data;
  final int index;
  final RideService rideService;

  @override
  State<_DiaryEntry> createState() => _DiaryEntryState();
}

class _DiaryEntryState extends State<_DiaryEntry> {
  List<String> _photos = [];
  bool _photosLoaded = false;

  @override
  void initState() {
    super.initState();
    _loadPhotos();
  }

  Future<void> _loadPhotos() async {
    try {
      final rideId = widget.data['ride_id'] as String;
      final urls = await widget.rideService.getRidePhotoUrls(rideId);
      if (mounted) setState(() { _photos = urls; _photosLoaded = true; });
    } catch (_) {
      if (mounted) setState(() => _photosLoaded = true);
    }
  }

  String _fechaCompleta(String? iso) {
    if (iso == null) return '';
    final d = DateTime.tryParse(iso)?.toLocal();
    if (d == null) return '';
    const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                   'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return '${dias[d.weekday - 1]}, ${d.day} de ${meses[d.month - 1]} ${d.year}';
  }

  String _hms(int seconds) {
    if (seconds <= 0) return '—';
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    if (h > 0) return '${h}h ${m}m';
    return '${m}min';
  }

  @override
  Widget build(BuildContext context) {
    final ride = widget.data['rides'] as Map<String, dynamic>? ?? {};
    final nombre = ride['nombre'] as String? ?? 'Rodada';
    final createdAt = ride['created_at'] as String?;
    final rideId = widget.data['ride_id'] as String;
    final rol = widget.data['rol'] as String? ?? 'rider';
    final distance = (widget.data['distance_km'] as num?)?.toDouble() ?? 0;
    final duration = (widget.data['duration_seconds'] as num?)?.toInt() ?? 0;
    final maxSpeed = (widget.data['max_speed_kmh'] as num?)?.toDouble() ?? 0;
    final videoUrl = widget.data['video_url'] as String?;
    final hasVideo = videoUrl != null && videoUrl.isNotEmpty;
    final heroPhoto = _photos.isNotEmpty ? _photos.first : null;

    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => RideSummaryScreen(
            rideId: rideId,
            rideName: nombre,
            elapsed: Duration(seconds: duration),
          ),
        ),
      ),
      child: Container(
        decoration: BoxDecoration(
          color: RColors.asphalt2,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: RColors.line),
        ),
        clipBehavior: Clip.hardEdge,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Hero image o placeholder ──────────────────────────
            _heroSection(heroPhoto, nombre, rol, widget.index),

            // ── Cuerpo ────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Fecha estilo diario
                  Row(children: [
                    const Icon(Icons.calendar_today_outlined,
                        size: 12, color: RColors.brand),
                    const SizedBox(width: 6),
                    Text(_fechaCompleta(createdAt),
                        style: const TextStyle(
                            color: RColors.brand,
                            fontSize: 11,
                            letterSpacing: 1,
                            fontWeight: FontWeight.w600)),
                  ]),
                  const SizedBox(height: 8),

                  // Nombre de la rodada
                  Text(nombre,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          height: 1.2)),
                  const SizedBox(height: 16),

                  // Stats en fila
                  Row(children: [
                    _stat(Icons.straighten, '${distance.toStringAsFixed(1)} km', 'distancia'),
                    const SizedBox(width: 8),
                    _stat(Icons.schedule, _hms(duration), 'tiempo'),
                    const SizedBox(width: 8),
                    _stat(Icons.speed, '${maxSpeed.toStringAsFixed(0)} km/h', 'vel. máx'),
                  ]),

                  // Strip de fotos adicionales
                  if (_photosLoaded && _photos.length > 1) ...[
                    const SizedBox(height: 14),
                    _photoStrip(),
                  ],

                  // Botones de acción
                  const SizedBox(height: 16),
                  Row(children: [
                    // Ver detalle
                    Expanded(
                      child: _actionBtn(
                        icon: Icons.map_outlined,
                        label: 'Ver detalle',
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => RideSummaryScreen(
                              rideId: rideId,
                              rideName: nombre,
                              elapsed: Duration(seconds: duration),
                            ),
                          ),
                        ),
                        filled: false,
                      ),
                    ),
                    if (hasVideo) ...[
                      const SizedBox(width: 10),
                      Expanded(
                        child: _actionBtn(
                          icon: Icons.play_circle_filled,
                          label: 'Ver video',
                          onTap: () => launchUrl(
                              Uri.parse(videoUrl),
                              mode: LaunchMode.externalApplication),
                          filled: true,
                        ),
                      ),
                    ],
                  ]),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _heroSection(String? photoUrl, String nombre, String rol, int index) {
    final colors = [
      [const Color(0xFF1a0a00), const Color(0xFF3d1500)],
      [const Color(0xFF0a001a), const Color(0xFF1a003d)],
      [const Color(0xFF001a0a), const Color(0xFF003d1a)],
      [const Color(0xFF1a1500), const Color(0xFF3d2d00)],
    ];
    final colorPair = colors[index % colors.length];

    return SizedBox(
      height: 180,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Foto o gradiente
          if (photoUrl != null)
            Image.network(
              photoUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => _gradientBg(colorPair),
            )
          else
            _gradientBg(colorPair),

          // Overlay oscuro
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.transparent,
                  Colors.black.withValues(alpha: 0.75),
                ],
              ),
            ),
          ),

          // Número de entrada
          Positioned(
            top: 14,
            left: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: RColors.brand.withValues(alpha: 0.6)),
              ),
              child: Text('#$index',
                  style: const TextStyle(
                      color: RColors.brand,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1)),
            ),
          ),

          // Badge líder
          if (rol == 'lider')
            Positioned(
              top: 14,
              right: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: RColors.brand,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text('👑 LÍDER',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1)),
              ),
            ),

          // Icono de moto si no hay foto
          if (photoUrl == null)
            const Center(
              child: Icon(Icons.motorcycle, size: 56,
                  color: Color(0x33E85D20)),
            ),
        ],
      ),
    );
  }

  Widget _gradientBg(List<Color> colors) => Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: colors,
          ),
        ),
      );

  Widget _stat(IconData icon, String val, String lbl) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
          decoration: BoxDecoration(
            color: RColors.asphalt3,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(children: [
            Icon(icon, color: RColors.brand, size: 16),
            const SizedBox(height: 4),
            Text(val,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w800)),
            Text(lbl,
                style: const TextStyle(
                    color: RColors.inkDim, fontSize: 9, letterSpacing: 0.5)),
          ]),
        ),
      );

  Widget _photoStrip() => SizedBox(
        height: 56,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: _photos.length - 1, // la primera ya es el hero
          separatorBuilder: (_, __) => const SizedBox(width: 6),
          itemBuilder: (_, i) => ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.network(
              _photos[i + 1],
              width: 56,
              height: 56,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                width: 56,
                height: 56,
                color: RColors.asphalt3,
                child: const Icon(Icons.broken_image,
                    size: 20, color: RColors.inkDim),
              ),
            ),
          ),
        ),
      );

  Widget _actionBtn({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    required bool filled,
  }) =>
      GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 11),
          decoration: BoxDecoration(
            color: filled ? RColors.brand : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
                color: filled ? RColors.brand : RColors.line),
          ),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon,
                size: 16,
                color: filled ? Colors.white : RColors.inkDim),
            const SizedBox(width: 6),
            Text(label,
                style: TextStyle(
                    color: filled ? Colors.white : RColors.inkDim,
                    fontSize: 13,
                    fontWeight: FontWeight.w700)),
          ]),
        ),
      );
}
