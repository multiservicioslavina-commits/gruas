<?php
/**
 * RIDERA MAPA DEMO - Con datos de prueba
 * Para verificar que el diseño funciona sin depender del API
 */

if (!function_exists('ridera_mapa_demo_render')) {
    function ridera_mapa_demo_render() {
        ?>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">

        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            #ridera-mapa-container {
                width: 100%;
                height: 90vh;
                position: relative;
                font-family: 'Poppins', sans-serif;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                overflow: hidden;
                display: flex;
            }
            #rmMap {
                flex: 1;
                position: relative;
                z-index: 10;
                background: linear-gradient(135deg, #2d5a3d 0%, #1f3a2f 100%);
                filter: brightness(1.8) contrast(1.6) saturate(1.2);
            }
            .rm-sidebar {
                position: relative;
                width: 360px;
                z-index: 800;
                background: rgba(20, 24, 50, 0.95);
                backdrop-filter: blur(20px);
                border-left: 1px solid rgba(232, 93, 32, 0.2);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: -8px 0 40px rgba(0, 0, 0, 0.7);
            }
            .rm-sidebar-header {
                padding: 24px 20px;
                background: linear-gradient(135deg, rgba(232, 93, 32, 0.15) 0%, rgba(232, 93, 32, 0.05) 100%);
                border-bottom: 2px solid rgba(232, 93, 32, 0.3);
                flex-shrink: 0;
            }
            .rm-sidebar-title {
                font-size: 26px;
                font-weight: 800;
                color: #fff;
                margin-bottom: 8px;
            }
            .rm-sidebar-subtitle {
                font-size: 12px;
                color: #E85D20;
                text-transform: uppercase;
                letter-spacing: 2px;
                font-weight: 700;
                margin-bottom: 16px;
            }
            .rm-stats-row {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 12px;
            }
            .rm-stat-card {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(232, 93, 32, 0.3);
                border-radius: 8px;
                padding: 10px;
                text-align: center;
            }
            .rm-stat-num {
                font-size: 20px;
                font-weight: 800;
                color: #E85D20;
                display: block;
            }
            .rm-stat-label {
                font-size: 10px;
                color: #b0b5c8;
                text-transform: uppercase;
                margin-top: 4px;
            }
            .rm-sidebar-content {
                flex: 1;
                overflow-y: auto;
                padding: 16px 0;
            }
            .rm-sidebar-content::-webkit-scrollbar { width: 6px; }
            .rm-sidebar-content::-webkit-scrollbar-thumb {
                background: rgba(232, 93, 32, 0.4);
                border-radius: 3px;
            }
            .rm-department { border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
            .rm-dep-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 16px;
                cursor: pointer;
                background: transparent;
                border: none;
                width: 100%;
                font-family: 'Poppins', sans-serif;
                text-align: left;
            }
            .rm-dep-header:hover { background: rgba(232, 93, 32, 0.08); }
            .rm-dep-header.active {
                background: rgba(232, 93, 32, 0.15);
                border-left: 3px solid #E85D20;
            }
            .rm-dep-name { display: flex; align-items: center; gap: 10px; flex: 1; }
            .rm-dep-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #E85D20;
                box-shadow: 0 0 8px rgba(232, 93, 32, 0.6);
            }
            .rm-dep-title {
                font-weight: 700;
                color: #fff;
                font-size: 14px;
                text-transform: uppercase;
            }
            .rm-route-count {
                background: rgba(232, 93, 32, 0.2);
                color: #E85D20;
                font-weight: 700;
                font-size: 11px;
                padding: 4px 10px;
                border-radius: 12px;
            }
            .rm-chevron {
                color: rgba(232, 93, 32, 0.4);
                font-size: 12px;
                transition: transform 0.3s ease;
            }
            .rm-dep-header.active .rm-chevron {
                transform: rotate(90deg);
                color: #E85D20;
            }
            .rm-routes { display: none; background: rgba(0, 0, 0, 0.3); }
            .rm-routes.open { display: block; }
            .rm-route-item {
                padding: 12px 16px 12px 40px;
                cursor: pointer;
                border-left: 2px solid transparent;
            }
            .rm-route-item:hover { background: rgba(232, 93, 32, 0.08); }
            .rm-route-item.active {
                background: rgba(232, 93, 32, 0.15);
                border-left-color: #E85D20;
            }
            .rm-route-title {
                font-size: 12px;
                font-weight: 700;
                color: #f0e8de;
                margin-bottom: 6px;
            }
            .rm-route-title a {
                color: inherit;
                text-decoration: none;
            }
            .rm-route-tags { display: flex; gap: 6px; flex-wrap: wrap; }
            .rm-tag {
                font-size: 10px;
                padding: 3px 8px;
                border-radius: 4px;
                font-weight: 600;
                text-transform: uppercase;
            }
            .rm-tag-distance { background: rgba(232, 93, 32, 0.2); color: #E8975A; }
            .rm-tag-alta { background: rgba(239, 68, 68, 0.2); color: #f87171; }
            .rm-tag-media { background: rgba(251, 146, 60, 0.2); color: #fb9241; }
            .rm-tag-baja { background: rgba(34, 197, 94, 0.2); color: #86efac; }
            .ridera-popup .leaflet-popup-content-wrapper {
                background: linear-gradient(135deg, rgba(20, 24, 50, 0.95) 0%, rgba(30, 35, 65, 0.95) 100%);
                border: 1px solid rgba(232, 93, 32, 0.4);
                border-radius: 10px;
            }
            .ridera-popup .leaflet-popup-content {
                font-family: 'Poppins', sans-serif;
                padding: 16px;
                color: #f0e8de;
            }
            @media (max-width: 1024px) {
                #ridera-mapa-container { flex-direction: column; }
                .rm-sidebar {
                    width: 100%;
                    height: auto;
                    max-height: 50vh;
                    border-left: none;
                    border-top: 2px solid rgba(232, 93, 32, 0.3);
                }
                #rmMap { order: -1; }
            }
        </style>

        <div id="ridera-mapa-container">
            <div id="rmMap"></div>
            <div class="rm-sidebar">
                <div class="rm-sidebar-header">
                    <div class="rm-sidebar-title">RIDERA</div>
                    <div class="rm-sidebar-subtitle">Rutas de Senderismo</div>
                    <div class="rm-stats-row">
                        <div class="rm-stat-card">
                            <span class="rm-stat-num" id="rmStatRutas">0</span>
                            <span class="rm-stat-label">Rutas</span>
                        </div>
                        <div class="rm-stat-card">
                            <span class="rm-stat-num" id="rmStatDeps">0</span>
                            <span class="rm-stat-label">Regiones</span>
                        </div>
                        <div class="rm-stat-card">
                            <span class="rm-stat-num" id="rmStatKm">0</span>
                            <span class="rm-stat-label">KM</span>
                        </div>
                    </div>
                </div>
                <div class="rm-sidebar-content" id="rmSidebarContent"></div>
            </div>
        </div>

        <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
        <script>
        (function() {
            var map = null;
            var allRoutes = [
                {id: 1, title: 'Medellín - Abriaquí', department: 'Antioquia', destino: 'Abriaquí', km: 85, difficulty: 'alta', lat: 5.7753, lon: -75.8981, link: '#', excerpt: 'Ruta clásica de Antioquia...'},
                {id: 2, title: 'Medellín - Guatapé', department: 'Antioquia', destino: 'Guatapé', km: 65, difficulty: 'media', lat: 6.2272, lon: -75.1561, link: '#', excerpt: 'Piedra del Peñol y Guatapé...'},
                {id: 3, title: 'Pereira - Salento', department: 'Risaralda', destino: 'Salento', km: 45, difficulty: 'media', lat: 4.7556, lon: -75.5745, link: '#', excerpt: 'Valle de Cocora y Salento...'},
                {id: 4, title: 'Armenia - Filandia', department: 'Quindío', destino: 'Filandia', km: 35, difficulty: 'baja', lat: 4.7731, lon: -75.6844, link: '#', excerpt: 'Pueblo cafetero colombiano...'},
            ];
            var markers = [];

            function initMap() {
                map = L.map('rmMap', {center: [6.0, -74.8], zoom: 6, zoomControl: false});
                L.control.zoom({position: 'topright'}).addTo(map);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: '© OpenStreetMap', maxZoom: 18}).addTo(map);
            }

            function getIcon() {
                return L.divIcon({
                    className: '',
                    html: '<div style="width:20px;height:20px;background:radial-gradient(circle,#ff7a3d,#E85D20);border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(232,93,32,0.8)"></div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });
            }

            function clearMarkers() {
                markers.forEach(function(m) { map.removeLayer(m); });
                markers = [];
            }

            function showMarkersForDep(dep) {
                clearMarkers();
                var routes = allRoutes.filter(function(r) { return r.department === dep; });
                routes.forEach(function(r) {
                    var m = L.marker([r.lat, r.lon], {icon: getIcon()}).addTo(map);
                    var popupHtml = '<div style="min-width:220px"><strong style="font-size:14px;color:#fff;display:block;margin-bottom:8px">' + r.title + '</strong>' +
                        '<div style="font-size:12px;color:#d0d8f0;margin-bottom:10px"><strong>📍 Destino:</strong> ' + r.destino + '</div>' +
                        '<div style="font-size:12px;color:#d0d8f0;margin-bottom:6px"><strong>📏 Distancia:</strong> ~' + r.km + ' km</div>' +
                        '<div style="font-size:12px;color:#d0d8f0;margin-bottom:10px"><strong>⛰️ Dificultad:</strong> ' + r.difficulty + '</div>' +
                        '<p style="font-size:12px;color:#b0b8d0;margin:8px 0 12px 0;line-height:1.5">' + r.excerpt + '</p>' +
                        '<a href="' + r.link + '" style="font-size:13px;font-weight:700;color:#E85D20;text-decoration:none" target="_blank">➜ Ver ruta completa</a></div>';
                    m.bindPopup(popupHtml, {className: 'ridera-popup'});
                    m._routeId = r.id;
                    markers.push(m);
                });
            }

            function renderPanel() {
                var deps = {}; var totalKm = 0;
                allRoutes.forEach(function(r) {
                    deps[r.department] = (deps[r.department] || 0) + 1;
                    totalKm += r.km;
                });

                document.getElementById('rmStatRutas').textContent = allRoutes.length;
                document.getElementById('rmStatDeps').textContent = Object.keys(deps).length;
                document.getElementById('rmStatKm').textContent = '+' + Math.round(totalKm);

                var html = '';
                var sortedDeps = Object.keys(deps).sort();
                sortedDeps.forEach(function(dep) {
                    var routes = allRoutes.filter(function(r) { return r.department === dep; });
                    html += '<div class="rm-department"><button class="rm-dep-header" data-dep="' + dep + '"><div class="rm-dep-name"><div class="rm-dep-dot"></div><div class="rm-dep-title">' + dep + '</div></div><div class="rm-dep-meta"><span class="rm-route-count">' + routes.length + '</span><span class="rm-chevron">▸</span></div></button><div class="rm-routes">';
                    routes.forEach(function(r) {
                        html += '<div class="rm-route-item" data-id="' + r.id + '" data-lat="' + r.lat + '" data-lon="' + r.lon + '"><div class="rm-route-title"><a href="' + r.link + '" target="_blank">' + r.title + '</a></div><div class="rm-route-tags">';
                        if (r.km) html += '<span class="rm-tag rm-tag-distance">~' + r.km + ' km</span>';
                        html += '<span class="rm-tag rm-tag-' + r.difficulty + '">' + r.difficulty + '</span>';
                        html += '</div></div>';
                    });
                    html += '</div></div>';
                });
                document.getElementById('rmSidebarContent').innerHTML = html;

                document.querySelectorAll('.rm-dep-header').forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        var dep = btn.dataset.dep;
                        var routes = btn.nextElementSibling;
                        var isOpen = routes.classList.contains('open');
                        document.querySelectorAll('.rm-routes').forEach(function(r) { r.classList.remove('open'); });
                        document.querySelectorAll('.rm-dep-header').forEach(function(b) { b.classList.remove('active'); });
                        if (!isOpen) {
                            routes.classList.add('open');
                            btn.classList.add('active');
                            showMarkersForDep(dep);
                        } else {
                            clearMarkers();
                        }
                    });
                });

                document.querySelectorAll('.rm-route-item').forEach(function(card) {
                    card.addEventListener('click', function(e) {
                        if (e.target.tagName === 'A') return;
                        var id = parseInt(card.dataset.id);
                        var lat = parseFloat(card.dataset.lat);
                        var lon = parseFloat(card.dataset.lon);
                        document.querySelectorAll('.rm-route-item').forEach(function(c) { c.classList.remove('active'); });
                        card.classList.add('active');
                        map.setView([lat, lon], 12, {animate: true});
                        markers.forEach(function(m) { if (m._routeId === id) m.openPopup(); });
                    });
                });
            }

            initMap();
            renderPanel();
        })();
        </script>
        <?php
    }

    if (!is_admin()) {
        add_shortcode('ridera_mapa_demo', 'ridera_mapa_demo_render');
    }
}
?>
