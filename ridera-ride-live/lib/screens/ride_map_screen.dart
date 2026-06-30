import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
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
  final _mapCtrl = MapController();

  final Map<String, _RiderData> _riders = {};
  RealtimeChannel? _channel;
  Timer? _statusTimer;
  bool _centered = true;

  String get _uid => Supabase.instance.client.auth.currentUser!.id;

  @override
  void initState() {
    super.initState();
    _loadMembers();
    _subscribeRealtime();
    _statusTimer = Timer.periodic(
        const Duration(seconds: 1), (_) => _recalcStatus());
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
        statusCode: r.statusCode,
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

  Future<void> _sendSos() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF1a1a1a),
        title: const Row(
          children: [
            Icon(Icons.warning_amber, color: Color(0xFFef4444), size: 28),
            SizedBox(width: 8),
            Text('SOS', style: TextStyle(color: Color(0xFFef4444))),
          ],
        ),
        content: const Text(
            '¿Enviar alerta de emergencia a todo el convoy?',
            style: TextStyle(color: Color(0xFFe6e3de))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar',
                style: TextStyle(color: Color(0xFFe6e3de))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('ENVIAR SOS',
                style: TextStyle(
                    color: Color(0xFFef4444), fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await Supabase.instance.client
            .from('members')
            .update({'status_code': 3})
            .eq('ride_id', widget.rideId)
            .eq('uid', _uid);
      } catch (_) {}
    }
  }

  Future<void> _resolveSos() async {
    try {
      await Supabase.instance.client
          .from('members')
          .update({'status_code': 0})
          .eq('ride_id', widget.rideId)
          .eq('status_code', 3);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('SOS resuelto')),
        );
      }
    } catch (_) {}
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
      if (mounted) Navigator.of(context).pop();
    }
  }

  Future<void> _leave() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF1a1a1a),
        title: const Text('¿Salir de la rodada?',
            style: TextStyle(color: Colors.white)),
        content: const Text(
            'Dejarás de ver el mapa en vivo. Para volver deberás unirte de nuevo con el código de la rodada.',
            style: TextStyle(color: Color(0xFFe6e3de))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Quedarme',
                style: TextStyle(color: Color(0xFFe6e3de))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Salir',
                style: TextStyle(
                    color: Color(0xFFef4444), fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await _rideService.leaveRide(widget.rideId);
      if (mounted) Navigator.of(context).pop();
    }
  }

  bool get _hasSos =>
      _riders.values.any((r) => r.status == RideStatus.sos);

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
        backgroundColor:
            _hasSos ? const Color(0xFF3b1111) : const Color(0xFF141414),
        foregroundColor: Colors.white,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _hasSos ? '⚠ SOS ACTIVO' : 'Rodada en vivo',
              style: TextStyle(
                fontSize: 16,
                color: _hasSos ? const Color(0xFFef4444) : Colors.white,
              ),
            ),
            Text(
              'Código: ${widget.rideId}  ·  ${_riders.length} pilotos',
              style:
                  const TextStyle(fontSize: 12, color: Color(0xFFe6e3de)),
            ),
          ],
        ),
        actions: [
          if (_hasSos && widget.isLider)
            IconButton(
              icon: const Icon(Icons.check_circle, color: Color(0xFF4ade80)),
              tooltip: 'Resolver SOS',
              onPressed: _resolveSos,
            ),
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
      floatingActionButton: FloatingActionButton(
        onPressed: _sendSos,
        backgroundColor: const Color(0xFFef4444),
        child: const Icon(Icons.sos, color: Colors.white, size: 28),
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
  final int statusCode;
  RideStatus status;

  _RiderData({
    required this.uid,
    required this.nombre,
    required this.rol,
    required this.lat,
    required this.lon,
    required this.speedKmh,
    required this.lastSeen,
    required this.statusCode,
    required this.status,
  });

  factory _RiderData.fromMap(Map<String, dynamic> m) {
    final ls = m['last_seen'] != null
        ? DateTime.parse(m['last_seen']).toUtc()
        : DateTime.now().toUtc();
    final spd = (m['speed_kmh'] as num?)?.toDouble() ?? 0;
    final sc = (m['status_code'] as num?)?.toInt() ?? 0;
    return _RiderData(
      uid: m['uid'] ?? '',
      nombre: m['nombre'] ?? '',
      rol: m['rol'] ?? 'rider',
      lat: (m['lat'] as num?)?.toDouble(),
      lon: (m['lon'] as num?)?.toDouble(),
      speedKmh: spd,
      lastSeen: ls,
      statusCode: sc,
      status: memberStatus(lastSeen: ls, speedKmh: spd, statusCode: sc),
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
        RideStatus.sos => const Color(0xFFef4444),
        RideStatus.falla => const Color(0xFFf97316),
      };

  String _statusLabel(RideStatus s) => switch (s) {
        RideStatus.enMarcha => 'En marcha',
        RideStatus.detenido => 'Detenido',
        RideStatus.perdido => 'Perdido',
        RideStatus.sos => '⚠ SOS',
        RideStatus.falla => 'Falla',
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
