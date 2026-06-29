import 'package:flutter/material.dart';
import '../ride_controller.dart';
import '../models/rider.dart';
import '../services/ride_repository.dart';
import '../theme.dart';

class PreRodadaScreen extends StatelessWidget {
  final RideController controller;
  final RideRepository? repo;
  final String? rideId;
  final bool isLeader;
  final String? joinCode;
  final VoidCallback onStart;

  const PreRodadaScreen({
    super.key,
    required this.controller,
    required this.onStart,
    this.repo,
    this.rideId,
    this.isLeader = true,
    this.joinCode,
  });

  bool get _live => repo != null && rideId != null;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('PRE-RODADA',
                style: TextStyle(
                    color: RColors.inkFaint,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 3,
                    fontSize: 11)),
            const SizedBox(height: 4),
            Text(controller.rideName,
                style:
                    const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            if (_live && joinCode != null) _codeBanner(context),
            const SizedBox(height: 14),
            Expanded(child: _live ? _liveBody(context) : _demoBody(context)),
            if (isLeader) ...[
              const SizedBox(height: 8),
              SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: onStart,
                    icon: const Icon(Icons.flag_rounded),
                    label: const Text('ARRANCAR RODADA'),
                  )),
            ],
          ],
        ),
      ),
    );
  }

  Widget _codeBanner(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: RColors.brand.withValues(alpha: 0.12),
          border: Border.all(color: RColors.brand.withValues(alpha: 0.5)),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('CÓDIGO PARA UNIRSE',
                style: TextStyle(
                    color: RColors.inkDim, fontSize: 10, letterSpacing: 2)),
            const SizedBox(height: 4),
            Text(joinCode!,
                style: const TextStyle(
                    color: RColors.brand,
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 6)),
          ]),
          const Spacer(),
          const Icon(Icons.qr_code_2_rounded, color: RColors.brand, size: 44),
        ]),
      );

  Widget _liveBody(BuildContext context) {
    if (!isLeader) {
      return StreamBuilder<List<Rider>>(
        stream: repo!.membersStream(rideId!),
        builder: (context, snap) {
          final aprobados = snap.data ?? [];
          final yaAprobado = aprobados.any((r) => r.id == controller.myUid && r.role != RiderRole.pendiente);
          if (yaAprobado) {
            return Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.check_circle_rounded,
                    color: RColors.ok, size: 44),
                const SizedBox(height: 12),
                const Text('¡Ya estás en la rodada!',
                    style:
                        TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                const SizedBox(height: 4),
                const Text('El líder te aprobó.',
                    style: TextStyle(color: RColors.inkDim)),
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: onStart,
                  icon: const Icon(Icons.sensors_rounded),
                  label: const Text('VER EL PANEL'),
                ),
              ]),
            );
          }
          return const Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.hourglass_top_rounded, color: RColors.warn, size: 40),
              SizedBox(height: 12),
              Text('Esperando aprobación del líder…',
                  style: TextStyle(color: RColors.inkDim)),
            ]),
          );
        },
      );
    }
    return StreamBuilder<List<Rider>>(
      stream: repo!.pendingStream(rideId!),
      builder: (context, snap) {
        final pending = snap.data ?? [];
        return ListenableBuilder(
          listenable: controller,
          builder: (context, _) {
            final approved = controller.riders.length;
            return ListView(children: [
              Row(children: [
                _stat('$approved', 'En la rodada', RColors.ok),
                const SizedBox(width: 10),
                _stat('${pending.length}', 'Pendientes', RColors.warn),
              ]),
              const SizedBox(height: 18),
              const Text('Solicitudes',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              const SizedBox(height: 8),
              if (pending.isEmpty)
                const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Center(
                        child: Text('Sin solicitudes nuevas.',
                            style: TextStyle(color: RColors.inkDim)))),
              ...pending.map((r) => _requestTile(
                    r.name,
                    onApprove: () => repo!.approve(rideId!, r.id),
                    onReject: () => repo!.remove(rideId!, r.id),
                  )),
            ]);
          },
        );
      },
    );
  }

  Widget _demoBody(BuildContext context) => const _DemoPending();

  Widget _stat(String n, String k, Color c) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
              color: RColors.asphalt2,
              border: Border.all(color: RColors.line),
              borderRadius: BorderRadius.circular(12)),
          child: Column(children: [
            Text(n,
                style: TextStyle(
                    color: c, fontSize: 26, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(k,
                style: const TextStyle(
                    color: RColors.inkDim, fontSize: 11, letterSpacing: 1.5)),
          ]),
        ),
      );

  Widget _requestTile(String name,
          {required VoidCallback onApprove, required VoidCallback onReject}) =>
      Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
        decoration: BoxDecoration(
            color: RColors.asphalt2,
            border: Border.all(color: RColors.line),
            borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          CircleAvatar(
              backgroundColor: RColors.asphalt3,
              child: Text(name.isNotEmpty ? name[0] : '?',
                  style: const TextStyle(color: RColors.ink))),
          const SizedBox(width: 12),
          Expanded(
              child: Text(name,
                  style: const TextStyle(fontWeight: FontWeight.w600))),
          IconButton(
              onPressed: onReject,
              icon: const Icon(Icons.close_rounded, color: RColors.inkDim),
              tooltip: 'Rechazar'),
          IconButton(
              onPressed: onApprove,
              icon: const Icon(Icons.check_circle_rounded, color: RColors.ok),
              tooltip: 'Aprobar'),
        ]),
      );
}

class _DemoPending extends StatefulWidget {
  const _DemoPending();
  @override
  State<_DemoPending> createState() => _DemoPendingState();
}

class _DemoPendingState extends State<_DemoPending> {
  final _pending = <String>[
    'Sofía Restrepo',
    'Andrés Mejía',
    'Diego Patiño',
    'Laura Gómez'
  ];
  int _approved = 0;

  @override
  Widget build(BuildContext context) {
    return ListView(children: [
      Row(children: [
        _stat('$_approved', 'Aprobados', RColors.ok),
        const SizedBox(width: 10),
        _stat('${_pending.length}', 'Pendientes', RColors.warn),
      ]),
      const SizedBox(height: 18),
      const Text('Solicitudes',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
      const SizedBox(height: 8),
      ..._pending.map((name) => Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
            decoration: BoxDecoration(
                color: RColors.asphalt2,
                border: Border.all(color: RColors.line),
                borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              CircleAvatar(
                  backgroundColor: RColors.asphalt3,
                  child: Text(name[0],
                      style: const TextStyle(color: RColors.ink))),
              const SizedBox(width: 12),
              Expanded(
                  child: Text(name,
                      style: const TextStyle(fontWeight: FontWeight.w600))),
              IconButton(
                  onPressed: () => setState(() => _pending.remove(name)),
                  icon: const Icon(Icons.close_rounded, color: RColors.inkDim)),
              IconButton(
                  onPressed: () => setState(() {
                        _pending.remove(name);
                        _approved++;
                      }),
                  icon: const Icon(Icons.check_circle_rounded,
                      color: RColors.ok)),
            ]),
          )),
    ]);
  }

  Widget _stat(String n, String k, Color c) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
              color: RColors.asphalt2,
              border: Border.all(color: RColors.line),
              borderRadius: BorderRadius.circular(12)),
          child: Column(children: [
            Text(n,
                style: TextStyle(
                    color: c, fontSize: 26, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(k,
                style: const TextStyle(
                    color: RColors.inkDim, fontSize: 11, letterSpacing: 1.5)),
          ]),
        ),
      );
}
