<?php
/**
 * Ridera Clubes - WordPress Integration
 *
 * Integra el sistema de clubes Supabase con WordPress
 * Proporciona shortcodes y CPT para mostrar clubes
 *
 * Usar en: functions.php o como plugin
 *
 * Shortcodes:
 * [ridera_clubes] - Muestra listado de clubes
 * [ridera_club slug="touring-bikers-colombia"] - Muestra club específico
 */

// Configuración Supabase
define('RIDERA_SUPABASE_URL', 'https://vzzxsdtsaahhzyctvmhx.supabase.co');
define('RIDERA_SUPABASE_KEY', 'sb_publishable_r1ImtuUXs1zM02OgwserGQ_F7R26Niu');

// ============================================================================
// 1. REGISTRAR CPT (Custom Post Type)
// ============================================================================

add_action('init', function() {
    register_post_type('ridera_club', array(
        'label' => 'Clubes Ridera',
        'public' => true,
        'publicly_queryable' => true,
        'show_ui' => true,
        'show_in_menu' => true,
        'query_var' => true,
        'rewrite' => array('slug' => 'clubes'),
        'capability_type' => 'post',
        'has_archive' => true,
        'hierarchical' => false,
        'menu_position' => 20,
        'menu_icon' => 'dashicons-admin-customizer',
        'supports' => array('title', 'editor', 'thumbnail', 'custom-fields'),
        'show_in_rest' => true,
    ));

    // Registrar taxonomía para categorías
    register_taxonomy('club_category', 'ridera_club', array(
        'label' => 'Categoría de Club',
        'public' => true,
        'hierarchical' => true,
        'show_ui' => true,
        'show_in_rest' => true,
    ));

    // Registrar taxonomía para regiones
    register_taxonomy('club_region', 'ridera_club', array(
        'label' => 'Región',
        'public' => true,
        'hierarchical' => true,
        'show_ui' => true,
        'show_in_rest' => true,
    ));
});

// ============================================================================
// 2. META BOXES PARA INFORMACIÓN DEL CLUB
// ============================================================================

add_action('add_meta_boxes', function() {
    add_meta_box(
        'club_info',
        'Información del Club',
        'ridera_club_meta_callback',
        'ridera_club',
        'normal',
        'high'
    );
});

