export default async (request, context) => {
  // Extract slug from URL path
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const slug = pathParts[pathParts.length - 1]?.replace('.html', '');

  // If no slug or it's the clubes.html listing page, serve normally
  if (!slug || slug === 'clubes' || slug === 'club-template') {
    return context.next();
  }

  // Serve the club template with slug embedded
  const templateResponse = await context.next();
  const html = await templateResponse.text();

  // Inject a script that will load the club data using the slug
  const modifiedHtml = html.replace(
    '</body>',
    `<script>
      // Override the slug loading with the URL path slug
      const urlSlug = '${slug}';
      // The existing loadClub function will use this slug
      console.log('Loading club with slug:', urlSlug);
    </script>
    </body>`
  );

  return new Response(modifiedHtml, {
    status: templateResponse.status,
    statusText: templateResponse.statusText,
    headers: templateResponse.headers,
  });
};

export const config = {
  path: '/supabase/clubes/*.html'
};
