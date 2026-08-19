-- Add vector extension for pgvector support
create extension if not exists vector;

-- Create wp_sync_content table to track WordPress content sync status
create table if not exists wp_sync_content (
  wp_id bigint not null,
  type text not null, -- 'post', 'page', 'rutas'
  title text,
  slug text,
  status text default 'publish',
  content text,
  excerpt text,
  featured_image text,
  link text,
  meta jsonb default '{}'::jsonb,
  wp_modified_at timestamp with time zone,
  synced_at timestamp with time zone default now(),
  primary key (wp_id, type)
);

-- Create ridera_content table for chunked content with embeddings
create table if not exists ridera_content (
  id bigserial primary key,
  url text not null,
  titulo text,
  categoria text,
  chunk_text text,
  chunk_index integer,
  embedding vector(1024),
  updated_at timestamp with time zone default now()
);

-- Create index for fast similarity search
create index if not exists ridera_content_embedding_idx on ridera_content using hnsw (embedding vector_cosine_ops);

-- Create RPC function for semantic search
create or replace function match_ridera_content(
  query_embedding vector,
  match_count integer default 5,
  match_threshold double precision default 0.3
)
returns table(
  id bigint,
  url text,
  titulo text,
  categoria text,
  chunk_text text,
  similarity double precision
) as $$
  select
    id, url, titulo, categoria, chunk_text,
    1 - (embedding <=> query_embedding) as similarity
  from ridera_content
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$ language sql stable;
