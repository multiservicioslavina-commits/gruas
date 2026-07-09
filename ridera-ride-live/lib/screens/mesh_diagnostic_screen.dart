import 'dart:async';
import 'package:flutter/material.dart';
import '../services/mesh_service.dart';
import '../theme.dart';

/// Panel de diagnóstico del mesh BLE.
/// Muestra en vivo los eventos del servicio nativo (advertising, scan, peers).
class MeshDiagnosticScreen extends StatefulWidget {
  const MeshDiagnosticScreen({super.key});

  @override
  State<MeshDiagnosticScreen> createState() => _MeshDiagnosticScreenState();
}

class _MeshDiagnosticScreenState extends State<MeshDiagnosticScreen> {
  final _mesh = MeshService();
  StreamSubscription<MeshStatusEvent>? _sub;
  StreamSubscription<MeshConnectionEvent>? _connSub;
  StreamSubscription<MeshPeerMessage>? _peerSub;
  final _events = <MeshStatusEvent>[];
  int _packetsReceived = 0;

  @override
  void initState() {
    super.initState();
    _events.addAll(_mesh.statusLog);
    _sub = _mesh.onStatus.listen((e) {
      if (mounted) setState(() => _events.add(e));
    });
    _connSub = _mesh.onConnection.listen((_) {
      if (mounted) setState(() {});
    });
    _peerSub = _mesh.onPeer.listen((_) {
      if (mounted) setState(() => _packetsReceived++);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _connSub?.cancel();
    _peerSub?.cancel();
    super.dispose();
  }

  Color _colorForKind(String kind) {
    if (kind.contains('ok') || kind.contains('ready') || kind == 'scanning') {
      return const Color(0xFF4ade80);
    }
    if (kind.contains('fail') || kind.contains('err') || kind.contains('denied')) {
      return const Color(0xFFef4444);
    }
    return const Color(0xFF60A5FA);
  }

  String _hms(DateTime d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.hour)}:${two(d.minute)}:${two(d.second)}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: RColors.asphalt,
      appBar: AppBar(
        backgroundColor: RColors.asphalt,
        foregroundColor: Colors.white,
        title: const Text('Diagnóstico Mesh BLE'),
      ),
      body: Column(
        children: [
          // Tarjeta de estado actual
          Container(
            margin: const EdgeInsets.all(12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: RColors.asphalt2,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: RColors.line),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _statRow('Servicio corriendo', _mesh.running ? 'SÍ' : 'NO',
                    _mesh.running),
                const SizedBox(height: 8),
                _statRow('Peers conectados directo',
                    '${_mesh.directPeers}', _mesh.directPeers > 0),
                const SizedBox(height: 8),
                _statRow('Paquetes recibidos', '$_packetsReceived',
                    _packetsReceived > 0),
              ],
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'LOG DE EVENTOS',
                style: TextStyle(
                    color: RColors.inkDim,
                    fontSize: 11,
                    letterSpacing: 2,
                    fontWeight: FontWeight.w700),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Expanded(
            child: _events.isEmpty
                ? const Center(
                    child: Text(
                      'Sin eventos aún — activa una rodada para ver actividad.',
                      style: TextStyle(color: RColors.inkDim, fontSize: 13),
                      textAlign: TextAlign.center,
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    reverse: true,
                    itemCount: _events.length,
                    itemBuilder: (_, i) {
                      final e = _events[_events.length - 1 - i];
                      final color = _colorForKind(e.kind);
                      return Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: RColors.asphalt2,
                          borderRadius: BorderRadius.circular(10),
                          border: Border(
                              left: BorderSide(color: color, width: 3)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(_hms(e.at),
                                    style: const TextStyle(
                                        color: RColors.inkDim,
                                        fontSize: 11,
                                        fontFamily: 'monospace')),
                                const SizedBox(width: 8),
                                Text(e.kind,
                                    style: TextStyle(
                                        color: color,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w800)),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(e.message,
                                style: const TextStyle(
                                    color: Colors.white, fontSize: 13)),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _statRow(String label, String value, bool ok) {
    return Row(
      children: [
        Icon(ok ? Icons.check_circle : Icons.circle_outlined,
            color: ok ? const Color(0xFF4ade80) : RColors.inkDim, size: 18),
        const SizedBox(width: 10),
        Expanded(
          child: Text(label,
              style: const TextStyle(color: RColors.ink, fontSize: 14)),
        ),
        Text(value,
            style: TextStyle(
                color: ok ? Colors.white : RColors.inkDim,
                fontSize: 15,
                fontWeight: FontWeight.w900)),
      ],
    );
  }
}
