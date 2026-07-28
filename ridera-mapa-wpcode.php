<?php
if (!function_exists('ridera_mapa_interactivo_render')) {
    function ridera_mapa_interactivo_render() {
        ob_start();
        ?>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
        <style>
        .ridera-app{width:100%;height:88vh;min-height:600px;display:flex;font-family:system-ui,-apple-system,sans-serif;background:#111;color:#eee;position:relative;overflow:hidden}
        .ridera-map{flex:1;position:relative;z-index:1}
        .ridera-panel{width:340px;background:#1a1a1a;border-left:1px solid #333;display:flex;flex-direction:column;z-index:2;overflow:hidden}
        .ridera-panel-head{padding:20px;background:#222;border-bottom:1px solid #333}
        .ridera-panel-head h2{margin:0 0 4px;font-size:22px;font-weight:800;color:#fff}
        .ridera-panel-head h2 span{color:#E85D20}
        .ridera-panel-head p{margin:0;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:2px}
        .ridera-stats{display:flex;gap:8px;margin-top:14px}
        .ridera-stat{flex:1;background:#2a2a2a;border:1px solid #3a3a3a;border-radius:6px;padding:8px;text-align:center}
        .ridera-stat b{display:block;font-size:18px;color:#E85D20}
        .ridera-stat small{font-size:9px;color:#777;text-transform:uppercase;letter-spacing:1px}
        .ridera-list{flex:1;overflow-y:auto}
        .ridera-list::-webkit-scrollbar{width:4px}
        .ridera-list::-webkit-scrollbar-thumb{background:#444;border-radius:2px}
        .ridera-dep{border-bottom:1px solid #2a2a2a}
        .ridera-dep-btn{width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:none;border:none;cursor:pointer;font-family:inherit;color:#ccc;text-align:left}
        .ridera-dep-btn:hover{background:#222}
        .ridera-dep-btn.act{background:rgba(232,93,32,.12);color:#fff}
        .ridera-dep-left{display:flex;align-items:center;gap:8px}
        .ridera-dep-dot{width:8px;height:8px;border-radius:50%;background:#E85D20}
        .ridera-dep-name{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
        .ridera-dep-cnt{font-size:10px;background:#333;color:#E85D20;padding:2px 8px;border-radius:10px;font-weight:700}
        .ridera-dep-arr{font-size:11px;color:#555;transition:transform .2s}
        .ridera-dep-btn.act .ridera-dep-arr{transform:rotate(90deg);color:#E85D20}
        .ridera-rutas{display:none;background:#151515}
        .ridera-rutas.open{display:block}
        .ridera-ruta{padding:10px 16px 10px 34px;border-left:2px solid transparent;cursor:pointer}
        .ridera-ruta:hover{background:#1e1e1e;border-left-color:rgba(232,93,32,.4)}
        .ridera-ruta.act{background:rgba(232,93,32,.1);border-left-color:#E85D20}
        .ridera-ruta-name{font-size:12px;font-weight:600;color:#ddd;margin-bottom:4px}
        .ridera-ruta-name a{color:inherit;text-decoration:none}
        .ridera-ruta-name a:hover{color:#E85D20}
        .ridera-ruta-tags{display:flex;gap:4px}
        .ridera-tag{font-size:9px;padding:2px 6px;border-radius:3px;font-weight:600}
        .ridera-tag-km{background:rgba(232,93,32,.15);color:#e8975a}
        .ridera-tag-alta{background:rgba(239,68,68,.15);color:#f87171}
        .ridera-tag-media{background:rgba(251,146,60,.15);color:#fb923c}
        .ridera-tag-baja{background:rgba(34,197,94,.15);color:#86efac}
        .ridera-popup .leaflet-popup-content-wrapper{background:#222;border:1px solid #444;border-radius:8px;color:#eee;font-family:system-ui,sans-serif}
        .ridera-popup .leaflet-popup-content{margin:12px;font-size:13px}
        .ridera-popup .leaflet-popup-tip{background:#222;border:1px solid #444}
        .ridera-popup a.leaflet-popup-close-button{color:#888}
        .ridera-msg{padding:16px;font-size:13px;color:#888;text-align:center}
        @media(max-width:900px){
            .ridera-app{flex-direction:column;height:100vh}
            .ridera-panel{width:100%;max-height:45vh;border-left:none;border-top:1px solid #333;order:2}
            .ridera-map{order:1;min-height:55vh}
        }
        </style>

        <div class="ridera-app">
            <div id="rmMap" class="ridera-map"></div>
            <div class="ridera-panel">
                <div class="ridera-panel-head">
                    <h2>RI<span>DE</span>RA</h2>
                    <p>Mapa de Rutas</p>
                    <div class="ridera-stats">
                        <div class="ridera-stat"><b id="sRutas">-</b><small>Rutas</small></div>
                        <div class="ridera-stat"><b id="sDeps">-</b><small>Deptos</small></div>
                        <div class="ridera-stat"><b id="sKm">-</b><small>KM</small></div>
                    </div>
                </div>
                <div class="ridera-list" id="rList">
                    <div class="ridera-msg">Cargando rutas...</div>
                </div>
            </div>
        </div>

        <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
        <script>
        document.addEventListener('DOMContentLoaded', function(){
            var map, markers=[], routes=[];

            var COORDS={
                'abriaquí':[5.78,-75.90],'ayapel':[8.60,-75.63],'guatapé':[6.23,-75.16],
                'sonsón':[5.69,-75.31],'caldas':[6.15,-75.73],'envigado':[6.18,-75.51],
                'sabaneta':[6.16,-75.49],'la ceja':[6.05,-75.42],'rionegro':[6.13,-75.38],
                'copacabana':[6.29,-75.51],'girardota':[6.42,-75.48],'barbosa':[6.46,-75.41],
                'pereira':[4.81,-75.70],'manizales':[5.07,-75.52],'armenia':[4.53,-75.73],
                'salento':[4.76,-75.57],'filandia':[4.77,-75.68],'pijao':[4.62,-75.67],
                'cartagena':[10.39,-75.51],'tayrona':[11.29,-73.89],'bogotá':[4.71,-74.07],
                'santa marta':[11.24,-74.22],'minca':[11.22,-74.30],'cali':[3.45,-76.53],
                'buenaventura':[3.88,-77.27],'popayán':[2.44,-76.61],'san andrés':[12.58,-81.72],
                'providencia':[13.37,-81.38],'leticia':[-0.20,-69.95],'puerto nariño':[0.75,-70.36],
                'medellín':[6.24,-75.58],'jardín':[5.60,-75.82],'jericó':[5.79,-75.78],
                'santa fe de antioquia':[6.56,-75.83],'cañasgordas':[6.75,-76.02],
                'andes':[5.66,-75.88],'urrao':[6.32,-76.13],'támesis':[5.66,-75.71],
                'fredonia':[5.93,-75.67],'san carlos':[6.19,-74.99],'san rafael':[6.30,-74.99],
                'puerto triunfo':[5.88,-74.65],'cisneros':[6.53,-75.09],'cocorná':[6.05,-75.19]
            };

            var DEPCOORDS={
                'antioquia':[6.25,-75.56,8],'risaralda':[4.81,-75.69,9],'quindío':[4.53,-75.73,9],
                'caldas':[5.07,-75.52,9],'bolívar':[10.39,-75.51,8],'magdalena':[11.24,-74.22,8],
                'cundinamarca':[4.71,-74.07,9],'valle del cauca':[3.45,-76.53,8],
                'cauca':[2.44,-76.61,8],'amazonas':[-0.20,-69.95,8]
            };

            // 1. INICIALIZAR MAPA PRIMERO
            map = L.map('rmMap',{center:[6.0,-74.8],zoom:6,zoomControl:false});
            L.control.zoom({position:'topright'}).addTo(map);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
                attribution:'© OpenStreetMap',maxZoom:18
            }).addTo(map);

            var icon = L.divIcon({className:'',
                html:'<div style="width:16px;height:16px;background:#E85D20;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px rgba(232,93,32,.7)"></div>',
                iconSize:[16,16],iconAnchor:[8,8]});

            function dest(title){
                var m=title.match(/[-–—]\s*(.+?)(?:\s*[-–—]|\s*$)/);
                if(m) return m[1].trim();
                var p=title.split(/[-–—]/);
                return p.length>1?p[p.length-1].trim():title;
            }

            function findCoord(d){
                var n=d.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
                var keys=Object.keys(COORDS).sort(function(a,b){return b.length-a.length;});
                for(var i=0;i<keys.length;i++){if(n.indexOf(keys[i])>=0)return COORDS[keys[i]];}
                return null;
            }

            function parse(r){
                var t=(r.title&&r.title.rendered)||'';
                t=t.replace(/&amp;/g,'&').replace(/&#8211;/g,'–').replace(/&#8212;/g,'—');
                var ex=(r.excerpt&&r.excerpt.rendered)||'';
                ex=ex.replace(/<[^>]+>/g,'').trim();
                var d=dest(t), c=findCoord(d)||[6.24,-75.58];
                var km=ex.match(/(\d+(?:[.,]\d+)?)\s*km/i);
                var df=ex.match(/(alta|media|baja)/i);
                return{id:r.id,title:t,link:r.link||'#',excerpt:ex.slice(0,180),
                    destino:d,km:km?parseFloat(km[1].replace(',','.')):null,
                    diff:df?df[1].toLowerCase():'',dep:'Antioquia',
                    lat:c[0],lon:c[1]};
            }

            function renderPanel(){
                var deps={},tkm=0;
                routes.forEach(function(r){deps[r.dep]=(deps[r.dep]||0)+1;if(r.km)tkm+=r.km;});
                document.getElementById('sRutas').textContent=routes.length;
                document.getElementById('sDeps').textContent=Object.keys(deps).length;
                document.getElementById('sKm').textContent=tkm>0?'+'+Math.round(tkm):'—';

                var h='';
                Object.keys(deps).sort().forEach(function(dep){
                    var rs=routes.filter(function(r){return r.dep===dep;});
                    h+='<div class="ridera-dep"><button class="ridera-dep-btn" data-d="'+dep+'">';
                    h+='<span class="ridera-dep-left"><span class="ridera-dep-dot"></span><span class="ridera-dep-name">'+dep+'</span></span>';
                    h+='<span style="display:flex;align-items:center;gap:6px"><span class="ridera-dep-cnt">'+rs.length+'</span><span class="ridera-dep-arr">▸</span></span>';
                    h+='</button><div class="ridera-rutas">';
                    rs.forEach(function(r){
                        h+='<div class="ridera-ruta" data-id="'+r.id+'" data-lat="'+r.lat+'" data-lon="'+r.lon+'">';
                        h+='<div class="ridera-ruta-name"><a href="'+r.link+'" target="_blank">'+r.title+'</a></div>';
                        h+='<div class="ridera-ruta-tags">';
                        if(r.km)h+='<span class="ridera-tag ridera-tag-km">~'+r.km+' km</span>';
                        if(r.diff)h+='<span class="ridera-tag ridera-tag-'+r.diff+'">'+r.diff+'</span>';
                        h+='</div></div>';
                    });
                    h+='</div></div>';
                });
                document.getElementById('rList').innerHTML=h;

                document.querySelectorAll('.ridera-dep-btn').forEach(function(btn){
                    btn.addEventListener('click',function(){
                        var d=btn.dataset.d,rt=btn.nextElementSibling,open=rt.classList.contains('open');
                        document.querySelectorAll('.ridera-rutas').forEach(function(x){x.classList.remove('open');});
                        document.querySelectorAll('.ridera-dep-btn').forEach(function(x){x.classList.remove('act');});
                        markers.forEach(function(m){map.removeLayer(m);});markers=[];
                        if(!open){
                            rt.classList.add('open');btn.classList.add('act');
                            var rs=routes.filter(function(r){return r.dep===d;});
                            rs.forEach(function(r){
                                var m=L.marker([r.lat,r.lon],{icon:icon}).addTo(map);
                                m.bindPopup('<div style="min-width:180px"><b style="color:#E85D20">'+r.title+'</b><br><span style="font-size:12px;color:#aaa">'+r.destino+'</span>'+(r.km?'<br><span style="font-size:12px">~'+r.km+' km</span>':'')+'<br><a href="'+r.link+'" target="_blank" style="color:#E85D20;font-weight:700;font-size:12px">Ver ruta →</a></div>',{className:'ridera-popup'});
                                m._rid=r.id;markers.push(m);
                            });
                            var dc=DEPCOORDS[d.toLowerCase()];
                            if(dc)map.setView([dc[0],dc[1]],dc[2],{animate:true});
                            else if(markers.length)map.fitBounds(L.featureGroup(markers).getBounds().pad(.2));
                        }else{
                            map.setView([6.0,-74.8],6,{animate:true});
                        }
                    });
                });

                document.querySelectorAll('.ridera-ruta').forEach(function(c){
                    c.addEventListener('click',function(e){
                        if(e.target.tagName==='A')return;
                        document.querySelectorAll('.ridera-ruta').forEach(function(x){x.classList.remove('act');});
                        c.classList.add('act');
                        var lat=parseFloat(c.dataset.lat),lon=parseFloat(c.dataset.lon),id=parseInt(c.dataset.id);
                        map.setView([lat,lon],12,{animate:true});
                        markers.forEach(function(m){if(m._rid===id)m.openPopup();});
                    });
                });
            }

            // 2. CARGAR RUTAS - Intentar múltiples endpoints
            var endpoints = [
                '/wp-json/wp/v2/rutas?per_page=100',
                '/wp-json/wp/v2/ruta?per_page=100',
                '/wp-json/wp/v2/posts?per_page=100'
            ];
            var tried = 0;

            function tryEndpoint(){
                if(tried >= endpoints.length){
                    document.getElementById('rList').innerHTML='<div class="ridera-msg">No se encontraron rutas. Verifica el API REST de WordPress.</div>';
                    return;
                }
                var url = endpoints[tried];
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url);
                xhr.onload = function(){
                    if(xhr.status === 200){
                        try{
                            var data = JSON.parse(xhr.responseText);
                            if(Array.isArray(data) && data.length > 0){
                                routes = data.map(parse);
                                renderPanel();
                                return;
                            }
                        }catch(e){}
                    }
                    tried++;
                    tryEndpoint();
                };
                xhr.onerror = function(){
                    tried++;
                    tryEndpoint();
                };
                xhr.send();
            }

            tryEndpoint();
        });
        </script>
        <?php
        return ob_get_clean();
    }
    add_shortcode('ridera_mapa_interactivo', 'ridera_mapa_interactivo_render');
}
