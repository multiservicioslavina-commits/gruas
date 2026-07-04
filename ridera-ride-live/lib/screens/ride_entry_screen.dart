import 'package:flutter/material.dart';
import '../theme.dart';
import '../ride_controller.dart';
import '../services/auth_service.dart';
import '../services/ride_repository.dart';
import '../services/session_service.dart';
import 'ridera_home_screen.dart';
import 'route_planner_screen.dart';

class RideEntryScreen extends StatefulWidget {
  const RideEntryScreen({super.key});
  @override
  State<RideEntryScreen> createState() => _RideEntryScreenState();
}

class _RideEntryScreenState extends State<RideEntryScreen> {
  final _name = TextEditingController();
  final _rideName = TextEditingController(text: 'Rodada Oriente Antioqueño');
  final _code = TextEditingController();
  final _auth = AuthService();
  final _repo = RideRepository();
  final _emName = TextEditingController();
  final _emPhone = TextEditingController();
  final _driveUrl = TextEditingController();
  bool _busy = false;
  String? _error;
  PlannedRouteResult? _plannedRoute;

  Future<void> _go(
      Future<_Bound> Function(String uid, String name) action) async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Escribe tu nombre de piloto.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final uid = await _auth.ensureSignedIn();
      await _auth.setDisplayName(name);
      final bound = await action(uid, name);

      final controller = RideController(demo: false)
        ..bindToRide(
            repo: _repo,
            rideId: bound.rideId,
            myUid: uid,
            name: bound.rideName);

      await SessionService()
          .save(joinCode: bound.joinCode, isLeader: bound.isLeader, name: name);

