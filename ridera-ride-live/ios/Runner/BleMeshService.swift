import Foundation
import CoreBluetooth

/// Mesh BLE puro para iOS usando CoreBluetooth.
///
/// Compatible con BleMeshService.kt de Android: mismo Service UUID,
/// misma Characteristic UUID, mismo protocolo binario de 33 bytes,
/// mismo mesh flood con TTL 3.
///
/// Arquitectura:
///  - CBPeripheralManager: anuncia el Service UUID y expone una Characteristic
///    donde los peers escriben mensajes (equivale al GATT Server de Android)
///  - CBCentralManager: escanea peers, se conecta y escribe mensajes
///    (equivale al GATT Client de Android)
///
/// Nota iOS: CoreBluetooth maneja internamente la cola de operaciones BLE,
/// así que no necesitamos una cola manual como en Android.
class BleMeshService: NSObject {

    static let shared = BleMeshService()

    // Mismos UUIDs que Android — imprescindible para interoperabilidad.
    static let serviceUUID = CBUUID(string: "f2b3a8c9-1234-5678-9abc-def012345678")
    static let charMessageUUID = CBUUID(string: "f2b3a8c9-1234-5678-9abc-def012345679")

    static let ttlInitial: UInt8 = 3
    static let msgTypePosition: UInt8 = 0x01
    static let payloadSize = 33

    // Scan adaptativo
    static let scanActiveNoPeersMs: TimeInterval = 20.0
    static let scanRestNoPeersMs: TimeInterval = 3.0
    static let scanActiveWithPeersMs: TimeInterval = 12.0
    static let scanRestWithPeersMs: TimeInterval = 8.0

    // Reconexión
    static let reconnectBaseDelay: TimeInterval = 3.0
    static let reconnectMaxAttempts = 5

    // Heartbeat
    static let peerTimeoutSec: TimeInterval = 45.0
    static let peerCleanupIntervalSec: TimeInterval = 15.0

    // ─── Callbacks hacia Flutter MethodChannel ───────────────────
    var onPeerMessage: ((_ uid: String, _ lat: Double, _ lon: Double,
                         _ speedKmh: Int, _ statusCode: Int, _ hops: Int) -> Void)?
    var onPeerConnected: ((_ endpointId: String) -> Void)?
    var onPeerDisconnected: ((_ endpointId: String) -> Void)?
    var onStatus: ((_ kind: String, _ message: String) -> Void)?

    private var myUid: String = ""
    private var myName: String = ""
    private(set) var running = false

    // CoreBluetooth managers
    private var centralManager: CBCentralManager?
    private var peripheralManager: CBPeripheralManager?
    private var messageCharacteristic: CBMutableCharacteristic?

    // Peers descubiertos como Central (nosotros → ellos)
    private var connectedPeripherals: [UUID: CBPeripheral] = [:]       // peripheral.identifier
    private var peripheralChars: [UUID: CBCharacteristic] = [:]        // cached characteristic

    // Peers que se conectaron a nosotros como Peripheral (ellos → nosotros)
    private var connectedCentrals: Set<String> = []                     // central identifier

    // Set consolidado de peers únicos
    private var uniquePeers: Set<String> = []

    // Heartbeat: último mensaje recibido de cada peer
    private var peerLastSeen: [String: Date] = [:]

    // Dedup mesh flood
    private var seenMessages: [Int32: Date] = [:]
    private let maxSeenMessages = 500

    // Reconexión
    private var reconnectAttempts: [UUID: Int] = [:]
    private var reconnectPeripherals: [UUID: CBPeripheral] = [:]

    // Timers
    private var scanTimer: Timer?
    private var cleanupTimer: Timer?
    private var scanning = false

    // Synchronization
    private let queue = DispatchQueue(label: "com.ridera.blemesh", qos: .userInitiated)

    private override init() {
        super.init()
    }

    // ─── API pública ─────────────────────────────────────────────