function ridera_club_meta_callback($post) {
    $meta = get_post_meta($post->ID, '_club_data', true);
    $meta = wp_parse_args($meta, array(
        'city' => '',
        'state' => '',
        'leader_name' => '',
        'leader_email' => '',
        'leader_phone' => '',
        'whatsapp' => '',
        'facebook_url' => '',
        'instagram_url' => '',
        'twitter_url' => '',
        'members_count' => '',
        'routes_completed' => '',
        'founded_year' => date('Y'),
        'motorcycle_brands' => '',
        'route_types' => '',
        'philosophy' => '',
        'frequency' => '',
    ));

    wp_nonce_field('save_club_meta', 'club_meta_nonce');
    ?>
    <style>
        .club-meta-form { display: grid; gap: 15px; }
        .club-meta-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .club-meta-form label { display: block; font-weight: bold; margin-bottom: 5px; }
        .club-meta-form input, .club-meta-form textarea { width: 100%; padding: 8px; }
    </style>

    <div class="club-meta-form">
        <div class="club-meta-row">
            <div>
                <label>Ciudad</label>
                <input type="text" name="club_city" value="<?php echo esc_attr($meta['city']); ?>">
            </div>
            <div>
                <label>Departamento</label>
                <input type="text" name="club_state" value="<?php echo esc_attr($meta['state']); ?>">
            </div>
        </div>

        <div style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 15px;">
            <h4>Información del Líder</h4>
            <div class="club-meta-row">
                <div>
                    <label>Nombre</label>
                    <input type="text" name="club_leader_name" value="<?php echo esc_attr($meta['leader_name']); ?>">
                </div>
                <div>
                    <label>Email</label>
                    <input type="email" name="club_leader_email" value="<?php echo esc_attr($meta['leader_email']); ?>">
                </div>
            </div>
            <div class="club-meta-row">
                <div>
                    <label>Teléfono</label>
                    <input type="tel" name="club_leader_phone" value="<?php echo esc_attr($meta['leader_phone']); ?>">
                </div>
                <div>
                    <label>WhatsApp</label>
                    <input type="tel" name="club_whatsapp" value="<?php echo esc_attr($meta['whatsapp']); ?>">
                </div>
            </div>
        </div>

        <div style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 15px;">
            <h4>Redes Sociales</h4>
            <div class="club-meta-row">
                <div>
                    <label>Facebook</label>
                    <input type="url" name="club_facebook_url" value="<?php echo esc_attr($meta['facebook_url']); ?>" placeholder="https://facebook.com/...">
                </div>
                <div>
                    <label>Instagram</label>
                    <input type="url" name="club_instagram_url" value="<?php echo esc_attr($meta['instagram_url']); ?>" placeholder="https://instagram.com/...">
                </div>
            </div>
            <div>
                <label>Twitter</label>
                <input type="url" name="club_twitter_url" value="<?php echo esc_attr($meta['twitter_url']); ?>" placeholder="https://twitter.com/...">
            </div>
        </div>

        <div style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 15px;">
            <h4>Estadísticas</h4>
            <div class="club-meta-row">
                <div>
                    <label>Miembros</label>
                    <input type="number" name="club_members_count" value="<?php echo esc_attr($meta['members_count']); ?>">
                </div>
                <div>
                    <label>Rutas Completadas</label>
                    <input type="number" name="club_routes_completed" value="<?php echo esc_attr($meta['routes_completed']); ?>">
                </div>
            </div>
            <div>
                <label>Año de Fundación</label>
                <input type="number" name="club_founded_year" value="<?php echo esc_attr($meta['founded_year']); ?>" min="1900" max="<?php echo date('Y'); ?>">
            </div>
        </div>

        <div style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 15px;">
            <h4>Información Adicional</h4>
            <div>
                <label>Filosofía del Club</label>
                <textarea name="club_philosophy" rows="3"><?php echo esc_textarea($meta['philosophy']); ?></textarea>
            </div>
            <div>
                <label>Frecuencia de Rutas (ej: Rutas semanales cada sábado)</label>
                <input type="text" name="club_frequency" value="<?php echo esc_attr($meta['frequency']); ?>">
            </div>
            <div>
                <label>Marcas de Motos (separadas por coma)</label>
                <input type="text" name="club_motorcycle_brands" value="<?php echo esc_attr($meta['motorcycle_brands']); ?>" placeholder="BMW, Harley-Davidson, ...">
            </div>
            <div>
                <label>Tipos de Ruta (separadas por coma)</label>
                <input type="text" name="club_route_types" value="<?php echo esc_attr($meta['route_types']); ?>" placeholder="Carretera, Off-Road, ...">
            </div>
        </div>
    </div>
    <?php
}

// Guardar meta data
add_action('save_post_ridera_club', function($post_id) {
    if (!isset($_POST['club_meta_nonce']) || !wp_verify_nonce($_POST['club_meta_nonce'], 'save_club_meta')) {
        return;
    }

    $club_data = array(
        'city' => sanitize_text_field($_POST['club_city'] ?? ''),
        'state' => sanitize_text_field($_POST['club_state'] ?? ''),
        'leader_name' => sanitize_text_field($_POST['club_leader_name'] ?? ''),
        'leader_email' => sanitize_email($_POST['club_leader_email'] ?? ''),
        'leader_phone' => sanitize_text_field($_POST['club_leader_phone'] ?? ''),
        'whatsapp' => sanitize_text_field($_POST['club_whatsapp'] ?? ''),
        'facebook_url' => esc_url($_POST['club_facebook_url'] ?? ''),
        'instagram_url' => esc_url($_POST['club_instagram_url'] ?? ''),
        'twitter_url' => esc_url($_POST['club_twitter_url'] ?? ''),
        'members_count' => intval($_POST['club_members_count'] ?? 0),
        'routes_completed' => intval($_POST['club_routes_completed'] ?? 0),
        'founded_year' => intval($_POST['club_founded_year'] ?? date('Y')),
        'philosophy' => sanitize_textarea_field($_POST['club_philosophy'] ?? ''),
        'frequency' => sanitize_text_field($_POST['club_frequency'] ?? ''),
        'motorcycle_brands' => sanitize_text_field($_POST['club_motorcycle_brands'] ?? ''),
        'route_types' => sanitize_text_field($_POST['club_route_types'] ?? ''),
    );

    update_post_meta($post_id, '_club_data', $club_data);

    // Sincronizar con Supabase si está disponible
    ridera_sync_club_to_supabase($post_id, $club_data);
});

