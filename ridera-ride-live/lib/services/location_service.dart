import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LocationService {
  static const _channel = MethodChannel('com.ridera.ridelive/gps');

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

    final accessToken =
        Supabase.instance.client.auth.currentSession?.accessToken ?? '';

    try {
      await _channel.invokeMethod('start', {
        'rideId': rideId,
        'uid': uid,
        'accessToken': accessToken,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> stop() async {
    try {
      await _channel.invokeMethod('stop');
    } catch (_) {}
  }
}