    func start(uid: String, name: String) {
        guard !running else { return }
        myUid = uid
        myName = name
        running = true

        centralManager = CBCentralManager(delegate: self, queue: queue, options: [
            CBCentralManagerOptionShowPowerAlertKey: true,
            CBCentralManagerOptionRestoreIdentifierKey: "com.ridera.mesh.central",
        ])
        peripheralManager = CBPeripheralManager(delegate: self, queue: queue, options: [
            CBPeripheralManagerOptionRestoreIdentifierKey: "com.ridera.mesh.peripheral",
        ])

        startPeerCleanup()
    }

    func stop() {
        running = false
        scanTimer?.invalidate()
        scanTimer = nil
        cleanupTimer?.invalidate()
        cleanupTimer = nil

        if scanning {
            centralManager?.stopScan()
            scanning = false
        }
        peripheralManager?.stopAdvertising()
        peripheralManager?.removeAllServices()

        for (_, peripheral) in connectedPeripherals {
            centralManager?.cancelPeripheralConnection(peripheral)
        }
        connectedPeripherals.removeAll()
        peripheralChars.removeAll()
        connectedCentrals.removeAll()
        uniquePeers.removeAll()
        peerLastSeen.removeAll()
        reconnectAttempts.removeAll()
        reconnectPeripherals.removeAll()
        seenMessages.removeAll()
        centralManager = nil
        peripheralManager = nil
    }

    func broadcastPosition(lat: Double, lon: Double, speedKmh: Int, statusCode: Int) {
        guard running, !myUid.isEmpty else { return }
        let msgId = Int32.random(in: Int32.min...Int32.max)
        markSeen(msgId)
        let payload = packPosition(uid: myUid, lat: lat, lon: lon,
                                   speedKmh: speedKmh, statusCode: statusCode,
                                   ttl: BleMeshService.ttlInitial, msgId: msgId)
        sendToAllPeers(payload)
    }

    var directPeers: Int {
        return uniquePeers.count
    }

    // ─── Peripheral Manager (GATT Server — recibir mensajes) ────

    private func setupPeripheralService() {
        let char = CBMutableCharacteristic(
            type: BleMeshService.charMessageUUID,
            properties: [.write, .writeWithoutResponse],
            value: nil,
            permissions: [.writeable]
        )
        messageCharacteristic = char

        let service = CBMutableService(type: BleMeshService.serviceUUID, primary: true)
        service.characteristics = [char]
        peripheralManager?.add(service)
    }

