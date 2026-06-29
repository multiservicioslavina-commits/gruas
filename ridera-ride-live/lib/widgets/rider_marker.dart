import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../services/ride_status.dart';

Color statusColor(RideStatus s) => switch (s) {
      RideStatus.enMarcha => const Color(0xFF4ade80),
      RideStatus.detenido => const Color(0xFFfbbf24),
      RideStatus.perdido => const Color(0xFFef4444),
      RideStatus.sos => const Color(0xFFef4444),
      RideStatus.falla => const Color(0xFFf97316),
    };

Marker riderMarker({
  required LatLng position,
  required String nombre,
  required RideStatus status,
  required double speedKmh,
  required bool isMe,
  required bool isLider,
}) {
  final color = statusColor(status);
  final isSos = status == RideStatus.sos;
  final size = isSos ? 52.0 : (isMe ? 48.0 : 40.0);

  return Marker(
    point: position,
    width: size + 60,
    height: size + 20,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: isSos ? const Color(0xFF3b1111) : const Color(0xFF141414),
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: color, width: isSos ? 1.5 : 0.5),
          ),
          child: Text(
            '${isSos ? "⚠ " : ""}${isLider ? "⭐ " : ""}$nombre',
            style: TextStyle(
              color: color,
              fontSize: isSos ? 11 : 10,
              fontWeight: FontWeight.w600,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        const SizedBox(height: 2),
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color.withValues(alpha: isSos ? 0.4 : 0.2),
            border: Border.all(color: color, width: isSos ? 4 : (isMe ? 3 : 2)),
          ),
          child: Icon(
            isSos
                ? Icons.sos
                : isLider
                    ? Icons.star
                    : Icons.sports_motorsports,
            color: color,
            size: isMe ? 24 : 20,
          ),
        ),
      ],
    ),
  );
}
