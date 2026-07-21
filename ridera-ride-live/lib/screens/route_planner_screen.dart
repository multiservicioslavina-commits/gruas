import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart' as fm;
import 'package:flutter_map_tile_caching/flutter_map_tile_caching.dart';
import 'package:latlong2/latlong.dart' as ll;
import '../services/directions_service.dart';
import '../theme.dart';

class RoutePlannerScreen extends StatefulWidget {
  const RoutePlannerScreen({super.key, this.initialCenter});
  final ll.LatLng? initialCenter;

  @override
  State<RoutePlannerScreen> createState() => _RoutePlannerScreenState();
}

class _RoutePlannerScreenState extends State<RoutePlannerScreen> {
  final _dir = DirectionsService();
  final _mapCtrl = fm.MapController();
  final _tileProvider = FMTCTileProvider(
    stores: const {'mapStore': BrowseStoreStrategy.readUpdateCreate},
  );

  // Waypoints: origin + destination + optional stops
  final _waypoints = <_Waypoint>[
    _Waypoint(kind: _WpKind.origin),
    _Waypoint(kind: _WpKind.destination),
  ];

  DirectionsRoute? _route;
  bool _computing = false;
  bool _showRoute = false;
  bool _downloadingTiles = false;
  double _tileProgress = 0;
  int _tilesDownloaded = 0;

  @override
  Widget build(BuildContext context) {
    final center = widget.initialCenter ?? const ll.LatLng(6.25, -75.57);
    final hasOrigin = _waypoints.first.lat != null;
    final hasDest = _waypoints.last.lat != null;
    final canStart = hasOrigin && hasDest;

    return Scaffold(
      backgroundColor: RColors.asphalt,
      appBar: AppBar(
        backgroundColor: RColors.asphalt,
        foregroundColor: Colors.white,
        title: const Text('Planear ruta'),
      ),
      body: Column(
        children: [
          // ─── Campos de búsqueda ────────────────────────────────
          Container(
            color: RColors.asphalt2,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Column(
              children: [
                for (int i = 0; i < _waypoints.length; i++)
                  _waypointRow(i),
                const SizedBox(height: 4),
                Row(
                  children: [
                    TextButton.icon(
                      onPressed: _addStop,
                      icon: const Icon(Icons.add_location_alt_outlined,
                          color: RColors.brand, size: 18),
                      label: const Text('Agregar parada',
                          style: TextStyle(color: RColors.brand, fontSize: 13)),
                    ),
                  ],
                ),
                if (_showRoute && _route != null)
                  _routeInfoBar(),
                if (_computing || _downloadingTiles)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Column(children: [
                      LinearProgressIndicator(
                        value: _downloadingTiles ? _tileProgress : null,
                        color: RColors.brand, backgroundColor: RColors.line, minHeight: 2,
                      ),
                      if (_downloadingTiles)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            'Descargando mapa offline… $_tilesDownloaded tiles',
                            style: const TextStyle(color: RColors.inkDim, fontSize: 11),
                          ),
                        ),
                    ]),
                  ),
              ],
            ),
          ),

          // ─── Mapa ──────────────────────────────────────────────
          Expanded(
            child: fm.FlutterMap(
              mapController: _mapCtrl,
              options: fm.MapOptions(
                initialCenter: center,
                initialZoom: 11,
                onTap: (_, point) => _onMapTap(point),
              ),
              children: [
                fm.TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'co.ridera.ridelive',
                  tileProvider: _tileProvider,
                ),
                if (_showRoute && _route != null)
                  fm.PolylineLayer(polylines: [
                    fm.Polyline(
                      points: _route!.polyline
                          .map((p) => ll.LatLng(p.lat, p.lon))
                          .toList(),
                      color: const Color(0xFF3B82F6),
                      strokeWidth: 5,
                    ),
                  ]),
                fm.MarkerLayer(markers: _buildMarkers()),
              ],
            ),
          ),

