<?php
/*
 * Template Name: Garage Técnico Ridera
 * Description: Base de datos técnica de motos 650cc+ para Rita y los moteros
 */

// Bloque WordPress estándar — solo head y foot del tema
get_header();
?>
<style>
/* Aislar estilos del garage del tema WordPress */
#ridera-garage *,#ridera-garage *::before,#ridera-garage *::after{box-sizing:border-box;margin:0;padding:0;}
#ridera-garage {
  --bg:#f0f0ec;--surface:#fff;--surface-2:#e6e6e1;--text:#18181b;--text-2:#52525b;
  --text-3:#a1a1aa;--accent:#e63946;--accent-dim:rgba(230,57,70,.09);
  --border:rgba(0,0,0,.09);--border-2:rgba(0,0,0,.05);
  --hero-bg:#12131a;--hero-text:#f4f4f5;--hero-sub:#8b8fa8;--hero-bd:rgba(255,255,255,.07);
  --mono:'SF Mono','Fira Mono','Consolas',monospace;
  --green:#16a34a;--green-dim:rgba(22,163,74,.10);--yellow-dim:rgba(217,119,6,.10);--yellow:#d97706;
  --sh-md:0 4px 18px rgba(0,0,0,.09);--r:10px;--r-lg:14px;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;
  background:var(--bg);color:var(--text);line-height:1.55;-webkit-font-smoothing:antialiased;
}
@media (prefers-color-scheme:dark){
  #ridera-garage{
    --bg:#0e0e12;--surface:#18181e;--surface-2:#222228;--text:#e4e4e7;--text-2:#a1a1aa;
    --text-3:#52525b;--border:rgba(255,255,255,.08);--border-2:rgba(255,255,255,.04);
    --sh-md:0 4px 18px rgba(0,0,0,.4);
  }
}
:root[data-theme="dark"] #ridera-garage{--bg:#0e0e12;--surface:#18181e;--surface-2:#222228;--text:#e4e4e7;--text-2:#a1a1aa;--text-3:#52525b;--border:rgba(255,255,255,.08);--border-2:rgba(255,255,255,.04);}
:root[data-theme="light"] #ridera-garage{--bg:#f0f0ec;--surface:#fff;--surface-2:#e6e6e1;--text:#18181b;--text-2:#52525b;--text-3:#a1a1aa;--border:rgba(0,0,0,.09);--border-2:rgba(0,0,0,.05);}

