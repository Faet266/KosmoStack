ALTER TABLE publications ADD COLUMN analysis_note TEXT;

CREATE TABLE legacy_imports (
  source TEXT PRIMARY KEY,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rag_passages (
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  body TEXT NOT NULL,
  search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', body)) STORED,
  PRIMARY KEY (page_id, position)
);
CREATE INDEX rag_passages_search ON rag_passages USING GIN (search_vector);
ALTER TABLE results ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
  to_tsvector('simple', coalesce(metric_name, '') || ' ' || coalesce(raw_value, '') || ' ' || coalesce(source_fragment, ''))
) STORED;
CREATE INDEX results_search ON results USING GIN (search_vector);

CREATE FUNCTION refresh_rag_passages() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.text_content = OLD.text_content THEN RETURN NEW; END IF;
    DELETE FROM rag_passages WHERE page_id = NEW.id;
  END IF;
  IF length(btrim(NEW.text_content)) = 0 THEN RETURN NEW; END IF;
  INSERT INTO rag_passages (page_id, position, body)
  SELECT NEW.id, start_word, array_to_string(words[start_word:start_word + 79], ' ')
  FROM (SELECT regexp_split_to_array(btrim(NEW.text_content), '\s+') AS words) AS source,
       LATERAL generate_series(1, greatest(cardinality(words) - 20, 1), 60) AS start_word;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pages_refresh_rag_passages
AFTER INSERT OR UPDATE OF text_content ON pages
FOR EACH ROW EXECUTE FUNCTION refresh_rag_passages();
