USE civicai_app;
ALTER TABLE users ADD COLUMN permanent_address VARCHAR(255) NULL AFTER name;
