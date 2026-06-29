import 'dart:async';
import 'dart:math';
import 'package:sensors_plus/sensors_plus.dart';

class CrashDetector {
  final double impactThreshold;
  final Duration cooldown;

  StreamSubscription<AccelerometerEvent>? _sub;
  DateTime _lastImpact = DateTime.fromMillisecondsSinceEpoch(0);

  int _hitsInARow = 0;
  static const _requiredHits = 3;

  CrashDetector({
    this.impactThreshold = 58.0,
    this.cooldown = const Duration(seconds: 30),
  });

  void start(void Function() onImpact) {
    _sub = accelerometerEventStream(
      samplingPeriod: SensorInterval.gameInterval,
    ).listen((e) {
      final magnitude = sqrt(e.x * e.x + e.y * e.y + e.z * e.z);
      if (magnitude >= impactThreshold) {
        _hitsInARow++;
        if (_hitsInARow >= _requiredHits) {
          final now = DateTime.now();
          if (now.difference(_lastImpact) > cooldown) {
            _lastImpact = now;
            _hitsInARow = 0;
            onImpact();
          }
        }
      } else {
        _hitsInARow = 0;
      }
    });
  }

  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
  }
}
