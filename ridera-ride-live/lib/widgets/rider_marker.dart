import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../services/ride_status.dart';

Color statusColor(RideStatus s) => switch (s) {
      RideStatus.enMarcha => const Color(0xFF4ade80),
      RideStatus.detenido => const Color(0xFFfbbf24),
      RideStatus.perdido => const Color(0xFFef4444),
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
  final size = isMe ? 48.0 : 40.0;

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
            color: const Color(0xFF141414),
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: color, width: 0.5),
          ),
          child: Text(
            '${isLider ? "⭐ " : ""}$nombre',
            style: TextStyle(
              color: color,
              fontSize: 10,
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
            color: color.withOpacity(0.2),
            border: Border.all(color: color, width: isMe ? 3 : 2),
          ),
          child: Icon(
            isLider ? Icons.star : Icons.sports_motorsports,
            color: color,
            size: isMe ? 24 : 20,
          ),
        ),
      ],
    ),
  );
}