          // ─── Botón principal ───────────────────────────────────
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
            color: RColors.asphalt,
            child: _showRoute && _route != null
                ? FilledButton.icon(
                    onPressed: _downloadingTiles ? null : _confirm,
                    icon: Icon(_downloadingTiles ? Icons.download : Icons.check_circle),
                    label: Text(
                      _downloadingTiles ? 'DESCARGANDO MAPA…' : 'CONFIRMAR RUTA',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: 1.5),
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF4ade80),
                      disabledBackgroundColor: RColors.asphalt2,
                      disabledForegroundColor: RColors.inkDim,
                      foregroundColor: Colors.black,
                      minimumSize: const Size(0, 56),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  )
                : FilledButton.icon(
                    onPressed: canStart && !_computing ? _startRoute : null,
                    icon: const Icon(Icons.navigation_rounded),
                    label: const Text('INICIAR RUTA',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: 1.5)),
                    style: FilledButton.styleFrom(
                      backgroundColor: RColors.brand,
                      disabledBackgroundColor: RColors.asphalt2,
                      disabledForegroundColor: RColors.inkDim,
                      minimumSize: const Size(0, 56),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  // ─── Route info bar ────────────────────────────────────────

  Widget _routeInfoBar() => Container(
    margin: const EdgeInsets.only(top: 6),
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
    decoration: BoxDecoration(
      color: RColors.brand.withValues(alpha: 0.15),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: RColors.brand.withValues(alpha: 0.4)),
    ),
    child: Row(children: [
      const Icon(Icons.straighten, color: RColors.brand, size: 18),
      const SizedBox(width: 6),
      Text('${_route!.distanceKm.toStringAsFixed(1)} km',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
      const SizedBox(width: 14),
      const Icon(Icons.timer_outlined, color: RColors.brand, size: 18),
      const SizedBox(width: 6),
      Text('${_route!.durationMin} min',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
    ]),
  );

  // ─── Waypoint row ──────────────────────────────────────────

  Widget _waypointRow(int i) {
    final wp = _waypoints[i];
    final isOrigin = i == 0;
    final isDest = i == _waypoints.length - 1;
    final icon = isOrigin ? Icons.trip_origin : isDest ? Icons.flag : Icons.circle_outlined;
    final iconColor = isOrigin ? const Color(0xFF4ade80) : isDest ? RColors.brand : Colors.white70;
    final hint = isOrigin ? '¿De dónde sales?' : isDest ? '¿A dónde vas?' : 'Parada intermedia';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Icon(icon, color: iconColor, size: 20),
        const SizedBox(width: 8),
        Expanded(child: _WaypointField(
          key: ValueKey('wp_$i'),
          hint: hint,
          initial: wp.label,
          onSelected: (r) => _setWaypoint(i, r),
        )),
        if (!isOrigin && !isDest)
          IconButton(
            icon: const Icon(Icons.close, color: RColors.inkDim, size: 18),
            onPressed: () => _removeStop(i),
          ),
      ]),
    );
  }

  List<fm.Marker> _buildMarkers() {
    final markers = <fm.Marker>[];
    for (int i = 0; i < _waypoints.length; i++) {
      final wp = _waypoints[i];
      if (wp.lat == null || wp.lon == null) continue;
      final isOrigin = i == 0;
      final isDest = i == _waypoints.length - 1;
      final color = isOrigin ? const Color(0xFF4ade80) : isDest ? RColors.brand : Colors.white;
      markers.add(fm.Marker(
        point: ll.LatLng(wp.lat!, wp.lon!),
        width: 40, height: 40,
        child: Icon(isDest ? Icons.flag : Icons.circle, color: color, size: 32,
            shadows: const [Shadow(color: Colors.black87, blurRadius: 4)]),
      ));
    }
    return markers;
  }

  // ─── Actions ───────────────────────────────────────────────

  void _onMapTap(ll.LatLng point) async {
    final empty = _waypoints.indexWhere((w) => w.lat == null);
    if (empty == -1) return;
    final result = await _dir.reverseGeocode(point.latitude, point.longitude);
    final label = result?.placeName ?? '${point.latitude.toStringAsFixed(4)}, ${point.longitude.toStringAsFixed(4)}';
    _setWaypoint(empty, GeocodeResult(
      placeName: label,
      name: result?.name ?? label,
      lat: point.latitude,
      lon: point.longitude,
    ));
  }

  void _setWaypoint(int i, GeocodeResult r) {
    setState(() {
      _waypoints[i] = _Waypoint(kind: _waypoints[i].kind, label: r.placeName, lat: r.lat, lon: r.lon);
      _showRoute = false;
      _route = null;
    });
    _mapCtrl.move(ll.LatLng(r.lat, r.lon), 12);
  }

  void _addStop() {
    setState(() {
      _waypoints.insert(_waypoints.length - 1, _Waypoint(kind: _WpKind.stop));
      _showRoute = false;
    });
  }

  void _removeStop(int i) {
    setState(() {
      _waypoints.removeAt(i);
      _showRoute = false;
      _route = null;
    });
  }

  Future<void> _startRoute() async {
    final points = _waypoints
        .where((w) => w.lat != null && w.lon != null)
        .map((w) => LatLng(w.lat!, w.lon!))
        .toList();
    if (points.length < 2) return;
    setState(() => _computing = true);
    try {
      final r = await _dir.route(points);
      if (!mounted) return;
      setState(() {
        _route = r;
        _computing = false;
        _showRoute = r != null;
      });
      if (r != null) {
        final llPts = r.polyline.map((p) => ll.LatLng(p.lat, p.lon)).toList();
        final bounds = fm.LatLngBounds.fromPoints(llPts);
        _mapCtrl.fitCamera(fm.CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(60), maxZoom: 15));
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('No se encontró ruta. Verifica los puntos.'), backgroundColor: RColors.sos),
          );
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() => _computing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error al calcular la ruta. Intenta de nuevo.'), backgroundColor: RColors.sos),
        );
      }
    }
  }

  Future<void> _confirm() async {
    if (_route == null) return;

    // Download tiles along the route for offline use
    await _downloadRouteTiles(_route!);

    if (!mounted) return;
    final origin = _waypoints.first;
    final dest = _waypoints.last;
    Navigator.of(context).pop(PlannedRouteResult(
      route: _route!,
      originName: origin.label,
      destinationName: dest.label,
      originLat: origin.lat!,
      originLon: origin.lon!,
      destinationLat: dest.lat!,
      destinationLon: dest.lon!,
    ));
  }

  Future<void> _downloadRouteTiles(DirectionsRoute route) async {
    if (route.polyline.isEmpty) return;
    setState(() {
      _downloadingTiles = true;
      _tileProgress = 0;
      _tilesDownloaded = 0;
    });

    try {
      final store = const FMTCStore('mapStore');

      // Build a bounding box around the route with padding
      double minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
      for (final p in route.polyline) {
        minLat = math.min(minLat, p.lat);
        maxLat = math.max(maxLat, p.lat);
        minLon = math.min(minLon, p.lon);
        maxLon = math.max(maxLon, p.lon);
      }
      // Add ~2km padding
      const pad = 0.02;
      minLat -= pad;
      maxLat += pad;
      minLon -= pad;
      maxLon += pad;

      final region = RectangleRegion(
        fm.LatLngBounds(
          ll.LatLng(minLat, minLon),
          ll.LatLng(maxLat, maxLon),
        ),
      );

      final downloadable = region.toDownloadable(
        minZoom: 10,
        maxZoom: 15,
        options: fm.TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'co.ridera.ridelive',
        ),
      );

      final (:downloadProgress, :tileEvents) = store.download.startForeground(
        region: downloadable,
        parallelThreads: 5,
        maxBufferLength: 200,
        skipExistingTiles: true,
      );

      await downloadProgress.listen((progress) {
        if (mounted) {
          setState(() {
            _tilesDownloaded = progress.attemptedTilesCount;
            _tileProgress = progress.percentageProgress / 100;
          });
        }
      }).asFuture();
    } catch (_) {
      // If download fails, continue anyway — tiles will load online
    }

    if (mounted) {
      setState(() => _downloadingTiles = false);
    }
  }
}