    private func startAdvertisingIfReady() {
        guard peripheralManager?.state == .poweredOn else { return }
        peripheralManager?.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [BleMeshService.serviceUUID],
            CBAdvertisementDataLocalNameKey: "RIDERA",
        ])
    }

    // ─── Central Manager (GATT Client — escanear y enviar) ──────

    private func startScanCycle() {
        guard running, centralManager?.state == .poweredOn else { return }
        runScanCycle()
    }

    private func runScanCycle() {
        guard running, centralManager?.state == .poweredOn else { return }

        centralManager?.scanForPeripherals(
            withServices: [BleMeshService.serviceUUID],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
        scanning = true

        let hasPeers = !uniquePeers.isEmpty
        let activeTime = hasPeers ? BleMeshService.scanActiveWithPeersMs : BleMeshService.scanActiveNoPeersMs
        let restTime = hasPeers ? BleMeshService.scanRestWithPeersMs : BleMeshService.scanRestNoPeersMs

        scanTimer?.invalidate()
        scanTimer = Timer.scheduledTimer(withTimeInterval: activeTime, repeats: false) { [weak self] _ in
            guard let self = self, self.running else { return }
            self.centralManager?.stopScan()
            self.scanning = false

            self.scanTimer = Timer.scheduledTimer(withTimeInterval: restTime, repeats: false) { [weak self] _ in
                self?.runScanCycle()
            }
        }
    }

    // ─── Envío mesh flood ────────────────────────────────────────

    private func sendToAllPeers(_ data: Data, exclude: UUID? = nil) {
        for (id, peripheral) in connectedPeripherals {
            if id == exclude { continue }
            guard let char = peripheralChars[id] else { continue }
            peripheral.writeValue(data, for: char, type: .withoutResponse)
        }
        // También enviar a centrals conectados via notify si fuera necesario
        // (los centrals nos escriben a nosotros; nosotros les escribimos como central)
    }

    // ─── Manejo de mensajes entrantes ────────────────────────────

    private func handleIncomingBytes(_ bytes: Data, fromId: String) {
        guard bytes.count >= BleMeshService.payloadSize else { return }
        guard bytes[0] == BleMeshService.msgTypePosition else { return }

        let unpacked = unpackPosition(bytes)
        guard unpacked.uid != myUid else { return }
        guard !isSeen(unpacked.msgId) else { return }
        markSeen(unpacked.msgId)

        let hops = Int(BleMeshService.ttlInitial) - Int(unpacked.ttl)
        DispatchQueue.main.async { [weak self] in
            self?.onPeerMessage?(unpacked.uid, unpacked.lat, unpacked.lon,
                                 unpacked.speedKmh, unpacked.statusCode, hops)
        }

        // Relay
        if unpacked.ttl > 1 {
            var relay = Data(bytes)
            relay[28] = unpacked.ttl - 1
            let excludeUUID = connectedPeripherals.first(where: {
                $0.key.uuidString == fromId
            })?.key
            sendToAllPeers(relay, exclude: excludeUUID)
        }
    }

    // ─── Reconexión automática ───────────────────────────────────

    private func scheduleReconnect(_ peripheral: CBPeripheral) {
        guard running else { return }
        let id = peripheral.identifier
        let attempt = (reconnectAttempts[id] ?? 0) + 1
        guard attempt <= BleMeshService.reconnectMaxAttempts else {
            reconnectAttempts.removeValue(forKey: id)
            reconnectPeripherals.removeValue(forKey: id)
            emitStatus("reconnect_give_up",
                       "Peer \(id.uuidString.prefix(8)): \(BleMeshService.reconnectMaxAttempts) intentos agotados")
            return
        }
        reconnectAttempts[id] = attempt
        reconnectPeripherals[id] = peripheral
        let delay = BleMeshService.reconnectBaseDelay * Double(attempt)
        emitStatus("reconnect_scheduled",
                   "Peer \(id.uuidString.prefix(8)): intento \(attempt) en \(Int(delay))s")

        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self = self, self.running else { return }
            guard self.reconnectPeripherals[id] != nil else { return }
            guard self.connectedPeripherals[id] == nil else { return }
            self.emitStatus("reconnect_trying",
                            "Reconectando a \(id.uuidString.prefix(8)) (intento \(attempt))")
            self.centralManager?.connect(peripheral, options: nil)
        }
    }

    // ─── Limpieza de peers muertos ───────────────────────────────

    private func startPeerCleanup() {
        cleanupTimer?.invalidate()
        cleanupTimer = Timer.scheduledTimer(withTimeInterval: BleMeshService.peerCleanupIntervalSec,
                                            repeats: true) { [weak self] _ in
            self?.cleanupStalePeers()
        }
    }

    private func cleanupStalePeers() {
        guard running else { return }
        let now = Date()
        var staleIds: [String] = []

        for (peerId, lastSeen) in peerLastSeen {
            if now.timeIntervalSince(lastSeen) > BleMeshService.peerTimeoutSec
                && uniquePeers.contains(peerId) {
                staleIds.append(peerId)
            }
        }

        for peerId in staleIds {
            emitStatus("peer_timeout",
                       "Peer \(peerId.prefix(8)) sin datos en \(Int(BleMeshService.peerTimeoutSec))s")

            // Desconectar peripheral (outgoing)
            if let uuid = UUID(uuidString: peerId),
               let peripheral = connectedPeripherals.removeValue(forKey: uuid) {
                peripheralChars.removeValue(forKey: uuid)
                centralManager?.cancelPeripheralConnection(peripheral)
            }

            uniquePeers.remove(peerId)
            peerLastSeen.removeValue(forKey: peerId)
            connectedCentrals.remove(peerId)

            DispatchQueue.main.async { [weak self] in
                self?.onPeerDisconnected?(peerId)
            }
        }
    }

    // ─── Peer tracking helpers ───────────────────────────────────

    private func notifyPeerAdded(_ peerId: String) {
        let isNew = !uniquePeers.contains(peerId)
        uniquePeers.insert(peerId)
        peerLastSeen[peerId] = Date()
        if isNew {
            DispatchQueue.main.async { [weak self] in
                self?.onPeerConnected?(peerId)
            }
        }
    }

    private func notifyPeerRemoved(_ peerId: String) {
        // Solo notificar si el peer no tiene ninguna conexión activa
        let hasOutgoing = connectedPeripherals.keys.contains(where: {
            $0.uuidString == peerId
        })
        let hasIncoming = connectedCentrals.contains(peerId)
        if !hasOutgoing && !hasIncoming {
            uniquePeers.remove(peerId)
            peerLastSeen.removeValue(forKey: peerId)
            DispatchQueue.main.async { [weak self] in
                self?.onPeerDisconnected?(peerId)
            }
        }
    }

    // ─── Dedup ───────────────────────────────────────────────────

    private func isSeen(_ msgId: Int32) -> Bool {
        return seenMessages[msgId] != nil
    }

    private func markSeen(_ msgId: Int32) {
        seenMessages[msgId] = Date()
        if seenMessages.count > maxSeenMessages {
            let sorted = seenMessages.sorted { $0.value < $1.value }
            for i in 0..<(sorted.count - maxSeenMessages) {
                seenMessages.removeValue(forKey: sorted[i].key)
            }
        }
    }

    // ─── Status ──────────────────────────────────────────────────

    private func emitStatus(_ kind: String, _ message: String) {
        NSLog("[RIDERA_BLE] \(kind): \(message)")
        DispatchQueue.main.async { [weak self] in
            self?.onStatus?(kind, message)
        }
    }

    // ─── Serialización binaria (33 bytes) — idéntica a Android ──
    // IMPORTANTE: Java ByteBuffer usa Big Endian por defecto.
    // Swift en ARM usa Little Endian. Convertimos explícitamente
    // a Big Endian para interoperabilidad Android ↔ iOS.

    private func packPosition(uid: String, lat: Double, lon: Double,
                              speedKmh: Int, statusCode: Int,
                              ttl: UInt8, msgId: Int32) -> Data {
        var data = Data(count: BleMeshService.payloadSize)
        data[0] = BleMeshService.msgTypePosition

        let uidBytes = uidToBytes(uid)
        data.replaceSubrange(1..<17, with: uidBytes)

        var latBE = Float(lat).bitPattern.bigEndian
        var lonBE = Float(lon).bitPattern.bigEndian
        var speedBE = UInt16(clamping: speedKmh).bigEndian
        let statusU8 = UInt8(clamping: statusCode)
        var msgIdBE = msgId.bigEndian

        withUnsafeBytes(of: &latBE)   { data.replaceSubrange(17..<21, with: $0) }
        withUnsafeBytes(of: &lonBE)   { data.replaceSubrange(21..<25, with: $0) }
        withUnsafeBytes(of: &speedBE) { data.replaceSubrange(25..<27, with: $0) }
        data[27] = statusU8
        data[28] = ttl
        withUnsafeBytes(of: &msgIdBE) { data.replaceSubrange(29..<33, with: $0) }

        return data
    }

    private struct Unpacked {
        let uid: String
        let lat: Double
        let lon: Double
        let speedKmh: Int
        let statusCode: Int
        let ttl: UInt8
        let msgId: Int32
    }

    private func unpackPosition(_ data: Data) -> Unpacked {
        let uidBytes = Array(data[1..<17])
        let uid = bytesToUid(uidBytes)

        let latBits: UInt32 = data.subdata(in: 17..<21).withUnsafeBytes {
            UInt32(bigEndian: $0.load(as: UInt32.self))
        }
        let lat = Float(bitPattern: latBits)

        let lonBits: UInt32 = data.subdata(in: 21..<25).withUnsafeBytes {
            UInt32(bigEndian: $0.load(as: UInt32.self))
        }
        let lon = Float(bitPattern: lonBits)

        let speed: UInt16 = data.subdata(in: 25..<27).withUnsafeBytes {
            UInt16(bigEndian: $0.load(as: UInt16.self))
        }
        let status = data[27]
        let ttl = data[28]
        let msgId: Int32 = data.subdata(in: 29..<33).withUnsafeBytes {
            Int32(bigEndian: $0.load(as: Int32.self))
        }

        return Unpacked(uid: uid, lat: Double(lat), lon: Double(lon),
                        speedKmh: Int(speed), statusCode: Int(status),
                        ttl: ttl, msgId: msgId)
    }

    private func uidToBytes(_ uid: String) -> [UInt8] {
        let hex = uid.replacingOccurrences(of: "-", with: "")
            .padding(toLength: 32, withPad: "0", startingAt: 0)
            .prefix(32)
        var out = [UInt8](repeating: 0, count: 16)
        let chars = Array(hex)
        for i in 0..<16 {
            let s = String(chars[i*2..<min(i*2+2, chars.count)])
            out[i] = UInt8(s, radix: 16) ?? 0
        }
        return out
    }

    private func bytesToUid(_ bytes: [UInt8]) -> String {
        let hex = bytes.map { String(format: "%02x", $0) }.joined()
        let i = hex.index(hex.startIndex, offsetBy: 8)
        let j = hex.index(i, offsetBy: 4)
        let k = hex.index(j, offsetBy: 4)
        let l = hex.index(k, offsetBy: 4)
        return "\(hex[hex.startIndex..<i])-\(hex[i..<j])-\(hex[j..<k])-\(hex[k..<l])-\(hex[l..<hex.endIndex])"
    }
}

