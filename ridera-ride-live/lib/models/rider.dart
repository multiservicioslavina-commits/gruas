import 'dart:ui';

enum RiderRole { lider, integrante, escoba, pendiente }

enum RiderStatus {
  ok,
  rezagado,
  falla,
  sos,
  offline;

  int get code => index;

  factory RiderStatus.fromCode(int c) =>
      c >= 0 && c < values.length ? values[c] : ok;

  Color get color => switch (this) {
        ok => const Color(0xFF4ade80),
        rezagado => const Color(0xFFfbbf24),
        falla => const Color(0xFFf97316),
        sos => const Color(0xFFef4444),
        offline => const Color(0xFF555555),
      };

  String get label => switch (this) {
        ok => 'OK',
        rezagado => 'Rezagado',
        falla => 'Falla',
        sos => 'SOS',
        offline => 'Sin señal',
      };
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
              : m['rol'] == 'pendiente'
                  ? RiderRole.pendiente
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
