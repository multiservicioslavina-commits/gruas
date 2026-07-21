import 'dart:async';
import 'package:flutter/material.dart';
import '../ride_controller.dart';
import '../services/ride_repository.dart';
import '../services/safety_service.dart';
import '../theme.dart';
import 'pre_rodada_screen.dart';
import 'leader_panel_screen.dart';
import 'ride_map_screen.dart';

class RideraHome extends StatefulWidget {
  final RideController controller;
  final RideRepository repo;
  final String rideId;
  final bool isLeader;
  final String joinCode;

  const RideraHome({
    super.key,
    required this.controller,
    required this.repo,
    required this.rideId,
    required this.isLeader,
    required this.joinCode,
  });

  @override
  State<RideraHome> createState() => _RideraHomeState();
}

class _RideraHomeState extends State<RideraHome> {
  bool _started = false;
  DateTime? _startedAt;
  StreamSubscription<void>? _crashSub;

  @override
  void initState() {
    super.initState();
    _crashSub = widget.controller.crashSuspected.listen((_) => _onCrash());
    // Auto-arrancar solo el GPS (para no perder posición mientras esperan
    // en pre-rodada), PERO la pantalla se queda en PRE-RODADA hasta que
    // el líder toque "COMENZAR RODADA".
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await widget.controller.startLocation().catchError((_) => false);
    });
  }

  @override
  void dispose() {
    _crashSub?.cancel();
    super.dispose();
  }

  Future<void> _onCrash() async {
    if (!mounted) return;
    final c = widget.controller;
    final confirm = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        backgroundColor: RColors.asphalt3,
        title: const Row(children: [
          Icon(Icons.warning_amber, color: RColors.sos, size: 28),
          SizedBox(width: 8),
          Text('¿Caída detectada?', style: TextStyle(color: RColors.sos)),
        ]),
        content: const Text(
          'Se detectó un impacto fuerte. Si no cancelas en 15 segundos se enviará SOS automáticamente.',
          style: TextStyle(color: RColors.ink),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child:
                const Text('Estoy bien', style: TextStyle(color: RColors.ok)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('ENVIAR SOS',
                style: TextStyle(
                    color: RColors.sos, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirm == true || confirm == null) {
      await c.confirmCrashSos();
      if (c.emergencyPhone.isNotEmpty) {
        SafetyService.openSmsToContact(
          contactPhone: c.emergencyPhone,
          riderName: c.rideName,
          lat: c.myLat,
          lon: c.myLon,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_started,
      onPopInvokedWithResult: (didPop, __) {
        if (didPop) return;
      },
      child: _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (!_started) {
      return Scaffold(
        backgroundColor: RColors.asphalt,
        appBar: AppBar(
          automaticallyImplyLeading: false,
          backgroundColor: RColors.asphalt,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ),
        body: PreRodadaScreen(
          controller: widget.controller,
          repo: widget.repo,
          rideId: widget.rideId,
          isLeader: widget.isLeader,
          joinCode: widget.joinCode,
          onStart: () async {
            final ok = await widget.controller.startLocation().catchError((_) => false);
            if (!mounted) return;
            if (ok == false) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                    'Activa las notificaciones de RIDERA en Ajustes y vuelve a presionar ARRANCAR.',
                    style: TextStyle(color: Colors.white),
                  ),
                  backgroundColor: Color(0xFFE85D20),
                  duration: Duration(seconds: 6),
                ),
              );
              return;
            }
            setState(() { _started = true; _startedAt = DateTime.now(); });
          },
        ),
      );
    }

    if (widget.isLeader) {
      return Scaffold(
        backgroundColor: RColors.asphalt,
        appBar: AppBar(
          automaticallyImplyLeading: false,
          backgroundColor: RColors.asphalt,
          elevation: 0,
        ),
        body: LeaderPanelScreen(controller: widget.controller),
        floatingActionButton: FloatingActionButton(
          onPressed: () {
            Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => RideMapScreen(
                rideId: widget.rideId,
                isLider: true,
                rideName: widget.controller.rideName,
                startedAt: _startedAt,
              ),
            ));
          },
          backgroundColor: RColors.brand,
          child: const Icon(Icons.map, color: Colors.white),
        ),
      );
    }

    return RideMapScreen(
      rideId: widget.rideId,
      isLider: false,
      rideName: widget.controller.rideName,
      startedAt: _startedAt,
    );
  }
}
