import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LocationService {
  Timer? _pushTimer;
  Position? _last;
  String? _rideId;
  String? _uid;

  Future<bool> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) {
      p = await Geolocator.requestPermission();
    }
    return p == LocationPermission.always || p == LocationPermission.whileInUse;
  }

  Future<void> start({required String rideId, required String uid}) async {
    if (!await ensurePermission()) return;

    _rideId = rideId;
    _uid = uid;

    await _poll();

    _pushTimer?.cancel();
    _pushTimer = Timer.periodic(const Duration(seconds: 4), (_) => _poll());
  }

  Future<void> _poll() async {
    try {
      _last = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
    } catch (_) {}
    await _push();
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
            'speed_kmh': (p.speed * 3.6).clamp(0, 400),
            'last_seen': DateTime.now().toUtc().toIso8601String(),
          })
          .eq('ride_id', _rideId!)
          .eq('uid', _uid!);
    } catch (_) {}
  }

  Future<void> stop() async {
    _pushTimer?.cancel();
    _pushTimer = null;
  }
}