// ─── Models ──────────────────────────────────────────────────

enum _WpKind { origin, stop, destination }

class _Waypoint {
  _Waypoint({required this.kind, this.label = '', this.lat, this.lon});
  final _WpKind kind;
  String label;
  double? lat;
  double? lon;
}

class PlannedRouteResult {
  final DirectionsRoute route;
  final String originName;
  final String destinationName;
  final double originLat;
  final double originLon;
  final double destinationLat;
  final double destinationLon;
  const PlannedRouteResult({
    required this.route,
    required this.originName,
    required this.destinationName,
    required this.originLat,
    required this.originLon,
    required this.destinationLat,
    required this.destinationLon,
  });
}

// ─── Campo de búsqueda con autocompletado ────────────────────

class _WaypointField extends StatefulWidget {
  const _WaypointField({
    super.key,
    required this.hint,
    required this.initial,
    required this.onSelected,
  });
  final String hint;
  final String initial;
  final ValueChanged<GeocodeResult> onSelected;

  @override
  State<_WaypointField> createState() => _WaypointFieldState();
}

class _WaypointFieldState extends State<_WaypointField> {
  final _ctrl = TextEditingController();
  final _dir = DirectionsService();
  final _focus = FocusNode();
  Timer? _debounce;
  List<GeocodeResult> _suggestions = [];
  final _layerLink = LayerLink();
  OverlayEntry? _overlayEntry;

