CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  role_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  document VARCHAR(20) NOT NULL UNIQUE,
  phone VARCHAR(20) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS institutions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  legal_document VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NULL,
  description TEXT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_institutions_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS addresses (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  institution_id BIGINT UNSIGNED NOT NULL UNIQUE,
  street VARCHAR(150) NOT NULL,
  number VARCHAR(20) NOT NULL,
  neighborhood VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(2) NOT NULL,
  zip_code VARCHAR(10) NOT NULL,
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_addresses_institution FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE IF NOT EXISTS institution_platform_subscriptions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  institution_id BIGINT UNSIGNED NOT NULL UNIQUE,
  monthly_fee_cents INT NOT NULL DEFAULT 29900,
  status ENUM('active', 'inactive', 'overdue') NOT NULL DEFAULT 'active',
  starts_at DATE NOT NULL,
  next_billing_at DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_platform_subscriptions_institution FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE IF NOT EXISTS institution_user (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  institution_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  membership_role ENUM('institution_admin', 'instructor', 'student', 'staff') NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_institution_user (institution_id, user_id),
  CONSTRAINT fk_institution_user_institution FOREIGN KEY (institution_id) REFERENCES institutions(id),
  CONSTRAINT fk_institution_user_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS modalities (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS institution_modality (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  institution_id BIGINT UNSIGNED NOT NULL,
  modality_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_institution_modality (institution_id, modality_id),
  CONSTRAINT fk_institution_modality_institution FOREIGN KEY (institution_id) REFERENCES institutions(id),
  CONSTRAINT fk_institution_modality_modality FOREIGN KEY (modality_id) REFERENCES modalities(id)
);

CREATE TABLE IF NOT EXISTS classes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  institution_id BIGINT UNSIGNED NOT NULL,
  modality_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  capacity INT NOT NULL DEFAULT 20,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_classes_institution FOREIGN KEY (institution_id) REFERENCES institutions(id),
  CONSTRAINT fk_classes_modality FOREIGN KEY (modality_id) REFERENCES modalities(id)
);

CREATE TABLE IF NOT EXISTS class_schedules (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  class_id BIGINT UNSIGNED NOT NULL,
  day_of_week TINYINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room_name VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_class_schedules_class FOREIGN KEY (class_id) REFERENCES classes(id)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  institution_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  modality_id BIGINT UNSIGNED NOT NULL,
  status ENUM('active', 'inactive', 'trial') NOT NULL DEFAULT 'active',
  started_at DATE NOT NULL,
  ended_at DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_enrollments_institution FOREIGN KEY (institution_id) REFERENCES institutions(id),
  CONSTRAINT fk_enrollments_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_enrollments_modality FOREIGN KEY (modality_id) REFERENCES modalities(id)
);

CREATE TABLE IF NOT EXISTS access_plans (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  price_cents INT NOT NULL,
  session_limit INT NULL,
  duration_days INT NOT NULL DEFAULT 30,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_access_passes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  source ENUM('trial', 'payment', 'admin') NOT NULL DEFAULT 'payment',
  status ENUM('active', 'expired', 'cancelled') NOT NULL DEFAULT 'active',
  starts_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  sessions_total INT NULL,
  sessions_used INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_access_passes_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_access_passes_plan FOREIGN KEY (plan_id) REFERENCES access_plans(id)
);

CREATE TABLE IF NOT EXISTS student_trial_uses (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  document VARCHAR(20) NOT NULL UNIQUE,
  student_id BIGINT UNSIGNED NOT NULL,
  access_pass_id BIGINT UNSIGNED NOT NULL,
  started_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_trial_uses_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_trial_uses_pass FOREIGN KEY (access_pass_id) REFERENCES student_access_passes(id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  class_schedule_id BIGINT UNSIGNED NOT NULL,
  booking_date DATE NOT NULL,
  status ENUM('scheduled', 'confirmed', 'cancelled') NOT NULL DEFAULT 'scheduled',
  is_trial TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bookings_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_bookings_schedule FOREIGN KEY (class_schedule_id) REFERENCES class_schedules(id)
);

CREATE TABLE IF NOT EXISTS access_pass_usage (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  access_pass_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_access_usage_pass FOREIGN KEY (access_pass_id) REFERENCES student_access_passes(id),
  CONSTRAINT fk_access_usage_booking FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

CREATE TABLE IF NOT EXISTS payment_simulations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  access_pass_id BIGINT UNSIGNED NULL,
  method ENUM('pix', 'boleto') NOT NULL,
  amount_cents INT NOT NULL,
  status ENUM('pending', 'paid', 'cancelled') NOT NULL DEFAULT 'pending',
  pix_code VARCHAR(255) NULL,
  boleto_code VARCHAR(120) NULL,
  paid_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_simulations_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_payment_simulations_plan FOREIGN KEY (plan_id) REFERENCES access_plans(id),
  CONSTRAINT fk_payment_simulations_pass FOREIGN KEY (access_pass_id) REFERENCES student_access_passes(id)
);

CREATE TABLE IF NOT EXISTS attendance_qr_tokens (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NOT NULL,
  token VARCHAR(100) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  status ENUM('active', 'used', 'expired') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_qr_tokens_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_qr_tokens_booking FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

CREATE TABLE IF NOT EXISTS attendances (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  booking_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  checked_in_at DATETIME NOT NULL,
  status ENUM('present', 'absent') NOT NULL DEFAULT 'present',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attendances_booking FOREIGN KEY (booking_id) REFERENCES bookings(id),
  CONSTRAINT fk_attendances_student FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS student_evaluations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  institution_id BIGINT UNSIGNED NOT NULL,
  evaluator_user_id BIGINT UNSIGNED NOT NULL,
  student_user_id BIGINT UNSIGNED NOT NULL,
  modality_id BIGINT UNSIGNED NOT NULL,
  score DECIMAL(4,2) NOT NULL,
  comment TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_evaluations_institution FOREIGN KEY (institution_id) REFERENCES institutions(id),
  CONSTRAINT fk_student_evaluations_evaluator FOREIGN KEY (evaluator_user_id) REFERENCES users(id),
  CONSTRAINT fk_student_evaluations_student FOREIGN KEY (student_user_id) REFERENCES users(id),
  CONSTRAINT fk_student_evaluations_modality FOREIGN KEY (modality_id) REFERENCES modalities(id)
);

CREATE TABLE IF NOT EXISTS student_progress_snapshots (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  institution_id BIGINT UNSIGNED NOT NULL,
  student_user_id BIGINT UNSIGNED NOT NULL,
  reference_month DATE NOT NULL,
  average_score DECIMAL(4,2) NOT NULL DEFAULT 0,
  attendance_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  risk_level ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'low',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_progress_institution FOREIGN KEY (institution_id) REFERENCES institutions(id),
  CONSTRAINT fk_student_progress_student FOREIGN KEY (student_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  email VARCHAR(150) PRIMARY KEY,
  token VARCHAR(100) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_name VARCHAR(100) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  payload_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
);
