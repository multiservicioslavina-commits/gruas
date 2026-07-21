import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart' as fm;
import 'package:flutter_map_tile_caching/flutter_map_tile_caching.dart';
import 'package:latlong2/latlong.dart' as ll;
import '../services/directions_service.dart';
import '../theme.dart';
import '../widgets/rita_fab.dart';

/// Pantalla para que el líder planee la ruta de la rodada.
/// Retorna un [PlannedRouteResult] cuando el usuario guarda, o null si cancela.
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

  final _waypoints = <_Waypoint>[
    _Waypoint(kind: _WpKind.origin),
    _Waypoint(kind: _WpKind.destination),
  ];

  DirectionsRoute? _route;
  bool _computing = false;
  int? _activeWaypoint;

  @override
  Widget build(BuildContext context) {
    final center = widget.initialCenter ?? const ll.LatLng(6.25, -75.57);
    return Scaffold(
      backgroundColor: RColors.asphalt,
      appBar: AppBar(
        backgroundColor: RColors.asphalt,
        foregroundColor: Colors.white,
        title: const Text('Planear ruta'),
        actions: const [],
      ),
      body: Column(
        children: [
          // ─── Lista de waypoints ─────────────────────────────────────
          Container(
            color: RColors.asphalt2,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Column(
              children: [
                for (int i = 0; i < _waypoints.length; i++)
                  _waypointRow(i),
                const SizedBox(height: 6),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: _addWaypoint,
                    icon: const Icon(Icons.add_location_alt_outlined,
                        color: RColors.brand, size: 20),
                    label: const Text('Agregar parada',
                        style: TextStyle(color: RColors.brand)),
                  ),
                ),
                if (_route != null)
                  Container(
                    margin: const EdgeInsets.only(top: 4),
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
                          style: const TextStyle(
                              color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
                      const SizedBox(width: 14),
                      const Icon(Icons.timer_outlined, color: RColors.brand, size: 18),
                      const SizedBox(width: 6),
                      Text('${_route!.durationMin} min',
                          style: const TextStyle(
                              color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
                      const SizedBox(width: 14),
                      const Icon(Icons.alt_route, color: RColors.brand, size: 18),
                      const SizedBox(width: 6),
                      Text('${_route!.steps.length} maniobras',
                          style: const TextStyle(color: RColors.ink, fontSize: 13)),
                    ]),
                  ),
                if (_activeWaypoint != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      '👆 Toca el mapa para fijar el punto',
                      style: TextStyle(color: RColors.brand, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ),
                if (_computing)
                  const Padding(
                    padding: EdgeInsets.only(top: 6),
                    child: LinearProgressIndicator(
                        color: RColors.brand, backgroundColor: RColors.line, minHeight: 2),
                  ),
              ],
            ),
          ),

          // ─── Mapa con la ruta ───────────────────────────────────
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
                if (_route != null)
                  fm.PolylineLayer(
                    polylines: [
                      fm.Polyline(
                        points: _route!.polyline
                            .map((p) => ll.LatLng(p.lat, p.lon))
                            .toList(),
                        color: const Color(0xFF3B82F6),
                        strokeWidth: 5,
                      ),
                    ],
                  ),
                fm.MarkerLayer(markers: _buildMarkers()),
              ],
            ),
          ),

          // ─── Botón confirmar ruta ──────────────────────────────
          if (_route != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              color: RColors.asphalt,
              child: FilledButton.icon(
                onPressed: _save,
                icon: const Icon(Icons.check_circle),
                label: const Text('CONFIRMAR RUTA',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: 1.5)),
                style: FilledButton.styleFrom(
                  backgroundColor: RColors.brand,
                  minimumSize: const Size(0, 56),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ─── UI helpers ────────────────────────────────────────────

  Widget _waypointRow(int i) {
    final wp = _waypoints[i];
    final isOrigin = i == 0;
    final isDest = i == _waypoints.length - 1;
    final icon = isOrigin
        ? Icons.trip_origin
        : isDest
            ? Icons.flag
            : Icons.circle_outlined;
    final iconColor = isOrigin
        ? const Color(0xFF4ade80)
        : isDest
            ? RColors.brand
            : Colors.white70;
    final hint = isOrigin
        ? 'Origen'
        : isDest
            ? 'Destino'
            : 'Parada intermedia';
    final isActive = _activeWaypoint == i;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        GestureDetector(
          onTap: () => setState(() => _activeWaypoint = isActive ? null : i),
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: isActive ? BoxDecoration(
              border: Border.all(color: RColors.brand, width: 2),
              borderRadius: BorderRadius.circular(8),
            ) : null,
            child: Icon(icon, color: isActive ? RColors.brand : iconColor, size: 20),
          ),
        ),
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
            onPressed: () => _removeWaypoint(i),
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
      final color = isOrigin
          ? const Color(0xFF4ade80)
          : isDest
              ? RColors.brand
              : Colors.white;
      markers.add(fm.Marker(
        point: ll.LatLng(wp.lat!, wp.lon!),
        width: 40,
        height: 40,
        child: Icon(
          isDest ? Icons.flag : Icons.circle,
          color: color,
          size: 32,
          shadows: const [Shadow(color: Colors.black87, blurRadius: 4)],
        ),
      ));
    }
    return markers;
  }

  // ─── State handling ────────────────────────────────────────

  void _onMapTap(ll.LatLng point) async {
    int target;
    if (_activeWaypoint != null) {
      target = _activeWaypoint!;
    } else {
      final empty = _waypoints.indexWhere((w) => w.lat == null);
      if (empty == -1) return;
      target = empty;
    }
    setState(() => _activeWaypoint = null);
    final result = await _dir.reverseGeocode(point.latitude, point.longitude);
    final label = result?.placeName ?? '${point.latitude.toStringAsFixed(4)}, ${point.longitude.toStringAsFixed(4)}';
    _setWaypoint(target, GeocodeResult(
      placeName: label,
      name: result?.name ?? label,
      lat: point.latitude,
      lon: point.longitude,
    ));
  }

  void _addWaypoint() {
    setState(() {
      _waypoints.insert(_waypoints.length - 1,
          _Waypoint(kind: _WpKind.stop));
    });
  }

  void _removeWaypoint(int i) {
    setState(() {
      _waypoints.removeAt(i);
      _route = null;
    });
    _compute();
  }

  void _setWaypoint(int i, GeocodeResult r) {
    setState(() {
      _waypoints[i] = _Waypoint(
        kind: _waypoints[i].kind,
        label: r.placeName,
        lat: r.lat,
        lon: r.lon,
      );
    });
    _mapCtrl.move(ll.LatLng(r.lat, r.lon), 12);
    _compute();
  }

  Future<void> _compute() async {
    final points = _waypoints
        .where((w) => w.lat != null && w.lon != null)
        .map((w) => LatLng(w.lat!, w.lon!))
        .toList();
    if (points.length < 2) {
      setState(() => _route = null);
      return;
    }
    setState(() => _computing = true);
    try {
      final r = await _dir.route(points);
      if (!mounted) return;
      setState(() {
        _route = r;
        _computing = false;
      });
      if (r != null) {
        _fitBounds(r.polyline);
      }
    } catch (_) {
      if (mounted) setState(() => _computing = false);
    }
  }

  void _fitBounds(List<LatLng> pts) {
    if (pts.isEmpty) return;
    final llPts = pts.map((p) => ll.LatLng(p.lat, p.lon)).toList();
    final bounds = fm.LatLngBounds.fromPoints(llPts);
    _mapCtrl.fitCamera(fm.CameraFit.bounds(
      bounds: bounds,
      padding: const EdgeInsets.all(60),
      maxZoom: 15,
    ));
  }

  void _save() {
    if (_route == null) return;
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
}

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

// ─── Campo de texto con autocompletado ──────────────────────

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
  bool _showSuggestions = false;
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
                  leading: const Icon(Icons.location_on,
                      color: RColors.brand, size: 18),
                  title: Text(r.name,
                      style: const TextStyle(color: Colors.white, fontSize: 13)),
                  subtitle: Text(r.placeName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
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
