CREATE TABLE workspace_areas (
  id UUID PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner, name)
);
CREATE TABLE workspace_documents (
  area_id UUID NOT NULL REFERENCES workspace_areas(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  tags TEXT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (area_id, document_id)
);
CREATE INDEX workspace_docs_document ON workspace_documents(document_id);
CREATE TABLE workspace_bookmarks (
  owner TEXT NOT NULL,
  href TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner, href)
);
