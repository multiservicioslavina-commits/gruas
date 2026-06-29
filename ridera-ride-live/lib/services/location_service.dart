import 'dart:async';
import 'dart:developer' as dev;
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../supabase_config.dart';

// ─── Isolate entry point (MUST be top-level) ────────────────────────
@pragma('vm:entry-point')
void startLocationCallback() {
  FlutterForegroundTask.setTaskHandler(_RideTaskHandler());
}

// ─── Task handler: runs inside the foreground-service isolate ───────
class _RideTaskHandler extends TaskHandler {
  StreamSubscription<Position>? _gpsSub;
  Position? _last;
  SupabaseClient? _sb;
  String? _rideId;
  String? _uid;

  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    final raw = await FlutterForegroundTask.getData<String>(key: 'ride_data');
    final parts = (raw ?? '').split('|');

    if (parts.length < 2) {
      _log('ride_data incompleto: $raw');
      return;
    }

    _rideId = parts[0];
    _uid = parts[1];
    final refresh = parts.length >= 3 && parts[2].isNotEmpty ? parts[2] : null;

    await _initSupabase(refresh);
    _startGps();
  }

  Future<void> _initSupabase(String? refreshToken) async {
    try {
      await Supabase.initialize(url: kSupabaseUrl, anonKey: kSupabaseAnonKey);
    } on AssertionError catch (_) {
      // Already initialized in this isolate — safe to continue.
    } catch (e) {
      _log('Supabase.initialize error: $e');
    }

    try {
      _sb = Supabase.instance.client;
    } catch (e) {
      _log('Supabase.instance error: $e');
      return;
    }

    if (refreshToken != null) {
      try {
        await _sb!.auth.setSession(refreshToken);
      } catch (e) {
        _log('setSession error: $e');
      }
    }
  }

  void _startGps() {
    _gpsSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen(
      (pos) => _last = pos,
      onError: (e) => _log('GPS stream error: $e'),
    );

    Geolocator.getCurrentPosition(
      locationSettings:
          const LocationSettings(accuracy: LocationAccuracy.high),
    ).then((pos) {
      _last = pos;
      _push();
    }).catchError((e) => _log('getCurrentPosition error: $e'));
  }

  @override
  void onRepeatEvent(DateTime timestamp) => _push();

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
    } catch (e) {
      _log('push error: $e');
    }
  }

  @override
  Future<void> onDestroy(DateTime timestamp) async {
    await _gpsSub?.cancel();
    _gpsSub = null;
  }

  @override
  Future<void> onReceiveData(Object data) async {}
  @override
  void onNotificationButtonPressed(String id) {}
  @override
  void onNotificationPressed() {}
  @override
  void onNotificationDismissed() {}

  void _log(String msg) => dev.log('[RideTask] $msg');
}

// ─── Public facade used by the rest of the app ──────────────────────
class LocationService {
  bool _initialized = false;

  Future<bool> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) {
      p = await Geolocator.requestPermission();
    }
    return p == LocationPermission.always ||
        p == LocationPermission.whileInUse;
  }

  Future<void> start({required String rideId, required String uid}) async {
    if (!await ensurePermission()) return;

    final refresh =
        Supabase.instance.client.auth.currentSession?.refreshToken ?? '';

    if (!_initialized) {
      FlutterForegroundTask.init(
        androidNotificationOptions: AndroidNotificationOptions(
          channelId: 'ridera_ride',
          channelName: 'Rodada RIDERA',
          channelDescription: 'Comparte tu ubicación con el convoy',
        ),
        iosNotificationOptions: const IOSNotificationOptions(),
        foregroundTaskOptions: ForegroundTaskOptions(
          eventAction: ForegroundTaskEventAction.repeat(4000),
          autoRunOnBoot: false,
          allowWakeLock: true,
          allowWifiLock: true,
        ),
      );
      _initialized = true;
    }

    await FlutterForegroundTask.saveData(
      key: 'ride_data',
      value: '$rideId|$uid|$refresh',
    );

    if (await FlutterForegroundTask.isRunningService) {
      await FlutterForegroundTask.restartService();
    } else {
      await FlutterForegroundTask.startService(
        notificationTitle: 'RIDERA · Rodada activa',
        notificationText: 'Compartiendo tu ubicación con el convoy',
        callback: startLocationCallback,
      );
    }
  }

  Future<void> stop() async {
    try {
      await FlutterForegroundTask.stopService();
    } catch (e) {
      dev.log('[LocationService] stop error: $e');
    }
  }
}
