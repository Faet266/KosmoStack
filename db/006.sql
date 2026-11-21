CREATE TABLE quality_snapshots (
  domain TEXT NOT NULL,
  split TEXT NOT NULL,
  digest TEXT NOT NULL,
  dataset_sha256 TEXT NOT NULL,
  schema_json JSONB NOT NULL,
  validation JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (domain, split)
);
CREATE TABLE quality_records (
  domain TEXT NOT NULL, split TEXT NOT NULL,
  id TEXT NOT NULL, table_name TEXT NOT NULL, publication_id TEXT NOT NULL, local_id TEXT NOT NULL,
  data_json JSONB NOT NULL,
  PRIMARY KEY (domain, split, id),
  UNIQUE (domain, split, table_name, publication_id, local_id),
  FOREIGN KEY (domain, split) REFERENCES quality_snapshots(domain, split) ON DELETE CASCADE
);
CREATE TABLE quality_links (
  domain TEXT NOT NULL, split TEXT NOT NULL,
  from_id TEXT NOT NULL, field TEXT NOT NULL, to_id TEXT NOT NULL,
  PRIMARY KEY (domain, split, from_id, field, to_id),
  FOREIGN KEY (domain, split, from_id) REFERENCES quality_records(domain, split, id) ON DELETE CASCADE,
  FOREIGN KEY (domain, split, to_id) REFERENCES quality_records(domain, split, id) ON DELETE CASCADE
);
CREATE TABLE quality_cards (
  domain TEXT NOT NULL, split TEXT NOT NULL, id TEXT NOT NULL, card_json JSONB NOT NULL,
  PRIMARY KEY (domain, split, id),
  FOREIGN KEY (domain, split, id) REFERENCES quality_records(domain, split, id) ON DELETE CASCADE
);