// ============================================================================
// 3. SINCRONIZACIÓN CON SUPABASE
// ============================================================================

function ridera_sync_club_to_supabase($post_id, $club_data) {
    $post = get_post($post_id);

    if (!$post || $post->post_type !== 'ridera_club') {
        return;
    }

    $slug = sanitize_title($post->post_title);

    $club_payload = array(
        'name' => $post->post_title,
        'slug' => $slug,
        'description' => wp_strip_all_tags($post->post_content),
        'city' => $club_data['city'],
        'state' => $club_data['state'],
        'leader_name' => $club_data['leader_name'],
        'leader_email' => $club_data['leader_email'],
        'leader_phone' => $club_data['leader_phone'],
        'whatsapp' => $club_data['whatsapp'],
        'facebook_url' => $club_data['facebook_url'],
        'instagram_url' => $club_data['instagram_url'],
        'twitter_url' => $club_data['twitter_url'],
        'members_count' => $club_data['members_count'],
        'routes_completed' => $club_data['routes_completed'],
        'founded_year' => $club_data['founded_year'],
        'philosophy' => $club_data['philosophy'],
        'frequency' => $club_data['frequency'],
        'motorcycle_brands' => array_map('trim', explode(',', $club_data['motorcycle_brands'])),
        'route_types' => array_map('trim', explode(',', $club_data['route_types'])),
        'active' => $post->post_status === 'publish',
    );

    // Llamar a Supabase API
    $response = wp_remote_post(
        RIDERA_SUPABASE_URL . '/rest/v1/clubs?upsert=true',
        array(
            'method' => 'POST',
            'headers' => array(
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . RIDERA_SUPABASE_KEY,
                'apikey' => RIDERA_SUPABASE_KEY,
            ),
            'body' => wp_json_encode($club_payload),
        )
    );

    if (is_wp_error($response)) {
        error_log('Error sincronizando club a Supabase: ' . $response->get_error_message());
    }
}

// ============================================================================
// 4. SHORTCODES
// ============================================================================

// Shortcode: [ridera_clubes]
add_shortcode('ridera_clubes', function($atts) {
    ob_start();
    ?>
    <div id="ridera-clubes-container" style="min-height: 400px;">
        <p>Cargando clubes...</p>
    </div>
    <script>
    (function() {
        const container = document.getElementById('ridera-clubes-container');

        // Cargar desde Supabase
        fetch('<?php echo RIDERA_SUPABASE_URL; ?>/rest/v1/clubs?select=*&active=eq.true&order=featured.desc', {
            headers: {
                'apikey': '<?php echo RIDERA_SUPABASE_KEY; ?>',
                'Content-Type': 'application/json',
            }
        })
        .then(r => r.json())
        .then(clubs => {
            if (!clubs.length) {
                container.innerHTML = '<p>No hay clubes registrados.</p>';
                return;
            }

            container.innerHTML = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 2rem;">' +
                clubs.map(club => `
                    <div style="border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; background: #f9f9f9;">
                        <h3>${club.name}</h3>
                        <p style="color: #666; font-size: 0.9em; margin: 0.5em 0;">${club.category}</p>
                        <p style="color: #666; margin: 0.5em 0;">📍 ${club.city}, ${club.state}</p>
                        <p>${club.description}</p>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin: 1rem 0; text-align: center; font-size: 0.9em;">
                            <div><strong>${club.members_count || 0}</strong><br>Miembros</div>
                            <div><strong>${club.routes_completed || 0}</strong><br>Rutas</div>
                            <div><strong>${club.founded_year}</strong><br>Fundado</div>
                        </div>
                        <a href="<?php echo site_url('/clubes/'); ?>${club.slug}" style="display: inline-block; background: #E85D20; color: white; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 4px; margin-top: 1rem;">Ver Club →</a>
                    </div>
                `).join('') +
            '</div>';
        })
        .catch(err => {
            console.error(err);
            container.innerHTML = '<p style="color: red;">Error al cargar clubes.</p>';
        });
    })();
    </script>
    <?php
    return ob_get_clean();
});

