import 'dart:async';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../supabase_config.dart';

/// Punto de entrada del isolate de fondo. DEBE ser funcion top-level.
@pragma('vm:entry-point')
void startLocationCallback() {
  FlutterForegroundTask.setTaskHandler(RideLocationTaskHandler());
}

/// Corre DENTRO del foreground service (isolate separado, sobrevive pantalla
/// bloqueada incluso en Xiaomi). Reconecta Supabase, se autentica con el token
/// de la sesion y escribe la posicion directo en la tabla members.
class RideLocationTaskHandler extends TaskHandler {
  StreamSubscription<Position>? _sub;
  Position? _last;
  SupabaseClient? _sb;
  String? _rideId;
  String? _uid;

  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    final raw = await FlutterForegroundTask.getData<String>(key: 'ride_data');
    final parts = (raw ?? '').split('|');
    String? refresh;
    if (parts.length >= 2) {
      _rideId = parts[0];
      _uid = parts[1];
    }
    if (parts.length >= 3 && parts[2].isNotEmpty) {
      refresh = parts[2];
    }

    try {
      await Supabase.initialize(url: kSupabaseUrl, anonKey: kSupabaseAnonKey);
    } catch (_) {}
    try {
      _sb = Supabase.instance.client;
    } catch (_) {}

    if (_sb != null && refresh != null) {
      try {
        await _sb!.auth.setSession(refresh);
      } catch (_) {}
    }

    _sub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen((pos) => _last = pos, onError: (_) {});

    try {
      _last = await Geolocator.getCurrentPosition(
        locationSettings:
            const LocationSettings(accuracy: LocationAccuracy.high),
      );
    } catch (_) {}
    await _push();
  }

  // Heartbeat: cada 4 s reescribe la posicion aunque este detenido.
  @override
  void onRepeatEvent(DateTime timestamp) {
    _push();
  }

  Future<void> _push() async {
    final p = _last;
    if (p == null || _sb == null || _rideId == null || _uid == null) return;
    try {
      await _sb!
          .from('members')
          .update({
            'lat': p.latitude,
            'lon': p.longitude,
            'speed_kmh': (p.speed * 3.6).clamp(0, 400),
            'last_seen': DateTime.now().toUtc().toIso8601String(),
          })
          .eq('ride_id', _rideId!)
          .eq('uid', _uid!);
    } catch (_) {}
  }

  @override
  Future<void> onReceiveData(Object data) async {}

  @override
  void onNotificationButtonPressed(String id) {}

  @override
  void onNotificationPressed() {}

  @override
  void onNotificationDismissed() {}

  @override
  Future<void> onDestroy(DateTime timestamp) async {
    await _sub?.cancel();
    _sub = null;
  }
}

/// Fachada usada por el resto de la app. Arranca/para el foreground service.
class LocationService {
  Future<bool> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) {
      p = await Geolocator.requestPermission();
    }
    return p == LocationPermission.always || p == LocationPermission.whileInUse;
  }

  /// Devuelve true si las notificaciones estan habilitadas (incluye MIUI).
  Future<bool> ensureNotificationPermission() async {
    final status = await Permission.notification.status;
    if (status.isGranted) return true;
    final result = await Permission.notification.request();
    if (result.isGranted) return true;
    // Si MIUI las bloquea, abre ajustes de la app para que el usuario las active.
    await openAppSettings();
    return false;
  }

  /// Arranca el servicio de ubicacion en foreground (sobrevive pantalla bloqueada).
  Future<bool> start({required String rideId, required String uid}) async {
    if (!await ensurePermission()) return false;
    if (!await ensureNotificationPermission()) return false;

    final refresh =
        Supabase.instance.client.auth.currentSession?.refreshToken ?? '';

    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'ridera_gps_v4',
        channelName: 'RIDERA GPS',
        channelDescription: 'Comparte tu ubicacion con el convoy',
        channelImportance: NotificationChannelImportance.DEFAULT,
        priority: NotificationPriority.DEFAULT,
      ),
      iosNotificationOptions: const IOSNotificationOptions(),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.repeat(4000),
        autoRunOnBoot: false,
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );

    await FlutterForegroundTask.saveData(
        key: 'ride_data', value: '$rideId|$uid|$refresh');

    if (await FlutterForegroundTask.isRunningService) {
      await FlutterForegroundTask.restartService();
    } else {
      await FlutterForegroundTask.startService(
        notificationTitle: 'RIDERA - Rodada activa',
        notificationText: 'Compartiendo tu ubicacion con el convoy',
        callback: startLocationCallback,
      );
    }
    return true;
  }

  Future<void> stop() async {
    try {
      await FlutterForegroundTask.stopService();
    } catch (_) {}
  }
}
