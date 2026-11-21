ALTER TABLE configurations ADD CONSTRAINT configurations_in_publication UNIQUE (id, publication_id);
ALTER TABLE datasets ADD CONSTRAINT datasets_in_publication UNIQUE (id, publication_id);
ALTER TABLE tasks ADD CONSTRAINT tasks_in_publication UNIQUE (id, publication_id);
ALTER TABLE experiments ADD CONSTRAINT experiments_in_publication UNIQUE (id, publication_id);
ALTER TABLE numeric_candidates ADD CONSTRAINT candidates_in_publication UNIQUE (id, publication_id);
ALTER TABLE results ADD CONSTRAINT results_in_publication UNIQUE (id, publication_id);
ALTER TABLE results
  ADD CONSTRAINT result_experiment_same_publication FOREIGN KEY (experiment_id, publication_id) REFERENCES experiments(id, publication_id),
  ADD CONSTRAINT result_config_same_publication FOREIGN KEY (configuration_id, publication_id) REFERENCES configurations(id, publication_id),
  ADD CONSTRAINT result_dataset_same_publication FOREIGN KEY (dataset_id, publication_id) REFERENCES datasets(id, publication_id),
  ADD CONSTRAINT result_task_same_publication FOREIGN KEY (task_id, publication_id) REFERENCES tasks(id, publication_id),
  ADD CONSTRAINT result_candidate_same_publication FOREIGN KEY (candidate_id, publication_id) REFERENCES numeric_candidates(id, publication_id),
  ADD CONSTRAINT result_duplicate_same_publication FOREIGN KEY (duplicate_of, publication_id) REFERENCES results(id, publication_id) DEFERRABLE,
  ADD CONSTRAINT result_source_page FOREIGN KEY (publication_id, source_page) REFERENCES pages(publication_id, page_number) DEFERRABLE;
