enum RiderRole { lider, integrante, escoba }

enum RiderStatus {
  ok,
  rezagado,
  falla,
  sos,
  offline;

  int get code => index;

  factory RiderStatus.fromCode(int c) =>
      c >= 0 && c < values.length ? values[c] : ok;
}

enum LinkType { directo, mesh, offline }

class Rider {
  Rider({
    required this.id,
    required this.name,
    this.role = RiderRole.integrante,
    this.status = RiderStatus.ok,
    this.link = LinkType.directo,
    this.relayVia,
    this.lat,
    this.lon,
    this.speedKmh = 0,
    this.lastSeen,
    this.emergencyName,
    this.emergencyPhone,
  });

  final String id;
  final String name;
  RiderRole role;
  RiderStatus status;
  LinkType link;
  String? relayVia;
  double? lat;
  double? lon;
  double speedKmh;
  DateTime? lastSeen;
  String? emergencyName;
  String? emergencyPhone;

  bool get isLeader => role == RiderRole.lider;

  factory Rider.fromSupabase(Map<String, dynamic> m) {
    final statusCode = m['status_code'] as int? ?? 0;
    return Rider(
      id: m['uid'] ?? '',
      name: m['nombre'] ?? '',
      role: m['rol'] == 'lider'
          ? RiderRole.lider
          : m['rol'] == 'escoba'
              ? RiderRole.escoba
              : RiderRole.integrante,
      status: RiderStatus.fromCode(statusCode),
      lat: (m['lat'] as num?)?.toDouble(),
      lon: (m['lon'] as num?)?.toDouble(),
      speedKmh: (m['speed_kmh'] as num?)?.toDouble() ?? 0,
      lastSeen: m['last_seen'] != null
          ? DateTime.parse(m['last_seen']).toUtc()
          : null,
      emergencyName: m['emergency_name'],
      emergencyPhone: m['emergency_phone'],
    );
  }
}
