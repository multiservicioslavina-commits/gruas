import UIKit
import Flutter

@main
@objc class AppDelegate: FlutterAppDelegate {

    private var meshChannel: FlutterMethodChannel?
    private let mesh = BleMeshService.shared

    override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        let controller = window?.rootViewController as! FlutterViewController

        // ── Canal MESH (mismo protocolo que Android) ─────────────────
        meshChannel = FlutterMethodChannel(
            name: "com.ridera.ridelive/mesh",
            binaryMessenger: controller.binaryMessenger
        )

        meshChannel?.setMethodCallHandler { [weak self] (call, result) in
            guard let self = self else { result(FlutterMethodNotImplemented); return }

            switch call.method {
            case "start":
                let args = call.arguments as? [String: Any] ?? [:]
                let uid = args["uid"] as? String ?? ""
                let name = args["name"] as? String ?? "Piloto"

                self.mesh.onPeerMessage = { uid, lat, lon, speedKmh, statusCode, hops in
                    self.meshChannel?.invokeMethod("onPeerMessage", arguments: [
                        "uid": uid,
                        "lat": lat,
                        "lon": lon,
                        "speed_kmh": speedKmh,
                        "status_code": statusCode,
                        "hops": hops,
                    ])
                }
                self.mesh.onPeerConnected = { endpointId in
                    self.meshChannel?.invokeMethod("onPeerConnected", arguments: [
                        "endpointId": endpointId,
                    ])
                }
                self.mesh.onPeerDisconnected = { endpointId in
                    self.meshChannel?.invokeMethod("onPeerDisconnected", arguments: [
                        "endpointId": endpointId,
                    ])
                }
                self.mesh.onStatus = { kind, message in
                    self.meshChannel?.invokeMethod("onStatus", arguments: [
                        "kind": kind,
                        "message": message,
                    ])
                }

                self.mesh.start(uid: uid, name: name)
                result(true)

            case "stop":
                self.mesh.stop()
                result(true)

            case "broadcastPosition":
                let args = call.arguments as? [String: Any] ?? [:]
                let lat = args["lat"] as? Double ?? 0.0
                let lon = args["lon"] as? Double ?? 0.0
                let speed = args["speed_kmh"] as? Int ?? 0
                let status = args["status_code"] as? Int ?? 0
                self.mesh.broadcastPosition(lat: lat, lon: lon,
                                            speedKmh: speed, statusCode: status)
                result(true)

            default:
                result(FlutterMethodNotImplemented)
            }
        }

        // ── Canal GPS (stub — iOS usa CLLocationManager directamente) ─
        let gpsChannel = FlutterMethodChannel(
            name: "com.ridera.ridelive/gps",
            binaryMessenger: controller.binaryMessenger
        )
        gpsChannel.setMethodCallHandler { (call, result) in
            switch call.method {
            case "startGps":
                // TODO: Implementar CLLocationManager foreground service equivalent
                result(true)
            case "stopGps":
                result(true)
            case "isBatteryOptimized":
                result(false) // iOS no tiene battery optimization como Android
            default:
                result(FlutterMethodNotImplemented)
            }
        }

        GeneratedPluginRegistrant.register(with: self)
        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }
}
