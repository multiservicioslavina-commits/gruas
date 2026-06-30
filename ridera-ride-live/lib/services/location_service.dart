import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LocationService {
  static const _channel = MethodChannel('com.ridera.ridelive/gps');

  Future<bool> ensurePermission() async {
    var status = await Permission.locationWhenInUse.status;
    if (!status.isGranted) {
      status = await Permission.locationWhenInUse.request();
    }
    return status.isGranted;
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
