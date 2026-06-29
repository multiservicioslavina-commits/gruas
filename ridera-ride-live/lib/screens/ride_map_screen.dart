import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/location_service.dart';
import '../services/ride_service.dart';
import '../services/ride_status.dart';
import '../widgets/rider_marker.dart';

class RideMapScreen extends StatefulWidget {
  const RideMapScreen({
    super.key,
    required this.rideId,
    required this.isLider,
  });

  final String rideId;
  final bool isLider;

  @override
  State<RideMapScreen> createState() => _RideMapScreenState();
}

class _RideMapScreenState extends State<RideMapScreen> {
  final _rideService = RideService();
  final _locationService = LocationService();
  final _mapCtrl = MapController();

  Map<String, _RiderData> _riders = {};
  RealtimeChannel? _channel;
  Timer? _statusTimer;
  bool _centered = true;

  String get _uid => Supabase.instance.client.auth.currentUser!.id;

  @override
  void initState() {
    super.initState();
    _startTracking();
    _loadMembers();
    _subscribeRealtime();
    _statusTimer = Timer.periodic(
        const Duration(seconds: 1), (_) => _recalcStatus());
  }

  Future<void> _startTracking() async {
    await _locationService.start(rideId: widget.rideId, uid: _uid);
  }

  Future<void> _loadMembers() async {
    try {
      final members = await _rideService.getMembers(widget.rideId);
      setState(() {
        for (final m in members) {
          _riders[m['uid']] = _RiderData.fromMap(m);
        }
      });
      _fitBounds();
    } catch (_) {}
  }

  void _subscribeRealtime() {
    _channel = _rideService.subscribeMembersRealtime(
      widget.rideId,
      (record) {
        if (record.isEmpty) return;
        setState(() {
          _riders[record['uid']] = _RiderData.fromMap(record);
        });
        if (_centered) _fitBounds();
      },
    );
  }

  void _recalcStatus() {
    bool changed = false;
    for (final r in _riders.values) {
      final newStatus = memberStatus(
        lastSeen: r.lastSeen,
        speedKmh: r.speedKmh,
      );
      if (r.status != newStatus) {
        r.status = newStatus;
        changed = true;
      }
    }
    if (changed) setState(() {});
  }

  void _fitBounds() {
    final pts = _riders.values
        .where((r) => r.lat != null && r.lon != null)
        .map((r) => LatLng(r.lat!, r.lon!))
        .toList();
    if (pts.isEmpty) return;

    if (pts.length == 1) {
      _mapCtrl.move(pts.first, 15);
      return;
    }

    final bounds = LatLngBounds.fromPoints(pts);
    _mapCtrl.fitCamera(
      CameraFit.bounds(
        bounds: bounds,
        padding: const EdgeInsets.all(60),
        maxZoom: 17,
      ),
    );
  }

