-- Text search dictionaries can retain non-ASCII case under the default C locale.
-- Fold text with PostgreSQL's Unicode collation before tokenizing.
ALTER TABLE rag_passages DROP COLUMN search_vector;
ALTER TABLE rag_passages ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
  to_tsvector('simple', lower(body COLLATE "pg_c_utf8"))
) STORED;
CREATE INDEX rag_passages_search ON rag_passages USING GIN (search_vector);

ALTER TABLE results DROP COLUMN search_vector;
ALTER TABLE results ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
  to_tsvector('simple', lower((coalesce(metric_name, '') || ' ' || coalesce(raw_value, '') || ' ' || coalesce(source_fragment, '')) COLLATE "pg_c_utf8"))
) STORED;
CREATE INDEX results_search ON results USING GIN (search_vector);