  @override
  void initState() {
    super.initState();
    _ctrl.text = widget.initial;
    _focus.addListener(() {
      if (!_focus.hasFocus) _hideOverlay();
    });
  }

  @override
  void didUpdateWidget(covariant _WaypointField old) {
    super.didUpdateWidget(old);
    if (widget.initial != old.initial && widget.initial != _ctrl.text) {
      _ctrl.text = widget.initial;
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    _focus.dispose();
    _hideOverlay();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return CompositedTransformTarget(
      link: _layerLink,
      child: TextField(
        controller: _ctrl,
        focusNode: _focus,
        style: const TextStyle(color: Colors.white, fontSize: 14),
        decoration: InputDecoration(
          hintText: widget.hint,
          hintStyle: const TextStyle(color: RColors.inkDim, fontSize: 14),
          filled: true,
          fillColor: RColors.asphalt,
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide.none),
          suffixIcon: _ctrl.text.isEmpty
              ? null
              : IconButton(
                  padding: EdgeInsets.zero,
                  icon: const Icon(Icons.clear, size: 16, color: RColors.inkDim),
                  onPressed: () {
                    _ctrl.clear();
                    _hideOverlay();
                    setState(() {});
                  },
                ),
        ),
        onChanged: (q) {
          _debounce?.cancel();
          _debounce = Timer(const Duration(milliseconds: 350), () async {
            final results = await _dir.geocode(q);
            _suggestions = results;
            _showOverlay();
          });
          setState(() {});
        },
      ),
    );
  }

  void _showOverlay() {
    _hideOverlay();
    if (_suggestions.isEmpty || !_focus.hasFocus) return;
    final overlay = Overlay.of(context);
    _overlayEntry = OverlayEntry(builder: (_) => Positioned(
      width: MediaQuery.of(context).size.width - 60,
      child: CompositedTransformFollower(
        link: _layerLink,
        offset: const Offset(0, 44),
        showWhenUnlinked: false,
        child: Material(
          color: RColors.asphalt2,
          elevation: 8,
          borderRadius: BorderRadius.circular(10),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 240),
            child: ListView.builder(
              padding: EdgeInsets.zero,
              shrinkWrap: true,
              itemCount: _suggestions.length,
              itemBuilder: (_, i) {
                final r = _suggestions[i];
                return ListTile(
                  dense: true,
                  leading: const Icon(Icons.location_on, color: RColors.brand, size: 18),
                  title: Text(r.name,
                      style: const TextStyle(color: Colors.white, fontSize: 13)),
                  subtitle: Text(r.placeName,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: RColors.inkDim, fontSize: 11)),
                  onTap: () {
                    _ctrl.text = r.placeName;
                    widget.onSelected(r);
                    _focus.unfocus();
                    _hideOverlay();
                  },
                );
              },
            ),
          ),
        ),
      ),
    ));
    overlay.insert(_overlayEntry!);
  }

  void _hideOverlay() {
    _overlayEntry?.remove();
    _overlayEntry = null;
  }
}
