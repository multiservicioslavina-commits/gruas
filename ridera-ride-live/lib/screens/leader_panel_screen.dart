import 'package:flutter/material.dart';
import '../ride_controller.dart';
import '../models/rider.dart';
import '../theme.dart';
import '../widgets/mesh_map.dart';
import '../widgets/street_map.dart';

class LeaderPanelScreen extends StatefulWidget {
  final RideController controller;
  const LeaderPanelScreen({super.key, required this.controller});

  @override
  State<LeaderPanelScreen> createState() => _LeaderPanelScreenState();
}

class _LeaderPanelScreenState extends State<LeaderPanelScreen> {
  String? _selected;
  bool _streetMap = true;

  RideController get c => widget.controller;

  String _hms(Duration d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.inHours)}:${two(d.inMinutes % 60)}:${two(d.inSeconds % 60)}';
  }

  void _toast(String msg, {Color color = RColors.signal}) {
    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: RColors.asphalt3,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: color),
        borderRadius: BorderRadius.circular(10),
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: c,
      builder: (context, _) {
        return SafeArea(
          child: Column(
            children: [
              _header(),
              if (c.hasSos) _sosBar(),
              Expanded(
                child: ListView(
                  padding: EdgeInsets.zero,
                  children: [
                    Stack(children: [
                      _streetMap
                          ? StreetMap(
                              controller: c,
                              selectedId: _selected,
                              onTapNode: (id) => setState(() => _selected = _selected == id ? null : id),
                            )
                          : MeshMap(
                              controller: c,
                              selectedId: _selected,
                              onTapNode: (id) => setState(() => _selected = _selected == id ? null : id),
                            ),
                      Positioned(top: 8, left: 12, child: _chip(_streetMap ? 'Mapa en vivo · Calles' : 'Malla en vivo · Relieve')),
                      Positioned(top: 8, right: 12, child: _chip('Sondeo ${c.pollLabel}', mono: true)),
                      Positioned(
                        bottom: 8, right: 12,
                        child: GestureDetector(
                          onTap: () => setState(() => _streetMap = !_streetMap),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(
                              color: RColors.asphalt.withValues(alpha: 0.85),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: RColors.brand, width: 1),
                            ),
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              Icon(_streetMap ? Icons.terrain : Icons.map, size: 16, color: RColors.brand),
                              const SizedBox(width: 6),
                              Text(_streetMap ? 'Relieve' : 'Calles', style: const TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600)),
                            ]),
                          ),
                        ),
                      ),
                    ]),
                    _meshHealth(),
                    _list(),
                    if (!c.isLive) _simControls(),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _header() => Container(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 12),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: RColors.line)),
        ),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(c.rideName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text('${c.riders.length} integrantes',
                  style: const TextStyle(color: RColors.inkDim, fontSize: 12)),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(_hms(c.elapsed),
                style: const TextStyle(color: RColors.brand, fontSize: 20, fontWeight: FontWeight.w800, fontFeatures: [FontFeature.tabularFigures()])),
            Row(children: [
              Icon(Icons.battery_charging_full_rounded,
                  size: 15, color: c.battery > 40 ? RColors.ok : RColors.warn),
              const SizedBox(width: 3),
              Text('${c.battery}%', style: const TextStyle(color: RColors.inkDim, fontSize: 12)),
            ]),
          ]),
        ]),
      );

  Widget _sosBar() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        color: const Color(0xFF4A1009),
        child: Row(children: [
          Container(
            width: 40, height: 40,
            decoration: const BoxDecoration(color: RColors.sos, shape: BoxShape.circle),
            child: const Center(child: Text('SOS', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12))),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(c.sosRider?.name ?? '—', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              const Text('Alerta prioritaria',
                  style: TextStyle(color: Color(0xFFFFCDC8), fontSize: 11)),
            ]),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: const Color(0xFF5A120C), minimumSize: const Size(0, 44)),
            onPressed: () { c.resolveSos(); _toast('SOS marcado como atendido', color: RColors.ok); },
            child: const Text('Atendido'),
          ),
        ]),
      );

  Widget _meshHealth() => Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
        child: Row(children: [
          _mchip('${c.directo}', 'DIRECTO', RColors.signal),
          const SizedBox(width: 8),
          _mchip('${c.mesh}', 'MESH', RColors.brand),
          const SizedBox(width: 8),
          _mchip('${c.offline}', 'OFFLINE', RColors.inkFaint),
        ]),
      );

  Widget _mchip(String n, String k, Color col) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: RColors.asphalt2,
            border: Border.all(color: RColors.line),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(children: [
            Text(n, style: TextStyle(color: col, fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(k, style: const TextStyle(color: RColors.inkDim, fontSize: 9, letterSpacing: 2)),
          ]),
        ),
      );

  Widget _list() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Text('INTEGRANTES', style: TextStyle(color: RColors.inkFaint, fontSize: 10, letterSpacing: 3)),
            Text('${c.riders.where((r) => r.status != RiderStatus.offline).length} activos',
                style: const TextStyle(color: RColors.inkFaint, fontSize: 11)),
          ]),
        ),
        ...c.riders.map(_riderTile),
      ],
    );
  }

  Widget _riderTile(Rider r) {
    final selected = r.id == _selected;
    final linkLabel = switch (r.link) {
      LinkType.directo => 'Directo',
      LinkType.mesh => 'Vía malla',
      LinkType.offline => 'Sin señal',
    };
    return InkWell(
      onTap: () => setState(() => _selected = selected ? null : r.id),
      child: Container(
        decoration: BoxDecoration(
          color: selected ? const Color(0xFF1C2733) : null,
          border: const Border(top: BorderSide(color: Color(0xFF1B232C))),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        child: Row(children: [
          Container(width: 13, height: 13, decoration: BoxDecoration(color: r.status.color, shape: BoxShape.circle)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(child: Text(r.name, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14))),
                if (r.isLeader) _roleTag('Líder', RColors.brand),
                if (r.role == RiderRole.escoba) _roleTag('Escoba', RColors.signal),
              ]),
              const SizedBox(height: 3),
              Text('$linkLabel · ${r.status.label}',
                  style: const TextStyle(color: RColors.inkDim, fontSize: 11)),
            ]),
          ),
          if (!r.isLeader)
            IconButton(
              onPressed: () { c.removeRider(r.id); _toast('Integrante removido'); },
              icon: const Icon(Icons.person_remove_rounded, color: RColors.inkDim),
              tooltip: 'Remover',
            ),
        ]),
      ),
    );
  }

  Widget _roleTag(String t, Color c) => Container(
        margin: const EdgeInsets.only(left: 6),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(border: Border.all(color: c.withValues(alpha: 0.5)), borderRadius: BorderRadius.circular(5)),
        child: Text(t, style: TextStyle(color: c, fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 1)),
      );

  Widget _simControls() => Container(
        margin: const EdgeInsets.fromLTRB(0, 12, 0, 0),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
        decoration: const BoxDecoration(
          color: Color(0xFF0A0E13),
          border: Border(top: BorderSide(color: RColors.line)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('SIMULACIÓN · CONTROLES DE DEMO',
              style: TextStyle(color: RColors.inkFaint, fontSize: 9, letterSpacing: 2.5)),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: _simBtn('Simular SOS', () => c.triggerSos())),
            const SizedBox(width: 8),
            Expanded(child: _simBtn('Caída de repetidor', () {
              final ms = c.simulateRelayFailure();
              if (ms > 0) _toast('Repetidor caído · ruta reconfigurada en $ms ms', color: RColors.ok);
            })),
          ]),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: _simBtn('Reiniciar escenario', () { c.resetScenario(); setState(() => _selected = null); }),
          ),
        ]),
      );

  Widget _simBtn(String label, VoidCallback onTap) => OutlinedButton(
        style: OutlinedButton.styleFrom(
          backgroundColor: RColors.asphalt2,
          foregroundColor: RColors.ink,
          side: const BorderSide(color: RColors.line),
          minimumSize: const Size(0, 50),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
        onPressed: onTap,
        child: Text(label, textAlign: TextAlign.center),
      );

  Widget _chip(String t, {bool mono = false}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          color: RColors.asphalt.withValues(alpha: 0.7),
          border: Border.all(color: RColors.line),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(t, style: TextStyle(color: RColors.inkDim, fontSize: 10, letterSpacing: mono ? 0 : 1.5)),
      );
}
