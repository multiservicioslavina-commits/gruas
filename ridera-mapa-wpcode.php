<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
<style>
.rid{width:100%;height:88vh;min-height:600px;display:flex;font-family:system-ui,-apple-system,sans-serif;background:#0f0f0f;color:#eee;position:relative;overflow:hidden;box-sizing:border-box}
.rid *{box-sizing:border-box}
.rid-side{width:360px;background:#161616;border-right:1px solid #2a2a2a;display:flex;flex-direction:column;z-index:2;overflow:hidden;order:1}
.rid-map{flex:1;position:relative;z-index:1;order:2}
.rid-head{padding:20px;background:linear-gradient(180deg,#1e1e1e,#161616);border-bottom:1px solid #2a2a2a;flex-shrink:0}
.rid-logo{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.rid-logo h2{margin:0;font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px}
.rid-logo h2 i{color:#E85D20;font-style:normal}
.rid-logo span{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:2px;border:1px solid #333;padding:2px 8px;border-radius:4px}
.rid-counts{display:flex;gap:8px}
.rid-count{flex:1;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:8px;padding:10px 8px;text-align:center}
.rid-count b{display:block;font-size:20px;color:#E85D20;font-weight:800}
.rid-count small{font-size:9px;color:#555;text-transform:uppercase;letter-spacing:1px}
.rid-search{padding:12px 20px;border-bottom:1px solid #2a2a2a;flex-shrink:0}
.rid-search input{width:100%;background:#1e1e1e;border:1px solid #333;border-radius:8px;padding:10px 14px;color:#ddd;font-size:13px;font-family:inherit;outline:none}
.rid-search input:focus{border-color:#E85D20}
.rid-search input::placeholder{color:#555}
.rid-routes{flex:1;overflow-y:auto}
.rid-routes::-webkit-scrollbar{width:4px}
.rid-routes::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
.rid-item{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid #1e1e1e;cursor:pointer;transition:background .15s}
.rid-item:hover{background:#1e1e1e}
.rid-item.act{background:rgba(232,93,32,.1);border-left:3px solid #E85D20;padding-left:17px}
.rid-dot{width:10px;height:10px;border-radius:50%;background:#E85D20;flex-shrink:0;box-shadow:0 0 6px rgba(232,93,32,.5)}
.rid-info{flex:1;min-width:0}
.rid-name{font-size:13px;font-weight:700;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rid-meta{display:flex;gap:6px;margin-top:4px}
.rid-badge{font-size:9px;padding:2px 7px;border-radius:3px;font-weight:600}
.rid-badge-km{background:rgba(232,93,32,.12);color:#e8975a}
.rid-badge-alta{background:rgba(239,68,68,.12);color:#f87171}
.rid-badge-media{background:rgba(251,146,60,.12);color:#fb923c}
.rid-badge-baja{background:rgba(34,197,94,.12);color:#86efac}
.rid-go{font-size:10px;color:#555;flex-shrink:0;padding:4px 8px;border:1px solid #333;border-radius:4px;transition:all .15s}
.rid-item:hover .rid-go{color:#E85D20;border-color:#E85D20}
.rid-empty{padding:40px 20px;text-align:center;color:#444;font-size:13px}
.rid-popup .leaflet-popup-content-wrapper{background:#1e1e1e;border:1px solid #3a3a3a;border-radius:10px;color:#eee;font-family:system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.6)}
.rid-popup .leaflet-popup-content{margin:14px 16px;font-size:13px;line-height:1.5}
.rid-popup .leaflet-popup-tip{background:#1e1e1e;border:1px solid #3a3a3a}
.rid-popup a.leaflet-popup-close-button{color:#666;font-size:18px}
.rid-popup-title{font-size:15px;font-weight:800;color:#fff;margin-bottom:6px}
.rid-popup-dest{font-size:12px;color:#999;margin-bottom:8px}
.rid-popup-tags{display:flex;gap:4px;margin-bottom:10px}
.rid-popup-link{display:inline-block;background:#E85D20;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:700;transition:background .15s}
.rid-popup-link:hover{background:#f06a2c}
.rid-popup-hint{font-size:10px;color:#555;margin-top:8px}
.rid-tooltip{background:#1e1e1e !important;border:1px solid #3a3a3a !important;color:#ddd !important;font-family:system-ui,sans-serif !important;font-size:12px !important;font-weight:600 !important;padding:4px 10px !important;border-radius:6px !important;box-shadow:0 4px 12px rgba(0,0,0,.4) !important}
.rid-tooltip::before{border-top-color:#3a3a3a !important}
@media(max-width:900px){
    .rid{flex-direction:column;height:100vh}
    .rid-side{width:100%;max-height:45vh;border-right:none;border-top:1px solid #2a2a2a;order:2}
    .rid-map{order:1;min-height:55vh}
}
</style>

<div class="rid">
    <div id="ridMap" class="rid-map"></div>
    <div class="rid-side">
        <div class="rid-head">
            <div class="rid-logo">
                <h2>R<i>IDE</i>RA</h2>
                <span>MAPA</span>
            </div>
            <div class="rid-counts">
                <div class="rid-count"><b id="cRutas">0</b><small>Rutas</small></div>
                <div class="rid-count"><b id="cKm">&mdash;</b><small>KM</small></div>
                <div class="rid-count"><b id="cPuntos">0</b><small>Puntos</small></div>
            </div>
        </div>
        <div class="rid-search">
            <input type="text" id="ridSearch" placeholder="Buscar ruta o destino...">
        </div>
        <div class="rid-routes" id="ridList">
            <div class="rid-empty">Cargando rutas...</div>
        </div>
    </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
(function(){
    var COORDS={
        "medellin":[6.24,-75.58],"bogota":[4.71,-74.07],"cali":[3.45,-76.53],
        "barranquilla":[10.96,-74.78],"cartagena":[10.39,-75.51],"bucaramanga":[7.12,-73.12],
        "pereira":[4.81,-75.70],"manizales":[5.07,-75.52],"armenia":[4.53,-75.73],
        "santa marta":[11.24,-74.22],"cucuta":[7.89,-72.50],"ibague":[4.44,-75.24],
        "neiva":[2.93,-75.28],"pasto":[1.21,-77.28],"villavicencio":[4.15,-73.63],
        "monteria":[8.75,-75.88],"valledupar":[10.47,-73.25],"tunja":[5.53,-73.36],
        "popayan":[2.44,-76.61],"quibdo":[5.69,-76.66],
        "abriaqui":[5.78,-75.90],"abejorral":[5.79,-75.43],"acacias":[3.99,-73.76],
        "aguazul":[5.17,-72.55],"aguadas":[5.61,-75.46],"amalfi":[6.91,-75.08],
        "amaga":[6.04,-75.70],"andes":[5.66,-75.88],"angelopolis":[6.12,-75.71],
        "angostura":[6.88,-75.33],"anori":[7.07,-75.15],"anza":[6.32,-75.87],
        "apartado":[7.88,-76.63],"arauca":[7.09,-70.76],"arboletes":[8.85,-76.43],
        "argelia":[5.74,-75.14],"ayapel":[8.60,-75.63],
        "bahia solano":[6.22,-77.39],"barbosa":[6.46,-75.41],"barichara":[6.63,-73.22],
        "bello":[6.34,-75.56],"betania":[5.74,-75.97],"betulia":[6.11,-75.98],
        "briceno":[7.11,-75.55],"buenaventura":[3.88,-77.27],"buritica":[6.73,-75.91],
        "caceres":[7.58,-75.35],"caicedo":[6.40,-75.98],"caldas":[6.15,-75.73],
        "campamento":[7.05,-75.29],"canasgordas":[6.75,-76.02],"caracoli":[6.41,-74.76],
        "caramanta":[5.55,-75.64],"carolina del principe":[6.72,-75.28],
        "caucasia":[7.98,-75.20],"chigorodo":[7.67,-76.68],
        "cisneros":[6.53,-75.09],"ciudad bolivar":[5.85,-76.02],
        "cocorna":[6.05,-75.19],"concepcion":[6.40,-75.25],"concordia":[6.05,-75.90],
        "copacabana":[6.29,-75.51],
        "dabeiba":[7.00,-76.25],"don matias":[6.48,-75.43],"duitama":[5.83,-73.03],
        "ebejico":[6.33,-75.77],"el bagre":[7.59,-74.81],
        "el carmen de viboral":[6.08,-75.34],"el penol":[6.22,-75.25],
        "el retiro":[6.06,-75.50],"el santuario":[6.14,-75.27],
        "entrerrios":[6.57,-75.53],"envigado":[6.18,-75.51],
        "falan":[5.13,-74.95],"filandia":[4.77,-75.68],"florencia":[1.61,-75.61],
        "fredonia":[5.93,-75.67],"frontino":[6.78,-76.13],"fusagasuga":[4.34,-74.36],
        "garzon":[2.20,-75.63],"giraldo":[6.63,-75.94],"girardot":[4.30,-74.80],
        "girardota":[6.42,-75.48],"gomez plata":[6.69,-75.22],
        "granada":[6.14,-75.18],"guadalupe":[6.83,-75.24],"guaduas":[5.07,-74.60],
        "guarne":[6.28,-75.44],"guatape":[6.23,-75.16],
        "heliconia":[6.21,-75.73],"hispania":[5.80,-75.90],"honda":[5.21,-74.74],
        "inirida":[3.86,-67.92],"ipiales":[0.83,-77.64],"itagui":[6.17,-75.60],
        "ituango":[7.17,-75.77],
        "jardin":[5.60,-75.82],"jerico":[5.79,-75.78],
        "la ceja":[6.05,-75.42],"la estrella":[6.16,-75.64],"la mesa":[4.63,-74.46],
        "la pintada":[5.74,-75.60],"la union":[5.97,-75.36],
        "leticia":[-0.20,-69.95],"liborina":[6.67,-75.80],"lorica":[9.24,-75.81],
        "maceo":[6.55,-74.79],"magangue":[9.24,-74.75],"manizales":[5.07,-75.52],
        "marinilla":[6.18,-75.34],"mariquita":[5.20,-74.89],"melgar":[4.21,-74.64],
        "minca":[11.22,-74.30],"mitu":[1.25,-70.23],"mocoa":[1.15,-76.65],
        "mompos":[9.25,-74.43],"montebello":[5.95,-75.52],"mutata":[7.24,-76.44],
        "narino":[5.61,-75.18],"nechi":[8.10,-74.77],"necocli":[8.43,-76.78],
        "nuqui":[5.70,-77.27],
        "olaya":[6.61,-75.79],
        "paipa":[5.78,-73.11],"pamplona":[7.38,-72.65],"peque":[7.01,-75.88],
        "pijao":[4.62,-75.67],"providencia":[13.37,-81.38],
        "pueblo rico":[5.24,-76.04],"puerto berrio":[6.49,-74.41],
        "puerto carreno":[6.19,-67.49],"puerto narino":[0.75,-70.36],
        "puerto nare":[6.19,-74.59],"puerto triunfo":[5.88,-74.65],
        "remedios":[7.03,-74.69],"riohacha":[11.54,-72.91],"rionegro":[6.13,-75.38],
        "sabaneta":[6.16,-75.49],"sabanalarga":[6.85,-75.81],
        "salento":[4.76,-75.57],"salgar":[5.96,-75.98],
        "san agustin":[1.88,-76.27],"san andres":[12.58,-81.72],
        "san andres de cuerquia":[7.09,-75.68],"san carlos":[6.19,-74.99],
        "san francisco":[5.86,-76.07],"san gil":[6.56,-73.13],
        "san jeronimo":[6.44,-75.73],"san jose de la montana":[6.85,-75.66],
        "san juan de uraba":[8.76,-76.53],
        "san luis":[6.04,-74.99],"san pedro":[6.47,-75.56],
        "san rafael":[6.30,-74.99],"san roque":[6.48,-74.89],
        "san vicente":[6.32,-75.34],
        "santa barbara":[5.88,-75.57],"santa fe de antioquia":[6.56,-75.83],
        "santa rosa de osos":[6.65,-75.47],"santo domingo":[6.47,-75.17],
        "segovia":[7.08,-74.70],"sibundoy":[1.19,-76.92],
        "sincelejo":[9.30,-75.39],"sogamoso":[5.71,-72.93],
        "soledad":[10.92,-74.77],"sonson":[5.69,-75.31],"sopetran":[6.50,-75.74],
        "tamesis":[5.66,-75.71],"taraza":[7.58,-75.40],"tayrona":[11.29,-73.89],
        "titiribi":[6.06,-75.80],"toledo":[7.31,-75.70],"tumaco":[1.80,-78.76],
        "turbo":[8.10,-76.73],
        "urrao":[6.32,-76.13],
        "valdivia":[7.30,-75.45],"valparaiso":[5.62,-75.62],
        "vegachi":[6.77,-74.80],"venecia":[5.96,-75.73],
        "villa de leyva":[5.63,-73.52],
        "yarumal":[6.97,-75.42],"yolombo":[6.60,-75.01],"yopal":[5.34,-72.39],
        "zaragoza":[7.49,-74.87],"zipaquira":[5.02,-74.00]
    };

    var map = L.map("ridMap",{center:[6.25,-75.5],zoom:7,zoomControl:false});
    L.control.zoom({position:"topright"}).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        attribution:"OpenStreetMap",maxZoom:18
    }).addTo(map);

    var icon = L.divIcon({className:"",
        html:'<div style="width:14px;height:14px;background:#E85D20;border-radius:50%;border:2.5px solid #fff;box-shadow:0 0 10px rgba(232,93,32,.6),0 2px 6px rgba(0,0,0,.4);cursor:pointer"></div>',
        iconSize:[14,14],iconAnchor:[7,7]});
    var iconActive = L.divIcon({className:"",
        html:'<div style="width:20px;height:20px;background:#ff6b35;border-radius:50%;border:3px solid #fff;box-shadow:0 0 16px rgba(232,93,32,.8),0 3px 10px rgba(0,0,0,.5);cursor:pointer"></div>',
        iconSize:[20,20],iconAnchor:[10,10]});

    var routes = [], markers = [], activeMarker = null;

    function extractDest(title){
        var t = title.rendered || title;
        var m = t.match(/[-–—]\s*(.+?)(?:\s*[-–—]|\s*$)/);
        if(m) return m[1].trim();
        var p = t.split(/[-–—]/);
        if(p.length > 1) return p[p.length-1].trim();
        var words = t.trim().split(/\s+/);
        if(words.length > 1) return words.slice(1).join(" ");
        return t;
    }

    function normalize(s){
        return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim();
    }

    var ORIGINS = ["medellin","bogota","cali","barranquilla","cartagena","bucaramanga","pereira","manizales","armenia","santa marta","cucuta","ibague","neiva","pasto","villavicencio","monteria","valledupar","tunja","popayan"];

    function findCoord(d){
        var n = normalize(d);
        var keys = Object.keys(COORDS).sort(function(a,b){return b.length - a.length;});
        for(var i=0; i<keys.length; i++){
            if(n.indexOf(keys[i]) >= 0) return COORDS[keys[i]];
        }
        return null;
    }

    function findDestCoord(title, dest){
        var c = findCoord(dest);
        if(c) return c;
        var nt = normalize(title);
        var keys = Object.keys(COORDS).sort(function(a,b){return b.length - a.length;});
        for(var i=0; i<keys.length; i++){
            if(ORIGINS.indexOf(keys[i]) >= 0) continue;
            if(nt.indexOf(keys[i]) >= 0) return COORDS[keys[i]];
        }
        return null;
    }

    function processData(rawData){
        var totalKm = 0;
        routes = []; markers = [];
        var sinCoord = [];

        rawData.forEach(function(r){
            var tit = r.title.rendered || r.title;
            var exc = "";
            if(r.excerpt && r.excerpt.rendered){
                var tmp = document.createElement("div");
                tmp.innerHTML = r.excerpt.rendered;
                exc = tmp.textContent || "";
            } else if(typeof r.excerpt === "string"){
                exc = r.excerpt;
            }
            var d = extractDest(tit);
            var c = findDestCoord(tit, d);
            if(!c){
                sinCoord.push(tit);
                return;
            }
            var kmMatch = exc.match(/(\d+(?:[.,]\d+)?)\s*km/i);
            var km = kmMatch ? parseFloat(kmMatch[1].replace(",",".")) : null;
            var diffMatch = exc.match(/(alta|media|baja)/i);
            var diff = diffMatch ? diffMatch[1].toLowerCase() : "";
            if(km) totalKm += km;
            routes.push({id:r.id, title:tit, link:r.link, destino:d, km:km, diff:diff, lat:c[0], lon:c[1], excerpt:exc.slice(0,150)});
        });

        if(sinCoord.length > 0){
            console.warn("Rutas sin coordenadas (" + sinCoord.length + "):", sinCoord);
        }

        document.getElementById("cRutas").textContent = routes.length;
        document.getElementById("cKm").textContent = totalKm > 0 ? "+"+Math.round(totalKm) : "—";
        document.getElementById("cPuntos").textContent = routes.length;

        routes.forEach(function(r, idx){
            var m = L.marker([r.lat, r.lon], {icon: icon}).addTo(map);
            m.bindTooltip(r.destino, {className:"rid-tooltip", direction:"top", offset:[0,-10]});
            var popup = '<div style="min-width:200px">' +
                '<div class="rid-popup-title">' + r.title + '</div>' +
                '<div class="rid-popup-dest">📍 ' + r.destino + '</div>' +
                '<div class="rid-popup-tags">' +
                (r.km ? '<span class="rid-badge rid-badge-km">~'+r.km+' km</span>' : '') +
                (r.diff ? '<span class="rid-badge rid-badge-'+r.diff+'">'+r.diff+'</span>' : '') +
                '</div>' +
                '<a href="'+r.link+'" class="rid-popup-link" target="_blank">Ver ruta completa →</a>' +
                '<div class="rid-popup-hint">Doble clic para ir a la ruta</div></div>';
            m.bindPopup(popup, {className:"rid-popup", maxWidth:280});
            m.on("dblclick", function(e){ L.DomEvent.stopPropagation(e); window.open(r.link, "_blank"); });
            markers.push(m);
        });

        renderList();

        if(routes.length === 0){
            document.getElementById("ridList").innerHTML = '<div class="rid-empty">No se encontraron rutas con coordenadas conocidas.</div>';
        }
    }

    function renderList(filter){
        var filtered = routes;
        if(filter){
            var f = filter.toLowerCase();
            filtered = routes.filter(function(r){
                return r.title.toLowerCase().indexOf(f) >= 0 || r.destino.toLowerCase().indexOf(f) >= 0;
            });
        }
        if(filtered.length === 0){
            document.getElementById("ridList").innerHTML = '<div class="rid-empty">No se encontraron rutas</div>';
            return;
        }
        var h = "";
        filtered.forEach(function(r){
            var idx = routes.indexOf(r);
            h += '<div class="rid-item" data-idx="'+idx+'">';
            h += '<div class="rid-dot"></div>';
            h += '<div class="rid-info"><div class="rid-name">'+r.title+'</div><div class="rid-meta">';
            if(r.km) h += '<span class="rid-badge rid-badge-km">~'+r.km+' km</span>';
            if(r.diff) h += '<span class="rid-badge rid-badge-'+r.diff+'">'+r.diff+'</span>';
            h += '</div></div>';
            h += '<div class="rid-go">→ mapa</div>';
            h += '</div>';
        });
        document.getElementById("ridList").innerHTML = h;

        document.querySelectorAll(".rid-item").forEach(function(el){
            el.addEventListener("click", function(){
                var idx = parseInt(el.dataset.idx);
                var r = routes[idx];
                var m = markers[idx];
                document.querySelectorAll(".rid-item").forEach(function(x){x.classList.remove("act");});
                el.classList.add("act");
                if(activeMarker) activeMarker.setIcon(icon);
                m.setIcon(iconActive);
                activeMarker = m;
                map.setView([r.lat, r.lon], 12, {animate:true, duration:0.8});
                setTimeout(function(){ m.openPopup(); }, 400);
            });
        });
    }

    document.getElementById("ridSearch").addEventListener("input", function(){
        renderList(this.value);
    });

    function loadAllPages(postType, page, allData){
        if(!page) page = 1;
        if(!allData) allData = [];

        fetch("/wp-json/wp/v2/" + postType + "?per_page=100&page=" + page)
        .then(function(res){
            if(!res.ok) throw new Error(res.status);
            var totalPages = parseInt(res.headers.get("X-WP-TotalPages")) || 1;
            return res.json().then(function(data){ return {data:data, totalPages:totalPages}; });
        })
        .then(function(result){
            allData = allData.concat(result.data);
            if(page < result.totalPages){
                loadAllPages(postType, page + 1, allData);
            } else {
                if(allData.length === 0 && postType === "rutas"){
                    loadAllPages("ruta", 1, []);
                    return;
                }
                processData(allData);
            }
        })
        .catch(function(){
            if(postType === "rutas"){
                loadAllPages("ruta", 1, []);
            } else if(postType === "ruta"){
                loadAllPages("posts", 1, []);
            } else {
                document.getElementById("ridList").innerHTML = '<div class="rid-empty">Error al cargar rutas.<br><small style="color:#444">Verifica que el tipo de post "rutas" exista.</small></div>';
            }
        });
    }

    loadAllPages("rutas");
})();
</script>
