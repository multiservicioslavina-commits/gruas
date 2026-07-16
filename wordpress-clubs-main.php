<?php
/**
 * Ridera Clubs System - WordPress Integration
 *
 * Archivo ÚNICO con dos shortcodes:
 *   [ridera_clubs_listing]                         → Listado de clubes
 *   [ridera_club_detail slug="touring-bikers-colombia"] → Detalle + registro
 *
 * INSTALACIÓN:
 * 1. Subir este archivo a wp-content/
 * 2. En wp-content/themes/TU-TEMA/functions.php agregar:
 *    require_once(WP_CONTENT_DIR . '/wordpress-clubs-main.php');
 * 3. Crear página "Clubes" con shortcode [ridera_clubs_listing]
 * 4. Crear página "Registro" con shortcode [ridera_club_detail slug="..."]
 */

// ============================================================================
// CONFIGURACIÓN SUPABASE
// ============================================================================
define('RIDERA_SUPABASE_URL', 'https://vzzxsdtsaahhzyctvmhx.supabase.co');
define('RIDERA_SUPABASE_KEY', 'sb_publishable_r1ImtuUXs1zM02OgwserGQ_F7R26Niu');

// URL de la página de detalle/registro (ajustar al slug de tu página WordPress)
define('RIDERA_CLUB_PAGE_URL', '/registro-club/');

// ============================================================================
// CSS Y FONTS COMPARTIDOS (se cargan una sola vez)
// ============================================================================
add_action('wp_head', function() {
    static $loaded = false;
    if ($loaded) return;
    $loaded = true;
    echo '<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400;700&family=Barlow+Condensed:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@500;700&display=swap" rel="stylesheet">';
});

