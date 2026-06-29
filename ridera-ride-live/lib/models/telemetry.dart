class Telemetry {
  const Telemetry({
    required this.nodeId,
    required this.lat,
    required this.lon,
    required this.status,
    required this.time,
    this.speedKmh = 0,
  });

  final int nodeId;
  final double lat;
  final double lon;
  final int status;
  final DateTime time;
  final double speedKmh;
}