      if (_emPhone.text.trim().isNotEmpty) {
        controller.setEmergencyContact(
            _emName.text.trim(), _emPhone.text.trim());
      }

      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => RideraHome(
            controller: controller,
            repo: _repo,
            rideId: bound.rideId,
            isLeader: bound.isLeader,
            joinCode: bound.joinCode),
      ));
    } catch (e) {
      setState(() => _error = 'No se pudo: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<_Bound> _create(String uid, String name) async {
    final planned = _plannedRoute;
    final ride = await _repo.createRide(
      name: _rideName.text.trim(),
      leaderUid: uid,
      leaderName: name,
      plannedRouteGeoJson: planned?.route.toGeoJsonLineString(),
      plannedSteps: planned?.route.stepsAsJson(),
      originName: planned?.originName,
      destinationName: planned?.destinationName,
      originLat: planned?.originLat,
      originLon: planned?.originLon,
      destinationLat: planned?.destinationLat,
      destinationLon: planned?.destinationLon,
      plannedDistanceKm: planned?.route.distanceKm,
      plannedDurationMin: planned?.route.durationMin,
      driveFolderUrl: _driveUrl.text.trim(),
    );
    return _Bound(ride.id, ride.name, ride.joinCode, true);
  }

  Future<void> _openPlanner() async {
    final result = await Navigator.of(context).push<PlannedRouteResult>(
      MaterialPageRoute(builder: (_) => const RoutePlannerScreen()),
    );
    if (result != null && mounted) {
      setState(() => _plannedRoute = result);
    }
  }

  Future<_Bound> _join(String uid, String name) async {
    final code = _code.text.trim().toUpperCase();
    final ride = await _repo.findByCode(code);
    if (ride == null) throw 'Código no encontrado';
    await _repo.requestJoin(rideId: ride.id, uid: uid, name: name);
    return _Bound(ride.id, ride.name, ride.joinCode, false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Rodada en vivo')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text('Tu nombre de piloto',
                style: TextStyle(color: RColors.inkDim, fontSize: 13)),
            const SizedBox(height: 6),
            TextField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: _dec('Ej: Carlos «Mono»')),
            const SizedBox(height: 16),
            const Text('Contacto de emergencia (opcional)',
                style: TextStyle(color: RColors.inkDim, fontSize: 13)),
            const SizedBox(height: 6),
            Row(children: [
              Expanded(
                  child: TextField(
                      controller: _emName,
                      textCapitalization: TextCapitalization.words,
                      decoration: _dec('Nombre'))),
              const SizedBox(width: 10),
              Expanded(
                  child: TextField(
                      controller: _emPhone,
                      keyboardType: TextInputType.phone,
                      decoration: _dec('Celular'))),
            ]),
            const SizedBox(height: 6),
            const Text(
                'Le avisaremos con tu ubicación si se detecta una caída.',
                style: TextStyle(color: RColors.inkFaint, fontSize: 11)),
            const SizedBox(height: 22),
            _card(
              title: 'Crear rodada',
              subtitle: 'Serás el líder. Recibirás un código para compartir.',
              child: Column(children: [
                TextField(
                    controller: _rideName,
                    decoration: _dec('Nombre de la rodada')),
                const SizedBox(height: 12),
                // Botón planear ruta
                InkWell(
                  onTap: _busy ? null : _openPlanner,
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: _plannedRoute != null
                          ? RColors.brand.withValues(alpha: 0.12)
                          : RColors.asphalt,
                      border: Border.all(
                        color: _plannedRoute != null
                            ? RColors.brand.withValues(alpha: 0.5)
                            : RColors.line,
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(children: [
                      Icon(
                        _plannedRoute != null ? Icons.route : Icons.add_road,
                        color: _plannedRoute != null ? RColors.brand : RColors.ink,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _plannedRoute == null
                            ? const Text('Planear ruta (opcional)',
                                style: TextStyle(
                                    color: RColors.ink,
                                    fontWeight: FontWeight.w600))
                            : Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Ruta: ${_plannedRoute!.originName.split(",").first} → ${_plannedRoute!.destinationName.split(",").first}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${_plannedRoute!.route.distanceKm.toStringAsFixed(1)} km · ${_plannedRoute!.route.durationMin} min',
                                    style: const TextStyle(
                                        color: RColors.inkDim, fontSize: 12),
                                  ),
                                ],
                              ),
                      ),
                      Icon(
                        _plannedRoute != null ? Icons.edit : Icons.chevron_right,
                        color: RColors.inkDim,
                      ),
                    ]),
                  ),
                ),
                const SizedBox(height: 12),
                // Álbum grupal Drive (opcional)
                TextField(
                  controller: _driveUrl,
                  keyboardType: TextInputType.url,
                  decoration: _dec('Álbum grupal Drive (opcional)'),
                ),
                const SizedBox(height: 6),
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Pega el link de una carpeta Drive para que todos suban las fotos.',
                    style: TextStyle(color: RColors.inkFaint, fontSize: 11),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _busy ? null : () => _go(_create),
                      icon: const Icon(Icons.flag_rounded),
                      label: const Text('CREAR Y SER LÍDER'),
                    )),
              ]),
            ),
            const SizedBox(height: 16),
            _card(
              title: 'Unirme a una rodada',
              subtitle:
                  'Pide el código al líder. Entrarás como pendiente de aprobación.',
              child: Column(children: [
                TextField(
                    controller: _code,
                    textCapitalization: TextCapitalization.characters,
                    decoration: _dec('Código (ej: K7P2M)')),
                const SizedBox(height: 12),
                SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 54),
                          side: const BorderSide(color: RColors.line),
                          foregroundColor: RColors.ink),
                      onPressed: _busy ? null : () => _go(_join),
                      icon: const Icon(Icons.login_rounded),
                      label: const Text('UNIRME'),
                    )),
              ]),
            ),
            if (_busy)
              const Padding(
                  padding: EdgeInsets.only(top: 20),
                  child: Center(child: CircularProgressIndicator())),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child:
                    Text(_error!, style: const TextStyle(color: RColors.sos)),
              ),
          ],
        ),
      ),
    );
  }

  InputDecoration _dec(String hint) => InputDecoration(
        hintText: hint,
        filled: true,
        fillColor: RColors.asphalt2,
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: RColors.line)),
        enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: RColors.line)),
      );

  Widget _card(
          {required String title,
          required String subtitle,
          required Widget child}) =>
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: RColors.asphalt2,
            border: Border.all(color: RColors.line),
            borderRadius: BorderRadius.circular(16)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title,
              style:
                  const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(subtitle,
              style: const TextStyle(color: RColors.inkDim, fontSize: 12.5)),
          const SizedBox(height: 14),
          child,
        ]),
      );
}

class _Bound {
  final String rideId;
  final String rideName;
  final String joinCode;
  final bool isLeader;
  _Bound(this.rideId, this.rideName, this.joinCode, this.isLeader);
}
