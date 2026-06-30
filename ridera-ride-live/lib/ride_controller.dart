import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'models/rider.dart';
import 'models/telemetry.dart';
import 'services/ride_repository.dart';
import 'services/location_service.dart';
import 'services/crash_detector.dart';

class RideController extends ChangeNotifier {
  final List<Rider> riders = [];
  final _rng = Random();

  RideRepository? _repo;
  String? rideId;
  String? myUid;
  StreamSubscription<List<Rider>>? _memberSub;
  final LocationService _location = LocationService();
  final CrashDetector _crash = CrashDetector();
  final StreamController<void> _crashCtrl = StreamController<void>.broadcast();

  Stream<void> get crashSuspected => _crashCtrl.stream;

  String emergencyName = '';
  String emergencyPhone = '';
  double myLat = 0;
  double myLon = 0;

  bool get isLive => _repo != null && rideId != null;

  Timer? _sim;
  Timer? _clock;
  Duration elapsed = Duration.zero;
  int battery = 84;
  String rideName = 'Rodada Oriente Antioqueño';

  RideController({bool demo = true}) {
    if (demo) {
      _seed();
      elapsed = const Duration(hours: 1, minutes: 47);
    }
  }

  // ======================= MODO EN VIVO =======================

  void bindToRide({
    required RideRepository repo,
    required String rideId,
    required String myUid,
    String? name,
  }) {
    _sim?.cancel();
    _repo = repo;
    this.rideId = rideId;
    this.myUid = myUid;
    if (name != null) rideName = name;
    riders.clear();
    _memberSub?.cancel();
    _memberSub = repo.membersStream(rideId).listen((list) {
      riders
        ..clear()
        ..addAll(list);
      notifyListeners();
    });
    _startClock();
    _crash.start(() => _crashCtrl.add(null));
    notifyListeners();
  }

  void pushMyTelemetry(double lat, double lon, double speedKmh,
      {int? statusCode}) {
    if (!isLive || myUid == null) return;
    myLat = lat;
    myLon = lon;
    final me = byId(myUid!);
    _repo!.updateTelemetry(
      rideId: rideId!,
      uid: myUid!,
      lat: lat,
      lon: lon,
      speedKmh: speedKmh,
      statusCode: statusCode ?? me?.status.code ?? 0,
    );
  }

  Future<void> sendMySos() async {
    if (isLive && myUid != null) {
      await _repo!.setStatus(rideId!, myUid!, RiderStatus.sos);
    }
  }

  Future<void> confirmCrashSos() => sendMySos();

  Future<void> setEmergencyContact(String name, String phone) async {
    emergencyName = name;
    emergencyPhone = phone;
    if (isLive && myUid != null) {
      await _repo!.updateEmergencyContact(rideId!, myUid!, name, phone);
    }
    notifyListeners();
  }

  Future<bool> startLocation() async {
    if (rideId == null || myUid == null) return false;
    return await _location.start(rideId: rideId!, uid: myUid!);
  }

  Stream<List<Rider>>? get pendingStream =>
      isLive ? _repo!.pendingStream(rideId!) : null;

  Future<void> approvePending(String uid) async {
    if (isLive) await _repo!.approve(rideId!, uid);
  }

  Future<void> rejectPending(String uid) async {
    if (isLive) await _repo!.remove(rideId!, uid);
  }

  // ======================= CONTEOS =======================

  int get directo => riders
      .where(
          (r) => r.link == LinkType.directo && r.status != RiderStatus.offline)
      .length;
  int get mesh => riders
      .where((r) => r.link == LinkType.mesh && r.status != RiderStatus.offline)
      .length;
  int get offline =>
      riders.where((r) => r.status == RiderStatus.offline).length;
  bool get hasSos => riders.any((r) => r.status == RiderStatus.sos);

  Rider? get sosRider => riders.cast<Rider?>().firstWhere(
      (r) => r!.status == RiderStatus.sos,
      orElse: () => null);

  Rider? byId(String id) =>
      riders.cast<Rider?>().firstWhere((r) => r!.id == id, orElse: () => null);

  String get pollLabel => (hasSos || offline > 0)
      ? '0.8 s · grupo disperso'
      : '2.0 s · crucero';

  // ======================= ACCIONES DEL LÍDER =======================

  void removeRider(String id) {
    if (isLive) {
      _repo!.remove(rideId!, id);
      return;
    }
    final r = byId(id);
    if (r == null || r.isLeader) return;
    for (final child in riders.where((x) => x.relayVia == id)) {
      child.relayVia = r.relayVia;
    }
    riders.removeWhere((x) => x.id == id);
    notifyListeners();
  }

