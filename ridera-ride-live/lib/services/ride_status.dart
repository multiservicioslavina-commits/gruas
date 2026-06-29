enum RideStatus { enMarcha, detenido, perdido }

RideStatus memberStatus({
  required DateTime lastSeen,
  required double speedKmh,
}) {
  final secs = DateTime.now().toUtc().difference(lastSeen.toUtc()).inSeconds;
  if (secs > 15) return RideStatus.perdido;
  if (speedKmh < 3) return RideStatus.detenido;
  return RideStatus.enMarcha;
}