// ─── CBCentralManagerDelegate ────────────────────────────────────
extension BleMeshService: CBCentralManagerDelegate {

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            emitStatus("central_on", "Bluetooth Central activo")
            startScanCycle()
        case .poweredOff:
            emitStatus("ble_off", "Bluetooth apagado")
        case .unauthorized:
            emitStatus("ble_unauthorized", "Sin permiso de Bluetooth")
        case .unsupported:
            emitStatus("ble_unsupported", "BLE no soportado")
        default:
            emitStatus("central_state", "Estado: \(central.state.rawValue)")
        }
    }

    func centralManager(_ central: CBCentralManager,
                         didDiscover peripheral: CBPeripheral,
                         advertisementData: [String: Any],
                         rssi RSSI: NSNumber) {
        let id = peripheral.identifier
        guard connectedPeripherals[id] == nil else { return }

        // Si estábamos reconectando, cancelar
        reconnectAttempts.removeValue(forKey: id)
        reconnectPeripherals.removeValue(forKey: id)

        connectedPeripherals[id] = peripheral
        peripheral.delegate = self
        central.connect(peripheral, options: nil)
        notifyPeerAdded(id.uuidString)
    }

    func centralManager(_ central: CBCentralManager,
                         didConnect peripheral: CBPeripheral) {
        peerLastSeen[peripheral.identifier.uuidString] = Date()
        peripheral.discoverServices([BleMeshService.serviceUUID])
    }

    func centralManager(_ central: CBCentralManager,
                         didDisconnectPeripheral peripheral: CBPeripheral,
                         error: Error?) {
        let id = peripheral.identifier
        connectedPeripherals.removeValue(forKey: id)
        peripheralChars.removeValue(forKey: id)
        notifyPeerRemoved(id.uuidString)
        scheduleReconnect(peripheral)
    }

    func centralManager(_ central: CBCentralManager,
                         didFailToConnect peripheral: CBPeripheral,
                         error: Error?) {
        let id = peripheral.identifier
        connectedPeripherals.removeValue(forKey: id)
        peripheralChars.removeValue(forKey: id)
        notifyPeerRemoved(id.uuidString)
        emitStatus("connect_fail", "Falló conexión a \(id.uuidString.prefix(8)): \(error?.localizedDescription ?? "?")")
    }

    // State restoration (iOS puede matar la app y restaurar después)
    func centralManager(_ central: CBCentralManager,
                         willRestoreState dict: [String: Any]) {
        if let peripherals = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral] {
            for peripheral in peripherals {
                connectedPeripherals[peripheral.identifier] = peripheral
                peripheral.delegate = self
                notifyPeerAdded(peripheral.identifier.uuidString)
            }
            emitStatus("central_restored", "Restaurados \(peripherals.count) peers")
        }
    }
}

