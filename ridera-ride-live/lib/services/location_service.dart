import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LocationService {
  StreamSubscription<Position>? _gpsSub;
  Timer? _heartbeat;
  Position? _last;
  String? _rideId;
  String? _uid;

  double get lat => _last?.latitude ?? 0;
  double get lon => _last?.longitude ?? 0;

  Future<bool> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) {
      p = await Geolocator.requestPermission();
    }
    return p == LocationPermission.always || p == LocationPermission.whileInUse;
  }

  Future<bool> start({required String rideId, required String uid}) async {
    if (!await ensurePermission()) return false;
    _rideId = rideId;
    _uid = uid;

    _gpsSub?.cancel();
    _heartbeat?.cancel();

    // Stream de posicion — actualiza _last cada vez que hay movimiento
    _gpsSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5,
      ),
    ).listen((p) => _last = p, onError: (_) {});

    // Fix inicial
    try {
      _last = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      await _push();
    } catch (_) {}

    // Heartbeat: publica cada 4s aunque no haya movimiento
    _heartbeat = Timer.periodic(const Duration(seconds: 4), (_) => _push());
    return true;
  }

  Future<void> _push() async {
    final p = _last;
    if (p == null || _rideId == null || _uid == null) return;
    try {
      await Supabase.instance.client
          .from('members')
          .update({
            'lat': p.latitude,
            'lon': p.longitude,
            'speed_kmh': (p.speed * 3.6).clamp(0, 300),
            'last_seen': DateTime.now().toUtc().toIso8601String(),
          })
          .eq('ride_id', _rideId!)
          .eq('uid', _uid!);
    } catch (_) {}
  }

  Future<void> stop() async {
    await _gpsSub?.cancel();
    _heartbeat?.cancel();
    _gpsSub = null;
    _heartbeat = null;
    _last = null;
  }
}