  void resolveSos() {
    if (isLive) {
      for (final r in riders.where((r) => r.status == RiderStatus.sos)) {
        _repo!.setStatus(rideId!, r.id, RiderStatus.ok);
      }
      return;
    }
    for (final r in riders) {
      if (r.status == RiderStatus.sos) r.status = RiderStatus.ok;
    }
    notifyListeners();
  }

  // ======================= DEMO =======================

  void _seed() {
    riders
      ..clear()
      ..addAll([
        Rider(
            id: 'L',
            name: 'Carlos «Mono» Restrepo',
            role: RiderRole.lider,
            status: RiderStatus.ok,
            link: LinkType.directo,
            speedKmh: 68),
        Rider(
            id: '3',
            name: 'Andrés Mejía',
            status: RiderStatus.ok,
            link: LinkType.directo),
        Rider(
            id: '4',
            name: 'Diego Patiño',
            status: RiderStatus.falla,
            link: LinkType.mesh,
            relayVia: '3'),
        Rider(
            id: '5',
            name: 'Laura Gómez',
            status: RiderStatus.ok,
            link: LinkType.mesh,
            relayVia: '4'),
        Rider(
            id: '6',
            name: 'Julián Cardona',
            status: RiderStatus.ok,
            link: LinkType.directo),
        Rider(
            id: '7',
            name: 'Sebastián Ruiz',
            status: RiderStatus.rezagado,
            link: LinkType.mesh,
            relayVia: '6'),
        Rider(
            id: '8',
            name: 'Mateo Álvarez',
            status: RiderStatus.ok,
            link: LinkType.mesh,
            relayVia: '7'),
        Rider(
            id: '9',
            name: 'Felipe Ocampo',
            status: RiderStatus.offline,
            link: LinkType.offline,
            relayVia: '8'),
        Rider(
            id: '10',
            name: 'Camilo Henao',
            status: RiderStatus.ok,
            link: LinkType.mesh,
            relayVia: '8'),
        Rider(
            id: 'E',
            name: 'Iván «El Tanque» Soto',
            role: RiderRole.escoba,
            status: RiderStatus.ok,
            link: LinkType.mesh,
            relayVia: '10'),
      ]);
  }

  void triggerSos() {
    final cand = riders
        .where((r) =>
            !r.isLeader &&
            r.status != RiderStatus.offline &&
            r.status != RiderStatus.sos)
        .toList();
    if (cand.isEmpty) return;
    cand[_rng.nextInt(cand.length)].status = RiderStatus.sos;
    notifyListeners();
  }

  int simulateRelayFailure() {
    final relays = riders
        .where((r) =>
            r.link == LinkType.mesh &&
            r.status != RiderStatus.offline &&
            riders.any((x) => x.relayVia == r.id))
        .toList();
    if (relays.isEmpty) return 0;
    final dead = relays[_rng.nextInt(relays.length)];
    dead.status = RiderStatus.offline;
    dead.link = LinkType.offline;
    for (final child in riders.where((x) => x.relayVia == dead.id)) {
      final alive = riders.where((o) =>
          o.id != child.id &&
          o.id != dead.id &&
          o.status != RiderStatus.offline);
      if (alive.isNotEmpty) {
        child.relayVia = alive.first.id;
        child.link = LinkType.mesh;
      }
    }
    notifyListeners();
    return 180 + _rng.nextInt(220);
  }

  void onTelemetry(Telemetry t) {
    final r = byId(t.nodeId.toString());
    if (r == null) return;
    r.lat = t.lat;
    r.lon = t.lon;
    r.status = RiderStatus.fromCode(t.status);
    r.lastSeen = t.time;
    notifyListeners();
  }

  void startSimulation() {
    _startClock();
    _sim?.cancel();
    _sim = Timer.periodic(const Duration(seconds: 3), (_) {
      final oks = riders
          .where((r) =>
              r.role == RiderRole.integrante && r.status == RiderStatus.ok)
          .toList();
      if (oks.isNotEmpty && _rng.nextDouble() < 0.4) {
        final r = oks[_rng.nextInt(oks.length)];
        r.status = RiderStatus.rezagado;
        Timer(const Duration(seconds: 5), () {
          if (r.status == RiderStatus.rezagado) {
            r.status = RiderStatus.ok;
            notifyListeners();
          }
        });
      }
      notifyListeners();
    });
  }

  void resetScenario() {
    if (isLive) return;
    _seed();
    battery = 84;
    notifyListeners();
  }

  void _startClock() {
    _clock?.cancel();
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      elapsed += const Duration(seconds: 1);
      notifyListeners();
    });
  }

  @override
  void dispose() {
    _sim?.cancel();
    _clock?.cancel();
    _memberSub?.cancel();
    _location.stop();
    _crash.stop();
    _crashCtrl.close();
    super.dispose();
  }
}
