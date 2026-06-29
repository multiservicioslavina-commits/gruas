import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LocationService {
  Timer? _pushTimer;
  String? _rideId;
  String? _uid;
  double _lat = 0;
  double _lon = 0;
  double _speed = 0;

  double get lat => _lat;
  double get lon => _lon;
  double get speed => _speed;

  Future<void> start({required String rideId, required String uid}) async {
    _rideId = rideId;
    _uid = uid;

    await Permission.notification.request();

    await Permission.locationWhenInUse.request();

    _pushTimer?.cancel();
    _pushTimer = Timer.periodic(const Duration(seconds: 5), (_) => _tick());
    await _tick();
  }

  Future<void> _tick() async {
    if (_rideId == null || _uid == null) return;
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 4),
        ),
      );
      _lat = pos.latitude;
      _lon = pos.longitude;
      _speed = (pos.speed * 3.6).clamp(0, 999);

      await Supabase.instance.client
          .from('members')
          .update({
            'lat': _lat,
            'lon': _lon,
            'speed_kmh': _speed,
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
