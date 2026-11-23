CREATE DATABASE IF NOT EXISTS civicai_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE civicai_app;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  permanent_address VARCHAR(255) NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('resident','admin') NOT NULL DEFAULT 'resident',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  description TEXT NOT NULL,
  location_text VARCHAR(255) NOT NULL,
  status ENUM('Submitted','In Review','In Progress','Resolved','Rejected') NOT NULL DEFAULT 'Submitted',
  -- admin-final values (NULL until the admin confirms or overrides)
  category ENUM('Infrastructure','Public Safety','Sanitation','Environment','Public Spaces','Other') NULL,
  priority ENUM('Low','Medium','High','Urgent') NULL,
  -- AI suggestions, kept separate so the override rate can be measured
  ai_status ENUM('pending','running','done','failed') NOT NULL DEFAULT 'pending',
  ai_category ENUM('Infrastructure','Public Safety','Sanitation','Environment','Public Spaces','Other') NULL,
  ai_priority ENUM('Low','Medium','High','Urgent') NULL,
  ai_summary VARCHAR(500) NULL,
  ai_visible_issue VARCHAR(500) NULL,
  ai_consistency ENUM('match','partial','mismatch','unclear') NULL,
  ai_confidence DECIMAL(3,2) NULL,
  ai_reason VARCHAR(500) NULL,
  needs_verification TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX (status), INDEX (user_id)
) ENGINE=InnoDB;

CREATE TABLE report_photos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id INT UNSIGNED NOT NULL,
  file_name CHAR(36) NOT NULL,
  mime VARCHAR(50) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  INDEX (sha256)
) ENGINE=InnoDB;

CREATE TABLE comments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE status_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