// Shortcode: [ridera_club slug="touring-bikers-colombia"]
add_shortcode('ridera_club', function($atts) {
    $atts = shortcode_atts(array('slug' => ''), $atts);

    if (!$atts['slug']) {
        return '<p>Error: especifica el slug del club</p>';
    }

    ob_start();
    ?>
    <div id="ridera-club-container" style="min-height: 400px;">
        <p>Cargando club...</p>
    </div>
    <script>
    (function() {
        const container = document.getElementById('ridera-club-container');
        const slug = '<?php echo esc_js($atts['slug']); ?>';

        fetch('<?php echo RIDERA_SUPABASE_URL; ?>/rest/v1/clubs?slug=eq.' + slug, {
            headers: {
                'apikey': '<?php echo RIDERA_SUPABASE_KEY; ?>',
                'Content-Type': 'application/json',
            }
        })
        .then(r => r.json())
        .then(clubs => {
            if (!clubs.length) {
                container.innerHTML = '<p>Club no encontrado.</p>';
                return;
            }

            const club = clubs[0];
            container.innerHTML = `
                <div style="max-width: 800px; margin: 0 auto;">
                    <h1>${club.name}</h1>
                    <p style="color: #666; font-size: 1.1em;">${club.category} • ${club.city}, ${club.state}</p>
                    <p>${club.description}</p>

                    <div style="background: #f0f0f0; padding: 1.5rem; border-radius: 8px; margin: 2rem 0;">
                        <h3>Estadísticas</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; text-align: center;">
                            <div><strong style="font-size: 1.5em;">${club.members_count || 0}</strong><br>Miembros</div>
                            <div><strong style="font-size: 1.5em;">${club.routes_completed || 0}</strong><br>Rutas</div>
                            <div><strong style="font-size: 1.5em;">${club.founded_year}</strong><br>Fundado</div>
                        </div>
                    </div>

                    ${club.philosophy ? `
                        <div style="background: #f9f9f9; padding: 1.5rem; border-left: 4px solid #E85D20; margin: 1rem 0; border-radius: 4px;">
                            <h4 style="margin-top: 0;">Filosofía</h4>
                            <p>${club.philosophy}</p>
                        </div>
                    ` : ''}

                    ${club.frequency ? `
                        <div style="background: #f9f9f9; padding: 1.5rem; border-left: 4px solid #E85D20; margin: 1rem 0; border-radius: 4px;">
                            <h4 style="margin-top: 0;">Frecuencia</h4>
                            <p>${club.frequency}</p>
                        </div>
                    ` : ''}

                    ${club.leader_name || club.leader_email || club.whatsapp ? `
                        <div style="background: #f0f0f0; padding: 1.5rem; border-radius: 8px; margin: 2rem 0;">
                            <h3>Contacto</h3>
                            ${club.leader_name ? `<p><strong>Líder:</strong> ${club.leader_name}</p>` : ''}
                            ${club.leader_email ? `<p><strong>Email:</strong> <a href="mailto:${club.leader_email}">${club.leader_email}</a></p>` : ''}
                            ${club.leader_phone ? `<p><strong>Teléfono:</strong> ${club.leader_phone}</p>` : ''}
                            ${club.whatsapp ? `<p><a href="https://wa.me/${club.whatsapp.replace(/\\D/g, '')}" style="display: inline-block; background: #25D366; color: white; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 4px; margin-top: 1rem;">💬 WhatsApp</a></p>` : ''}
                        </div>
                    ` : ''}

                    ${club.facebook_url || club.instagram_url || club.twitter_url ? `
                        <div style="margin: 2rem 0;">
                            <h3>Redes Sociales</h3>
                            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                                ${club.facebook_url ? `<a href="${club.facebook_url}" target="_blank" style="padding: 0.5rem 1rem; background: #1877F2; color: white; text-decoration: none; border-radius: 4px;">Facebook</a>` : ''}
                                ${club.instagram_url ? `<a href="${club.instagram_url}" target="_blank" style="padding: 0.5rem 1rem; background: #E1306C; color: white; text-decoration: none; border-radius: 4px;">Instagram</a>` : ''}
                                ${club.twitter_url ? `<a href="${club.twitter_url}" target="_blank" style="padding: 0.5rem 1rem; background: #1DA1F2; color: white; text-decoration: none; border-radius: 4px;">Twitter</a>` : ''}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        })
        .catch(err => {
            console.error(err);
            container.innerHTML = '<p style="color: red;">Error al cargar el club.</p>';
        });
    })();
    </script>
    <?php
    return ob_get_clean();
});