// ============================================================================
// CSS BASE COMPARTIDO
// ============================================================================
function ridera_base_css() {
    return '
    <style>
      :root {
        --orange: #E85D20;
        --orange-light: #f07a3a;
        --orange-dark: #c44d18;
        --black: #0a0908;
        --off-black: #0f0f0f;
        --dark-gray: #1a1712;
        --white: #f4f1ed;
        --muted: #e6e3de;
        --muted-dark: #9d9891;
        --accent: #4ade80;
        --red: #ef4444;
        --display: "Bebas Neue", sans-serif;
        --condensed: "Barlow Condensed", sans-serif;
        --body: "DM Sans", sans-serif;
        --mono: "DM Mono", monospace;
      }

      .ridera-wrap * { box-sizing: border-box; }
      .ridera-wrap { color: var(--white); font-family: var(--body); line-height: 1.6; }
      .ridera-wrap a { color: var(--orange); text-decoration: none; }
      .ridera-wrap a:hover { text-decoration: underline; }
      .ridera-wrap h1, .ridera-wrap h2, .ridera-wrap h3 { margin: 0; }

      /* LOADING */
      .ridera-loading-spinner {
        display: inline-block;
        width: 20px; height: 20px;
        border: 2px solid rgba(232, 93, 32, 0.3);
        border-top-color: var(--orange);
        border-radius: 50%;
        animation: ridera-spin 0.8s linear infinite;
      }
      @keyframes ridera-spin { to { transform: rotate(360deg); } }

      /* ALERT */
      .ridera-alert {
        padding: 1rem;
        border-radius: 6px;
        margin-bottom: 1.5rem;
        font-size: 0.95rem;
      }
      .ridera-alert.success {
        background: rgba(16, 185, 129, 0.15);
        border: 1px solid rgba(16, 185, 129, 0.3);
        color: #10b981;
      }
      .ridera-alert.error {
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: var(--red);
      }
      .ridera-alert.info {
        background: rgba(232, 93, 32, 0.15);
        border: 1px solid rgba(232, 93, 32, 0.3);
        color: var(--orange);
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      /* BUTTONS */
      .ridera-btn {
        padding: 0.75rem 1.5rem;
        background: transparent;
        border: 1px solid rgba(232, 93, 32, 0.3);
        color: var(--muted-dark);
        cursor: pointer;
        border-radius: 6px;
        font-family: var(--condensed);
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        transition: all 0.2s ease;
        text-decoration: none;
        display: inline-block;
      }
      .ridera-btn:hover { border-color: var(--orange); color: var(--orange); }
      .ridera-btn.primary { background: var(--orange); color: var(--black); border-color: var(--orange); font-weight: 600; }
      .ridera-btn.primary:hover { background: var(--orange-light); border-color: var(--orange-light); }
      .ridera-btn.primary:disabled { background: rgba(232, 93, 32, 0.5); cursor: not-allowed; border-color: rgba(232, 93, 32, 0.5); }

      /* EMPTY STATE */
      .ridera-empty-state {
        text-align: center;
        padding: 4rem 2rem;
        color: var(--muted-dark);
      }
    </style>
    ';
}

// ============================================================================
// SHORTCODE: LISTADO DE CLUBES  [ridera_clubs_listing]
// ============================================================================
add_shortcode('ridera_clubs_listing', function($atts) {
    // Leer parámetro de slug desde URL para enlaces directos
    $club_page_url = RIDERA_CLUB_PAGE_URL;

    ob_start();
    echo ridera_base_css();
    ?>
    <div class="ridera-wrap" id="ridera-clubs-app">
      <style>
        /* HERO */
        #ridera-clubs-app .hero {
          position: relative;
          padding: 6rem 4rem;
          min-height: 400px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          gap: 2rem;
          background: linear-gradient(135deg, #0f0f0f 0%, #1a1712 50%, #0f0f0f 100%);
          border-bottom: 1px solid rgba(232, 93, 32, 0.2);
          overflow: hidden;
          border-radius: 12px;
          margin-bottom: 0;
        }
        #ridera-clubs-app .hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 80% 50%, rgba(232,93,32,0.1) 0%, transparent 60%);
          pointer-events: none;
        }
        #ridera-clubs-app .hero-content { position: relative; z-index: 2; max-width: 600px; }
        #ridera-clubs-app .hero h1 {
          font-family: var(--display);
          font-size: 4.5rem;
          line-height: 1;
          color: var(--white);
          margin-bottom: 1rem;
          letter-spacing: -2px;
        }
        #ridera-clubs-app .hero p { font-size: 1.1rem; color: var(--muted-dark); line-height: 1.8; }

        /* FILTERS */
        #ridera-clubs-app .filters-section {
          padding: 3rem 4rem;
          background: rgba(15, 15, 15, 0.5);
          border-bottom: 1px solid rgba(232, 93, 32, 0.15);
          backdrop-filter: blur(10px);
        }
        #ridera-clubs-app .filters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        #ridera-clubs-app .filter-group { display: flex; flex-direction: column; gap: 0.5rem; }
        #ridera-clubs-app .filter-group label {
          font-family: var(--condensed);
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: var(--orange);
        }
        #ridera-clubs-app .filter-group input,
        #ridera-clubs-app .filter-group select {
          background: rgba(232, 93, 32, 0.08);
          border: 1px solid rgba(232, 93, 32, 0.3);
          color: var(--white);
          padding: 0.75rem 1rem;
          border-radius: 6px;
          font-family: var(--body);
          font-size: 0.95rem;
          transition: all 0.2s ease;
        }
        #ridera-clubs-app .filter-group input:focus,
        #ridera-clubs-app .filter-group select:focus {
          outline: none;
          border-color: var(--orange);
          background: rgba(232, 93, 32, 0.12);
          box-shadow: 0 0 0 3px rgba(232, 93, 32, 0.1);
        }
        #ridera-clubs-app .filter-group select option { background: #1a1712; color: var(--white); }

        /* CLUBS HEADER */
        #ridera-clubs-app .clubs-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 3rem;
          gap: 2rem;
        }
        #ridera-clubs-app .clubs-count {
          font-family: var(--condensed);
          font-size: 1.2rem;
          color: var(--muted-dark);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        #ridera-clubs-app .sort-options { display: flex; gap: 0.75rem; }
        #ridera-clubs-app .sort-btn {
          padding: 0.6rem 1.2rem;
          background: transparent;
          border: 1px solid rgba(232, 93, 32, 0.3);
          color: var(--muted-dark);
          cursor: pointer;
          border-radius: 4px;
          font-family: var(--condensed);
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          transition: all 0.2s ease;
        }
        #ridera-clubs-app .sort-btn:hover,
        #ridera-clubs-app .sort-btn.active { border-color: var(--orange); color: var(--orange); background: rgba(232, 93, 32, 0.1); }

        /* CLUBS GRID */
        #ridera-clubs-app .clubs-section { padding: 4rem; }
        #ridera-clubs-app .clubs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 2rem;
          margin-bottom: 3rem;
        }
        #ridera-clubs-app .club-card {
          position: relative;
          background: linear-gradient(135deg, rgba(26, 23, 18, 0.8) 0%, rgba(15, 15, 15, 0.9) 100%);
          border: 1px solid rgba(232, 93, 32, 0.2);
          border-radius: 12px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          overflow: hidden;
          text-decoration: none;
          color: inherit;
        }
        #ridera-clubs-app .club-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at top right, rgba(232,93,32,0.1), transparent 70%);
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
        }
        #ridera-clubs-app .club-card:hover {
          border-color: var(--orange);
          background: linear-gradient(135deg, rgba(26, 23, 18, 1) 0%, rgba(15, 15, 15, 1) 100%);
          transform: translateY(-8px);
          box-shadow: 0 20px 40px rgba(232, 93, 32, 0.15);
          text-decoration: none;
        }
        #ridera-clubs-app .club-card:hover::before { opacity: 1; }

        #ridera-clubs-app .club-header { display: flex; align-items: flex-start; gap: 1rem; }
        #ridera-clubs-app .club-avatar {
          width: 60px; height: 60px;
          border-radius: 10px;
          background: linear-gradient(135deg, rgba(232,93,32,0.25), rgba(232,93,32,0.1));
          border: 1px solid rgba(232,93,32,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          flex-shrink: 0;
          overflow: hidden;
        }
        #ridera-clubs-app .club-avatar img { width: 100%; height: 100%; object-fit: cover; }
        #ridera-clubs-app .club-info h3 { font-family: var(--display); font-size: 1.5rem; color: var(--white); margin-bottom: 0.25rem; }
        #ridera-clubs-app .club-category {
          display: inline-block;
          padding: 0.3rem 0.8rem;
          background: rgba(232, 93, 32, 0.15);
          border: 1px solid rgba(232, 93, 32, 0.3);
          border-radius: 4px;
          font-family: var(--condensed);
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--orange);
        }
        #ridera-clubs-app .club-location { display: flex; align-items: center; gap: 0.5rem; color: var(--muted-dark); font-size: 0.9rem; margin-top: 0.5rem; }
        #ridera-clubs-app .club-description { color: var(--muted-dark); font-size: 0.95rem; line-height: 1.6; flex-grow: 1; }
        #ridera-clubs-app .club-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
          padding: 1rem;
          background: rgba(232, 93, 32, 0.05);
          border-radius: 8px;
        }
        #ridera-clubs-app .stat { text-align: center; }
        #ridera-clubs-app .stat-value { font-family: var(--condensed); font-size: 1.5rem; font-weight: 700; color: var(--orange); }
        #ridera-clubs-app .stat-label { font-size: 0.75rem; color: var(--muted-dark); text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0.25rem; }
        #ridera-clubs-app .club-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 1rem; border-top: 1px solid rgba(232, 93, 32, 0.1); }
        #ridera-clubs-app .club-brands { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        #ridera-clubs-app .brand-tag { padding: 0.2rem 0.6rem; background: rgba(232, 93, 32, 0.1); border: 1px solid rgba(232, 93, 32, 0.2); border-radius: 3px; font-size: 0.7rem; color: var(--muted-dark); }
        #ridera-clubs-app .club-link { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--orange); font-family: var(--condensed); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; transition: all 0.2s ease; }
        #ridera-clubs-app .club-link:hover { gap: 0.75rem; }

        /* RESPONSIVE */
        @media (max-width: 768px) {
          #ridera-clubs-app .hero { padding: 3rem 1.5rem; }
          #ridera-clubs-app .hero h1 { font-size: 2.5rem; }
          #ridera-clubs-app .filters-section, #ridera-clubs-app .clubs-section { padding: 2rem 1.5rem; }
          #ridera-clubs-app .clubs-grid { grid-template-columns: 1fr; }
          #ridera-clubs-app .filters-grid { grid-template-columns: 1fr; }
        }
      </style>

      <!-- HERO -->
      <section class="hero">
        <div class="hero-content">
          <h1>Ridera Clubes</h1>
          <p>Descubre la comunidad de motociclistas que comparten tu pasión. Encuentra el club perfecto para conectar, aprender y explorar juntos.</p>
        </div>
      </section>

      <!-- FILTERS -->
      <section class="filters-section">
        <div class="filters-grid">
          <div class="filter-group">
            <label for="ridera-search">Buscar club</label>
            <input type="text" id="ridera-search" placeholder="Nombre o ubicación...">
          </div>
          <div class="filter-group">
            <label for="ridera-category">Categoría</label>
            <select id="ridera-category">
              <option value="">Todas las categorías</option>
              <option value="Touring">Touring</option>
              <option value="Cruiser">Cruiser</option>
              <option value="Enduro">Enduro</option>
              <option value="Sport">Sport</option>
              <option value="Adventure">Adventure</option>
            </select>
          </div>
          <div class="filter-group">
            <label for="ridera-region">Región</label>
            <select id="ridera-region">
              <option value="">Todas las regiones</option>
              <option value="Metropolitana">Metropolitana</option>
              <option value="Oriente">Oriente</option>
              <option value="Occidente">Occidente</option>
              <option value="Valle">Valle de Aburrá</option>
            </select>
          </div>
        </div>

        <div class="clubs-header">
          <div class="clubs-count">
            <span id="ridera-clubs-count">0</span> clubes encontrados
          </div>
          <div class="sort-options">
            <button class="sort-btn active" data-sort="featured">Destacados</button>
            <button class="sort-btn" data-sort="members">Miembros</button>
            <button class="sort-btn" data-sort="founded">Antigüedad</button>
          </div>
        </div>
      </section>

      <!-- CLUBS GRID -->
      <section class="clubs-section">
        <div id="ridera-loading" style="text-align: center; padding: 4rem 2rem;">
          <div class="ridera-loading-spinner" style="margin: 0 auto 1rem;"></div>
          <p style="color: var(--muted-dark);">Cargando clubes...</p>
        </div>

        <div id="ridera-grid" class="clubs-grid" style="display: none;"></div>

        <div id="ridera-empty" class="ridera-empty-state" style="display: none;">
          <p>No se encontraron clubes que coincidan con tu búsqueda.</p>
          <p style="font-size: 0.9rem; color: var(--muted-dark); margin-top: 0.5rem;">Intenta cambiar los filtros.</p>
        </div>
      </section>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script>
    (function() {
      const SUPABASE_URL = "<?php echo RIDERA_SUPABASE_URL; ?>";
      const SUPABASE_KEY = "<?php echo RIDERA_SUPABASE_KEY; ?>";
      const CLUB_PAGE = "<?php echo $club_page_url; ?>";

      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

      let allClubs = [];
      let filteredClubs = [];

      const grid = document.getElementById('ridera-grid');
      const loading = document.getElementById('ridera-loading');
      const empty = document.getElementById('ridera-empty');
      const countEl = document.getElementById('ridera-clubs-count');
      const searchEl = document.getElementById('ridera-search');
      const catEl = document.getElementById('ridera-category');
      const regEl = document.getElementById('ridera-region');
      const sortBtns = document.querySelectorAll('#ridera-clubs-app .sort-btn');

      async function init() {
        loading.style.display = 'block';
        try {
          const { data, error } = await client
            .from('clubs')
            .select('*')
            .eq('active', true)
            .order('featured', { ascending: false })
            .order('founded_year', { ascending: false });

          if (error) throw error;
          allClubs = data || [];
          filteredClubs = [...allClubs];
          renderClubs();
        } catch (err) {
          console.error('Error cargando clubes:', err);
          loading.innerHTML = '<p style="color: var(--muted-dark);">Error al cargar los clubes. Intenta más tarde.</p>';
        }
      }

      function filterClubs() {
        const search = searchEl.value.toLowerCase();
        const cat = catEl.value;
        const reg = regEl.value;

        filteredClubs = allClubs.filter(club => {
          const matchSearch = !search || club.name.toLowerCase().includes(search) || (club.city || '').toLowerCase().includes(search);
          const matchCat = !cat || club.category === cat;
          const matchReg = !reg || club.region === reg;
          return matchSearch && matchCat && matchReg;
        });

        renderClubs();
      }

      function sortClubs(type) {
        switch(type) {
          case 'members':
            filteredClubs.sort((a, b) => (b.members_count || 0) - (a.members_count || 0));
            break;
          case 'founded':
            filteredClubs.sort((a, b) => (b.founded_year || 0) - (a.founded_year || 0));
            break;
          default:
            filteredClubs.sort((a, b) => (a.featured === b.featured) ? ((b.founded_year || 0) - (a.founded_year || 0)) : (a.featured ? -1 : 1));
        }
        renderClubs();
      }

      function renderClubs() {
        loading.style.display = 'none';
        countEl.textContent = filteredClubs.length;

        if (filteredClubs.length === 0) {
          grid.style.display = 'none';
          empty.style.display = 'block';
          return;
        }

        grid.style.display = 'grid';
        empty.style.display = 'none';

        grid.innerHTML = filteredClubs.map(club => {
          const avatarContent = club.avatar_url
            ? `<img src="${club.avatar_url}" alt="${club.name}">`
            : (club.avatar_emoji || '🏍');

          const brands = club.motorcycle_brands && club.motorcycle_brands.length > 0
            ? `<div class="club-brands">
                ${club.motorcycle_brands.slice(0, 3).map(b => `<span class="brand-tag">${b}</span>`).join('')}
                ${club.motorcycle_brands.length > 3 ? `<span class="brand-tag">+${club.motorcycle_brands.length - 3}</span>` : ''}
              </div>`
            : '<span></span>';

          return `
            <a href="${CLUB_PAGE}?slug=${club.slug}" class="club-card">
              <div class="club-header">
                <div class="club-avatar">${avatarContent}</div>
                <div class="club-info">
                  <h3>${club.name}</h3>
                  <span class="club-category">${club.category || ''}</span>
                  <div class="club-location">📍 ${club.city || ''}, ${club.state || ''}</div>
                </div>
              </div>
              <p class="club-description">${club.description || 'Comunidad de motociclistas'}</p>
              <div class="club-stats">
                <div class="stat">
                  <div class="stat-value">${club.members_count || 0}</div>
                  <div class="stat-label">Miembros</div>
                </div>
                <div class="stat">
                  <div class="stat-value">${club.routes_completed || 0}</div>
                  <div class="stat-label">Rutas</div>
                </div>
                <div class="stat">
                  <div class="stat-value">${club.founded_year || '—'}</div>
                  <div class="stat-label">Fundado</div>
                </div>
              </div>
              <div class="club-footer">
                ${brands}
                <span class="club-link">Ver club →</span>
              </div>
            </a>
          `;
        }).join('');
      }

      // Event listeners
      searchEl.addEventListener('input', filterClubs);
      catEl.addEventListener('change', filterClubs);
      regEl.addEventListener('change', filterClubs);
      sortBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          sortBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          sortClubs(btn.dataset.sort);
        });
      });

      init();
    })();
    </script>
    <?php
    return ob_get_clean();
});

