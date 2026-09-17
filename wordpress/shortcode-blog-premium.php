<?php
/**
 * WPCode Snippet: Dynamic Blog Section "Sala de Máquinas"
 * Shortcode: [wpcode id="XXXX"]
 *
 * Displays hero post, ticker (3 next posts), and featured article.
 * Gets real category counts and reading time.
 * Direct PHP output for WPCode compatibility.
 */

// Hero post (most recent)
$hero_args = array(
    'post_type'      => 'post',
    'posts_per_page' => 1,
    'orderby'        => 'date',
    'order'          => 'DESC'
);

$hero_posts = get_posts( $hero_args );
$hero_post = ! empty( $hero_posts ) ? $hero_posts[0] : null;

// Ticker posts (next 3)
$ticker_args = array(
    'post_type'      => 'post',
    'posts_per_page' => 3,
    'offset'         => 1,
    'orderby'        => 'date',
    'order'          => 'DESC'
);

$ticker_posts = get_posts( $ticker_args );

// Featured article (5th post)
$featured_args = array(
    'post_type'      => 'post',
    'posts_per_page' => 1,
    'offset'         => 4,
    'orderby'        => 'date',
    'order'          => 'DESC'
);

$featured_posts = get_posts( $featured_args );
$featured_post = ! empty( $featured_posts ) ? $featured_posts[0] : null;

// Get real category counts
$categories = get_categories( array(
    'orderby' => 'count',
    'order'   => 'DESC',
    'number'  => 5
) );

// Get total post count
$total_posts_obj = wp_count_posts( 'post' );
$total_posts = $total_posts_obj->publish;

// Category icons mapping
$cat_icons = array(
    'mecanica'   => '⚙️',
    'rutas'      => '🗺️',
    'modelos'    => '🏍️',
    'accesorios' => '🛠️',
    'tuning'     => '💨',
    'historia'   => '📚',
    'tecnologia' => '💻',
    'videos'     => '🎥',
    'noticias'   => '📰',
);

// Helper: Calculate reading time
function get_reading_time( $post ) {
    $content = wp_strip_all_tags( $post->post_content );
    $word_count = str_word_count( $content );
    return ceil( $word_count / 200 );
}
?>

<div class="sala-de-maquinas">

    <!-- Sección Hero -->
    <?php if ( $hero_post ) : ?>
        <section class="hero-section">
            <?php
            $hero_image = get_the_post_thumbnail_url( $hero_post->ID, 'large' );
            if ( $hero_image ) {
                echo '<img src="' . esc_url( $hero_image ) . '" alt="' . esc_attr( $hero_post->post_title ) . '" class="hero-image">';
            }
            ?>
            <div class="hero-content">
                <h1><?php echo esc_html( $hero_post->post_title ); ?></h1>
                <p class="excerpt"><?php echo wp_kses_post( wp_trim_words( $hero_post->post_excerpt ?: $hero_post->post_content, 30 ) ); ?></p>
                <a href="<?php echo esc_url( get_permalink( $hero_post->ID ) ); ?>" class="btn-hero">
                    Leer más →
                </a>
                <span class="reading-time">
                    ⏱️ <?php echo get_reading_time( $hero_post ); ?> min de lectura
                </span>
            </div>
        </section>
    <?php endif; ?>

    <!-- Sección Ticker -->
    <section class="ticker-section">
        <h2>Últimas noticias</h2>
        <div class="ticker-grid">
            <?php foreach ( $ticker_posts as $post ) : ?>
                <article class="ticker-card">
                    <?php
                    $thumb = get_the_post_thumbnail_url( $post->ID, 'medium' );
                    if ( $thumb ) {
                        echo '<img src="' . esc_url( $thumb ) . '" alt="' . esc_attr( $post->post_title ) . '">';
                    }
                    ?>
                    <h3><?php echo esc_html( wp_trim_words( $post->post_title, 8 ) ); ?></h3>
                    <p><?php echo wp_kses_post( wp_trim_words( $post->post_excerpt ?: $post->post_content, 15 ) ); ?></p>
                    <a href="<?php echo esc_url( get_permalink( $post->ID ) ); ?>">Leer →</a>
                </article>
            <?php endforeach; ?>
        </div>
    </section>

    <!-- Sección Categorías -->
    <section class="categories-section">
        <h2>Categorías</h2>
        <div class="categories-grid">
            <?php foreach ( $categories as $cat ) : ?>
                <div class="category-card">
                    <span class="cat-icon">
                        <?php echo isset( $cat_icons[ $cat->slug ] ) ? $cat_icons[ $cat->slug ] : '📌'; ?>
                    </span>
                    <h4><?php echo esc_html( $cat->name ); ?></h4>
                    <p><?php echo absint( $cat->count ); ?> artículos</p>
                    <a href="<?php echo esc_url( get_category_link( $cat->term_id ) ); ?>" class="btn-cat">
                        Ver →
                    </a>
                </div>
            <?php endforeach; ?>
        </div>
    </section>

    <!-- Sección Artículo Destacado -->
    <?php if ( $featured_post ) : ?>
        <section class="featured-section">
            <div class="featured-content">
                <h2>Artículo destacado</h2>
                <h3><?php echo esc_html( $featured_post->post_title ); ?></h3>
                <p class="featured-excerpt">
                    <?php echo wp_kses_post( wp_trim_words( $featured_post->post_excerpt ?: $featured_post->post_content, 40 ) ); ?>
                </p>
                <a href="<?php echo esc_url( get_permalink( $featured_post->ID ) ); ?>" class="btn-featured">
                    Leer artículo completo →
                </a>
                <span class="reading-time">
                    ⏱️ <?php echo get_reading_time( $featured_post ); ?> min de lectura
                </span>
            </div>
        </section>
    <?php endif; ?>

    <!-- Estadísticas -->
    <section class="stats-section">
        <div class="stat">
            <span class="stat-number"><?php echo absint( $total_posts ); ?></span>
            <span class="stat-label">Artículos publicados</span>
        </div>
        <div class="stat">
            <span class="stat-number"><?php echo count( $categories ); ?></span>
            <span class="stat-label">Categorías activas</span>
        </div>
    </section>

