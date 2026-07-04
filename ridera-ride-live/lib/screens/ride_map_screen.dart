import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/crash_detector.dart';
import '../services/location_service.dart';
import '../services/mesh_service.dart';
import '../services/photo_service.dart';
import '../services/push_dispatcher.dart';
import '../services/ride_service.dart';
import '../services/ride_status.dart';
import '../services/safety_service.dart';
import '../widgets/rider_marker.dart';
import 'ride_summary_screen.dart';

class RideMapScreen extends StatefulWidget {
  const RideMapScreen({
    super.key,
    required this.rideId,
    required this.isLider,
    this.rideName = 'Rodada',
    this.startedAt,
  });

  final String rideId;
  final bool isLider;
  final String rideName;
  final DateTime? startedAt;

  @override
  State<RideMapScreen> createState() => _RideMapScreenState();
}

enum _MapType { calles, satelite, relieve, oscuro }

extension _MapTypeExt on _MapType {
  String get label => switch (this) {
    _MapType.calles   => 'Calles',
    _MapType.satelite => 'Satélite',
    _MapType.relieve  => 'Relieve',
    _MapType.oscuro   => 'Oscuro',
  };
  IconData get icon => switch (this) {
    _MapType.calles   => Icons.map_outlined,
    _MapType.satelite => Icons.satellite_alt,
    _MapType.relieve  => Icons.terrain,
    _MapType.oscuro   => Icons.nights_stay_outlined,
  };
  String get url => switch (this) {
    _MapType.calles   => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    _MapType.satelite => 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    _MapType.relieve  => 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    _MapType.oscuro   => 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
  };
}

