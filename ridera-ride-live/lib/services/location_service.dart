import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LocationService {
  StreamSubscription<Position>? _sub;
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

  LocationSettings _buildSettings() {
    if (Platform.isAndroid) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'RIDERA Ride Live',
          notificationText: 'Rastreando tu ubicación en la rodada',
          notificationIcon:
              AndroidResource(name: 'ic_launcher', defType: 'mipmap'),
          enableWakeLock: true,
          setOngoing: true,
          color: Colors.deepOrange,
        ),
      );
    }
    return const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10,
    );
  }

  Future<void> start({required String rideId, required String uid}) async {
    if (!await ensurePermission()) return;

    _rideId = rideId;
    _uid = uid;

    try {
      _last = await Geolocator.getCurrentPosition(
        locationSettings:
            const LocationSettings(accuracy: LocationAccuracy.high),
      );
    } catch (_) {}

    _sub = Geolocator.getPositionStream(
      locationSettings: _buildSettings(),
    ).listen((pos) => _last = pos, onError: (_) {});

    _pushTimer?.cancel();
    _pushTimer = Timer.periodic(const Duration(seconds: 4), (_) => _push());
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
    await _sub?.cancel();
    _sub = null;
  }
}
