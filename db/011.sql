ALTER TABLE research_articles ADD COLUMN citation JSONB NOT NULL DEFAULT '{}'::jsonb;