  Future<void> _endRide() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF1a1a1a),
        title: const Text('Finalizar rodada',
            style: TextStyle(color: Colors.white)),
        content: const Text(
            '¿Seguro que quieres terminar la rodada para todos?',
            style: TextStyle(color: Color(0xFFe6e3de))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('No',
                style: TextStyle(color: Color(0xFFe6e3de))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sí, finalizar',
                style: TextStyle(color: Color(0xFFE85D20))),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await _rideService.endRide(widget.rideId);
      await _locationService.stop();
      if (mounted) Navigator.of(context).pop();
    }
  }

  Future<void> _leave() async {
    await _rideService.leaveRide(widget.rideId);
    await _locationService.stop();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  void dispose() {
    _channel?.unsubscribe();
    _statusTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final markers = _riders.values
        .where((r) => r.lat != null && r.lon != null)
        .map((r) => riderMarker(
              position: LatLng(r.lat!, r.lon!),
              nombre: r.nombre,
              status: r.status,
              speedKmh: r.speedKmh,
              isMe: r.uid == _uid,
              isLider: r.rol == 'lider',
            ))
        .toList();

    return Scaffold(
      backgroundColor: const Color(0xFF0e0e0e),
      appBar: AppBar(
        backgroundColor: const Color(0xFF141414),
        foregroundColor: Colors.white,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Rodada en vivo', style: TextStyle(fontSize: 16)),
            Text(
              'Código: ${widget.rideId}  ·  ${_riders.length} pilotos',
              style: const TextStyle(
                  fontSize: 12, color: Color(0xFFe6e3de)),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.my_location),
            onPressed: () {
              _centered = true;
              _fitBounds();
            },
          ),
          if (widget.isLider)
            IconButton(
              icon: const Icon(Icons.stop_circle_outlined,
                  color: Color(0xFFE85D20)),
              onPressed: _endRide,
            )
          else
            IconButton(
              icon: const Icon(Icons.exit_to_app),
              onPressed: _leave,
            ),
        ],
      ),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _mapCtrl,
            options: MapOptions(
              initialCenter: const LatLng(6.25, -75.57),
              initialZoom: 12,
              onPositionChanged: (_, hasGesture) {
                if (hasGesture) _centered = false;
              },
            ),
            children: [
              TileLayer(
                urlTemplate:
                    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'co.ridera.ridelive',
              ),
              MarkerLayer(markers: markers),
            ],
          ),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: _RiderListPanel(
              riders: _riders.values.toList(),
              myUid: _uid,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Data model ─────────────────────────────────────────────────────

class _RiderData {
  final String uid;
  final String nombre;
  final String rol;
  final double? lat;
  final double? lon;
  final double speedKmh;
  final DateTime lastSeen;
  RideStatus status;

  _RiderData({
    required this.uid,
    required this.nombre,
    required this.rol,
    required this.lat,
    required this.lon,
    required this.speedKmh,
    required this.lastSeen,
    required this.status,
  });

  factory _RiderData.fromMap(Map<String, dynamic> m) {
    final ls = m['last_seen'] != null
        ? DateTime.parse(m['last_seen']).toUtc()
        : DateTime.now().toUtc();
    final spd = (m['speed_kmh'] as num?)?.toDouble() ?? 0;
    return _RiderData(
      uid: m['uid'] ?? '',
      nombre: m['nombre'] ?? '',
      rol: m['rol'] ?? 'rider',
      lat: (m['lat'] as num?)?.toDouble(),
      lon: (m['lon'] as num?)?.toDouble(),
      speedKmh: spd,
      lastSeen: ls,
      status: memberStatus(lastSeen: ls, speedKmh: spd),
    );
  }
}

// ─── Bottom panel ───────────────────────────────────────────────────

class _RiderListPanel extends StatelessWidget {
  const _RiderListPanel({required this.riders, required this.myUid});

  final List<_RiderData> riders;
  final String myUid;

  Color _statusColor(RideStatus s) => switch (s) {
        RideStatus.enMarcha => const Color(0xFF4ade80),
        RideStatus.detenido => const Color(0xFFfbbf24),
        RideStatus.perdido => const Color(0xFFef4444),
      };

  String _statusLabel(RideStatus s) => switch (s) {
        RideStatus.enMarcha => 'En marcha',
        RideStatus.detenido => 'Detenido',
        RideStatus.perdido => 'Perdido',
      };

  @override
  Widget build(BuildContext context) {
    if (riders.isEmpty) return const SizedBox.shrink();

    return Container(
      constraints: const BoxConstraints(maxHeight: 160),
      decoration: const BoxDecoration(
        color: Color(0xFF141414),
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        border: Border(top: BorderSide(color: Color(0xFF2a2a2a))),
      ),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: riders.length,
        itemBuilder: (_, i) {
          final r = riders[i];
          final isMe = r.uid == myUid;
          return ListTile(
            dense: true,
            leading: CircleAvatar(
              radius: 6,
              backgroundColor: _statusColor(r.status),
            ),
            title: Text(
              '${r.nombre}${isMe ? " (tú)" : ""}${r.rol == "lider" ? " ⭐" : ""}',
              style: const TextStyle(color: Colors.white, fontSize: 14),
            ),
            subtitle: Text(
              '${_statusLabel(r.status)}  ·  ${r.speedKmh.toStringAsFixed(0)} km/h',
              style: TextStyle(
                  color: _statusColor(r.status), fontSize: 12),
            ),
          );
        },
      ),
    );
  }
}
