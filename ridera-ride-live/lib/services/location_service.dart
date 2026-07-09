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
      await _channel.invokeMethod('setRideActive', {'active': true});
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> refreshToken() async {
    final accessToken =
        Supabase.instance.client.auth.currentSession?.accessToken ?? '';
    if (accessToken.isEmpty) return;
    try {
      await _channel.invokeMethod('refreshToken', {
        'accessToken': accessToken,
      });
    } catch (_) {}
  }

  Future<void> stop() async {
    try {
      await _channel.invokeMethod('setRideActive', {'active': false});
      await _channel.invokeMethod('stop');
    } catch (_) {}
  }

  /// true = está optimizada (la app puede ser matada)
  Future<bool> isBatteryOptimized() async {
    try {
      return await _channel.invokeMethod<bool>('isBatteryOptimized') ?? false;
    } catch (_) { return false; }
  }

  /// Muestra el diálogo del sistema pidiendo ignorar optimización de batería
  Future<void> requestIgnoreBatteryOptimization() async {
    try {
      await _channel.invokeMethod('requestIgnoreBatteryOptimization');
    } catch (_) {}
  }

  /// Abre la pantalla de autoarranque del fabricante (Xiaomi, Huawei, etc.)
  /// Retorna true si logró abrirla.
  Future<bool> openAutoStartSettings() async {
    try {
      return await _channel.invokeMethod<bool>('openAutoStartSettings') ?? false;
    } catch (_) { return false; }
  }
}
