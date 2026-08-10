-- Secure accessor for Supabase Vault secrets from edge functions.
-- PostgREST does not expose the `vault` schema directly, so edge functions
-- (running as service_role) call this public wrapper instead.
--
-- NOTE: this only creates the accessor function. The actual secret must be
-- stored separately and is NOT part of this migration:
--   select vault.create_secret('<voyage-api-key>', 'voyage_api_key', 'Voyage AI embeddings API key for Rita RAG pipeline');
create or replace function public.get_vault_secret(secret_name text)
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1;
$$;

revoke all on function public.get_vault_secret(text) from public, anon, authenticated;
grant execute on function public.get_vault_secret(text) to service_role;

-- match_ridera_content's original default match_threshold (0.72) was
-- calibrated without real embedding data and excluded every real result:
-- Voyage cosine similarity for genuinely relevant matches on this dataset
-- lands around 0.35-0.6, not the 0.7+ range that threshold assumed.
create or replace function public.match_ridera_content(query_embedding vector, match_count integer DEFAULT 5, match_threshold double precision DEFAULT 0.3)
 returns table(id bigint, url text, titulo text, categoria text, chunk_text text, similarity double precision)
 language sql
 stable
as $function$
  select
    id, url, titulo, categoria, chunk_text,
    1 - (embedding <=> query_embedding) as similarity
  from ridera_content
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$function$;
