USE civicai_app;

CREATE TABLE IF NOT EXISTS ai_user_usage (
  day DATE NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  calls INT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