#ridera-garage .g-hero{background:var(--hero-bg);padding:48px 24px 36px;position:relative;overflow:hidden;}
#ridera-garage .g-hero::after{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 55% 70% at 80% 0%,rgba(230,57,70,.07) 0%,transparent 60%),radial-gradient(ellipse 40% 50% at 10% 100%,rgba(99,102,241,.05) 0%,transparent 55%);}
#ridera-garage .g-hero-inner{max-width:780px;margin:0 auto;position:relative;z-index:1;}
#ridera-garage .g-eyebrow{font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:12px;}
#ridera-garage .g-hero h1{font-size:clamp(22px,4vw,30px);font-weight:800;color:var(--hero-text);letter-spacing:-.5px;line-height:1.2;margin-bottom:6px;text-wrap:balance;}
#ridera-garage .g-hero-sub{font-size:14px;color:var(--hero-sub);margin-bottom:26px;max-width:480px;}
#ridera-garage .g-search-wrap{position:relative;max-width:580px;}
#ridera-garage .g-search-wrap svg.icon-search{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:var(--hero-sub);pointer-events:none;width:17px;height:17px;}
#ridera-garage #moto-search{width:100%;background:rgba(255,255,255,.06);border:1px solid var(--hero-bd);border-radius:var(--r);padding:13px 46px;font-size:15px;color:var(--hero-text);outline:none;font-family:inherit;transition:border-color .2s,background .2s;}
#ridera-garage #moto-search::placeholder{color:var(--hero-sub);}
#ridera-garage #moto-search:focus{border-color:var(--accent);background:rgba(255,255,255,.09);}
#ridera-garage .g-clear{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--hero-sub);cursor:pointer;padding:4px;line-height:0;display:none;border-radius:4px;}
#ridera-garage .g-clear.on{display:block;}
#ridera-garage .g-hero-pills{display:flex;flex-wrap:wrap;gap:6px;margin-top:20px;}
#ridera-garage .g-pill{font-size:11px;font-weight:600;letter-spacing:.3px;padding:4px 10px;border-radius:20px;border:1px solid rgba(255,255,255,.12);color:var(--hero-sub);background:none;cursor:pointer;font-family:inherit;transition:all .15s;}
#ridera-garage .g-pill:hover,#ridera-garage .g-pill.on{background:var(--accent);border-color:var(--accent);color:#fff;}
#ridera-garage .g-filters{background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;}
#ridera-garage .g-filters-inner{max-width:960px;margin:0 auto;padding:0 20px;display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;}
#ridera-garage .g-filters-inner::-webkit-scrollbar{display:none;}
#ridera-garage .g-ftab{flex-shrink:0;padding:11px 14px;font-size:13px;font-weight:600;color:var(--text-2);background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;font-family:inherit;transition:color .15s,border-color .15s;}
#ridera-garage .g-ftab:hover{color:var(--text);}
#ridera-garage .g-ftab.active{color:var(--accent);border-bottom-color:var(--accent);}
#ridera-garage .g-content{max-width:960px;margin:0 auto;padding:36px 20px 60px;}
#ridera-garage .g-count{font-size:12px;color:var(--text-3);margin-bottom:20px;}
#ridera-garage .g-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px;}
#ridera-garage .g-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;transition:box-shadow .18s,transform .18s;display:flex;flex-direction:column;}
#ridera-garage .g-card:hover{box-shadow:var(--sh-md);transform:translateY(-2px);}
#ridera-garage .g-card.hidden{display:none;}
#ridera-garage .g-card-head{padding:16px 18px 14px;border-bottom:1px solid var(--border-2);display:flex;flex-direction:column;gap:4px;}
#ridera-garage .g-marca{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--accent);}
#ridera-garage .g-modelo{font-size:16px;font-weight:800;line-height:1.2;color:var(--text);}
#ridera-garage .g-años{font-size:12px;color:var(--text-3);font-family:var(--mono);font-variant-numeric:tabular-nums;}
#ridera-garage .g-codigo{font-size:11px;color:var(--text-3);font-family:var(--mono);margin-top:2px;}
#ridera-garage .g-stats{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border-top:1px solid var(--border-2);}
#ridera-garage .g-stat{padding:11px 14px;background:var(--surface);}
#ridera-garage .g-stat-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-3);margin-bottom:3px;}
#ridera-garage .g-stat-val{font-size:15px;font-weight:800;color:var(--text);font-family:var(--mono);font-variant-numeric:tabular-nums;line-height:1.2;}
#ridera-garage .g-stat-sub{font-size:10px;color:var(--text-3);margin-top:1px;}
#ridera-garage .g-motor{padding:11px 16px;font-size:12px;color:var(--text-2);line-height:1.55;border-bottom:1px solid var(--border-2);}
#ridera-garage .g-expand{border-top:1px solid var(--border-2);}
#ridera-garage .g-expand-btn{width:100%;padding:11px 16px;display:flex;align-items:center;justify-content:space-between;background:none;border:none;cursor:pointer;font-size:12px;font-weight:700;color:var(--text-2);font-family:inherit;text-align:left;transition:background .15s;}
#ridera-garage .g-expand-btn:hover{background:var(--surface-2);color:var(--text);}
#ridera-garage .g-expand-btn .arrow{font-size:10px;transition:transform .2s;color:var(--text-3);}
#ridera-garage .g-expand-btn.open .arrow{transform:rotate(180deg);}
#ridera-garage .g-expand-body{display:none;padding:0 16px 14px;}
#ridera-garage .g-expand-body.open{display:block;}
#ridera-garage .g-maint{width:100%;border-collapse:collapse;font-size:12px;}
#ridera-garage .g-maint td{padding:7px 6px;border-bottom:1px solid var(--border-2);vertical-align:top;}
#ridera-garage .g-maint tr:last-child td{border-bottom:none;}
#ridera-garage .g-maint td:first-child{color:var(--text-2);font-weight:600;width:38%;}
#ridera-garage .g-maint td:nth-child(2){color:var(--text-2);width:36%;}
#ridera-garage .g-maint td:last-child{color:var(--accent);font-weight:700;font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;}
#ridera-garage .g-falla{padding:8px 0;border-bottom:1px solid var(--border-2);}
#ridera-garage .g-falla:last-child{border-bottom:none;}
#ridera-garage .g-falla-nombre{font-size:12px;font-weight:700;color:var(--text);margin-bottom:3px;display:flex;align-items:center;gap:6px;}
#ridera-garage .g-falla-nombre::before{content:'!';display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;background:var(--yellow-dim);color:var(--yellow);border-radius:50%;font-size:9px;font-weight:900;flex-shrink:0;}
#ridera-garage .g-falla-sintoma{font-size:11px;color:var(--text-3);margin-bottom:3px;}
#ridera-garage .g-falla-sol{font-size:11px;color:var(--green);}
#ridera-garage .g-falla-sol::before{content:'→ ';}
#ridera-garage .g-variantes{margin:10px 16px 0;background:var(--accent-dim);border-radius:6px;padding:8px 10px;font-size:11px;color:var(--text-2);line-height:1.55;}
#ridera-garage .g-variantes strong{color:var(--accent);display:block;margin-bottom:2px;font-size:10px;letter-spacing:1px;text-transform:uppercase;}
#ridera-garage .g-empty{text-align:center;padding:56px 20px;display:none;}
#ridera-garage .g-empty.on{display:block;}
#ridera-garage .g-rita{background:var(--hero-bg);border-radius:var(--r-lg);padding:30px 24px;text-align:center;margin-top:40px;}
#ridera-garage .g-rita h3{color:var(--hero-text);font-size:17px;font-weight:700;margin-bottom:6px;}
#ridera-garage .g-rita p{color:var(--hero-sub);font-size:13px;margin-bottom:16px;max-width:400px;margin-left:auto;margin-right:auto;}
#ridera-garage .g-wa-btn{display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;padding:10px 22px;border-radius:22px;text-decoration:none;font-weight:700;font-size:14px;transition:background .18s,transform .18s;}
#ridera-garage .g-wa-btn:hover{background:#1da851;transform:translateY(-1px);}
#ridera-garage .g-wa-btn svg{width:18px;height:18px;fill:currentColor;}
@media (max-width:640px){#ridera-garage .g-hero{padding:36px 16px 28px;}#ridera-garage .g-content{padding:24px 14px 48px;}#ridera-garage .g-grid{grid-template-columns:1fr;}}
</style>

<div id="ridera-garage">

<?php /* ── JSON DATA — Rita y los moteros consultan aquí ── */ ?>
<script type="application/json" id="rita-motos">
<?php
// Incluir el archivo JSON de datos si existe, o usar inline
$data_file = get_template_directory() . '/ridera-data/motos.json';
if (file_exists($data_file)) {
    echo file_get_contents($data_file);
} else {
    // Data inline — misma data del garage-ridera.html
    ?>
{"page":"garage-ridera","descripcion":"Fichas técnicas de motos 650cc+ para Rita y los moteros de Ridera","marcas":["Suzuki","Yamaha","Honda","BMW","Triumph","Kawasaki"],"motos":[]}
    <?php
    // NOTA: Reemplazar el JSON vacío por el contenido completo del archivo garage-ridera.html
    // o cargar desde motos.json en el directorio del tema
}
?>
</script>

<header class="g-hero">
  <div class="g-hero-inner">
    <p class="g-eyebrow">Ridera · Garage Técnico</p>
    <h1>Fichas técnicas para moteros</h1>
    <p class="g-hero-sub">Aceite, llantas, mantenimiento y fallas comunes. Rita busca aquí cuando le preguntas por tu moto.</p>
    <div class="g-search-wrap">
      <svg class="icon-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="search" id="moto-search" placeholder="Buscar: MT-07, R1250GS, aceite, ShiftCam, Africa Twin…" autocomplete="off" spellcheck="false" aria-label="Buscar moto"/>
      <button class="g-clear" id="moto-clear" type="button" aria-label="Limpiar">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="g-hero-pills">
      <button class="g-pill" onclick="setSearch('aceite')" type="button">Aceite</button>
      <button class="g-pill" onclick="setSearch('llantas')" type="button">Llantas PSI</button>
      <button class="g-pill" onclick="setSearch('falla')" type="button">Fallas comunes</button>
      <button class="g-pill" onclick="setSearch('ShiftCam')" type="button">BMW ShiftCam</button>
      <button class="g-pill" onclick="setSearch('DCT')" type="button">Honda DCT</button>
      <button class="g-pill" onclick="setSearch('supercharger')" type="button">Kawasaki H2</button>
      <button class="g-pill" onclick="setSearch('vstrom')" type="button">V-Strom</button>
      <button class="g-pill" onclick="setSearch('Africa Twin')" type="button">Africa Twin</button>
      <button class="g-pill" onclick="setSearch('T-plane')" type="button">Triumph 3 cil.</button>
    </div>
  </div>
</header>

<nav class="g-filters">
  <div class="g-filters-inner">
    <button class="g-ftab active" data-marca="all" type="button">Todas</button>
    <button class="g-ftab" data-marca="Suzuki" type="button">Suzuki</button>
    <button class="g-ftab" data-marca="Yamaha" type="button">Yamaha</button>
    <button class="g-ftab" data-marca="Honda" type="button">Honda</button>
    <button class="g-ftab" data-marca="BMW" type="button">BMW</button>
    <button class="g-ftab" data-marca="Triumph" type="button">Triumph</button>
    <button class="g-ftab" data-marca="Kawasaki" type="button">Kawasaki</button>
  </div>
</nav>

<main class="g-content">
  <p class="g-count" id="g-count"></p>
  <div class="g-grid" id="g-grid"></div>
  <div class="g-empty" id="g-empty">
    <p style="font-size:14px;color:var(--text-2)">Sin resultados — <a href="#" onclick="clearSearch();return false;" style="color:var(--accent)">ver todas las motos</a></p>
    <p style="margin-top:8px;font-size:13px;color:var(--text-3)">¿Tu moto no está? <a href="https://wa.me/573117896717" target="_blank" rel="noopener" style="color:var(--accent)">Escríbele a Rita</a></p>
  </div>
  <div class="g-rita">
    <h3>🏍️ ¿Rita no tiene la respuesta?</h3>
    <p>Escríbele por WhatsApp y ella busca en el garage técnico o te conecta con un experto.</p>
    <a class="g-wa-btn" href="https://wa.me/573117896717?text=Hola%20Rita%2C%20tengo%20una%20pregunta%20t%C3%A9cnica%20sobre%20mi%20moto" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.75.75 0 00.917.918l4.462-1.494A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.386 0-4.592-.83-6.32-2.216l-.442-.369-3.063 1.025 1.025-3.063-.369-.442A9.96 9.96 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg>
      Hablar con Rita
    </a>
  </div>
</main>

</div><!-- #ridera-garage -->

<script>
(function(){
  const rawData = JSON.parse(document.getElementById('rita-motos').textContent);
  const motos   = rawData.motos;
  const grid    = document.getElementById('g-grid');
  const countEl = document.getElementById('g-count');
  const emptyEl = document.getElementById('g-empty');

  motos.forEach(m => {
    const card = document.createElement('div');
    card.className = 'g-card';
    card.dataset.marca = m.marca;
    card.dataset.search = [
      m.marca, m.modelo, m.años, m.codigo || '',
      m.motor, m.aceite_spec, m.aceite_litros,
      m.variantes || '',
      (m.fallas||[]).map(f => f.nombre+' '+f.sintoma+' '+f.solucion).join(' '),
      (m.mantenimiento||[]).map(x => x.item).join(' ')
    ].join(' ').toLowerCase();

    const tras = m.llantas_psi.trasera_solo || m.llantas_psi.trasera || '–';

    card.innerHTML = `
      <div class="g-card-head">
        <span class="g-marca">${m.marca}</span>
        <span class="g-modelo">${m.modelo}</span>
        <span class="g-años">${m.años}</span>
        ${m.codigo ? `<span class="g-codigo">${m.codigo}</span>` : ''}
      </div>
      <div class="g-stats">
        <div class="g-stat"><div class="g-stat-label">Aceite</div><div class="g-stat-val">${m.aceite_litros}</div><div class="g-stat-sub">${m.aceite_spec}</div></div>
        <div class="g-stat"><div class="g-stat-label">Llantas (PSI)</div><div class="g-stat-val">${m.llantas_psi.delantera} / ${tras}</div><div class="g-stat-sub">Del. / Tras.</div></div>
        <div class="g-stat"><div class="g-stat-label">Cambio aceite</div><div class="g-stat-val">${m.cambio_aceite_km.toLocaleString()} km</div><div class="g-stat-sub">Torque filtro: ${m.torque_filtro}</div></div>
        <div class="g-stat"><div class="g-stat-label">Fallas conocidas</div><div class="g-stat-val">${(m.fallas||[]).length}</div><div class="g-stat-sub">documentadas</div></div>
      </div>
      <div class="g-motor">${m.motor}</div>
      ${m.variantes ? `<div class="g-variantes"><strong>Variantes</strong>${m.variantes}</div>` : ''}
      <div class="g-expand">
        <button class="g-expand-btn" type="button" aria-expanded="false">Mantenimiento (${(m.mantenimiento||[]).length} items)<span class="arrow">▼</span></button>
        <div class="g-expand-body">
          <table class="g-maint">${(m.mantenimiento||[]).map(x=>`<tr><td>${x.item}</td><td>${x.accion}</td><td>${x.intervalo}</td></tr>`).join('')}</table>
        </div>
      </div>
      <div class="g-expand">
        <button class="g-expand-btn" type="button" aria-expanded="false">Fallas comunes (${(m.fallas||[]).length})<span class="arrow">▼</span></button>
        <div class="g-expand-body">
          ${(m.fallas||[]).map(f=>`<div class="g-falla"><div class="g-falla-nombre">${f.nombre}</div><div class="g-falla-sintoma">${f.sintoma}</div><div class="g-falla-sol">${f.solucion}</div></div>`).join('')}
        </div>
      </div>`;

    card.querySelectorAll('.g-expand-btn').forEach(btn => {
      btn.addEventListener('click', function(){
        const body = this.nextElementSibling;
        const open = body.classList.toggle('open');
        this.classList.toggle('open', open);
        this.setAttribute('aria-expanded', open);
      });
    });
    grid.appendChild(card);
  });

  const searchInput = document.getElementById('moto-search');
  const clearBtn    = document.getElementById('moto-clear');

  function filterCards(q){
    const lq = q.toLowerCase().trim();
    const cards = grid.querySelectorAll('.g-card');
    let visible = 0;
    cards.forEach(c => {
      const match = !lq || c.dataset.search.includes(lq) || c.textContent.toLowerCase().includes(lq);
      c.classList.toggle('hidden', !match);
      if (match) visible++;
    });
    countEl.textContent = visible + (visible===1?' moto':' motos');
    emptyEl.classList.toggle('on', visible===0 && lq.length>0);
    clearBtn.classList.toggle('on', q.length>0);
    document.querySelectorAll('#ridera-garage .g-pill').forEach(p=>p.classList.remove('on'));
  }

  searchInput.addEventListener('input', ()=>filterCards(searchInput.value));
  clearBtn.addEventListener('click', ()=>{searchInput.value='';filterCards('');searchInput.focus();});

  window.setSearch = function(q){
    searchInput.value=q;filterCards(q);
    document.querySelectorAll('#ridera-garage .g-pill').forEach(p=>p.classList.toggle('on',p.textContent.trim()===q));
    searchInput.scrollIntoView({behavior:'smooth',block:'nearest'});
  };
  window.clearSearch = function(){searchInput.value='';filterCards('');};

  document.querySelectorAll('#ridera-garage .g-ftab').forEach(btn=>{
    btn.addEventListener('click',function(){
      document.querySelectorAll('#ridera-garage .g-ftab').forEach(b=>b.classList.remove('active'));
      this.classList.add('active');
      const marca = this.dataset.marca;
      searchInput.value='';filterCards('');
      grid.querySelectorAll('.g-card').forEach(c=>{
        c.classList.toggle('hidden', marca!=='all' && c.dataset.marca!==marca);
      });
      const vis=grid.querySelectorAll('.g-card:not(.hidden)').length;
      countEl.textContent=vis+(vis===1?' moto':' motos');
      emptyEl.classList.toggle('on',vis===0);
    });
  });

  const q = new URLSearchParams(location.search).get('q');
  if(q){searchInput.value=q;filterCards(q);}

  document.addEventListener('keydown',e=>{
    if(e.key==='/'&&document.activeElement!==searchInput){e.preventDefault();searchInput.focus();}
    if(e.key==='Escape'&&document.activeElement===searchInput){searchInput.blur();if(searchInput.value){searchInput.value='';filterCards('');}}
  });

  filterCards('');
})();
</script>

<?php get_footer(); ?>
