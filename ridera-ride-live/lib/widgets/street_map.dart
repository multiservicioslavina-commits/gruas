import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../ride_controller.dart';
import '../models/rider.dart';
import 'rider_marker.dart';
import '../services/ride_status.dart';

class StreetMap extends StatelessWidget {
  final RideController controller;
  final String? selectedId;
  final void Function(String id) onTapNode;
  final String tileUrl;

  const StreetMap({
    super.key,
    required this.controller,
    this.selectedId,
    required this.onTapNode,
    this.tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  });

  @override
  Widget build(BuildContext context) {
    final pts = controller.riders
        .where((r) => r.lat != null && r.lon != null)
        .toList();

    final markers = pts.map((r) {
      final rideStatus = switch (r.status) {
        RiderStatus.ok => RideStatus.enMarcha,
        RiderStatus.rezagado => RideStatus.detenido,
        RiderStatus.falla => RideStatus.falla,
        RiderStatus.sos => RideStatus.sos,
        RiderStatus.offline => RideStatus.perdido,
      };
      return riderMarker(
        position: LatLng(r.lat!, r.lon!),
        nombre: r.name,
        status: rideStatus,
        speedKmh: r.speedKmh,
        isMe: r.id == controller.myUid,
        isLider: r.isLeader,
      );
    }).toList();

    return SizedBox(
      height: 280,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(0),
        child: FlutterMap(
          options: MapOptions(
            initialCenter: pts.isNotEmpty
                ? LatLng(pts.first.lat!, pts.first.lon!)
                : const LatLng(6.25, -75.57),
            initialZoom: 13,
          ),
          children: [
            TileLayer(
              urlTemplate: tileUrl,
              userAgentPackageName: 'co.ridera.ridelive',
            ),
            MarkerLayer(markers: markers),
          ],
        ),
      ),
    );
  }
}