// ============================================================================
// 5. TEMPLATE CUSTOMIZADO PARA CPT
// ============================================================================

add_filter('template_include', function($template) {
    if (is_post_type_archive('ridera_club')) {
        ob_start();
        ?>
        <!DOCTYPE html>
        <html <?php language_attributes(); ?>>
        <head>
            <meta charset="<?php bloginfo('charset'); ?>">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <?php wp_head(); ?>
            <style>
                body { background: #0a0908; color: #f4f1ed; }
                .clubs-container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
                .clubs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 2rem; }
                .club-card { border: 1px solid #E85D20; border-radius: 8px; padding: 1.5rem; background: #1a1712; }
                .club-card:hover { border-color: #f07a3a; box-shadow: 0 0 20px rgba(232, 93, 32, 0.3); }
            </style>
        </head>
        <body>
            <div class="clubs-container">
                <h1>Ridera Clubes</h1>
                <div class="clubs-grid">
                    <?php
                    $args = array('post_type' => 'ridera_club', 'posts_per_page' => -1);
                    $query = new WP_Query($args);

                    while ($query->have_posts()) {
                        $query->the_post();
                        $meta = get_post_meta(get_the_ID(), '_club_data', true);
                        ?>
                        <div class="club-card">
                            <h2><?php the_title(); ?></h2>
                            <p><?php echo $meta['city'] . ', ' . $meta['state']; ?></p>
                            <p><?php the_excerpt(); ?></p>
                            <a href="<?php the_permalink(); ?>">Ver más →</a>
                        </div>
                        <?php
                    }
                    wp_reset_postdata();
                    ?>
                </div>
            </div>
            <?php wp_footer(); ?>
        </body>
        </html>
        <?php
        return null;
    }
    return $template;
});

// ============================================================================
// 6. ADMIN MENU PARA SINCRONIZACIÓN
// ============================================================================

add_action('admin_menu', function() {
    add_submenu_page(
        'edit.php?post_type=ridera_club',
        'Sincronizar con Supabase',
        'Sincronizar',
        'manage_options',
        'ridera-sync-clubs',
        'ridera_sync_admin_page'
    );
});

function ridera_sync_admin_page() {
    ?>
    <div class="wrap">
        <h1>Sincronizar Clubes con Supabase</h1>
        <p>Sincroniza todos los clubes de WordPress con Supabase.</p>

        <button class="button button-primary" id="sync-btn" onclick="syncAllClubs()">
            🔄 Sincronizar Ahora
        </button>
        <div id="sync-status" style="margin-top: 20px;"></div>
    </div>

    <script>
    function syncAllClubs() {
        const btn = document.getElementById('sync-btn');
        const status = document.getElementById('sync-status');

        btn.disabled = true;
        status.innerHTML = '<p>Sincronizando...</p>';

        // Obtener todos los clubes
        const clubs = <?php echo wp_json_encode(array_map(function($post) {
            $meta = get_post_meta($post->ID, '_club_data', true);
            return array(
                'title' => $post->post_title,
                'content' => $post->post_content,
                'meta' => $meta,
                'slug' => $post->post_name,
            );
        }, get_posts(array('post_type' => 'ridera_club', 'posts_per_page' => -1)))); ?>;

        // Sincronizar cada club
        let synced = 0;
        clubs.forEach(club => {
            fetch('<?php echo RIDERA_SUPABASE_URL; ?>/rest/v1/clubs?upsert=true', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer <?php echo RIDERA_SUPABASE_KEY; ?>',
                    'apikey': '<?php echo RIDERA_SUPABASE_KEY; ?>',
                },
                body: JSON.stringify({
                    name: club.title,
                    slug: club.slug,
                    description: club.content,
                    ...club.meta,
                    active: true,
                })
            }).then(() => {
                synced++;
                status.innerHTML = `<p style="color: green;">✅ ${synced}/${clubs.length} clubes sincronizados</p>`;

                if (synced === clubs.length) {
                    btn.disabled = false;
                }
            });
        });
    }
    </script>
    <?php
}
