<?php
/**
 * RIDERA MAPA INTERACTIVO - MEJORADO
 *
 * ✅ Fetchea TODAS las rutas (sin límite de 100)
 * ✅ Detecta departamentos desde categorías de WordPress
 * ✅ Interactividad completa: click en depto → zoom al mapa
 * ✅ Muestra todos los markers de todas las regiones
 */

if (!function_exists('ridera_mapa_interactivo_render')) {

    function ridera_mapa_interactivo_render() {
        ?>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">

        <style>
            #ridera-mapa-container {
                width: 100%;
                height: 85vh;
                min-height: 650px;
                position: relative;
                font-family: 'DM Sans', system-ui, sans-serif;
                background: #111;
                color: #f0e8de;
                -webkit-font-smoothing: antialiased;
            }
            #ridera-mapa-container * { box-sizing: border-box; }
            #rmMap { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; }
            .rm-topbar {
                position: absolute; top: 16px; left: 16px; right: 16px; z-index: 800;
                display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
                background: rgba(18,16,14,0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
                border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 14px 22px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            }
            .rm-brand { display: flex; align-items: baseline; gap: 12px; }
            .rm-brand h2 { font-family: 'Bebas Neue', sans-serif; font-size: 28px; font-weight: 400; letter-spacing: 2px; margin: 0; color: #fff; line-height: 1; }
            .rm-brand h2 span { color: #E85D20; }
            .rm-brand p { font-size: 11px; color: #8a8078; letter-spacing: 3px; text-transform: uppercase; margin: 0; }
            .rm-stats { display: flex; gap: 16px; align-items: center; }
            .rm-stat { text-align: center; padding: 0 8px; }
            .rm-stat-num { font-family: 'Bebas Neue', sans-serif; font-size: 24px; color: #E85D20; display: block; line-height: 1.1; }
            .rm-stat-label { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #8a8078; display: block; }
            .rm-cta {
                padding: 10px 24px; border-radius: 10px; background: #E85D20; color: #fff;
                font-family: 'Bebas Neue', sans-serif; font-size: 15px; letter-spacing: 2px;
                text-decoration: none; text-transform: uppercase; transition: all 0.2s;
                border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(232,93,32,0.35); white-space: nowrap;
            }
            .rm-cta:hover { background: #f06a2c; transform: translateY(-1px); }
            .rm-panel {
                position: absolute; top: 90px; left: 16px; bottom: 16px; width: 320px; z-index: 800;
                background: rgba(18,16,14,0.9); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; overflow: hidden;
                display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            }
            @media (max-width: 800px) {
                .rm-panel { width: calc(100% - 32px); top: auto; bottom: 16px; max-height: 50vh; }
                .rm-topbar { padding: 10px 14px; }
                .rm-brand p { display: none; }
            }
            .rm-panel-head { padding: 16px 18px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
            .rm-panel-title { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #E85D20; font-weight: 700; margin: 0 0 4px 0; }
            .rm-panel-sub { font-size: 12px; color: #8a8078; margin: 0; }
            .rm-dep-list { flex: 1; overflow-y: auto; padding: 0; }
            .rm-dep-list::-webkit-scrollbar { width: 3px; }
            .rm-dep-list::-webkit-scrollbar-thumb { background: rgba(232,93,32,0.3); border-radius: 2px; }
            .rm-dep-item { border-bottom: 1px solid rgba(255,255,255,0.04); }
            .rm-dep-btn {
                width: 100%; display: flex; align-items: center; justify-content: space-between;
                padding: 14px 18px; cursor: pointer; background: transparent; border: none;
                font-family: inherit; color: #d0c8be; transition: all 0.15s; text-align: left;
            }
            .rm-dep-btn:hover { background: rgba(255,255,255,0.04); }
            .rm-dep-btn.active { background: rgba(232,93,32,0.1); color: #fff; }
            .rm-dep-btn-left { display: flex; align-items: center; gap: 10px; }
            .rm-dep-dot { width: 8px; height: 8px; border-radius: 50%; background: #E85D20; flex-shrink: 0; box-shadow: 0 0 6px rgba(232,93,32,0.4); }
            .rm-dep-name { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
            .rm-dep-count { font-size: 11px; color: #5a524a; font-weight: 600; background: rgba(255,255,255,0.05); padding: 2px 10px; border-radius: 10px; }
            .rm-dep-arrow { font-size: 12px; color: #5a524a; transition: transform 0.2s; }
            .rm-dep-btn.active .rm-dep-arrow { transform: rotate(90deg); color: #E85D20; }
            .rm-dep-routes { display: none; background: rgba(0,0,0,0.2); max-height: 300px; overflow-y: auto; }
            .rm-dep-routes.open { display: block; }
            .rm-route-card {
                padding: 12px 18px 12px 36px; border-top: 1px solid rgba(255,255,255,0.03);
                cursor: pointer; transition: all 0.15s; border-left: 3px solid transparent;
            }
            .rm-route-card:hover { background: rgba(232,93,32,0.06); border-left-color: rgba(232,93,32,0.5); }
            .rm-route-card.active { background: rgba(232,93,32,0.1); border-left-color: #E85D20; }
            .rm-route-name { font-size: 13px; font-weight: 700; color: #f0e8de; margin-bottom: 4px; }
            .rm-route-name a { color: inherit; text-decoration: none; transition: color 0.15s; }
            .rm-route-name a:hover { color: #E85D20; }
            .rm-route-tags { display: flex; gap: 5px; flex-wrap: wrap; }
            .rm-tag { font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 700; }
            .rm-tag-km { background: rgba(232,93,32,0.15); color: #E8975A; }
            .rm-tag-alta { background: rgba(239,68,68,0.15); color: #f87171; }
            .rm-tag-media { background: rgba(234,179,8,0.15); color: #facc15; }
            .rm-tag-baja { background: rgba(34,197,94,0.15); color: #4ade80; }
            .rm-loading { display: flex; align-items: center; justify-content: center; height: 200px; color: #8a8078; font-size: 13px; }
            .ridera-popup .leaflet-popup-content-wrapper {
                background: rgba(18,16,14,0.92) !important; color: #f0e8de !important;
                border-radius: 12px !important; border: 1px solid rgba(255,255,255,0.1) !important;
                box-shadow: 0 12px 40px rgba(0,0,0,0.5) !important; backdrop-filter: blur(16px) !important;
            }
            .ridera-popup .leaflet-popup-tip { background: rgba(18,16,14,0.92) !important; }
            .ridera-popup .leaflet-popup-content { margin: 14px 18px !important; font-family: 'DM Sans', sans-serif !important; }
            .ridera-popup .leaflet-popup-content a { color: #E85D20 !important; font-weight: 700 !important; }
            #ridera-mapa-container .leaflet-control-zoom a {
                background: rgba(18,16,14,0.85) !important; color: #f0e8de !important;
                border-color: rgba(255,255,255,0.08) !important; backdrop-filter: blur(12px) !important;
            }
            #ridera-mapa-container .leaflet-control-zoom a:hover { background: rgba(232,93,32,0.3) !important; }
            #ridera-mapa-container .leaflet-control-zoom { border: none !important; border-radius: 10px !important; overflow: hidden !important; box-shadow: 0 4px 16px rgba(0,0,0,0.3) !important; }
            #ridera-mapa-container .leaflet-control-attribution { background: rgba(18,16,14,0.6) !important; color: #5a524a !important; font-size: 9px !important; }
            #ridera-mapa-container .leaflet-control-attribution a { color: #8a8078 !important; }
        </style>

        <div id="ridera-mapa-container">
            <div id="rmMap"></div>
            <div class="rm-topbar">
                <div class="rm-brand">
                    <h2>RIDE<span>RA</span></h2>
                    <p>Colombia en dos ruedas</p>
                </div>
                <div class="rm-stats">
                    <div class="rm-stat">
                        <span class="rm-stat-num" id="rmStatRutas">-</span>
                        <span class="rm-stat-label">Rutas</span>
                    </div>
                    <div class="rm-stat">
                        <span class="rm-stat-num" id="rmStatDeps">-</span>
                        <span class="rm-stat-label">Deptos</span>
                    </div>
                    <div class="rm-stat">
                        <span class="rm-stat-num" id="rmStatKm">-</span>
                        <span class="rm-stat-label">Km</span>
                    </div>
                </div>
                <a class="rm-cta" href="/rutas/">Ver todas ↗</a>
            </div>
            <div class="rm-panel">
                <div class="rm-panel-head">
                    <p class="rm-panel-title">Explorar rutas</p>
                    <p class="rm-panel-sub">Selecciona un departamento</p>
                </div>
                <div class="rm-dep-list" id="rmDepList">
                    <div class="rm-loading">Cargando rutas...</div>
                </div>
            </div>
        </div>

        <script>
        (function() {
            var allRoutes = [];
            var map, markers = [];

            // Coordenadas de destinos en Colombia
            var DEST_COORDS = {
                'ayapel': [9.2417, -74.4267], 'abriaqui': [6.6131, -75.7578],
                'abejimarejo': [6.6947, -75.5733], 'abejorral': [5.3417, -74.9406],
                'la pintada': [5.7417, -75.6042], 'pintada': [5.7417, -75.6042],
                'venecia': [5.7819, -75.6208], 'jardin': [5.5983, -75.8194],
                'salento': [4.6378, -75.5708], 'filandia': [4.6756, -75.6581],
                'guatape': [6.2325, -75.1564], 'penol': [6.2206, -75.2442],
                'san rafael': [6.2944, -74.9867], 'cocorna': [6.0556, -75.1853],
                'san carlos': [6.1872, -74.9950], 'pereira': [4.8133, -75.6961],
                'armenia': [4.5339, -75.6811], 'manizales': [5.0689, -75.5174],
                'cali': [3.4516, -76.5320], 'cartagena': [10.3910, -75.5144],
                'santa marta': [11.2408, -74.1990], 'bucaramanga': [7.1254, -73.1198],
                'tunja': [5.5353, -73.3678], 'villa de leyva': [5.6347, -73.5228],
                'san gil': [6.5594, -73.1361], 'barichara': [6.6350, -73.2250],
                'bogota': [4.7110, -74.0721], 'popayan': [2.4419, -76.6064],
                'pasto': [1.2136, -77.2811], 'neiva': [2.9273, -75.2819],
                'ibague': [4.4389, -75.2322], 'girardot': [4.3017, -74.8022],
                'honda': [5.2072, -74.7364], 'villavicencio': [4.1420, -73.6266],
                'medellin': [6.2442, -75.5812], 'santa fe': [6.5591, -75.8268],
                'cañasgordas': [6.7497, -76.0258],
            };

            // Coordenadas de departamentos (para zoom/center)
            var DEP_COORDS = {
                'antioquia': {center: [6.25, -75.56], zoom: 8},
                'risaralda': {center: [4.81, -75.69], zoom: 9},
                'quindio': {center: [4.54, -75.67], zoom: 9},
                'valle del cauca': {center: [3.45, -76.52], zoom: 8},
                'bolivar': {center: [10.39, -75.51], zoom: 8},
                'magdalena': {center: [11.24, -74.20], zoom: 8},
                'cesar': {center: [10.47, -73.25], zoom: 8},
                'atlantico': {center: [10.96, -74.78], zoom: 8},
                'cordoba': {center: [8.75, -75.88], zoom: 8},
                'sucre': {center: [9.30, -75.39], zoom: 8},
                'choco': {center: [5.69, -76.66], zoom: 8},
                'cauca': {center: [2.44, -76.61], zoom: 8},
                'nariño': {center: [1.29, -77.35], zoom: 8},
                'santander': {center: [7.12, -73.12], zoom: 8},
                'boyaca': {center: [5.53, -73.36], zoom: 8},
                'cundinamarca': {center: [4.71, -74.07], zoom: 8},
                'tolima': {center: [4.44, -75.23], zoom: 8},
                'huila': {center: [2.93, -75.28], zoom: 8},
                'meta': {center: [4.15, -73.63], zoom: 8},
                'caldas': {center: [5.07, -75.52], zoom: 9},
            };

            function extractDestino(titulo) {
                return titulo.toLowerCase()
                    .replace(/medellín\s*[-–]\s*/i, '').replace(/medellín\s*/i, '')
                    .replace(/\s*—\s*elementor/i, '').replace(/\s*elementor/i, '')
                    .trim();
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

                // Detectar departamento desde categorías
                var department = 'antioquia'; // default
                if (r.categories && r.categories.length > 0) {
                    var catName = (r._embedded && r._embedded['wp:term'] && r._embedded['wp:term'][0])
                        ? r._embedded['wp:term'][0][0].name : '';
                    if (catName) department = catName.toLowerCase();
                }

                return {
                    id: r.id, title: title, slug: r.slug, link: r.link,
                    excerpt: excerpt.slice(0, 200), destino: destino, km: km,
                    difficulty: difficulty, department: department,
                    lat: coords[0], lon: coords[1],
                };
            }

            // Fetchear TODAS las rutas sin límite
            function fetchAllRoutes(callback) {
                var allData = [];
                var page = 1;

                function fetchPage() {
                    var url = '/wp-json/wp/v2/rutas?per_page=100&page=' + page +
                              '&_embed&_fields=id,title,slug,link,excerpt,categories';

                    fetch(url)
                        .then(res => res.json())
                        .then(data => {
                            if (!Array.isArray(data) || data.length === 0) {
                                // Se acabaron las rutas
                                callback(allData.map(parseRoute));
                                return;
                            }
                            allData = allData.concat(data);
                            page++;
                            fetchPage();
                        })
                        .catch(err => {
                            console.error('Error fetcheando rutas:', err);
                            document.getElementById('rmDepList').innerHTML = '<div class="rm-loading">Error cargando rutas.</div>';
                        });
                }

                fetchPage();
            }

            function initMap() {
                map = L.map('rmMap', { center: [6.0, -74.8], zoom: 6, zoomControl: false });
                L.control.zoom({ position: 'topright' }).addTo(map);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap', maxZoom: 18,
                }).addTo(map);
            }

            var markerIcon = null;
            function getIcon() {
                if (!markerIcon) {
                    markerIcon = L.divIcon({
                        className: '',
                        html: '<div style="width:18px;height:18px;background:radial-gradient(circle,#ff7a3d,#E85D20);border-radius:50%;border:2.5px solid #fff;box-shadow:0 0 12px rgba(232,93,32,0.6),0 3px 8px rgba(0,0,0,0.3)"></div>',
                        iconSize: [18, 18], iconAnchor: [9, 9],
                    });
                }
                return markerIcon;
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
                    var popupHtml = '<div style="min-width:200px">' +
                        '<strong style="font-size:14px;color:#f0e8de;display:block;margin-bottom:8px">' + r.title + '</strong>' +
                        '<div style="font-size:12px;color:#c0b8ae;margin-bottom:10px"><strong>Destino:</strong> ' + (r.destino.charAt(0).toUpperCase() + r.destino.slice(1)) + '</div>' +
                        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">' +
                        (r.km ? '<span style="background:rgba(232,93,32,0.15);color:#E8975A;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">~' + r.km + ' km</span>' : '') +
                        (r.difficulty ? '<span style="font-size:11px;text-transform:capitalize;color:#c0b8ae;padding:2px 8px;background:rgba(255,255,255,0.06);border-radius:4px;font-weight:600">' + r.difficulty + '</span>' : '') +
                        '</div>' +
                        '<p style="font-size:12px;color:#a09888;margin:8px 0 10px 0;line-height:1.4">' + r.excerpt + '</p>' +
                        '<a href="' + r.link + '" style="font-size:13px;font-weight:700;color:#E85D20;text-decoration:none;display:inline-block" target="_blank">Ver ruta completa →</a></div>';
                    m.bindPopup(popupHtml, { className: 'ridera-popup' });
                    m._routeId = r.id;
                    markers.push(m);
                });

                // Zoom a la región del departamento
                var depConfig = DEP_COORDS[dep.toLowerCase()];
                if (depConfig && markers.length > 0) {
                    map.setView(depConfig.center, depConfig.zoom, { animate: true, duration: 0.8 });
                } else if (markers.length > 0) {
                    var group = L.featureGroup(markers);
                    map.fitBounds(group.getBounds().pad(0.2));
                }
            }

            function renderPanel() {
                var deps = {};
                var totalKm = 0;

                allRoutes.forEach(function(r) {
                    var dep = r.department.toLowerCase();
                    if (!deps[dep]) deps[dep] = [];
                    deps[dep].push(r);
                    if (r.km) totalKm += r.km;
                });

                document.getElementById('rmStatRutas').textContent = allRoutes.length;
                document.getElementById('rmStatDeps').textContent = Object.keys(deps).length;
                document.getElementById('rmStatKm').textContent = totalKm > 0 ? '+' + Math.round(totalKm).toLocaleString() : '—';

                var html = '';
                var sortedDeps = Object.keys(deps).sort();
                sortedDeps.forEach(function(dep) {
                    var routes = deps[dep];
                    html += '<div class="rm-dep-item" data-dep="' + dep + '">';
                    html += '<button class="rm-dep-btn"><span class="rm-dep-btn-left"><span class="rm-dep-dot"></span><span class="rm-dep-name">' + dep.toUpperCase() + '</span></span>';
                    html += '<span style="display:flex;align-items:center;gap:8px"><span class="rm-dep-count">' + routes.length + '</span><span class="rm-dep-arrow">▸</span></span></button>';
                    html += '<div class="rm-dep-routes">';
                    routes.forEach(function(r) {
                        html += '<div class="rm-route-card" data-id="' + r.id + '" data-lat="' + r.lat + '" data-lon="' + r.lon + '">';
                        html += '<div class="rm-route-name"><a href="' + r.link + '" target="_blank">' + r.title + '</a></div>';
                        html += '<div class="rm-route-tags">';
                        if (r.km) html += '<span class="rm-tag rm-tag-km">~' + r.km + ' km</span>';
                        if (r.difficulty) html += '<span class="rm-tag rm-tag-' + r.difficulty + '">' + r.difficulty.charAt(0).toUpperCase() + r.difficulty.slice(1) + '</span>';
                        html += '</div></div>';
                    });
                    html += '</div></div>';
                });
                document.getElementById('rmDepList').innerHTML = html;

                // Event listeners para departamentos
                document.querySelectorAll('#ridera-mapa-container .rm-dep-btn').forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        var item = btn.closest('.rm-dep-item');
                        var dep = item.dataset.dep;
                        var routes = item.querySelector('.rm-dep-routes');
                        var isOpen = routes.classList.contains('open');

                        document.querySelectorAll('#ridera-mapa-container .rm-dep-routes').forEach(function(r) { r.classList.remove('open'); });
                        document.querySelectorAll('#ridera-mapa-container .rm-dep-btn').forEach(function(b) { b.classList.remove('active'); });

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

                // Event listeners para rutas individuales
                document.querySelectorAll('#ridera-mapa-container .rm-route-card').forEach(function(card) {
                    card.addEventListener('click', function(e) {
                        if (e.target.tagName === 'A') return;
                        var id = parseInt(card.dataset.id);
                        var lat = parseFloat(card.dataset.lat);
                        var lon = parseFloat(card.dataset.lon);
                        document.querySelectorAll('#ridera-mapa-container .rm-route-card').forEach(function(c) { c.classList.remove('active'); });
                        card.classList.add('active');
                        if (map) {
                            map.setView([lat, lon], 12, { animate: true, duration: 0.8 });
                            setTimeout(function() {
                                markers.forEach(function(m) { if (m._routeId === id) m.openPopup(); });
                            }, 400);
                        }
                    });
                });
            }

            // Iniciar
            initMap();
            fetchAllRoutes(function(routes) {
                allRoutes = routes;
                renderPanel();
            });
        })();
        </script>
        <?php
    }

    if (!is_admin()) {
        add_shortcode('ridera_mapa_interactivo', 'ridera_mapa_interactivo_render');
    }
}