</div>

<style>
.sala-de-maquinas {
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Hero Section */
.hero-section {
    position: relative;
    margin-bottom: 50px;
    border-radius: 8px;
    overflow: hidden;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

.hero-image {
    width: 100%;
    height: 400px;
    object-fit: cover;
    opacity: 0.8;
}

.hero-content {
    padding: 40px;
    background: rgba(0,0,0,0.5);
    position: relative;
    z-index: 1;
}

.hero-content h1 {
    font-size: 32px;
    margin: 0 0 20px 0;
    line-height: 1.3;
}

.hero-content .excerpt {
    font-size: 16px;
    margin: 0 0 20px 0;
    opacity: 0.95;
}

.btn-hero {
    display: inline-block;
    padding: 12px 24px;
    background: white;
    color: #667eea;
    text-decoration: none;
    border-radius: 4px;
    font-weight: bold;
    margin-right: 20px;
    transition: transform 0.3s;
}

.btn-hero:hover {
    transform: translateY(-2px);
}

.reading-time {
    display: block;
    margin-top: 20px;
    opacity: 0.9;
    font-size: 14px;
}

/* Ticker Section */
.ticker-section {
    margin-bottom: 50px;
}

.ticker-section h2 {
    font-size: 24px;
    margin-bottom: 30px;
    color: #333;
    border-bottom: 3px solid #667eea;
    padding-bottom: 10px;
}

.ticker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
}

.ticker-card {
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    transition: transform 0.3s, box-shadow 0.3s;
}

.ticker-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.ticker-card img {
    width: 100%;
    height: 200px;
    object-fit: cover;
}

.ticker-card h3 {
    padding: 15px;
    margin: 0;
    font-size: 16px;
    color: #333;
    line-height: 1.4;
}

.ticker-card p {
    padding: 0 15px;
    margin: 0 0 15px 0;
    color: #666;
    font-size: 14px;
    line-height: 1.5;
}

.ticker-card a {
    display: inline-block;
    padding: 0 15px 15px 15px;
    color: #667eea;
    text-decoration: none;
    font-weight: bold;
    transition: color 0.3s;
}

.ticker-card a:hover {
    color: #764ba2;
}

/* Categories Section */
.categories-section {
    margin-bottom: 50px;
}

.categories-section h2 {
    font-size: 24px;
    margin-bottom: 30px;
    color: #333;
    border-bottom: 3px solid #667eea;
    padding-bottom: 10px;
}

.categories-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 15px;
}

.category-card {
    background: white;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    padding: 20px;
    text-align: center;
    transition: all 0.3s;
    cursor: pointer;
}

.category-card:hover {
    border-color: #667eea;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
}

.cat-icon {
    font-size: 28px;
    display: block;
    margin-bottom: 10px;
}

.category-card h4 {
    font-size: 14px;
    margin: 0 0 5px 0;
    color: #333;
}

.category-card p {
    margin: 0 0 15px 0;
    color: #999;
    font-size: 12px;
}

.btn-cat {
    display: inline-block;
    color: #667eea;
    text-decoration: none;
    font-weight: bold;
    font-size: 12px;
    transition: color 0.3s;
}

.btn-cat:hover {
    color: #764ba2;
}

/* Featured Section */
.featured-section {
    margin-bottom: 50px;
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    padding: 40px;
    border-radius: 8px;
    color: white;
}

.featured-section h2 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
    opacity: 0.9;
    margin-bottom: 15px;
}

.featured-section h3 {
    font-size: 28px;
    margin: 0 0 20px 0;
}

.featured-excerpt {
    font-size: 16px;
    line-height: 1.6;
    margin-bottom: 20px;
    opacity: 0.95;
}

.btn-featured {
    display: inline-block;
    padding: 12px 24px;
    background: white;
    color: #f5576c;
    text-decoration: none;
    border-radius: 4px;
    font-weight: bold;
    margin-right: 20px;
    transition: transform 0.3s;
}

.btn-featured:hover {
    transform: translateY(-2px);
}

/* Stats Section */
.stats-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-top: 50px;
}

.stat {
    background: white;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    padding: 30px;
    text-align: center;
}

.stat-number {
    display: block;
    font-size: 36px;
    font-weight: bold;
    color: #667eea;
    margin-bottom: 10px;
}

.stat-label {
    display: block;
    font-size: 14px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 1px;
}

/* Responsive */
@media (max-width: 768px) {
    .hero-content h1 {
        font-size: 24px;
    }

    .featured-section h3 {
        font-size: 20px;
    }

    .ticker-grid {
        grid-template-columns: 1fr;
    }
}
</style>