// ─── CBPeripheralDelegate ────────────────────────────────────────
extension BleMeshService: CBPeripheralDelegate {

    func peripheral(_ peripheral: CBPeripheral,
                     didDiscoverServices error: Error?) {
        guard error == nil else { return }
        for service in (peripheral.services ?? []) {
            if service.uuid == BleMeshService.serviceUUID {
                peripheral.discoverCharacteristics(
                    [BleMeshService.charMessageUUID], for: service)
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                     didDiscoverCharacteristicsFor service: CBService,
                     error: Error?) {
        guard error == nil else { return }
        for char in (service.characteristics ?? []) {
            if char.uuid == BleMeshService.charMessageUUID {
                peripheralChars[peripheral.identifier] = char
                emitStatus("peer_ready", "Peer listo: \(peripheral.identifier.uuidString.prefix(8))")
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                     didUpdateValueFor characteristic: CBCharacteristic,
                     error: Error?) {
        guard error == nil, let data = characteristic.value else { return }
        let peerId = peripheral.identifier.uuidString
        peerLastSeen[peerId] = Date()
        handleIncomingBytes(data, fromId: peerId)
    }
}

// ─── CBPeripheralManagerDelegate ─────────────────────────────────
extension BleMeshService: CBPeripheralManagerDelegate {

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        switch peripheral.state {
        case .poweredOn:
            emitStatus("peripheral_on", "Bluetooth Peripheral activo")
            setupPeripheralService()
            startAdvertisingIfReady()
        case .poweredOff:
            emitStatus("peripheral_off", "Peripheral apagado")
        default:
            emitStatus("peripheral_state", "Estado: \(peripheral.state.rawValue)")
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager,
                            didAdd service: CBService, error: Error?) {
        if let error = error {
            emitStatus("service_error", "Error agregando servicio: \(error.localizedDescription)")
        } else {
            emitStatus("gatt_server_ok", "Servidor GATT activo")
        }
    }

    func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager,
                                               error: Error?) {
        if let error = error {
            emitStatus("advertising_fail", error.localizedDescription)
        } else {
            emitStatus("advertising_ok", "Anunciando RIDERA")
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager,
                            didReceiveWrite requests: [CBATTRequest]) {
        for request in requests {
            if request.characteristic.uuid == BleMeshService.charMessageUUID,
               let data = request.value {
                let centralId = request.central.identifier.uuidString
                connectedCentrals.insert(centralId)
                peerLastSeen[centralId] = Date()
                notifyPeerAdded(centralId)
                handleIncomingBytes(data, fromId: centralId)
            }
            peripheral.respond(to: request, withResult: .success)
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager,
                            central: CBCentral,
                            didSubscribeTo characteristic: CBCharacteristic) {
        let centralId = central.identifier.uuidString
        connectedCentrals.insert(centralId)
        notifyPeerAdded(centralId)
    }

    func peripheralManager(_ peripheral: CBPeripheralManager,
                            central: CBCentral,
                            didUnsubscribeFrom characteristic: CBCharacteristic) {
        let centralId = central.identifier.uuidString
        connectedCentrals.remove(centralId)
        notifyPeerRemoved(centralId)
    }

    // State restoration
    func peripheralManager(_ peripheral: CBPeripheralManager,
                            willRestoreState dict: [String: Any]) {
        emitStatus("peripheral_restored", "Peripheral restaurado por iOS")
    }
}
