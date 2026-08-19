<?php
/**
 * WPCode Snippet: Rotating Daily Routes Display
 * Shortcode: [wpcode id="5401"]
 *
 * Displays 3 randomly rotated motorcycle routes daily.
 * Uses WordPress options to persist rotation state.
 * Direct PHP output (no add_shortcode wrapper) for WPCode compatibility.
 */

// Query rutas custom post type
$args = array(
    'post_type'      => 'rutas',
    'posts_per_page' => -1,
    'orderby'        => 'date',
    'order'          => 'DESC'
);

$all_posts = get_posts( $args );

if ( empty( $all_posts ) ) {
    echo '<p>No rutas disponibles en este momento.</p>';
    return;
}

// Calculate rotation index based on date
$hoy = date( 'Y-m-d' );
$ultima_rotacion = get_option( 'ridera_rutas_premium_rotation_date' );

if ( $ultima_rotacion !== $hoy ) {
    // New day, rotate to next set of 3
    $indice_actual = (int) get_option( 'ridera_rutas_premium_rotation_index', 0 );
    $indice_nuevo = ( $indice_actual + 3 ) % count( $all_posts );
    update_option( 'ridera_rutas_premium_rotation_index', $indice_nuevo );
    update_option( 'ridera_rutas_premium_rotation_date', $hoy );
} else {
    $indice_nuevo = (int) get_option( 'ridera_rutas_premium_rotation_index', 0 );
}

// Get the 3 routes to display
$rutas_hoy = array_slice( $all_posts, $indice_nuevo, 3 );
?>

<div class="rutas-rotativas-premium">
    <h2>Rutas Recomendadas Hoy</h2>

    <?php foreach ( $rutas_hoy as $ruta ) : ?>
        <div class="ruta-card">
            <h3><?php echo esc_html( $ruta->post_title ); ?></h3>

            <?php
            // Display ACF fields if available
            if ( function_exists( 'get_field' ) ) {
                $distancia = get_field( 'distancia', $ruta->ID );
                $dificultad = get_field( 'dificultad', $ruta->ID );
                $descripcion = get_field( 'descripcion', $ruta->ID );

                if ( $distancia ) {
                    echo '<p><strong>Distancia:</strong> ' . esc_html( $distancia ) . ' km</p>';
                }
                if ( $dificultad ) {
                    echo '<p><strong>Dificultad:</strong> ' . esc_html( $dificultad ) . '</p>';
                }
                if ( $descripcion ) {
                    echo '<p>' . wp_kses_post( $descripcion ) . '</p>';
                }
            } else {
                // Fallback: show excerpt
                if ( ! empty( $ruta->post_excerpt ) ) {
                    echo '<p>' . wp_kses_post( $ruta->post_excerpt ) . '</p>';
                }
            }
            ?>

            <a href="<?php echo esc_url( get_permalink( $ruta->ID ) ); ?>" class="btn-ruta">
                Ver detalles →
            </a>
        </div>
    <?php endforeach; ?>
</div>

<style>
.rutas-rotativas-premium {
    margin: 20px 0;
    padding: 20px;
    background-color: #f9f9f9;
    border-radius: 8px;
}

.rutas-rotativas-premium h2 {
    text-align: center;
    color: #333;
    margin-bottom: 30px;
    font-size: 28px;
}

.ruta-card {
    background: white;
    padding: 20px;
    margin-bottom: 20px;
    border-left: 4px solid #c41e3a;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    transition: transform 0.3s ease;
}

.ruta-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.ruta-card h3 {
    color: #c41e3a;
    margin-top: 0;
    font-size: 20px;
}

.ruta-card p {
    margin: 10px 0;
    color: #666;
    line-height: 1.6;
}

.btn-ruta {
    display: inline-block;
    margin-top: 15px;
    padding: 10px 20px;
    background-color: #c41e3a;
    color: white;
    text-decoration: none;
    border-radius: 4px;
    font-weight: bold;
    transition: background-color 0.3s ease;
}

.btn-ruta:hover {
    background-color: #a01830;
}
</style>
