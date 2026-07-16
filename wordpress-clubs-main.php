<?php
/**
 * Ridera Clubs System for WordPress
 * Main file for clubs listing and detail pages
 *
 * Usage:
 * 1. Add to functions.php: require_once('wp-content/wordpress-clubs-main.php');
 * 2. Create pages with shortcodes:
 *    - [ridera_clubs_listing] → Club listing page
 *    - [ridera_club_detail slug="touring-bikers-colombia"] → Club detail + registration
 */

// ============================================================================
// SUPABASE CONFIG
// ============================================================================

define('SUPABASE_URL', 'https://vzzxsdtsaahhzyctvmhx.supabase.co');
define('SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6enpzZHRzYWFoaHp5Y3R2bWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDQ2NjI4MjcsImV4cCI6MjAyMDIzODgyN30.8_EzBvLI2Np-KpKC3l3b0mKPHyAVjPfD3yI3YzJXzzU');

// ============================================================================
// SHORTCODE: CLUBS LISTING
// ============================================================================

add_shortcode('ridera_clubs_listing', function($atts) {
    return render_clubs_listing();
});

function render_clubs_listing() {
    ob_start();
    ?>
    <div id="ridera-clubs-app" class="ridera-clubs-container">
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
            }

            .ridera-clubs-container {
                background: var(--black);
                color: var(--white);
                font-family: 'DM Sans', system-ui, sans-serif;
                padding: 2rem;
                max-width: 1400px;
                margin: 0 auto;
            }

            .clubs-header {
                text-align: center;
                margin-bottom: 3rem;
            }

            .clubs-header h1 {
                font-family: 'Bebas Neue', sans-serif;
                font-size: 2.5rem;
                margin-bottom: 0.5rem;
                color: var(--white);
            }

            .clubs-header p {
                color: var(--muted-dark);
                font-size: 1.1rem;
            }

            /* FILTROS */
            .clubs-filters {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 1rem;
                margin-bottom: 2rem;
                padding: 1.5rem;
                background: linear-gradient(135deg, #0f0f0f 0%, #1a1712 100%);
                border-radius: 12px;
                border: 1px solid rgba(232, 93, 32, 0.1);
            }

            .filter-group {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }

            .filter-group label {
                font-size: 0.9rem;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                color: var(--orange);
                font-weight: 600;
            }

            .filter-group select,
            .filter-group input {
                background: var(--off-black);
                border: 1px solid rgba(232, 93, 32, 0.3);
                color: var(--white);
                padding: 0.75rem;
                border-radius: 6px;
                font-family: 'DM Sans', sans-serif;
            }

            .filter-group select:focus,
            .filter-group input:focus {
                outline: none;
                border-color: var(--orange);
                box-shadow: 0 0 0 3px rgba(232, 93, 32, 0.1);
            }

            /* GRID DE CLUBES */
            .clubs-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 2rem;
                margin-bottom: 3rem;
            }

            .club-card {
                background: linear-gradient(135deg, #0f0f0f 0%, #1a1712 100%);
                border: 1px solid rgba(232, 93, 32, 0.2);
                border-radius: 12px;
                overflow: hidden;
                cursor: pointer;
                transition: all 0.3s ease;
                position: relative;
            }

            .club-card:hover {
                border-color: var(--orange);
                transform: translateY(-4px);
                box-shadow: 0 8px 24px rgba(232, 93, 32, 0.15);
            }

            .club-card-image {
                width: 100%;
                height: 200px;
                background: linear-gradient(135deg, var(--orange) 0%, var(--orange-dark) 100%);
                position: relative;
                overflow: hidden;
            }

            .club-card-image img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .club-card-avatar {
                position: absolute;
                bottom: -30px;
                left: 20px;
                width: 80px;
                height: 80px;
                background: var(--black);
                border: 3px solid var(--orange);
                border-radius: 50%;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            }

            .club-card-content {
                padding: 3rem 1.5rem 1.5rem;
            }

            .club-card-name {
                font-family: 'Barlow Condensed', sans-serif;
                font-size: 1.3rem;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                color: var(--orange);
                margin-bottom: 0.5rem;
            }

            .club-card-description {
                color: var(--muted-dark);
                font-size: 0.95rem;
                margin-bottom: 1rem;
                line-height: 1.5;
            }

            .club-card-stats {
                display: flex;
                gap: 1rem;
                margin-bottom: 1rem;
                padding-bottom: 1rem;
                border-bottom: 1px solid rgba(232, 93, 32, 0.1);
            }

            .stat {
                text-align: center;
                flex: 1;
            }

            .stat-value {
                font-size: 1.3rem;
                font-weight: bold;
                color: var(--orange);
            }

            .stat-label {
                font-size: 0.75rem;
                color: var(--muted-dark);
                text-transform: uppercase;
            }

            .club-card-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
                margin-bottom: 1rem;
            }

            .tag {
                background: rgba(232, 93, 32, 0.1);
                color: var(--orange);
                padding: 0.25rem 0.75rem;
                border-radius: 20px;
                font-size: 0.8rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .club-card-cta {
                width: 100%;
                background: var(--orange);
                color: var(--black);
                border: none;
                padding: 0.75rem 1rem;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                font-family: 'DM Sans', sans-serif;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .club-card-cta:hover {
                background: var(--orange-light);
                transform: scale(1.05);
            }

            /* LOADING & EMPTY STATES */
            .clubs-loading {
                text-align: center;
                padding: 4rem 2rem;
            }

            .clubs-loader {
                width: 40px;
                height: 40px;
                border: 3px solid rgba(232, 93, 32, 0.2);
                border-top-color: var(--orange);
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 1rem;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            .clubs-empty {
                text-align: center;
                padding: 4rem 2rem;
                color: var(--muted-dark);
            }

            /* MODAL PARA DETALLE */
            .club-modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                z-index: 1000;
                overflow-y: auto;
            }

            .club-modal.active {
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .club-modal-content {
                background: var(--black);
                border: 1px solid rgba(232, 93, 32, 0.2);
                border-radius: 12px;
                width: 90%;
                max-width: 600px;
                max-height: 90vh;
                overflow-y: auto;
                position: relative;
            }

            .club-modal-close {
                position: absolute;
                top: 1rem;
                right: 1rem;
                background: transparent;
                border: none;
                color: var(--white);
                font-size: 1.5rem;
                cursor: pointer;
                z-index: 1001;
            }

            @media (max-width: 768px) {
                .clubs-header h1 {
                    font-size: 1.8rem;
                }

                .clubs-grid {
                    grid-template-columns: 1fr;
                }

                .clubs-filters {
                    grid-template-columns: 1fr;
                }
            }
        </style>

        <!-- HEADER -->
        <div class="clubs-header">
            <h1>Clubes de Motociclistas</h1>
            <p>Encuentra y únete a tu comunidad de motos favorita</p>
        </div>

        <!-- FILTROS -->
        <div class="clubs-filters">
            <div class="filter-group">
                <label>Categoría</label>
                <select id="filterCategory">
                    <option value="">Todas</option>
                    <option value="touring">Touring</option>
                    <option value="cruiser">Cruiser</option>
                    <option value="enduro">Enduro</option>
                    <option value="sport">Sport</option>
                </select>
            </div>

            <div class="filter-group">
                <label>Región</label>
                <select id="filterRegion">
                    <option value="">Todas</option>
                    <option value="bogota">Bogotá</option>
                    <option value="medellin">Medellín</option>
                    <option value="cali">Cali</option>
                    <option value="barranquilla">Barranquilla</option>
                </select>
            </div>

            <div class="filter-group">
                <label>Buscar</label>
                <input type="text" id="filterSearch" placeholder="Nombre del club...">
            </div>

            <div class="filter-group">
                <label>Ordenar por</label>
                <select id="filterSort">
                    <option value="featured">Destacados</option>
                    <option value="members">Miembros</option>
                    <option value="newest">Más nuevos</option>
                </select>
            </div>
        </div>

        <!-- GRID DE CLUBES -->
        <div id="clubsList" class="clubs-grid">
            <div class="clubs-loading">
                <div class="clubs-loader"></div>
                <p>Cargando clubes...</p>
            </div>
        </div>

        <!-- MODAL DE DETALLE -->
        <div id="clubModal" class="club-modal">
            <div class="club-modal-content">
                <button class="club-modal-close" onclick="closeClubModal()">&times;</button>
                <div id="clubDetailContent"></div>
            </div>
        </div>
    </div>

    <script>
        const SUPABASE_URL = '<?php echo SUPABASE_URL; ?>';
        const SUPABASE_KEY = '<?php echo SUPABASE_ANON_KEY; ?>';

        let allClubs = [];
        let filteredClubs = [];

        // Load clubs from Supabase
        async function loadClubs() {
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/clubs?select=*`, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`
                    }
                });

                if (!response.ok) throw new Error('Failed to load clubs');

                allClubs = await response.json();
                filteredClubs = [...allClubs];
                renderClubs();
            } catch (error) {
                console.error('Error loading clubs:', error);
                document.getElementById('clubsList').innerHTML =
                    '<div class="clubs-empty"><p>Error al cargar clubes. Por favor, intenta más tarde.</p></div>';
            }
        }

        // Render clubs
        function renderClubs() {
            const container = document.getElementById('clubsList');

            if (filteredClubs.length === 0) {
                container.innerHTML = '<div class="clubs-empty"><p>No se encontraron clubes.</p></div>';
                return;
            }

            container.innerHTML = filteredClubs.map(club => `
                <div class="club-card" onclick="openClubDetail('${club.slug}')">
                    <div class="club-card-image" style="background: linear-gradient(135deg, ${club.primary_color || '#E85D20'} 0%, ${club.secondary_color || '#c44d18'} 100%)">
                        ${club.logo_url ? `<img src="${club.logo_url}" alt="${club.name}">` : ''}
                    </div>
                    <div class="club-card-avatar">
                        ${club.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div class="club-card-content">
                        <div class="club-card-name">${club.name}</div>
                        <p class="club-card-description">${club.description || ''}</p>

                        <div class="club-card-stats">
                            <div class="stat">
                                <div class="stat-value">${club.members_count || 0}</div>
                                <div class="stat-label">Miembros</div>
                            </div>
                            <div class="stat">
                                <div class="stat-value">${club.founded_year || '2024'}</div>
                                <div class="stat-label">Año</div>
                            </div>
                            <div class="stat">
                                <div class="stat-value">${club.monthly_rides || 0}</div>
                                <div class="stat-label">Rutas</div>
                            </div>
                        </div>

                        <div class="club-card-tags">
                            ${club.category ? `<span class="tag">${club.category}</span>` : ''}
                            ${club.region ? `<span class="tag">${club.region}</span>` : ''}
                        </div>

                        <button class="club-card-cta">Ver Detalles</button>
                    </div>
                </div>
            `).join('');
        }

        // Filter clubs
        function applyFilters() {
            filteredClubs = allClubs.filter(club => {
                const category = document.getElementById('filterCategory').value;
                const region = document.getElementById('filterRegion').value;
                const search = document.getElementById('filterSearch').value.toLowerCase();

                if (category && club.category !== category) return false;
                if (region && club.region !== region) return false;
                if (search && !club.name.toLowerCase().includes(search)) return false;

                return true;
            });

            // Apply sorting
            const sortBy = document.getElementById('filterSort').value;
            if (sortBy === 'members') {
                filteredClubs.sort((a, b) => (b.members_count || 0) - (a.members_count || 0));
            } else if (sortBy === 'newest') {
                filteredClubs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }

            renderClubs();
        }

        // Open club detail
        async function openClubDetail(slug) {
            const modal = document.getElementById('clubModal');
            const content = document.getElementById('clubDetailContent');

            modal.classList.add('active');
            content.innerHTML = '<div class="clubs-loading"><div class="clubs-loader"></div></div>';

            try {
                // Load club data
                const response = await fetch(`${SUPABASE_URL}/rest/v1/clubs?slug=eq.${slug}&select=*`, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`
                    }
                });

                if (!response.ok) throw new Error('Failed to load club');
                const clubs = await response.json();
                const club = clubs[0];

                // Render club detail
                content.innerHTML = `
                    <div style="padding: 2rem;">
                        <h2 style="font-size: 2rem; margin-bottom: 1rem; color: var(--white);">${club.name}</h2>
                        <p style="color: var(--muted-dark); margin-bottom: 2rem;">${club.description}</p>

                        <div style="background: rgba(232, 93, 32, 0.1); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
                            <h3 style="color: var(--orange); margin-bottom: 1rem;">Líder del Club</h3>
                            <p><strong>${club.leader_name}</strong></p>
                            <p style="color: var(--muted-dark);">${club.leader_email}</p>
                        </div>

                        <a href="?page=club-registration&slug=${slug}" style="
                            display: inline-block;
                            background: var(--orange);
                            color: var(--black);
                            padding: 1rem 2rem;
                            border-radius: 6px;
                            text-decoration: none;
                            font-weight: 600;
                            text-transform: uppercase;
                            letter-spacing: 0.05em;
                            transition: all 0.3s ease;
                        " onmouseover="this.style.background='var(--orange-light)'" onmouseout="this.style.background='var(--orange)'">
                            Unirme al Club
                        </a>
                    </div>
                `;
            } catch (error) {
                console.error('Error loading club detail:', error);
                content.innerHTML = '<div class="clubs-empty"><p>Error al cargar detalles del club.</p></div>';
            }
        }

        // Close modal
        function closeClubModal() {
            document.getElementById('clubModal').classList.remove('active');
        }

        // Event listeners
        document.getElementById('filterCategory')?.addEventListener('change', applyFilters);
        document.getElementById('filterRegion')?.addEventListener('change', applyFilters);
        document.getElementById('filterSearch')?.addEventListener('input', applyFilters);
        document.getElementById('filterSort')?.addEventListener('change', applyFilters);

        // Load clubs on page load
        loadClubs();
    </script>
    <?php
    return ob_get_clean();
}

// ============================================================================
// SHORTCODE: CLUB DETAIL + REGISTRATION
// ============================================================================

add_shortcode('ridera_club_detail', function($atts) {
    $atts = shortcode_atts(array(
        'slug' => ''
    ), $atts);

    if (!$atts['slug']) {
        return '<p style="color: red;">Error: Especifica el slug del club con slug="touring-bikers-colombia"</p>';
    }

    return render_club_detail_with_registration($atts['slug']);
});

function render_club_detail_with_registration($club_slug) {
    ob_start();
    ?>
    <div id="ridera-club-detail" class="club-detail-container">
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
                --red: #ef4444;
            }

            .club-detail-container {
                background: var(--black);
                color: var(--white);
                font-family: 'DM Sans', system-ui, sans-serif;
                padding: 2rem;
                max-width: 1200px;
                margin: 0 auto;
            }

            /* CLUB INFO SECTION */
            .club-hero {
                background: linear-gradient(135deg, #0f0f0f 0%, #1a1712 100%);
                border: 1px solid rgba(232, 93, 32, 0.2);
                border-radius: 12px;
                padding: 3rem;
                margin-bottom: 3rem;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 3rem;
                align-items: center;
            }

            .club-hero h1 {
                font-family: 'Bebas Neue', sans-serif;
                font-size: 2.5rem;
                margin-bottom: 1rem;
            }

            .club-hero p {
                color: var(--muted-dark);
                line-height: 1.8;
                margin-bottom: 1rem;
            }

            .club-hero-info {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 1rem;
                margin-top: 2rem;
            }

            .info-item {
                text-align: center;
            }

            .info-label {
                font-size: 0.9rem;
                color: var(--muted-dark);
                text-transform: uppercase;
                margin-bottom: 0.5rem;
            }

            .info-value {
                font-size: 1.8rem;
                font-weight: bold;
                color: var(--orange);
            }

            .club-logo {
                width: 200px;
                height: 200px;
                background: linear-gradient(135deg, var(--orange) 0%, var(--orange-dark) 100%);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            }

            .club-logo img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            /* FORM SECTION */
            .registration-section {
                background: linear-gradient(135deg, #0f0f0f 0%, #1a1712 100%);
                border: 1px solid rgba(232, 93, 32, 0.2);
                border-radius: 12px;
                padding: 2rem;
            }

            .registration-section h2 {
                font-family: 'Bebas Neue', sans-serif;
                font-size: 1.8rem;
                margin-bottom: 2rem;
            }

            .form-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 1.5rem;
                margin-bottom: 2rem;
            }

            .form-group {
                display: flex;
                flex-direction: column;
            }

            .form-group label {
                margin-bottom: 0.5rem;
                font-weight: 600;
                color: var(--orange);
                font-size: 0.9rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .form-group input,
            .form-group select,
            .form-group textarea {
                background: var(--off-black);
                border: 1px solid rgba(232, 93, 32, 0.3);
                color: var(--white);
                padding: 0.75rem;
                border-radius: 6px;
                font-family: 'DM Sans', sans-serif;
            }

            .form-group input:focus,
            .form-group select:focus,
            .form-group textarea:focus {
                outline: none;
                border-color: var(--orange);
                box-shadow: 0 0 0 3px rgba(232, 93, 32, 0.1);
            }

            .form-group.full {
                grid-column: 1 / -1;
            }

            /* PHOTO UPLOAD */
            .photo-section {
                margin: 2rem 0;
            }

            .photo-section h3 {
                font-size: 1.1rem;
                margin-bottom: 1rem;
            }

            .photo-upload-area {
                border: 2px dashed rgba(232, 93, 32, 0.5);
                border-radius: 8px;
                padding: 2rem;
                text-align: center;
                cursor: pointer;
                transition: all 0.3s ease;
                background: rgba(232, 93, 32, 0.05);
            }

            .photo-upload-area:hover {
                border-color: var(--orange);
                background: rgba(232, 93, 32, 0.1);
            }

            .photo-upload-area.dragover {
                border-color: var(--orange);
                background: rgba(232, 93, 32, 0.15);
            }

            .photo-upload-area p {
                color: var(--muted-dark);
                margin-bottom: 0.5rem;
            }

            .photo-preview-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                gap: 1rem;
                margin-top: 1rem;
            }

            .photo-preview {
                position: relative;
                width: 100px;
                height: 100px;
                border-radius: 8px;
                overflow: hidden;
            }

            .photo-preview img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .photo-remove {
                position: absolute;
                top: -5px;
                right: -5px;
                background: var(--red);
                color: var(--white);
                border: none;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                cursor: pointer;
                display: none;
                align-items: center;
                justify-content: center;
            }

            .photo-preview:hover .photo-remove {
                display: flex;
            }

            .photo-counter {
                margin-top: 1rem;
                font-size: 0.9rem;
                color: var(--muted-dark);
            }

            .photo-counter.valid {
                color: #10b981;
            }

            /* MESSAGES */
            .message {
                padding: 1rem;
                border-radius: 6px;
                margin-bottom: 1rem;
                display: none;
            }

            .message.show {
                display: block;
            }

            .message.success {
                background: rgba(16, 185, 129, 0.1);
                border: 1px solid #10b981;
                color: #10b981;
            }

            .message.error {
                background: rgba(239, 68, 68, 0.1);
                border: 1px solid var(--red);
                color: var(--red);
            }

            /* SUBMIT BUTTON */
            .submit-btn {
                width: 100%;
                background: var(--orange);
                color: var(--black);
                border: none;
                padding: 1rem;
                border-radius: 6px;
                font-weight: 600;
                font-size: 1rem;
                cursor: pointer;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                transition: all 0.3s ease;
                font-family: 'DM Sans', sans-serif;
            }

            .submit-btn:hover:not(:disabled) {
                background: var(--orange-light);
                transform: scale(1.02);
            }

            .submit-btn:disabled {
                background: var(--muted-dark);
                cursor: not-allowed;
                opacity: 0.7;
            }

            /* RESPONSIVE */
            @media (max-width: 768px) {
                .club-hero {
                    grid-template-columns: 1fr;
                }

                .form-grid {
                    grid-template-columns: 1fr;
                }

                .club-hero h1 {
                    font-size: 1.8rem;
                }
            }
        </style>

        <!-- CLUB INFO -->
        <div id="clubInfoSection" class="club-hero">
            <div>
                <h1 id="clubName">Cargando...</h1>
                <p id="clubDescription"></p>
                <div class="club-hero-info">
                    <div class="info-item">
                        <div class="info-label">Miembros</div>
                        <div class="info-value" id="clubMembers">0</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Fundado</div>
                        <div class="info-value" id="clubYear">2024</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Rutas/Mes</div>
                        <div class="info-value" id="clubRides">0</div>
                    </div>
                </div>
            </div>
            <div class="club-logo" id="clubLogoContainer">
                <span style="font-size: 4rem; font-weight: bold;" id="clubInitials">--</span>
            </div>
        </div>

        <!-- REGISTRATION FORM -->
        <div class="registration-section">
            <h2>Registrate como Miembro</h2>

            <div id="successMessage" class="message success"></div>
            <div id="errorMessage" class="message error"></div>

            <form id="registrationForm" onsubmit="handleSubmit(event)">
                <!-- PERSONAL INFO -->
                <div style="margin-bottom: 2rem;">
                    <h3 style="font-size: 1.1rem; margin-bottom: 1rem;">Información Personal</h3>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Nombre Completo *</label>
                            <input type="text" name="fullname" required>
                        </div>
                        <div class="form-group">
                            <label>Email *</label>
                            <input type="email" name="email" required>
                        </div>
                        <div class="form-group">
                            <label>Teléfono</label>
                            <input type="tel" name="phone">
                        </div>
                        <div class="form-group">
                            <label>WhatsApp</label>
                            <input type="tel" name="whatsapp">
                        </div>
                        <div class="form-group">
                            <label>Ciudad</label>
                            <input type="text" name="city">
                        </div>
                    </div>
                </div>

                <!-- MOTORCYCLE INFO -->
                <div style="margin-bottom: 2rem;">
                    <h3 style="font-size: 1.1rem; margin-bottom: 1rem;">Mi Motocicleta</h3>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Marca *</label>
                            <input type="text" name="moto_brand" required>
                        </div>
                        <div class="form-group">
                            <label>Modelo</label>
                            <input type="text" name="moto_model">
                        </div>
                        <div class="form-group">
                            <label>Año</label>
                            <input type="number" name="moto_year" min="1900" max="2099">
                        </div>
                        <div class="form-group">
                            <label>Color</label>
                            <input type="text" name="moto_color">
                        </div>
                    </div>
                </div>

                <!-- PHOTOS -->
                <div class="photo-section">
                    <h3>Fotos de tu Moto (Mínimo 3) *</h3>
                    <div class="photo-upload-area" id="photoUploadArea">
                        <p>📸 Arrastra tus fotos aquí</p>
                        <p style="font-size: 0.9rem;">o haz click para seleccionar</p>
                        <input type="file" id="photoInput" multiple accept="image/*" style="display: none;">
                    </div>
                    <div class="photo-preview-grid" id="photoPreview"></div>
                    <div class="photo-counter" id="photoCounter">Fotos seleccionadas: 0/∞ (mínimo 3)</div>
                </div>

                <!-- MESSAGE -->
                <div class="form-group full">
                    <label>¿Por qué quieres unirte a este club?</label>
                    <textarea name="message" rows="4" style="resize: vertical;"></textarea>
                </div>

                <!-- SUBMIT -->
                <button type="submit" class="submit-btn">🚀 Unirme al Club</button>
            </form>
        </div>
    </div>

    <script>
        const SUPABASE_URL = '<?php echo SUPABASE_URL; ?>';
        const SUPABASE_KEY = '<?php echo SUPABASE_ANON_KEY; ?>';
        const CLUB_SLUG = '<?php echo $club_slug; ?>';

        let clubData = null;
        let selectedPhotos = [];

        // Load club info
        async function loadClubInfo() {
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/clubs?slug=eq.${CLUB_SLUG}&select=*`, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`
                    }
                });

                if (!response.ok) throw new Error('Failed to load club');
                const clubs = await response.json();
                clubData = clubs[0];

                if (!clubData) {
                    throw new Error('Club not found');
                }

                // Render club info
                document.getElementById('clubName').textContent = clubData.name;
                document.getElementById('clubDescription').textContent = clubData.description || '';
                document.getElementById('clubMembers').textContent = clubData.members_count || 0;
                document.getElementById('clubYear').textContent = clubData.founded_year || '2024';
                document.getElementById('clubRides').textContent = clubData.monthly_rides || 0;
                document.getElementById('clubInitials').textContent = clubData.name.substring(0, 2).toUpperCase();

                if (clubData.logo_url) {
                    document.getElementById('clubLogoContainer').innerHTML = `<img src="${clubData.logo_url}" alt="${clubData.name}">`;
                }
            } catch (error) {
                console.error('Error loading club:', error);
                showError('Error al cargar información del club');
            }
        }

        // Photo upload handling
        const uploadArea = document.getElementById('photoUploadArea');
        const photoInput = document.getElementById('photoInput');

        uploadArea.addEventListener('click', () => photoInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            handlePhotos([...e.dataTransfer.files]);
        });

        photoInput.addEventListener('change', (e) => handlePhotos([...e.target.files]));

        function handlePhotos(files) {
            const imageFiles = files.filter(f => f.type.startsWith('image/'));
            selectedPhotos = [...selectedPhotos, ...imageFiles].slice(0, 10);
            renderPhotoPreviews();
        }

        function renderPhotoPreviews() {
            const preview = document.getElementById('photoPreview');
            const counter = document.getElementById('photoCounter');

            preview.innerHTML = selectedPhotos.map((file, idx) => `
                <div class="photo-preview">
                    <img src="${URL.createObjectURL(file)}" alt="Preview ${idx + 1}">
                    <button class="photo-remove" type="button" onclick="removePhoto(${idx})">×</button>
                </div>
            `).join('');

            const valid = selectedPhotos.length >= 3;
            counter.textContent = `Fotos seleccionadas: ${selectedPhotos.length}/∞ (mínimo 3) ${valid ? '✅' : ''}`;
            counter.classList.toggle('valid', valid);
        }

        function removePhoto(idx) {
            selectedPhotos.splice(idx, 1);
            renderPhotoPreviews();
        }

        // Form submission
        async function handleSubmit(e) {
            e.preventDefault();

            if (selectedPhotos.length < 3) {
                showError('Debes subir mínimo 3 fotos');
                return;
            }

            const submitBtn = document.querySelector('.submit-btn');
            submitBtn.disabled = true;

            try {
                // Upload photos
                const photoUrls = [];
                for (const file of selectedPhotos) {
                    const fileName = `${clubData.id}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.name}`;

                    const formData = new FormData();
                    formData.append('', file);

                    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/club-photos/${fileName}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${SUPABASE_KEY}`
                        },
                        body: file
                    });

                    if (uploadRes.ok) {
                        photoUrls.push(`${SUPABASE_URL}/storage/v1/object/public/club-photos/${fileName}`);
                    }
                }

                // Insert member record
                const formData = new FormData(document.getElementById('registrationForm'));
                const memberData = {
                    club_id: clubData.id,
                    fullname: formData.get('fullname'),
                    email: formData.get('email'),
                    phone: formData.get('phone') || null,
                    whatsapp: formData.get('whatsapp') || null,
                    city: formData.get('city') || null,
                    moto_brand: formData.get('moto_brand'),
                    moto_model: formData.get('moto_model') || null,
                    moto_year: formData.get('moto_year') ? parseInt(formData.get('moto_year')) : null,
                    moto_color: formData.get('moto_color') || null,
                    photo_urls: photoUrls,
                    message: formData.get('message') || null,
                    status: 'pending'
                };

                const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/club_members`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify(memberData)
                });

                if (!insertRes.ok) throw new Error('Failed to save registration');

                showSuccess('¡Te has registrado exitosamente! El líder del club revisará tu solicitud.');
                document.getElementById('registrationForm').reset();
                selectedPhotos = [];
                renderPhotoPreviews();

            } catch (error) {
                console.error('Error submitting form:', error);
                showError('Error al registrarte. Por favor, intenta de nuevo.');
            } finally {
                submitBtn.disabled = false;
            }
        }

        function showSuccess(message) {
            const el = document.getElementById('successMessage');
            el.textContent = message;
            el.classList.add('show');
            setTimeout(() => el.classList.remove('show'), 5000);
        }

        function showError(message) {
            const el = document.getElementById('errorMessage');
            el.textContent = message;
            el.classList.add('show');
            setTimeout(() => el.classList.remove('show'), 5000);
        }

        // Load on page load
        loadClubInfo();
    </script>
    <?php
    return ob_get_clean();
}