// ============================================================================
// SHORTCODE: DETALLE DE CLUB + REGISTRO  [ridera_club_detail slug="..."]
// ============================================================================
add_shortcode('ridera_club_detail', function($atts) {
    $atts = shortcode_atts(array('slug' => ''), $atts);

    // Intentar obtener el slug desde URL si no viene en shortcode
    $slug = $atts['slug'];
    if (empty($slug) && isset($_GET['slug'])) {
        $slug = sanitize_text_field($_GET['slug']);
    }

    if (empty($slug)) {
        return '<p style="color:#ef4444; padding: 2rem;">Error: Especifica el slug del club — ej: [ridera_club_detail slug="touring-bikers-colombia"]</p>';
    }

    $clubs_url = '/clubes/';

    ob_start();
    echo ridera_base_css();
    ?>
    <div class="ridera-wrap" id="ridera-club-detail">
      <style>
        /* HEADER MINI */
        #ridera-club-detail .club-header-bar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: linear-gradient(180deg, rgba(12,10,8,.95) 0%, rgba(12,10,8,.8) 100%);
          border-bottom: 1px solid rgba(232, 93, 32, 0.2);
          padding: 1rem 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          backdrop-filter: blur(10px);
        }
        #ridera-club-detail .club-header-bar span { font-family: var(--condensed); text-transform: uppercase; letter-spacing: 0.1em; color: var(--orange); }
        #ridera-club-detail .club-header-bar a { font-family: var(--condensed); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; padding: 0.5rem 1rem; border: 1px solid rgba(232, 93, 32, 0.3); border-radius: 4px; transition: all 0.2s ease; color: var(--muted-dark); }
        #ridera-club-detail .club-header-bar a:hover { border-color: var(--orange); color: var(--orange); text-decoration: none; }

        /* HERO */
        #ridera-club-detail .hero {
          position: relative;
          height: 500px;
          display: flex;
          align-items: flex-end;
          overflow: hidden;
          background: linear-gradient(135deg, #0f0f0f 0%, #1a1712 50%, #0f0f0f 100%);
        }
        #ridera-club-detail .hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 30% 50%, rgba(232,93,32,0.15) 0%, transparent 60%);
          pointer-events: none;
        }
        #ridera-club-detail .hero-content {
          position: relative;
          z-index: 2;
          width: 100%;
          padding: 4rem;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4rem;
          align-items: flex-end;
        }
        #ridera-club-detail .hero-left { display: flex; flex-direction: column; gap: 2rem; }
        #ridera-club-detail .club-avatar-hero {
          width: 140px; height: 140px;
          border-radius: 20px;
          background: linear-gradient(135deg, rgba(232,93,32,0.3), rgba(232,93,32,0.1));
          border: 2px solid rgba(232,93,32,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 4rem;
          box-shadow: 0 20px 60px rgba(232,93,32,0.2);
          backdrop-filter: blur(10px);
          overflow: hidden;
        }
        #ridera-club-detail .club-avatar-hero img { width: 100%; height: 100%; object-fit: cover; }
        #ridera-club-detail .hero-text h1 { font-family: var(--display); font-size: 3.5rem; color: var(--white); margin-bottom: 0.5rem; }
        #ridera-club-detail .hero-subtitle { font-family: var(--condensed); font-size: 1rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--orange); }
        #ridera-club-detail .hero-description { color: var(--muted-dark); font-size: 1rem; line-height: 1.8; max-width: 500px; }
        #ridera-club-detail .hero-right { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
        #ridera-club-detail .stat-card {
          background: rgba(232, 93, 32, 0.08);
          border: 1px solid rgba(232, 93, 32, 0.25);
          border-radius: 12px;
          padding: 2rem;
          text-align: center;
          backdrop-filter: blur(10px);
        }
        #ridera-club-detail .stat-card h3 { font-family: var(--condensed); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--muted-dark); margin-bottom: 1rem; }
        #ridera-club-detail .stat-card .value { font-family: var(--display); font-size: 2.5rem; color: var(--orange); line-height: 1; }

        /* CONTENT SECTIONS */
        #ridera-club-detail .content-section { padding: 4rem; border-bottom: 1px solid rgba(232, 93, 32, 0.1); }
        #ridera-club-detail .section-title { font-family: var(--display); font-size: 2.5rem; margin-bottom: 2rem; color: var(--white); }

        /* GALLERY */
        #ridera-club-detail .gallery-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin: 2rem 0; }
        #ridera-club-detail .gallery-item { width: 100%; aspect-ratio: 1; border-radius: 12px; overflow: hidden; border: 1px solid rgba(232, 93, 32, 0.2); cursor: pointer; transition: all 0.3s ease; }
        #ridera-club-detail .gallery-item:hover { border-color: var(--orange); transform: scale(1.05); box-shadow: 0 10px 30px rgba(232, 93, 32, 0.2); }
        #ridera-club-detail .gallery-item img { width: 100%; height: 100%; object-fit: cover; }

        /* SIGNUP SECTION */
        #ridera-club-detail .signup-section {
          background: linear-gradient(135deg, rgba(232,93,32,0.08) 0%, rgba(232,93,32,0.02) 100%);
          padding: 3rem;
          border-radius: 12px;
          border: 1px solid rgba(232, 93, 32, 0.2);
        }
        #ridera-club-detail .form-group { margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
        #ridera-club-detail .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
        #ridera-club-detail .form-group label { font-family: var(--condensed); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--orange); }
        #ridera-club-detail .form-group input,
        #ridera-club-detail .form-group textarea,
        #ridera-club-detail .form-group select {
          background: rgba(232, 93, 32, 0.05);
          border: 1px solid rgba(232, 93, 32, 0.2);
          color: var(--white);
          padding: 0.75rem 1rem;
          border-radius: 6px;
          font-family: var(--body);
          font-size: 0.95rem;
          transition: all 0.2s ease;
        }
        #ridera-club-detail .form-group input::placeholder { color: rgba(255, 255, 255, 0.3); }
        #ridera-club-detail .form-group input:focus,
        #ridera-club-detail .form-group textarea:focus,
        #ridera-club-detail .form-group select:focus { outline: none; border-color: var(--orange); background: rgba(232, 93, 32, 0.1); box-shadow: 0 0 0 3px rgba(232, 93, 32, 0.1); }
        #ridera-club-detail .form-group textarea { min-height: 100px; resize: vertical; }

        /* PHOTO UPLOAD */
        #ridera-club-detail .upload-area {
          border: 2px dashed rgba(232, 93, 32, 0.3);
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: rgba(232, 93, 32, 0.02);
        }
        #ridera-club-detail .upload-area:hover { border-color: var(--orange); background: rgba(232, 93, 32, 0.08); }
        #ridera-club-detail .upload-area.dragover { border-color: var(--orange); background: rgba(232, 93, 32, 0.15); }
        #ridera-club-detail .upload-area p { color: var(--muted-dark); margin: 0.5rem 0; }
        #ridera-club-detail .upload-area .upload-icon { font-size: 2rem; margin-bottom: 0.5rem; }
        #ridera-club-detail .preview-images { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 1rem; margin-top: 1rem; }
        #ridera-club-detail .preview-image { position: relative; border-radius: 8px; overflow: hidden; aspect-ratio: 1; border: 1px solid rgba(232, 93, 32, 0.2); }
        #ridera-club-detail .preview-image img { width: 100%; height: 100%; object-fit: cover; }
        #ridera-club-detail .preview-image .remove {
          position: absolute; top: 0.5rem; right: 0.5rem;
          background: rgba(239, 68, 68, 0.8); color: white; border: none;
          border-radius: 50%; width: 30px; height: 30px; cursor: pointer; font-size: 1.2rem;
          display: flex; align-items: center; justify-content: center;
        }
        #ridera-club-detail .preview-image .remove:hover { background: var(--red); }

        /* FORM ACTIONS */
        #ridera-club-detail .form-actions { display: flex; gap: 1rem; margin-top: 2rem; }

        /* MODAL */
        #ridera-club-detail .img-modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 1000; align-items: center; justify-content: center; padding: 1rem; }
        #ridera-club-detail .img-modal.active { display: flex; }
        #ridera-club-detail .img-modal-close { position: absolute; top: 20px; right: 20px; background: rgba(0,0,0,0.5); border: none; color: white; font-size: 2rem; cursor: pointer; width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        #ridera-club-detail .img-modal img { max-width: 800px; width: 100%; border-radius: 12px; }

        /* RESPONSIVE */
        @media (max-width: 768px) {
          #ridera-club-detail .hero-content { grid-template-columns: 1fr; gap: 2rem; padding: 2rem; }
          #ridera-club-detail .hero-right { grid-template-columns: 1fr 1fr; }
          #ridera-club-detail .hero-text h1 { font-size: 2rem; }
          #ridera-club-detail .content-section { padding: 2rem; }
          #ridera-club-detail .section-title { font-size: 1.8rem; }
          #ridera-club-detail .form-row { grid-template-columns: 1fr; }
          #ridera-club-detail .signup-section { padding: 1.5rem; }
        }
      </style>

      <!-- HEADER BAR -->
      <header class="club-header-bar">
        <span>Ridera Clubes</span>
        <a href="<?php echo esc_attr($clubs_url); ?>">← Volver a clubes</a>
      </header>

      <!-- LOADING STATE -->
      <div id="ridera-detail-loading" style="display: flex; align-items: center; justify-content: center; min-height: 400px; flex-direction: column; gap: 1rem;">
        <div class="ridera-loading-spinner"></div>
        <p style="color: var(--muted-dark);">Cargando club...</p>
      </div>

      <!-- CLUB CONTENT (oculto hasta cargar) -->
      <div id="ridera-detail-content" style="display: none;">
        <!-- HERO -->
        <section class="hero">
          <div class="hero-content">
            <div class="hero-left">
              <div class="club-avatar-hero" id="rd-avatar">🏍</div>
              <div class="hero-text">
                <h1 id="rd-title">—</h1>
                <p class="hero-subtitle" id="rd-category">—</p>
              </div>
            </div>
            <div class="hero-right">
              <div class="stat-card"><h3>Miembros</h3><div class="value" id="rd-members">0</div></div>
              <div class="stat-card"><h3>Rutas</h3><div class="value" id="rd-routes">0</div></div>
              <div class="stat-card"><h3>Fundado</h3><div class="value" id="rd-founded">—</div></div>
              <div class="stat-card"><h3>Ubicación</h3><div class="value" style="font-size:1.2rem;" id="rd-location">—</div></div>
            </div>
          </div>
        </section>

        <!-- ABOUT -->
        <section class="content-section" id="rd-about-section" style="display: none;">
          <h2 class="section-title">Acerca del Club</h2>
          <div id="rd-about-text"></div>
        </section>

        <!-- GALLERY -->
        <section class="content-section" id="rd-gallery-section" style="display: none;">
          <h2 class="section-title">Galería</h2>
          <div class="gallery-grid" id="rd-gallery"></div>
        </section>

        <!-- CONTACT -->
        <section class="content-section" id="rd-contact-section" style="display: none;">
          <h2 class="section-title">Conecta con Nosotros</h2>
          <div id="rd-contact-cards" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;"></div>
        </section>

        <!-- BRANDS & ROUTES -->
        <section class="content-section" id="rd-brand-section" style="display: none;">
          <h2 class="section-title">Motos y Rutas</h2>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 3rem;">
            <div>
              <h3 style="font-family: var(--condensed); font-size: 1rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--orange); margin-bottom: 1.5rem;">🏍 Marcas de Motos</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 1rem;" id="rd-brands"></div>
            </div>
            <div>
              <h3 style="font-family: var(--condensed); font-size: 1rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--orange); margin-bottom: 1.5rem;">🛣 Tipos de Ruta</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 1rem;" id="rd-routes-tags"></div>
            </div>
          </div>
        </section>

        <!-- SIGNUP SECTION -->
        <section class="content-section">
          <h2 class="section-title">¡Únete al Club!</h2>
          <div class="signup-section">
            <div id="rd-signup-alert"></div>

            <form id="rd-signup-form" style="display: flex; flex-direction: column; gap: 2rem;">
              <!-- PERSONAL INFO -->
              <div>
                <h3 style="font-size: 1.2rem; margin-bottom: 1.5rem; color: var(--white);">Información Personal</h3>
                <div class="form-row">
                  <div class="form-group"><label>Nombre Completo *</label><input type="text" name="fullname" required></div>
                  <div class="form-group"><label>Email *</label><input type="email" name="email" required></div>
                </div>
                <div class="form-row">
                  <div class="form-group"><label>Teléfono</label><input type="tel" name="phone"></div>
                  <div class="form-group"><label>WhatsApp</label><input type="tel" name="whatsapp"></div>
                </div>
                <div class="form-group"><label>Ciudad</label><input type="text" name="city"></div>
              </div>

              <!-- MOTO INFO -->
              <div>
                <h3 style="font-size: 1.2rem; margin-bottom: 1.5rem; color: var(--white);">Información de tu Moto</h3>
                <div class="form-row">
                  <div class="form-group"><label>Marca *</label><input type="text" name="moto_brand" placeholder="Ej: BMW, Harley-Davidson" required></div>
                  <div class="form-group"><label>Modelo</label><input type="text" name="moto_model" placeholder="Ej: R1200GS"></div>
                </div>
                <div class="form-row">
                  <div class="form-group"><label>Año</label><input type="number" name="moto_year" placeholder="2024"></div>
                  <div class="form-group"><label>Color</label><input type="text" name="moto_color" placeholder="Ej: Rojo"></div>
                </div>
              </div>

              <!-- PHOTOS -->
              <div>
                <h3 style="font-size: 1.2rem; margin-bottom: 1.5rem; color: var(--white);">Fotos (Mínimo 3 requeridas)</h3>
                <div class="form-group">
                  <label>Sube tus fotos (Arrastra o haz click)</label>
                  <div class="upload-area" id="rd-upload-area">
                    <div class="upload-icon">📸</div>
                    <p style="font-weight: 500;">Arrastra tus fotos aquí</p>
                    <p>o haz click para seleccionar</p>
                    <p style="font-size: 0.85em; margin-top: 1rem;">Mínimo 3 fotos requeridas</p>
                    <input type="file" id="rd-photo-input" style="display: none;" multiple accept="image/*">
                  </div>
                  <div class="preview-images" id="rd-photo-preview"></div>
                  <div id="rd-photo-count" style="color: var(--muted-dark); margin-top: 1rem; font-size: 0.9rem;">
                    Fotos seleccionadas: <strong>0/∞</strong> (mínimo 3)
                  </div>
                </div>
              </div>

              <!-- MESSAGE -->
              <div>
                <h3 style="font-size: 1.2rem; margin-bottom: 1.5rem; color: var(--white);">Mensaje Adicional</h3>
                <div class="form-group">
                  <label>¿Por qué quieres unirte a este club?</label>
                  <textarea name="message" placeholder="Cuéntanos por qué te interesa este club..."></textarea>
                </div>
              </div>

              <div class="form-actions">
                <button type="submit" class="ridera-btn primary" id="rd-submit-btn">🚀 Unirme al Club</button>
                <button type="reset" class="ridera-btn">Limpiar</button>
              </div>
            </form>
          </div>
        </section>
      </div>

      <!-- ERROR STATE -->
      <div id="ridera-detail-error" style="display: none; padding: 4rem 2rem; text-align: center;">
        <div style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; padding: 2rem; border-radius: 8px;">
          <p>No se pudo cargar la información del club.</p>
          <p style="margin-top: 1rem;"><a href="<?php echo esc_attr($clubs_url); ?>">← Volver a clubes</a></p>
        </div>
      </div>

      <!-- IMAGE MODAL -->
      <div id="rd-image-modal" class="img-modal">
        <button class="img-modal-close" onclick="document.getElementById('rd-image-modal').classList.remove('active')">×</button>
        <img id="rd-modal-img" src="" alt="">
      </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script>
    (function() {
      const SUPABASE_URL = "<?php echo RIDERA_SUPABASE_URL; ?>";
      const SUPABASE_KEY = "<?php echo RIDERA_SUPABASE_KEY; ?>";
      const CLUB_SLUG = "<?php echo esc_js($slug); ?>";

      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      let currentClub = null;
      let selectedPhotos = [];

      // ============ RITA COMPATIBILITY ============
      window.clubData = {
        current: null,
        extractClubInfo: function() {
          if (!this.current) return null;
          const c = this.current;
          return {
            clubId: c.id, name: c.name, description: c.description, category: c.category,
            stats: { members: c.members_count || 0, routes: c.routes_completed || 0, founded: c.founded_year, location: `${c.city}, ${c.state}` },
            contact: { leader: c.leader_name, phone: c.leader_phone, email: c.leader_email, city: c.city, region: c.region },
            social: { facebook: c.facebook_url, instagram: c.instagram_url, whatsapp: c.whatsapp, twitter: c.twitter_url },
            brands: c.motorcycle_brands || [], routes: c.route_types || [], philosophy: c.philosophy, frequency: c.frequency
          };
        }
      };

      // ============ PHOTO UPLOAD ============
      const uploadArea = document.getElementById('rd-upload-area');
      const photoInput = document.getElementById('rd-photo-input');

      uploadArea.addEventListener('click', () => photoInput.click());
      uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
      uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
      uploadArea.addEventListener('drop', e => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handlePhotos([...e.dataTransfer.files]);
      });
      photoInput.addEventListener('change', e => handlePhotos([...e.target.files]));

      function handlePhotos(files) {
        files.filter(f => f.type.startsWith('image/')).forEach(file => {
          if (selectedPhotos.length >= 10) return;
          if (selectedPhotos.some(p => p.name === file.name && p.size === file.size)) return;
          selectedPhotos.push(file);

          const reader = new FileReader();
          reader.onload = e => {
            const div = document.createElement('div');
            div.className = 'preview-image';
            div.innerHTML = `
              <img src="${e.target.result}" alt="Preview">
              <button type="button" class="remove" onclick="removePhoto(this, '${file.name}', ${file.size})">×</button>
            `;
            document.getElementById('rd-photo-preview').appendChild(div);
            updatePhotoCount();
          };
          reader.readAsDataURL(file);
        });
      }

      window.removePhoto = function(btn, name, size) {
        selectedPhotos = selectedPhotos.filter(p => !(p.name === name && p.size === size));
        btn.closest('.preview-image').remove();
        updatePhotoCount();
      };

      function updatePhotoCount() {
        document.getElementById('rd-photo-count').innerHTML =
          `Fotos seleccionadas: <strong>${selectedPhotos.length}/∞</strong> (mínimo 3)`;
      }

      // ============ LOAD CLUB ============
      async function loadClub() {
        try {
          const { data, error } = await client
            .from('clubs')
            .select('*')
            .eq('slug', CLUB_SLUG)
            .eq('active', true)
            .single();

          if (error || !data) {
            document.getElementById('ridera-detail-loading').style.display = 'none';
            document.getElementById('ridera-detail-error').style.display = 'block';
            return;
          }

          currentClub = data;
          window.clubData.current = data;
          renderClub(data);
        } catch (err) {
          console.error('Error:', err);
          document.getElementById('ridera-detail-loading').style.display = 'none';
          document.getElementById('ridera-detail-error').style.display = 'block';
        }
      }

      function renderClub(club) {
        // Hero
        const avatarEl = document.getElementById('rd-avatar');
        if (club.avatar_url) avatarEl.innerHTML = `<img src="${club.avatar_url}" alt="${club.name}">`;
        else avatarEl.textContent = club.avatar_emoji || '🏍';

        document.getElementById('rd-title').textContent = club.name;
        document.getElementById('rd-category').textContent = club.category || '';
        document.getElementById('rd-members').textContent = club.members_count || '0';
        document.getElementById('rd-routes').textContent = club.routes_completed || '0';
        document.getElementById('rd-founded').textContent = club.founded_year || '—';
        document.getElementById('rd-location').textContent = club.city || '—';
        document.title = `${club.name} · Ridera Clubes`;

        // About
        if (club.description || club.philosophy || club.frequency) {
          document.getElementById('rd-about-section').style.display = 'block';
          document.getElementById('rd-about-text').innerHTML = `
            ${club.description ? `<p style="margin-bottom:1.5rem;font-size:1.05rem;line-height:1.8;">${club.description}</p>` : ''}
            ${club.philosophy ? `<div style="background:rgba(232,93,32,0.08);padding:1.5rem;border-left:4px solid var(--orange);margin:1rem 0;border-radius:4px;"><strong>Filosofía:</strong> ${club.philosophy}</div>` : ''}
            ${club.frequency ? `<div style="background:rgba(232,93,32,0.08);padding:1.5rem;border-left:4px solid var(--orange);margin:1rem 0;border-radius:4px;"><strong>Frecuencia:</strong> ${club.frequency}</div>` : ''}
          `;
        }

        // Gallery
        if (club.cover_url || club.avatar_url) {
          document.getElementById('rd-gallery-section').style.display = 'block';
          const images = [club.cover_url, club.avatar_url].filter(Boolean);
          document.getElementById('rd-gallery').innerHTML = images.map(url =>
            `<div class="gallery-item" onclick="document.getElementById('rd-image-modal').classList.add('active'); document.getElementById('rd-modal-img').src='${url}'">
              <img src="${url}" alt="${club.name}">
            </div>`
          ).join('');
        }

        // Contact
        if (club.leader_name || club.leader_email || club.facebook_url || club.instagram_url) {
          document.getElementById('rd-contact-section').style.display = 'block';
          const cards = [];
          if (club.leader_name) cards.push(`
            <div style="background:rgba(232,93,32,0.08);border:1px solid rgba(232,93,32,0.2);border-radius:12px;padding:1.5rem;">
              <div style="font-family:var(--condensed);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.15em;color:var(--muted-dark);margin-bottom:1rem;">Líder del Club</div>
              <div style="font-size:1.1rem;color:var(--white);">${club.leader_name}</div>
              ${club.leader_phone ? `<div style="font-size:0.9rem;color:var(--muted-dark);margin-top:0.5rem;">${club.leader_phone}</div>` : ''}
            </div>`);
          if (club.leader_email) cards.push(`
            <div style="background:rgba(232,93,32,0.08);border:1px solid rgba(232,93,32,0.2);border-radius:12px;padding:1.5rem;">
              <div style="font-family:var(--condensed);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.15em;color:var(--muted-dark);margin-bottom:1rem;">Email</div>
              <a href="mailto:${club.leader_email}">${club.leader_email}</a>
            </div>`);
          if (club.facebook_url || club.instagram_url || club.whatsapp || club.twitter_url) {
            let socials = `<div style="background:rgba(232,93,32,0.08);border:1px solid rgba(232,93,32,0.2);border-radius:12px;padding:1.5rem;grid-column:1/-1;">
              <div style="font-family:var(--condensed);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.15em;color:var(--muted-dark);margin-bottom:1rem;">Síguenos</div>
              <div style="display:flex;gap:1rem;flex-wrap:wrap;">`;
            if (club.facebook_url) socials += `<a href="${club.facebook_url}" target="_blank" class="ridera-btn primary">Facebook</a>`;
            if (club.instagram_url) socials += `<a href="${club.instagram_url}" target="_blank" class="ridera-btn primary">Instagram</a>`;
            if (club.twitter_url) socials += `<a href="${club.twitter_url}" target="_blank" class="ridera-btn primary">Twitter</a>`;
            if (club.whatsapp) socials += `<a href="https://wa.me/${club.whatsapp.replace(/\D/g,'')}" target="_blank" class="ridera-btn primary">WhatsApp</a>`;
            socials += `</div></div>`;
            cards.push(socials);
          }
          document.getElementById('rd-contact-cards').innerHTML = cards.join('');
        }

        // Brands & Routes
        if (club.motorcycle_brands?.length || club.route_types?.length) {
          document.getElementById('rd-brand-section').style.display = 'block';
          if (club.motorcycle_brands?.length) {
            document.getElementById('rd-brands').innerHTML = club.motorcycle_brands.map(b =>
              `<span style="padding:0.6rem 1.2rem;background:rgba(232,93,32,0.12);border:1px solid rgba(232,93,32,0.3);border-radius:6px;color:var(--muted);font-size:0.9rem;">${b}</span>`
            ).join('');
          }
          if (club.route_types?.length) {
            document.getElementById('rd-routes-tags').innerHTML = club.route_types.map(r =>
              `<span style="padding:0.6rem 1.2rem;background:rgba(232,93,32,0.12);border:1px solid rgba(232,93,32,0.3);border-radius:6px;color:var(--muted);font-size:0.9rem;">${r}</span>`
            ).join('');
          }
        }

        document.getElementById('ridera-detail-loading').style.display = 'none';
        document.getElementById('ridera-detail-content').style.display = 'block';
      }

      // ============ SIGNUP FORM ============
      document.getElementById('rd-signup-form').addEventListener('submit', async e => {
        e.preventDefault();
        const submitBtn = document.getElementById('rd-submit-btn');
        const alertDiv = document.getElementById('rd-signup-alert');

        if (selectedPhotos.length < 3) {
          alertDiv.innerHTML = '<div class="ridera-alert error">⚠️ Debes seleccionar al menos 3 fotos</div>';
          return;
        }

        submitBtn.disabled = true;
        alertDiv.innerHTML = '<div class="ridera-alert info"><div class="ridera-loading-spinner"></div>Procesando tu registro...</div>';

        try {
          const photoUrls = [];
          for (const photo of selectedPhotos) {
            const fileName = `${Date.now()}-${Math.random()}-${photo.name}`;
            const { error: upErr } = await client.storage.from('club-photos').upload(`${currentClub.id}/${fileName}`, photo);
            if (upErr) throw upErr;
            const { data: { publicUrl } } = client.storage.from('club-photos').getPublicUrl(`${currentClub.id}/${fileName}`);
            photoUrls.push(publicUrl);
          }

          const fd = new FormData(e.target);
          const { error: insertErr } = await client.from('club_members').insert([{
            club_id: currentClub.id,
            fullname: fd.get('fullname'),
            email: fd.get('email'),
            phone: fd.get('phone'),
            whatsapp: fd.get('whatsapp'),
            city: fd.get('city'),
            moto_brand: fd.get('moto_brand'),
            moto_model: fd.get('moto_model'),
            moto_year: fd.get('moto_year'),
            moto_color: fd.get('moto_color'),
            photo_urls: photoUrls,
            message: fd.get('message'),
            created_at: new Date().toISOString()
          }]);

          if (insertErr) throw insertErr;

          alertDiv.innerHTML = '<div class="ridera-alert success">✅ ¡Éxito! Tu registro ha sido enviado<br><small>El líder del club se pondrá en contacto pronto</small></div>';
          e.target.reset();
          selectedPhotos = [];
          document.getElementById('rd-photo-preview').innerHTML = '';
          updatePhotoCount();

        } catch (err) {
          console.error('Error:', err);
          alertDiv.innerHTML = `<div class="ridera-alert error">❌ Error al procesar tu registro: ${err.message}</div>`;
        } finally {
          submitBtn.disabled = false;
        }
      });

      loadClub();
    })();
    </script>
    <?php
    return ob_get_clean();
});
