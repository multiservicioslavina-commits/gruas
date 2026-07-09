import 'dart:async';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

/// Cliente Dart del sistema Mesh BLE nativo (BleMeshService.kt).
///
/// Funciona con Bluetooth Low Energy puro — no depende de Google Play Services,
/// funciona en cualquier fabricante Android con BLE (API 21+).
class MeshService {
  static final MeshService _instance = MeshService._();
  factory MeshService() => _instance;
  MeshService._() {
    _channel.setMethodCallHandler(_onNative);
  }

  static const _channel = MethodChannel('com.ridera.ridelive/mesh');

  final _peerCtrl = StreamController<MeshPeerMessage>.broadcast();
  final _connCtrl = StreamController<MeshConnectionEvent>.broadcast();
  final _statusCtrl = StreamController<MeshStatusEvent>.broadcast();

  /// Cada posición que llega por mesh (propia o relayada).
  Stream<MeshPeerMessage> get onPeer => _peerCtrl.stream;

  /// Peer directo conectado/desconectado.
  Stream<MeshConnectionEvent> get onConnection => _connCtrl.stream;

  /// Eventos de diagnóstico del BLE nativo (advertising_ok, scan_fail, etc).
  Stream<MeshStatusEvent> get onStatus => _statusCtrl.stream;

  /// Últimos N eventos de status (para el panel de diagnóstico).
  final List<MeshStatusEvent> statusLog = [];

  bool _running = false;
  int _directPeers = 0;
  int get directPeers => _directPeers;
  bool get running => _running;

  Future<bool> ensurePermissions() async {
    final needed = <Permission>[
      Permission.bluetoothScan,
      Permission.bluetoothConnect,
      Permission.bluetoothAdvertise,
      Permission.locationWhenInUse,
    ];
    final statuses = await needed.request();
    return statuses.values.every((s) => s.isGranted || s.isLimited);
  }

  Future<bool> start({required String uid, required String name}) async {
    if (_running) return true;
    if (!await ensurePermissions()) {
      _log('perm_denied', 'Faltan permisos de Bluetooth/Ubicación');
      return false;
    }
    try {
      await _channel.invokeMethod('start', {'uid': uid, 'name': name});
      _running = true;
      return true;
    } catch (e) {
      _log('start_error', e.toString());
      return false;
    }
  }

  Future<void> stop() async {
    if (!_running) return;
    try {
      await _channel.invokeMethod('stop');
    } catch (_) {}
    _running = false;
    _directPeers = 0;
  }

  Future<void> broadcast({
    required double lat,
    required double lon,
    required int speedKmh,
    required int statusCode,
  }) async {
    if (!_running) return;
    try {
      await _channel.invokeMethod('broadcastPosition', {
        'lat': lat,
        'lon': lon,
        'speed_kmh': speedKmh,
        'status_code': statusCode,
      });
    } catch (_) {}
  }

  void _log(String kind, String message) {
    final evt = MeshStatusEvent(kind: kind, message: message, at: DateTime.now());
    statusLog.add(evt);
    if (statusLog.length > 100) statusLog.removeAt(0);
    _statusCtrl.add(evt);
  }

  Future<void> _onNative(MethodCall call) async {
    switch (call.method) {
      case 'onPeerMessage':
        final m = Map<String, dynamic>.from(call.arguments as Map);
        _peerCtrl.add(MeshPeerMessage(
          uid: m['uid'] as String,
          lat: (m['lat'] as num).toDouble(),
          lon: (m['lon'] as num).toDouble(),
          speedKmh: (m['speed_kmh'] as num?)?.toInt() ?? 0,
          statusCode: (m['status_code'] as num?)?.toInt() ?? 0,
          hops: (m['hops'] as num?)?.toInt() ?? 0,
        ));
        break;
      case 'onPeerConnected':
        _directPeers++;
        _connCtrl.add(MeshConnectionEvent(connected: true));
        break;
      case 'onPeerDisconnected':
        _directPeers = (_directPeers - 1).clamp(0, 999);
        _connCtrl.add(MeshConnectionEvent(connected: false));
        break;
      case 'onStatus':
        final m = Map<String, dynamic>.from(call.arguments as Map);
        _log(m['kind'] as String? ?? '', m['message'] as String? ?? '');
        break;
    }
  }
}

class MeshPeerMessage {
  final String uid;
  final double lat;
  final double lon;
  final int speedKmh;
  final int statusCode;
  final int hops;
  MeshPeerMessage({
    required this.uid, required this.lat, required this.lon,
    required this.speedKmh, required this.statusCode, required this.hops,
  });
}

class MeshConnectionEvent {
  final bool connected;
  MeshConnectionEvent({required this.connected});
}

class MeshStatusEvent {
  final String kind;
  final String message;
  final DateTime at;
  MeshStatusEvent({required this.kind, required this.message, required this.at});
}
