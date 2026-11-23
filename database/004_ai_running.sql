USE civicai_app;
ALTER TABLE reports
  MODIFY ai_status ENUM('pending','running','done','failed') NOT NULL DEFAULT 'pending';
