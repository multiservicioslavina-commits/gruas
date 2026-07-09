// lib/services/ride_tracking_service.dart
//
// RIDERA RIDE LIVE — Servicio de seguimiento de ubicacion en convoy.
//
// Resuelve los dos problemas detectados en las pruebas de banco:
//   1) Sin foreground service, el GPS MUERE con la pantalla bloqueada
//      (el piloto desaparece del mapa del lider cuando guarda el telefono).
//   2) Sin "heartbeat", un piloto DETENIDO se ve igual que uno PERDIDO,
//      porque last_seen solo se refrescaba al moverse.
//
// El diseno clave: el stream del GPS solo guarda la ultima posicion en
// memoria (_last); el UNICO que escribe a Supabase es el timer (heartbeat).
// Asi desacoplamos "ritmo del GPS" de "ritmo de publicacion":
//   - Detenido  -> reporta la misma posicion pero last_seen FRESCO.
//   - En marcha -> reporta posicion nueva.
//
// Requiere en pubspec.yaml:
//   geolocator: ^14.0.0
//   supabase_flutter: ^2.0.0   (o tu version actual)
//
// Requiere permisos en AndroidManifest.xml (ver AndroidManifest_permisos.txt).

import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class RideTrackingService {
  RideTrackingService({
    required this.supabase,
    required this.rideId,
    required this.uid,
    this.heartbeat = const Duration(seconds: 4),
  });

  final SupabaseClient supabase;
  final String rideId;
  final String uid;
  final Duration heartbeat;

  Position? _last;
  StreamSubscription<Position>? _posSub;
  Timer? _timer;
  bool _running = false;

  bool get isRunning => _running;

  /// Arranca el seguimiento. Devuelve false si faltan permisos o el GPS
  /// del sistema esta apagado (maneja ese caso en la UI).
  Future<bool> start() async {
    if (_running) return true;

    // 1) GPS del sistema encendido
    if (!await Geolocator.isLocationServiceEnabled()) return false;

    // 2) Permiso de ubicacion en primer plano
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied ||
        perm == LocationPermission.deniedForever) {
      return false;
    }

    // 3) Stream con FOREGROUND SERVICE -> sobrevive a la pantalla bloqueada.
    //    enableWakeLock mantiene vivo el proceso (y por tanto el timer).
    final settings = AndroidSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10,
      foregroundNotificationConfig: const ForegroundNotificationConfig(
        notificationTitle: 'RIDERA · Rodada activa',
        notificationText: 'Compartiendo tu ubicacion con el convoy',
        enableWakeLock: true,
        setOngoing: true,
      ),
    );

    _posSub = Geolocator.getPositionStream(locationSettings: settings)
        .listen((p) => _last = p, onError: (_) {});

    // Primer fix inmediato para no esperar al primer movimiento.
    try {
      _last = await Geolocator.getCurrentPosition(
        locationSettings:
            const LocationSettings(accuracy: LocationAccuracy.high),
      );
      await _push();
    } catch (_) {
      // sin fix aun: el heartbeat publicara en cuanto llegue
    }

    // 4) HEARTBEAT: publica cada N segundos aunque no haya fix nuevo.
    _timer = Timer.periodic(heartbeat, (_) => _push());

    _running = true;
    return true;
  }

  Future<void> _push() async {
    final p = _last;
    if (p == null) return;
    try {
      await supabase
          .from('members')
          .update({
            'lat': p.latitude,
            'lon': p.longitude,
            'speed_kmh': (p.speed * 3.6).clamp(0, 300), // m/s -> km/h
            'last_seen': DateTime.now().toUtc().toIso8601String(),
          })
          .eq('ride_id', rideId)
          .eq('uid', uid);
    } catch (_) {
      // Sin red (zona muerta): se reintenta solo en el proximo heartbeat.
    }
  }

  /// Llamar al salir de la rodada o cerrar la pantalla del mapa.
  Future<void> stop() async {
    await _posSub?.cancel();
    _timer?.cancel();
    _posSub = null;
    _timer = null;
    _running = false;
  }
}

/// Mismo criterio que la vista `member_live_status` de la base de datos.
/// Usalo en el PANEL DEL LIDER, recalculando con un Timer local cada 1 s,
/// porque el realtime NO emite ningun evento cuando un piloto se queda en
/// silencio: el unico que puede "apagar" un pin a perdido es el reloj local.
String memberEstado({required DateTime lastSeen, required double speedKmh}) {
  final secs = DateTime.now().toUtc().difference(lastSeen.toUtc()).inSeconds;
  if (secs > 15) return 'perdido'; // rojo
  if (speedKmh < 3) return 'detenido'; // amarillo
  return 'en_marcha'; // verde
}
