import 'dart:math';
import 'package:flutter/material.dart';
import '../ride_controller.dart';
import '../models/rider.dart';
import '../theme.dart';

class MeshMap extends StatelessWidget {
  final RideController controller;
  final String? selectedId;
  final void Function(String id) onTapNode;

  const MeshMap({
    super.key,
    required this.controller,
    this.selectedId,
    required this.onTapNode,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 280,
      child: Container(
        color: RColors.asphalt,
        child: CustomPaint(
          painter: _MeshPainter(controller.riders, selectedId),
          child: Stack(
            children: [
              for (int i = 0; i < controller.riders.length; i++)
                _buildNode(context, controller.riders[i], i),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNode(BuildContext context, Rider r, int index) {
    final total = controller.riders.length;
    final angle = (2 * pi * index / total) - pi / 2;
    final cx = 0.5 + 0.32 * cos(angle);
    final cy = 0.5 + 0.32 * sin(angle);
    if (r.isLeader) {
      return _positioned(0.5, 0.5, r);
    }
    return _positioned(cx, cy, r);
  }

  Widget _positioned(double fx, double fy, Rider r) {
    final selected = r.id == selectedId;
    final color = r.status.color;
    return Positioned(
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      child: Align(
        alignment: Alignment(fx * 2 - 1, fy * 2 - 1),
        child: GestureDetector(
          onTap: () => onTapNode(r.id),
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color.withValues(alpha: selected ? 0.4 : 0.15),
              border: Border.all(color: color, width: selected ? 3 : 1.5),
            ),
            child: Center(
              child: Text(
                r.name.isNotEmpty ? r.name[0] : '?',
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MeshPainter extends CustomPainter {
  final List<Rider> riders;
  final String? selectedId;

  _MeshPainter(this.riders, this.selectedId);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = RColors.line
      ..strokeWidth = 1;

    final center = Offset(size.width / 2, size.height / 2);
    for (int i = 0; i < riders.length; i++) {
      if (riders[i].isLeader) continue;
      final angle = (2 * pi * i / riders.length) - pi / 2;
      final p = Offset(
        center.dx + size.width * 0.32 * cos(angle),
        center.dy + size.height * 0.32 * sin(angle),
      );
      canvas.drawLine(center, p, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _MeshPainter old) => true;
}
