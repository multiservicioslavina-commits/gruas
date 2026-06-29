import 'dart:async';
import 'dart:math';
import 'package:sensors_plus/sensors_plus.dart';

class CrashDetector {
  static const double _threshold = 40.0; // m/s² (~4 G)

  StreamSubscription<AccelerometerEvent>? _sub;
  VoidCallback? _onCrash;

  void start(VoidCallback onCrash) {
    _onCrash = onCrash;
    _sub = accelerometerEventStream().listen((e) {
      final mag = sqrt(e.x * e.x + e.y * e.y + e.z * e.z);
      if (mag > _threshold) {
        _onCrash?.call();
      }
    });
  }

  void stop() {
    _sub?.cancel();
    _sub = null;
    _onCrash = null;
  }
}
