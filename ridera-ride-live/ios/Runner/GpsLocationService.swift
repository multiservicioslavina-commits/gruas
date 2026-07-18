import Foundation
import CoreLocation

class GpsLocationService: NSObject, CLLocationManagerDelegate {

    static let shared = GpsLocationService()

    private let supabaseUrl = "https://vzzxsdtsaahhzyctvmhx.supabase.co"
    private let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6enhzZHRzYWFoaHp5Y3R2bWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNzU3NzIsImV4cCI6MjA5Njk1MTc3Mn0.5GZRCUuMx7fwmvoo48nXVCq9QJs0ysCzz0TPr9mmcNI"

    private var locationManager: CLLocationManager?
    private var lastLocation: CLLocation?
    private var heartbeatTimer: Timer?
    private var pointCounter = 0

    private(set) var rideId: String = ""
    private(set) var uid: String = ""
    var accessToken: String = ""
    private(set) var running = false

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 5
        config.timeoutIntervalForResource = 10
        return URLSession(configuration: config)
    }()

    private override init() {
        super.init()
    }

    func start(rideId: String, uid: String, accessToken: String) {
        guard !running else { return }
        self.rideId = rideId
        self.uid = uid
        self.accessToken = accessToken
        running = true

        locationManager = CLLocationManager()
        locationManager?.delegate = self
        locationManager?.desiredAccuracy = kCLLocationAccuracyBest
        locationManager?.distanceFilter = 3
        locationManager?.allowsBackgroundLocationUpdates = true
        locationManager?.pausesLocationUpdatesAutomatically = false
        locationManager?.showsBackgroundLocationIndicator = true
        locationManager?.activityType = .otherNavigation

        locationManager?.requestWhenInUseAuthorization()
        locationManager?.startUpdatingLocation()

        heartbeatTimer?.invalidate()
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 4.0, repeats: true) { [weak self] _ in
            self?.pushToSupabase()
        }
    }

    func stop() {
        guard running else { return }
        running = false
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
        locationManager?.stopUpdatingLocation()
        locationManager?.delegate = nil
        locationManager = nil
        lastLocation = nil
        pointCounter = 0
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }

        // Descartar si precisión > 100m
        if loc.horizontalAccuracy > 100 { return }

        // Descartar saltos imposibles (> 300 km/h)
        if let prev = lastLocation {
            let dtSec = loc.timestamp.timeIntervalSince(prev.timestamp)
            if dtSec > 0 {
                let distM = loc.distance(from: prev)
                let speedKmh = (distM / dtSec) * 3.6
                if speedKmh > 300 { return }
            }
        }

        lastLocation = loc

        // Broadcast al mesh BLE
        let speedKmh = max(0, min(300, Int(loc.speed * 3.6)))
        BleMeshService.shared.broadcastPosition(
            lat: loc.coordinate.latitude,
            lon: loc.coordinate.longitude,
            speedKmh: speedKmh,
            statusCode: 0
        )
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        NSLog("[RIDERA_GPS] Error: \(error.localizedDescription)")
    }

    // MARK: - Supabase Push

    private func pushToSupabase() {
        guard let loc = lastLocation, !rideId.isEmpty, !uid.isEmpty else { return }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let now = formatter.string(from: Date())
        let speedKmh = max(0, min(300, loc.speed * 3.6))

        let memberBody = """
        {"lat":\(loc.coordinate.latitude),"lon":\(loc.coordinate.longitude),"speed_kmh":\(speedKmh),"last_seen":"\(now)"}
        """
        let token = accessToken.isEmpty ? anonKey : accessToken

        // PATCH members
        var memberURL = URLComponents(string: "\(supabaseUrl)/rest/v1/members")!
        memberURL.queryItems = [
            URLQueryItem(name: "ride_id", value: "eq.\(rideId)"),
            URLQueryItem(name: "uid", value: "eq.\(uid)"),
        ]
        var req = URLRequest(url: memberURL.url!)
        req.httpMethod = "PATCH"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        req.httpBody = memberBody.data(using: .utf8)
        session.dataTask(with: req) { _, _, _ in }.resume()

        // INSERT route_points cada ~20s (cada 5 heartbeats)
        pointCounter += 1
        if pointCounter % 5 == 0 {
            let pointBody = """
            {"ride_id":"\(rideId)","uid":"\(uid)","lat":\(loc.coordinate.latitude),"lon":\(loc.coordinate.longitude),"speed_kmh":\(speedKmh),"recorded_at":"\(now)"}
            """
            var pointReq = URLRequest(url: URL(string: "\(supabaseUrl)/rest/v1/route_points")!)
            pointReq.httpMethod = "POST"
            pointReq.setValue(anonKey, forHTTPHeaderField: "apikey")
            pointReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            pointReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
            pointReq.setValue("return=minimal", forHTTPHeaderField: "Prefer")
            pointReq.httpBody = pointBody.data(using: .utf8)
            session.dataTask(with: pointReq) { _, _, _ in }.resume()
        }
    }
}
