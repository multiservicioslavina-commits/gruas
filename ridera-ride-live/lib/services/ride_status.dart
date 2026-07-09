enum RideStatus { enMarcha, detenido, perdido, sos, falla }

RideStatus memberStatus({
  required DateTime lastSeen,
  required double speedKmh,
  int statusCode = 0,
}) {
  // status_code from DB takes priority: 3=sos, 2=falla
  if (statusCode == 3) return RideStatus.sos;
  if (statusCode == 2) return RideStatus.falla;

  final secs = DateTime.now().toUtc().difference(lastSeen.toUtc()).inSeconds;
  if (secs > 30) return RideStatus.perdido;
  if (speedKmh < 3) return RideStatus.detenido;
  return RideStatus.enMarcha;
}
