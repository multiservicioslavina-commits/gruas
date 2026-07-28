<?php
/**
 * RIDERA MAPA INTERACTIVO - DISEÑO NUEVO 2026
 *
 * ✅ Mapa BRILLANTE y claro
 * ✅ Panel lateral moderno con cards
 * ✅ Filtros por departamento con zoom automático
 * ✅ Interfaz limpia y responsive
 */

if (!function_exists('ridera_mapa_nuevo_render')) {

    function ridera_mapa_nuevo_render() {
        ?>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
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
            }

            #rmMap {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                z-index: 10;
                filter: brightness(2.1) contrast(1.8) saturate(1.4);
            }

            /* ===== PANEL LATERAL ===== */
            .rm-sidebar {
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                width: 360px;
                z-index: 800;
                background: rgba(20, 24, 50, 0.95);
                backdrop-filter: blur(20px);
                border-right: 1px solid rgba(232, 93, 32, 0.2);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: 8px 0 40px rgba(0, 0, 0, 0.7);
            }

            .rm-sidebar-header {
                padding: 24px 20px;
                background: linear-gradient(135deg, rgba(232, 93, 32, 0.15) 0%, rgba(232, 93, 32, 0.05) 100%);
                border-bottom: 2px solid rgba(232, 93, 32, 0.3);
            }

            .rm-sidebar-title {
                font-size: 26px;
                font-weight: 800;
                color: #fff;
                margin-bottom: 8px;
                letter-spacing: -0.5px;
            }

            .rm-sidebar-subtitle {
                font-size: 12px;
                color: #E85D20;
                text-transform: uppercase;
                letter-spacing: 2px;
                font-weight: 700;
            }

            .rm-stats-row {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 12px;
                margin-top: 16px;
            }

            .rm-stat-card {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(232, 93, 32, 0.3);
                border-radius: 8px;
                padding: 10px;
                text-align: center;
                transition: all 0.3s ease;
            }

            .rm-stat-card:hover {
                background: rgba(232, 93, 32, 0.15);
                border-color: #E85D20;
                transform: translateY(-2px);
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
                letter-spacing: 1px;
            }

            /* ===== SCROLL CONTENIDO ===== */
            .rm-sidebar-content {
                flex: 1;
                overflow-y: auto;
                padding: 16px 0;
            }

            .rm-sidebar-content::-webkit-scrollbar {
                width: 6px;
            }

            .rm-sidebar-content::-webkit-scrollbar-track {
                background: transparent;
            }

            .rm-sidebar-content::-webkit-scrollbar-thumb {
                background: rgba(232, 93, 32, 0.4);
                border-radius: 3px;
            }

            .rm-sidebar-content::-webkit-scrollbar-thumb:hover {
                background: rgba(232, 93, 32, 0.7);
            }

            /* ===== DEPARTAMENTOS ===== */
            .rm-department {
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            }

            .rm-dep-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 16px;
                cursor: pointer;
                transition: all 0.2s ease;
                background: transparent;
                border: none;
                width: 100%;
                font-family: 'Poppins', sans-serif;
                text-align: left;
            }

            .rm-dep-header:hover {
                background: rgba(232, 93, 32, 0.08);
                padding-left: 20px;
            }

            .rm-dep-header.active {
                background: rgba(232, 93, 32, 0.15);
                border-left: 3px solid #E85D20;
                padding-left: 17px;
            }

            .rm-dep-name {
                display: flex;
                align-items: center;
                gap: 10px;
                flex: 1;
            }

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
                letter-spacing: 1px;
            }

            .rm-dep-meta {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .rm-route-count {
                background: rgba(232, 93, 32, 0.2);
                color: #E85D20;
                font-weight: 700;
                font-size: 11px;
                padding: 4px 10px;
                border-radius: 12px;
                letter-spacing: 0.5px;
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

            /* ===== RUTAS ===== */
            .rm-routes {
                display: none;
                background: rgba(0, 0, 0, 0.3);
            }

            .rm-routes.open {
                display: block;
            }

            .rm-route-item {
                padding: 12px 16px 12px 40px;
                cursor: pointer;
                transition: all 0.2s ease;
                border-left: 2px solid transparent;
                position: relative;
            }

            .rm-route-item:hover {
                background: rgba(232, 93, 32, 0.08);
                border-left-color: rgba(232, 93, 32, 0.5);
                padding-left: 36px;
            }

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
                transition: color 0.2s;
            }

            .rm-route-title a:hover {
                color: #E85D20;
            }

            .rm-route-tags {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
            }

            .rm-tag {
                font-size: 10px;
                padding: 3px 8px;
                border-radius: 4px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .rm-tag-distance {
                background: rgba(232, 93, 32, 0.2);
                color: #E8975A;
            }

            .rm-tag-alta {
                background: rgba(239, 68, 68, 0.2);
                color: #f87171;
            }

            .rm-tag-media {
                background: rgba(251, 146, 60, 0.2);
                color: #fb9241;
            }

            .rm-tag-baja {
                background: rgba(34, 197, 94, 0.2);
                color: #86efac;
            }

            /* ===== POPUP LEAFLET ===== */
            .ridera-popup .leaflet-popup-content-wrapper {
                background: linear-gradient(135deg, rgba(20, 24, 50, 0.95) 0%, rgba(30, 35, 65, 0.95) 100%);
                border: 1px solid rgba(232, 93, 32, 0.4);
                border-radius: 10px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
                padding: 0;
            }

            .ridera-popup .leaflet-popup-content {
                font-family: 'Poppins', sans-serif;
                padding: 16px;
                color: #f0e8de;
            }

            .ridera-popup .leaflet-popup-tip {
                background: rgba(20, 24, 50, 0.95);
                border: 1px solid rgba(232, 93, 32, 0.4);
            }

            /* ===== RESPONSIVE ===== */
            @media (max-width: 1024px) {
                .rm-sidebar {
                    width: 300px;
                }
            }

            @media (max-width: 768px) {
                #ridera-mapa-container {
                    height: 100vh;
                }

                .rm-sidebar {
                    width: 100%;
                    height: auto;
                    max-height: 50vh;
                    bottom: 0;
                    top: auto;
                    border-right: none;
                    border-top: 2px solid rgba(232, 93, 32, 0.3);
                    border-radius: 16px 16px 0 0;
                }

                .rm-sidebar-header {
                    padding: 16px;
                }

                .rm-sidebar-title {
                    font-size: 20px;
                }

                .rm-stats-row {
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 8px;
                }
            }

            @media (max-width: 480px) {
                .rm-sidebar {
                    max-height: 60vh;
                }

                .rm-sidebar-title {
                    font-size: 18px;
                }

                .rm-dep-title {
                    font-size: 12px;
                }

                .rm-route-title {
                    font-size: 11px;
                }

                .rm-stats-row {
                    grid-template-columns: 1fr 1fr;
                }
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

        <script>
        (function() {
            var map = null;
            var allRoutes = [];
            var markers = [];
            var WP_API = '/wp-json/wp/v2/rutas';

            var DEST_COORDS = {
                'medellín': [6.2442, -75.5812],
                'guatapé': [6.2272, -75.1561],
                'ayapel': [8.5967, -75.6328],
                'sonsón': [5.6881, -75.3142],
                'caldas': [6.1489, -75.7333],
                'abriaquí': [5.7753, -75.8981],
                'envigado': [6.1792, -75.5080],
                'sabaneta': [6.1578, -75.4894],
                'La Ceja': [6.0537, -75.4247],
                'Rionegro': [6.1291, -75.3767],
                'Copacabana': [6.2947, -75.5067],
                'Girardota': [6.4239, -75.4769],
                'Barbosa': [6.4586, -75.4089],
                'Pereira': [4.8133, -75.6964],
                'Manizales': [5.0688, -75.5153],
                'Armenia': [4.5339, -75.7314],
                'Salento': [4.7556, -75.5745],
                'Filandia': [4.7731, -75.6844],
                'Pijao': [4.6222, -75.6733],
                'Cartagena': [10.3905, -75.5142],
                'Tayrona': [11.2856, -73.8945],
                'Bogotá': [4.7110, -74.0721],
                'Santa Marta': [11.2429, -74.2245],
                'Minca': [11.2169, -74.3036],
                'Cali': [3.4516, -76.5319],
                'Buenaventura': [3.8828, -77.2744],
                'Popayán': [2.4448, -76.6133],
                'San Andrés': [12.5847, -81.7200],
                'Providencia': [13.3689, -81.3769],
                'Leticia': [-0.2030, -69.9489],
                'Puerto Nariño': [0.7533, -70.3639],
            };

            var DEP_COORDS = {
                'antioquia': {center: [6.25, -75.56], zoom: 8},
                'risaralda': {center: [4.81, -75.69], zoom: 9},
                'quindío': {center: [4.53, -75.73], zoom: 9},
                'caldas': {center: [5.07, -75.52], zoom: 9},
                'bolívar': {center: [10.39, -75.51], zoom: 8},
                'magdalena': {center: [11.24, -74.22], zoom: 8},
                'distrito capital': {center: [4.71, -74.07], zoom: 10},
                'valle': {center: [3.45, -76.53], zoom: 8},
                'cauca': {center: [2.44, -76.61], zoom: 8},
                'san andrés y providencia': {center: [12.58, -81.72], zoom: 9},
                'amazonas': {center: [-0.20, -69.95], zoom: 8},
            };

            function extractDestino(title) {
                var match = title.match(/—\s*(.+?)(?:\s*–|\s*$)/);
                if (match) return match[1].trim();
                var parts = title.split('-');
                return parts.length > 1 ? parts[parts.length - 1].trim() : title;
            }

            function getCoordForDestino(destino) {
                var norm = destino.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
                var destKeys = Object.keys(DEST_COORDS).sort((a,b) => b.length - a.length);
                for (var i = 0; i < destKeys.length; i++) {
                    if (norm.indexOf(destKeys[i]) >= 0) return DEST_COORDS[destKeys[i]];
                }
                return null;
            }

            function parseRoute(r) {
                var title = (r.title && r.title.rendered) || '';
                title = title.replace(/&amp;/g, '&').replace(/&#8211;/g, '–');
                var excerpt = (r.excerpt && r.excerpt.rendered) || '';
                excerpt = excerpt.replace(/<[^>]+>/g, '').trim();

                var destino = extractDestino(title);
                var coords = getCoordForDestino(destino) || [6.2442, -75.5812];
                var kmMatch = excerpt.match(/(\d+(?:[.,]\d+)?)\s*km/i);
                var km = kmMatch ? parseFloat(kmMatch[1].replace(',', '.')) : null;
                var diffMatch = excerpt.match(/(alta|media|baja)/i);
                var difficulty = diffMatch ? diffMatch[1].toLowerCase() : '';

                var department = 'Antioquia';
                if (r.categories && r.categories.length > 0) {
                    var catName = (r._embedded && r._embedded['wp:term'] && r._embedded['wp:term'][0])
                        ? r._embedded['wp:term'][0][0].name : '';
                    if (catName) department = catName;
                }

                return {
                    id: r.id, title: title, slug: r.slug, link: r.link,
                    excerpt: excerpt.slice(0, 200), destino: destino, km: km,
                    difficulty: difficulty, department: department,
                    lat: coords[0], lon: coords[1],
                };
            }

            function fetchAllRoutes(page, allData) {
                page = page || 1; allData = allData || [];
                var url = WP_API + '?per_page=100&page=' + page + '&_embed&_fields=id,title,slug,link,excerpt,categories';
                fetch(url).then(function(res) { return res.json(); }).then(function(data) {
                    if (!Array.isArray(data) || data.length === 0) {
                        allRoutes = allData.map(parseRoute);
                        initMap();
                        renderPanel();
                        return;
                    }
                    allData = allData.concat(data);
                    fetchAllRoutes(page + 1, allData);
                }).catch(function(err) {
                    console.error('Error cargando rutas:', err);
                    document.getElementById('rmSidebarContent').innerHTML = '<div style="padding:20px;color:#f87171">Error cargando rutas</div>';
                });
            }

            function initMap() {
                map = L.map('rmMap', { center: [6.0, -74.8], zoom: 6, zoomControl: false });
                L.control.zoom({ position: 'topright' }).addTo(map);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap', maxZoom: 18,
                }).addTo(map);
            }

            function getIcon() {
                return L.divIcon({
                    className: '',
                    html: '<div style="width:20px;height:20px;background:radial-gradient(circle,#ff7a3d,#E85D20);border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(232,93,32,0.8),0 4px 10px rgba(0,0,0,0.4)"></div>',
                    iconSize: [20, 20], iconAnchor: [10, 10],
                });
            }

            function clearMarkers() {
                markers.forEach(function(m) { map.removeLayer(m); });
                markers = [];
            }

            function showMarkersForDep(dep) {
                clearMarkers();
                var routes = allRoutes.filter(function(r) { return r.department.toLowerCase() === dep.toLowerCase(); });
                routes.forEach(function(r) {
                    var m = L.marker([r.lat, r.lon], { icon: getIcon() }).addTo(map);
                    var popupHtml = '<div style="min-width:220px"><strong style="font-size:14px;color:#fff;display:block;margin-bottom:8px">' + r.title + '</strong>' +
                        '<div style="font-size:12px;color:#d0d8f0;margin-bottom:10px"><strong>📍 Destino:</strong> ' + r.destino + '</div>' +
                        (r.km ? '<div style="font-size:12px;color:#d0d8f0;margin-bottom:6px"><strong>📏 Distancia:</strong> ~' + r.km + ' km</div>' : '') +
                        (r.difficulty ? '<div style="font-size:12px;color:#d0d8f0;margin-bottom:10px"><strong>⛰️ Dificultad:</strong> ' + r.difficulty + '</div>' : '') +
                        '<p style="font-size:12px;color:#b0b8d0;margin:8px 0 12px 0;line-height:1.5">' + r.excerpt + '</p>' +
                        '<a href="' + r.link + '" style="font-size:13px;font-weight:700;color:#E85D20;text-decoration:none;display:inline-block" target="_blank">➜ Ver ruta completa</a></div>';
                    m.bindPopup(popupHtml, { className: 'ridera-popup' });
                    m._routeId = r.id;
                    markers.push(m);
                });
                if (markers.length > 0) {
                    var depConfig = DEP_COORDS[dep.toLowerCase()];
                    if (depConfig) {
                        map.setView(depConfig.center, depConfig.zoom, { animate: true, duration: 1 });
                    } else {
                        var group = L.featureGroup(markers);
                        map.fitBounds(group.getBounds().pad(0.2));
                    }
                }
            }

            function renderPanel() {
                var deps = {};
                var totalKm = 0;
                allRoutes.forEach(function(r) {
                    deps[r.department] = (deps[r.department] || 0) + 1;
                    if (r.km) totalKm += r.km;
                });

                document.getElementById('rmStatRutas').textContent = allRoutes.length;
                document.getElementById('rmStatDeps').textContent = Object.keys(deps).length;
                document.getElementById('rmStatKm').textContent = totalKm > 0 ? '+' + Math.round(totalKm).toLocaleString() : '—';

                var html = '';
                var sortedDeps = Object.keys(deps).sort();
                sortedDeps.forEach(function(dep) {
                    var routes = allRoutes.filter(function(r) { return r.department.toLowerCase() === dep.toLowerCase(); });
                    html += '<div class="rm-department">';
                    html += '<button class="rm-dep-header" data-dep="' + dep + '"><div class="rm-dep-name"><div class="rm-dep-dot"></div><div class="rm-dep-title">' + dep + '</div></div>';
                    html += '<div class="rm-dep-meta"><span class="rm-route-count">' + routes.length + '</span><span class="rm-chevron">▸</span></div></button>';
                    html += '<div class="rm-routes">';
                    routes.forEach(function(r) {
                        html += '<div class="rm-route-item" data-id="' + r.id + '" data-lat="' + r.lat + '" data-lon="' + r.lon + '">' +
                            '<div class="rm-route-title"><a href="' + r.link + '" target="_blank">' + r.title + '</a></div>' +
                            '<div class="rm-route-tags">';
                        if (r.km) html += '<span class="rm-tag rm-tag-distance">~' + r.km + ' km</span>';
                        if (r.difficulty) html += '<span class="rm-tag rm-tag-' + r.difficulty + '">' + r.difficulty + '</span>';
                        html += '</div></div>';
                    });
                    html += '</div></div>';
                });
                document.getElementById('rmSidebarContent').innerHTML = html;

                document.querySelectorAll('#ridera-mapa-container .rm-dep-header').forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        var dep = btn.dataset.dep;
                        var routes = btn.nextElementSibling;
                        var isOpen = routes.classList.contains('open');

                        document.querySelectorAll('#ridera-mapa-container .rm-routes').forEach(function(r) { r.classList.remove('open'); });
                        document.querySelectorAll('#ridera-mapa-container .rm-dep-header').forEach(function(b) { b.classList.remove('active'); });

                        if (!isOpen) {
                            routes.classList.add('open');
                            btn.classList.add('active');
                            showMarkersForDep(dep);
                        } else {
                            clearMarkers();
                            map.setView([6.0, -74.8], 6, { animate: true });
                        }
                    });
                });

                document.querySelectorAll('#ridera-mapa-container .rm-route-item').forEach(function(card) {
                    card.addEventListener('click', function(e) {
                        if (e.target.tagName === 'A') return;
                        var id = parseInt(card.dataset.id);
                        var lat = parseFloat(card.dataset.lat);
                        var lon = parseFloat(card.dataset.lon);
                        document.querySelectorAll('#ridera-mapa-container .rm-route-item').forEach(function(c) { c.classList.remove('active'); });
                        card.classList.add('active');
                        if (map) {
                            map.setView([lat, lon], 12, { animate: true, duration: 0.8 });
                            markers.forEach(function(m) { if (m._routeId === id) m.openPopup(); });
                        }
                    });
                });
            }

            fetchAllRoutes();
        })();
        </script>
        <?php
    }

    if (!is_admin()) {
        add_shortcode('ridera_mapa_interactivo', 'ridera_mapa_nuevo_render');
    }
}
?>