class _RideMapScreenState extends State<RideMapScreen>
    with WidgetsBindingObserver {
  final _rideService = RideService();
  final _photoService = PhotoService();
  final _locationService = LocationService();
  final _mesh = MeshService();
  final _crashDetector = CrashDetector();
  final _mapCtrl = MapController();

  String _emergencyName = '';
  String _emergencyPhone = '';
  bool _crashDialogShowing = false;
  Timer? _meshBroadcastTimer;
  StreamSubscription<MeshPeerMessage>? _meshSub;
  StreamSubscription<MeshConnectionEvent>? _meshConnSub;
  int _meshDirectPeers = 0;
  bool _uploadingPhoto = false;

  final Map<String, _RiderData> _riders = {};
  final Map<String, List<LatLng>> _traces = {};
  RealtimeChannel? _channel;
  Timer? _statusTimer;
  Timer? _refreshTimer;
  bool _centered = true;
  _MapType _mapType = _MapType.calles;

  // Ruta planeada por el líder (opcional)
  List<LatLng>? _plannedPolyline;
  List<Map<String, dynamic>>? _plannedSteps;
  String? _originName;
  String? _destinationName;
  String? _driveFolderUrl;

  String get _uid => Supabase.instance.client.auth.currentUser!.id;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadMembers();
    _loadRoutePoints();
    _loadPlannedRoute();
    _subscribeRealtime();
    _statusTimer = Timer.periodic(
        const Duration(seconds: 1), (_) => _recalcStatus());
    // Recarga completa desde DB cada 30s como respaldo si el WebSocket cae
    _refreshTimer = Timer.periodic(
        const Duration(seconds: 30), (_) => _loadMembers());
    // Preguntar por permiso de batería después de que la UI cargue
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkBatteryOptimization());
    _startMesh();
    _startCrashDetector();
  }

  Future<void> _startCrashDetector() async {
    // Cargar contacto de emergencia del miembro actual desde la DB
    try {
      final row = await Supabase.instance.client
          .from('members')
          .select('emergency_name, emergency_phone')
          .eq('ride_id', widget.rideId)
          .eq('uid', _uid)
          .maybeSingle();
      if (row != null) {
        _emergencyName = (row['emergency_name'] as String?) ?? '';
        _emergencyPhone = (row['emergency_phone'] as String?) ?? '';
      }
    } catch (_) {}

    // Solo detectar caídas si hay un contacto configurado
    if (_emergencyPhone.trim().isEmpty) return;

    _crashDetector.start(() {
      if (!mounted || _crashDialogShowing) return;
      _showCrashCountdown();
    });
  }

  Future<void> _showCrashCountdown() async {
    _crashDialogShowing = true;
    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const _CrashCountdownDialog(),
    );
    _crashDialogShowing = false;

    if (result == true) {
      // Timer expiró sin cancelación → asumir caída real
      await _triggerCrashSos();
    }
  }

  Future<void> _triggerCrashSos() async {
    final me = _riders[_uid];
    final lat = me?.lat ?? 0.0;
    final lon = me?.lon ?? 0.0;
    final riderName = me?.nombre ?? 'Piloto RIDERA';

    // 1. Marcar SOS en la rodada (todos los otros riders lo verán en su mapa)
    try {
      await Supabase.instance.client
          .from('members')
          .update({'status_code': 3})
          .eq('ride_id', widget.rideId)
          .eq('uid', _uid);
    } catch (_) {}

    // 2. Push notification a TODOS los miembros de la rodada
    PushDispatcher.sendToRide(
      rideId: widget.rideId,
      title: '🚨 SOS en la rodada',
      body: '$riderName puede haber tenido una caída. Toca para ver el mapa.',
      data: {'type': 'sos', 'ride_id': widget.rideId, 'from_uid': _uid},
    );

    // 3. Enviar SMS al contacto de emergencia
    final smsOk = await SafetyService.sendSosAuto(
      contactPhone: _emergencyPhone,
      riderName: riderName,
      lat: lat,
      lon: lon,
    );

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          smsOk
              ? '🚨 SOS enviado al contacto de emergencia por SMS'
              : '🚨 SOS activo. No se pudo enviar SMS — verifica permiso de SMS.',
        ),
        backgroundColor: smsOk
            ? const Color(0xFFef4444)
            : const Color(0xFFf97316),
        duration: const Duration(seconds: 6),
      ),
    );
  }

  Future<void> _startMesh() async {
    // Nombre para anunciarse en el mesh (visible en el peer descubrimiento)
    final myMember = _riders[_uid];
    final name = myMember?.nombre ?? 'Piloto';
    final ok = await _mesh.start(uid: _uid, name: name);
    if (!ok) return;
    _meshSub = _mesh.onPeer.listen(_onMeshPeerMessage);
    _meshConnSub = _mesh.onConnection.listen((e) {
      if (mounted) setState(() => _meshDirectPeers = _mesh.directPeers);
    });
    // Broadcast propio periódico al mesh cada 4s
    _meshBroadcastTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      final me = _riders[_uid];
      if (me?.lat == null || me?.lon == null) return;
      _mesh.broadcast(
        lat: me!.lat!,
        lon: me.lon!,
        speedKmh: me.speedKmh.round(),
        statusCode: me.statusCode,
      );
    });
  }

  void _onMeshPeerMessage(MeshPeerMessage m) {
    if (!mounted) return;
    // Solo mostrar peers cuya última señal viene por mesh; si Supabase ya lo trae
    // más reciente, la lógica de tiempo pondría "en marcha" naturalmente.
    setState(() {
      final existing = _riders[m.uid];
      final updated = _RiderData(
        uid: m.uid,
        nombre: existing?.nombre ?? 'Mesh · ${m.uid.substring(0, 6)}',
        rol: existing?.rol ?? 'rider',
        lat: m.lat,
        lon: m.lon,
        speedKmh: m.speedKmh.toDouble(),
        lastSeen: DateTime.now().toUtc(),
        statusCode: m.statusCode,
        status: memberStatus(
          lastSeen: DateTime.now().toUtc(),
          speedKmh: m.speedKmh.toDouble(),
          statusCode: m.statusCode,
        ),
      );
      _riders[m.uid] = updated;
      final list = _traces.putIfAbsent(m.uid, () => []);
      final pt = LatLng(m.lat, m.lon);
      if (list.isEmpty ||
          list.last.latitude != pt.latitude ||
          list.last.longitude != pt.longitude) {
        list.add(pt);
      }
    });
  }

  Future<void> _checkBatteryOptimization() async {
    await Future.delayed(const Duration(seconds: 2));
    if (!mounted) return;
    final optimized = await _locationService.isBatteryOptimized();
    if (!optimized || !mounted) return;

    // Diálogo simple, un solo botón grande "PERMITIR"
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF1a1a1a),
        title: const Row(children: [
          Icon(Icons.battery_alert, color: Color(0xFFE85D20), size: 28),
          SizedBox(width: 8),
          Expanded(child: Text('Mantener GPS activo',
              style: TextStyle(color: Colors.white, fontSize: 17))),
        ]),
        content: const Text(
            'Para que tu ubicación siga compartiéndose con el celular bloqueado, toca PERMITIR en la siguiente pantalla.',
            style: TextStyle(color: Color(0xFFe6e3de), fontSize: 14)),
        actions: [
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFE85D20),
                minimumSize: const Size(0, 52),
              ),
              onPressed: () async {
                Navigator.pop(context);
                await _locationService.requestIgnoreBatteryOptimization();
                await Future.delayed(const Duration(seconds: 1));
                if (!mounted) return;
                // Después de batería, ofrecer autoarranque (importante en Xiaomi/Huawei)
                final opened = await _locationService.openAutoStartSettings();
                if (opened && mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Activa "Autoarranque" para RIDERA AVENTURA'),
                      backgroundColor: Color(0xFF1a1a1a),
                      duration: Duration(seconds: 4),
                    ),
                  );
                }
              },
              child: const Text('PERMITIR',
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.5)),
            ),
          ),
        ],
      ),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // App vuelve al frente — reconectar Realtime y recargar datos
      _channel?.unsubscribe();
      _subscribeRealtime();
      _loadMembers();
      _loadRoutePoints(clearFirst: true); // recarga limpia para no duplicar puntos
    }
  }

  Future<void> _loadRoutePoints({bool clearFirst = false}) async {
    try {
      final rows = await Supabase.instance.client
          .from('route_points')
          .select('uid, lat, lon')
          .eq('ride_id', widget.rideId)
          .order('recorded_at');
      if (!mounted) return;
      setState(() {
        // En resume se limpia para evitar duplicar puntos históricos
        if (clearFirst) _traces.clear();
        for (final r in rows) {
          final uid = r['uid'] as String;
          final lat = (r['lat'] as num).toDouble();
          final lon = (r['lon'] as num).toDouble();
          final list = _traces.putIfAbsent(uid, () => []);
          final pt = LatLng(lat, lon);
          // Comparar valores porque LatLng no implementa ==
          if (list.isEmpty ||
              list.last.latitude != pt.latitude ||
              list.last.longitude != pt.longitude) {
            list.add(pt);
          }
        }
      });
    } catch (_) {}
  }

  Future<void> _loadPlannedRoute() async {
    try {
      final row = await Supabase.instance.client
          .from('rides')
          .select('planned_route, planned_steps, origin_name, destination_name, drive_folder_url')
          .eq('id', widget.rideId)
          .maybeSingle();
      if (row == null || !mounted) return;
      final geo = row['planned_route'] as Map<String, dynamic>?;
      if (geo != null && geo['coordinates'] is List) {
        final coords = (geo['coordinates'] as List).cast<List>();
        final pts = coords
            .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
            .toList();
        setState(() {
          _plannedPolyline = pts;
          _plannedSteps = (row['planned_steps'] as List?)
              ?.map((e) => Map<String, dynamic>.from(e as Map))
              .toList();
          _originName = row['origin_name'] as String?;
          _destinationName = row['destination_name'] as String?;
          _driveFolderUrl = row['drive_folder_url'] as String?;
        });
      }
    } catch (_) {}
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
        final data = _RiderData.fromMap(record);
        final uid = record['uid'] as String? ?? '';
        setState(() {
          _riders[uid] = data;
          if (data.lat != null && data.lon != null) {
            final pt = LatLng(data.lat!, data.lon!);
            final list = _traces.putIfAbsent(uid, () => []);
            if (list.isEmpty || list.last != pt) list.add(pt);
          }
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
      // Notif push a los demás miembros de la rodada
      final me = _riders[_uid];
      PushDispatcher.sendToRide(
        rideId: widget.rideId,
        title: '🚨 SOS en la rodada',
        body: '${me?.nombre ?? "Un piloto"} activó SOS. Toca para ver el mapa.',
        data: {'type': 'sos', 'ride_id': widget.rideId, 'from_uid': _uid},
      );
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
      try { await _rideService.endRide(widget.rideId); } catch (_) {}
      if (mounted) _goToSummary();
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
      try { await _rideService.leaveRide(widget.rideId); } catch (_) {}
      if (mounted) _goToSummary();
    }
  }

  void _goToSummary() {
    final elapsed = widget.startedAt != null
        ? DateTime.now().difference(widget.startedAt!)
        : Duration.zero;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => RideSummaryScreen(
          rideId: widget.rideId,
          rideName: widget.rideName,
          elapsed: elapsed,
        ),
      ),
    );
  }

  Future<void> _takePhoto() async {
    if (_uploadingPhoto) return;
    setState(() => _uploadingPhoto = true);
    try {
      final me = _riders[_uid];
      final url = await _photoService.captureAndUpload(
        rideId: widget.rideId,
        lat: me?.lat,
        lon: me?.lon,
      );
      if (url != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Foto guardada en la rodada'),
            backgroundColor: Color(0xFF1a1a1a),
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Error al guardar la foto'),
            backgroundColor: Color(0xFF3b1111),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  bool get _hasSos =>
      _riders.values.any((r) => r.status == RideStatus.sos);

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _channel?.unsubscribe();
    _statusTimer?.cancel();
    _refreshTimer?.cancel();
    _meshBroadcastTimer?.cancel();
    _meshSub?.cancel();
    _meshConnSub?.cancel();
    _mesh.stop();
    _crashDetector.stop();
    super.dispose();
  }

  Widget _buildMap() {
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
    return FlutterMap(
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
          urlTemplate: _mapType.url,
          userAgentPackageName: 'co.ridera.ridelive',
        ),
        // Ruta planeada por el líder (azul, debajo del trazado real)
        if (_plannedPolyline != null && _plannedPolyline!.isNotEmpty)
          PolylineLayer(
            polylines: [
              Polyline(
                points: _plannedPolyline!,
                color: const Color(0xFF3B82F6).withValues(alpha: 0.85),
                strokeWidth: 5,
                borderColor: const Color(0xFF1e40af),
                borderStrokeWidth: 1,
              ),
            ],
          ),
        PolylineLayer(
          polylines: _traces.entries.map((e) {
            final isLider = _riders[e.key]?.rol == 'lider';
            return Polyline(
              points: e.value,
              color: isLider
                  ? const Color(0xFFE85D20)
                  : const Color(0xFF6B9FD4),
              strokeWidth: isLider ? 3.5 : 2.0,
            );
          }).toList(),
        ),
        MarkerLayer(markers: markers),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final isLandscape =
        MediaQuery.of(context).orientation == Orientation.landscape;

    final appBar = AppBar(
      automaticallyImplyLeading: false,
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
          Row(children: [
            Text(
              'Código: ${widget.rideId}  ·  ${_riders.length} pilotos',
              style: const TextStyle(fontSize: 12, color: Color(0xFFe6e3de)),
            ),
            if (_meshDirectPeers > 0) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFF1e40af),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.bluetooth, size: 10, color: Colors.white),
                  const SizedBox(width: 3),
                  Text('MESH · $_meshDirectPeers',
                      style: const TextStyle(
                          fontSize: 10,
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5)),
                ]),
              ),
            ],
          ]),
        ],
      ),
      actions: [
        if (_hasSos && widget.isLider)
          IconButton(
            icon: const Icon(Icons.check_circle, color: Color(0xFF4ade80)),
            tooltip: 'Resolver SOS',
            onPressed: _resolveSos,
          ),
        if (_driveFolderUrl != null && _driveFolderUrl!.isNotEmpty)
          IconButton(
            icon: const Icon(Icons.folder_shared, color: Color(0xFF60A5FA)),
            tooltip: 'Álbum grupal',
            onPressed: () => launchUrl(Uri.parse(_driveFolderUrl!),
                mode: LaunchMode.externalApplication),
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
    );

    if (isLandscape) {
      // ── Layout horizontal: mapa a la izquierda, riders a la derecha ──
      return PopScope(
        canPop: false,
        child: Scaffold(
          backgroundColor: const Color(0xFF0e0e0e),
          appBar: appBar,
          body: Row(
            children: [
              // Mapa (60% del ancho)
              Expanded(
                flex: 6,
                child: Stack(
                  children: [
                    _buildMap(),
                    Positioned(
                      top: 10,
                      left: 10,
                      child: _MapTypePicker(
                        selected: _mapType,
                        onSelect: (t) => setState(() => _mapType = t),
                      ),
                    ),
                  ],
                ),
              ),
              // Panel derecho (40% del ancho)
              Container(
                width: 220,
                color: const Color(0xFF141414),
                child: Column(
                  children: [
                    // Lista de riders
                    Expanded(
                      child: _RiderListPanelVertical(
                        riders: _riders.values.toList(),
                        myUid: _uid,
                      ),
                    ),
                    // Botones cámara y SOS
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 12),
                      decoration: const BoxDecoration(
                        border: Border(
                            top: BorderSide(color: Color(0xFF2a2a2a))),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          _ActionBtn(
                            heroTag: 'camera_l',
                            onPressed: _uploadingPhoto ? null : _takePhoto,
                            backgroundColor: const Color(0xFF1a1a1a),
                            child: _uploadingPhoto
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                        color: Colors.white, strokeWidth: 2))
                                : const Icon(Icons.camera_alt,
                                    color: Colors.white),
                          ),
                          _ActionBtn(
                            heroTag: 'sos_l',
                            onPressed: _sendSos,
                            backgroundColor: const Color(0xFFef4444),
                            child: const Text('SOS',
                                style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w900,
                                    fontSize: 13)),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    // ── Layout vertical (portrait): mapa full + panel riders abajo ────
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: const Color(0xFF0e0e0e),
        appBar: appBar,
        body: Stack(
          children: [
            _buildMap(),
            Positioned(
              top: 12,
              left: 12,
              child: _MapTypePicker(
                selected: _mapType,
                onSelect: (t) => setState(() => _mapType = t),
              ),
            ),
            if (_plannedSteps != null && _plannedSteps!.isNotEmpty)
              Positioned(
                top: 12,
                right: 12,
                left: 160,
                child: _NavBanner(
                  steps: _plannedSteps!,
                  currentLat: _riders[_uid]?.lat,
                  currentLon: _riders[_uid]?.lon,
                  originName: _originName,
                  destinationName: _destinationName,
                  driveUrl: _driveFolderUrl,
                ),
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
        floatingActionButton: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            FloatingActionButton(
              heroTag: 'camera',
              onPressed: _uploadingPhoto ? null : _takePhoto,
              backgroundColor: const Color(0xFF1a1a1a),
              child: _uploadingPhoto
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2))
                  : const Icon(Icons.camera_alt, color: Colors.white),
            ),
            const SizedBox(height: 12),
            FloatingActionButton(
              heroTag: 'sos',
              onPressed: _sendSos,
              backgroundColor: const Color(0xFFef4444),
              child: const Icon(Icons.sos, color: Colors.white, size: 28),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Map type picker ────────────────────────────────────────────────

class _MapTypePicker extends StatefulWidget {
  const _MapTypePicker({required this.selected, required this.onSelect});
  final _MapType selected;
  final ValueChanged<_MapType> onSelect;
  @override
  State<_MapTypePicker> createState() => _MapTypePickerState();
}

class _MapTypePickerState extends State<_MapTypePicker> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Botón principal
        GestureDetector(
          onTap: () => setState(() => _open = !_open),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF141414).withValues(alpha: 0.92),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF2a2a2a)),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(widget.selected.icon, size: 16, color: const Color(0xFFE85D20)),
              const SizedBox(width: 6),
              Text(widget.selected.label,
                  style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
              const SizedBox(width: 4),
              Icon(_open ? Icons.expand_less : Icons.expand_more,
                  size: 16, color: Colors.white54),
            ]),
          ),
        ),
        // Panel desplegable
        if (_open) ...[
          const SizedBox(height: 6),
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF141414).withValues(alpha: 0.95),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF2a2a2a)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: _MapType.values.map((t) {
                final sel = t == widget.selected;
                return GestureDetector(
                  onTap: () {
                    widget.onSelect(t);
                    setState(() => _open = false);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: sel ? const Color(0xFFE85D20).withValues(alpha: 0.15) : Colors.transparent,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(t.icon, size: 16,
                          color: sel ? const Color(0xFFE85D20) : Colors.white60),
                      const SizedBox(width: 10),
                      Text(t.label, style: TextStyle(
                          color: sel ? const Color(0xFFE85D20) : Colors.white,
                          fontSize: 13,
                          fontWeight: sel ? FontWeight.w700 : FontWeight.normal)),
                      if (sel) ...[
                        const SizedBox(width: 8),
                        const Icon(Icons.check, size: 14, color: Color(0xFFE85D20)),
                      ],
                    ]),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ],
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

// ─── Botón de acción compacto (landscape) ───────────────────────────

class _ActionBtn extends StatelessWidget {
  const _ActionBtn({
    required this.heroTag,
    required this.onPressed,
    required this.backgroundColor,
    required this.child,
  });
  final String heroTag;
  final VoidCallback? onPressed;
  final Color backgroundColor;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      heroTag: heroTag,
      mini: true,
      onPressed: onPressed,
      backgroundColor: backgroundColor,
      child: child,
    );
  }
}

// ─── Panel lateral de riders (landscape) ────────────────────────────

class _RiderListPanelVertical extends StatelessWidget {
  const _RiderListPanelVertical({required this.riders, required this.myUid});

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
    if (riders.isEmpty) {
      return const Center(
        child: Text('Sin pilotos',
            style: TextStyle(color: Color(0xFF555555), fontSize: 12)),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(10),
      itemCount: riders.length,
      separatorBuilder: (_, __) =>
          const Divider(color: Color(0xFF2a2a2a), height: 1),
      itemBuilder: (_, i) {
        final r = riders[i];
        final isMe = r.uid == myUid;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: [
              CircleAvatar(
                radius: 5,
                backgroundColor: _statusColor(r.status),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${r.nombre}${isMe ? " (tú)" : ""}${r.rol == "lider" ? " ⭐" : ""}',
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w600),
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      '${_statusLabel(r.status)} · ${r.speedKmh.toStringAsFixed(0)} km/h',
                      style: TextStyle(
                          color: _statusColor(r.status), fontSize: 10),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ─── Bottom panel (portrait) ─────────────────────────────────────────

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

// ─── Banner de navegación turn-by-turn ─────────────────────

class _NavBanner extends StatelessWidget {
  const _NavBanner({
    required this.steps,
    required this.currentLat,
    required this.currentLon,
    required this.originName,
    required this.destinationName,
    required this.driveUrl,
  });

  final List<Map<String, dynamic>> steps;
  final double? currentLat;
  final double? currentLon;
  final String? originName;
  final String? destinationName;
  final String? driveUrl;

  // Encuentra el step más cercano al piloto que aún no ha pasado.
  Map<String, dynamic>? _nextStep() {
    if (currentLat == null || currentLon == null) return steps.first;
    Map<String, dynamic>? best;
    double bestDist = double.infinity;
    for (final s in steps) {
      final lat = (s['lat'] as num?)?.toDouble();
      final lon = (s['lon'] as num?)?.toDouble();
      if (lat == null || lon == null) continue;
      final d = _haversineMeters(currentLat!, currentLon!, lat, lon);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  double _distanceToNext() {
    final s = _nextStep();
    if (s == null || currentLat == null || currentLon == null) return 0;
    return _haversineMeters(
      currentLat!, currentLon!,
      (s['lat'] as num).toDouble(),
      (s['lon'] as num).toDouble(),
    );
  }

  IconData _iconForModifier(String modifier) {
    switch (modifier) {
      case 'left':
      case 'sharp left':
        return Icons.turn_left;
      case 'slight left':
        return Icons.turn_slight_left;
      case 'right':
      case 'sharp right':
        return Icons.turn_right;
      case 'slight right':
        return Icons.turn_slight_right;
      case 'straight':
        return Icons.straight;
      case 'uturn':
        return Icons.u_turn_left;
      default:
        return Icons.navigation;
    }
  }

  @override
  Widget build(BuildContext context) {
    final step = _nextStep();
    if (step == null) return const SizedBox.shrink();
    final instruction = (step['instruction'] as String?) ?? '';
    final modifier = (step['modifier'] as String?) ?? '';
    final distM = _distanceToNext();
    final distText = distM > 1000
        ? '${(distM / 1000).toStringAsFixed(1)} km'
        : '${distM.round()} m';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF141414).withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.5)),
      ),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: const Color(0xFF3B82F6),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(_iconForModifier(modifier),
              color: Colors.white, size: 22),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(distText,
                  style: const TextStyle(
                      color: Color(0xFF60A5FA),
                      fontWeight: FontWeight.w900,
                      fontSize: 15,
                      letterSpacing: 0.5)),
              const SizedBox(height: 1),
              Text(
                instruction.isEmpty ? 'Siga la ruta' : instruction,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ]),
    );
  }
}

double _haversineMeters(double lat1, double lon1, double lat2, double lon2) {
  const r = 6371000.0;
  final dLat = (lat2 - lat1) * math.pi / 180;
  final dLon = (lon2 - lon1) * math.pi / 180;
  final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(lat1 * math.pi / 180) *
          math.cos(lat2 * math.pi / 180) *
          math.sin(dLon / 2) *
          math.sin(dLon / 2);
  return 2 * r * math.asin(math.sqrt(a));
}

// ─── Diálogo de countdown por caída detectada ─────────────

class _CrashCountdownDialog extends StatefulWidget {
  const _CrashCountdownDialog();
  @override
  State<_CrashCountdownDialog> createState() => _CrashCountdownDialogState();
}

class _CrashCountdownDialogState extends State<_CrashCountdownDialog>
    with SingleTickerProviderStateMixin {
  static const _totalSeconds = 15;
  late int _remaining;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _remaining = _totalSeconds;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _remaining--);
      if (_remaining <= 0) {
        _timer?.cancel();
        Navigator.of(context).pop(true); // envió SOS
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final progress = _remaining / _totalSeconds;
    return PopScope(
      canPop: false,
      child: Dialog(
        backgroundColor: const Color(0xFF2b0d0d),
        insetPadding: const EdgeInsets.all(20),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: Color(0xFFef4444), width: 2),
        ),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.warning_rounded,
                  color: Color(0xFFef4444), size: 64),
              const SizedBox(height: 12),
              const Text(
                '¡Detectamos una caída!',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 8),
              Text(
                'Enviaremos SOS a tu contacto de emergencia\nen $_remaining segundos.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFFe6e3de), fontSize: 15),
              ),
              const SizedBox(height: 20),
              // Barra de progreso
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 10,
                  backgroundColor: Colors.black26,
                  color: const Color(0xFFef4444),
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF4ade80),
                    minimumSize: const Size(0, 60),
                  ),
                  child: const Text(
                    'ESTOY BIEN — CANCELAR',
                    style: TextStyle(
                        color: Colors.black,
                        fontWeight: FontWeight.w900,
                        fontSize: 16,
                        letterSpacing: 1.5),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              TextButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text(
                  'ENVIAR SOS AHORA',
                  style: TextStyle(
                      color: Color(0xFFef4444),
                      fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
