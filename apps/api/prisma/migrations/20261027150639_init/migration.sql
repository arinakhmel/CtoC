-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email_confirmed_at" DATETIME,
    "student_verified_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_role_check" CHECK ("role" IN ('student', 'customer', 'moderator')),
    CONSTRAINT "users_display_name_len_check" CHECK (length("display_name") BETWEEN 2 AND 60),
    CONSTRAINT "users_verified_only_students_check" CHECK ("student_verified_at" IS NULL OR "role" = 'student')
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "used_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "email_tokens_purpose_check" CHECK ("purpose" IN ('confirm_email', 'reset_password'))
);

-- CreateTable
CREATE TABLE "university_domains" (
    "domain" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "bio" TEXT NOT NULL DEFAULT '',
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "student_profiles_bio_len_check" CHECK (length("bio") <= 500)
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "in_catalog" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "skills_name_len_check" CHECK (length("name") BETWEEN 1 AND 40)
);

-- CreateTable
CREATE TABLE "profile_skills" (
    "user_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,

    PRIMARY KEY ("user_id", "skill_id"),
    CONSTRAINT "profile_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "profile_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" DATETIME,
    CONSTRAINT "files_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "files_kind_check" CHECK ("kind" IN ('student_document', 'result')),
    CONSTRAINT "files_size_check" CHECK ("size_bytes" > 0)
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "decided_by" TEXT,
    "decided_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "verification_requests_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "verification_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "verification_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'revoked')),
    CONSTRAINT "verification_requests_reason_check" CHECK ("status" <> 'rejected' OR length("reason") BETWEEN 1 AND 500)
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price_kopecks" INTEGER NOT NULL,
    "deadline_at" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "commission_bp" INTEGER,
    "commission_kopecks" INTEGER,
    "net_kopecks" INTEGER,
    "executor_id" TEXT,
    "moderation_reason" TEXT,
    "published_at" DATETIME,
    "assigned_at" DATETIME,
    "completed_at" DATETIME,
    "cancelled_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tasks_executor_id_fkey" FOREIGN KEY ("executor_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tasks_status_check" CHECK ("status" IN ('pending_moderation', 'published', 'rejected', 'in_progress', 'in_review', 'revision', 'done', 'cancelled')),
    CONSTRAINT "tasks_title_len_check" CHECK (length("title") BETWEEN 5 AND 120),
    CONSTRAINT "tasks_description_len_check" CHECK (length("description") BETWEEN 1 AND 5000),
    CONSTRAINT "tasks_price_positive_check" CHECK ("price_kopecks" > 0),
    CONSTRAINT "tasks_commission_sum_check" CHECK ("commission_kopecks" IS NULL OR "net_kopecks" IS NULL OR "commission_kopecks" + "net_kopecks" = "price_kopecks"),
    CONSTRAINT "tasks_executor_required_check" CHECK ("status" NOT IN ('in_progress', 'in_review', 'revision', 'done') OR "executor_id" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" DATETIME,
    CONSTRAINT "applications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "applications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "applications_status_check" CHECK ("status" IN ('sent', 'accepted', 'rejected')),
    CONSTRAINT "applications_note_len_check" CHECK ("note" IS NULL OR length("note") <= 500)
);

-- CreateTable
CREATE TABLE "result_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "revision_comment" TEXT,
    "submitted_at" DATETIME,
    "decided_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "result_versions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "result_versions_status_check" CHECK ("status" IN ('draft', 'submitted', 'accepted', 'returned')),
    CONSTRAINT "result_versions_version_check" CHECK ("version" >= 1),
    CONSTRAINT "result_versions_comment_check" CHECK ("status" <> 'returned' OR length("revision_comment") BETWEEN 1 AND 2000)
);

-- CreateTable
CREATE TABLE "result_files" (
    "result_version_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,

    PRIMARY KEY ("result_version_id", "file_id"),
    CONSTRAINT "result_files_result_version_id_fkey" FOREIGN KEY ("result_version_id") REFERENCES "result_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "result_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "messages_body_len_check" CHECK (length("body") BETWEEN 1 AND 2000)
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "read_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notifications_type_check" CHECK ("type" IN ('executor_selected', 'result_accepted', 'verification_rejected', 'verification_approved', 'application_received', 'result_submitted', 'result_returned', 'task_published', 'task_rejected', 'withdrawal_processed'))
);

-- CreateTable
CREATE TABLE "escrows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "amount_kopecks" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" DATETIME,
    CONSTRAINT "escrows_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "escrows_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "escrows_amount_check" CHECK ("amount_kopecks" > 0),
    CONSTRAINT "escrows_status_check" CHECK ("status" IN ('held', 'released', 'refunded'))
);

-- CreateTable
CREATE TABLE "balances" (
    "owner_id" TEXT NOT NULL PRIMARY KEY,
    "available_kopecks" INTEGER NOT NULL DEFAULT 0,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "balances_non_negative_check" CHECK ("available_kopecks" >= 0)
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_kopecks" INTEGER NOT NULL,
    "task_id" TEXT,
    "withdrawal_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledger_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ledger_entries_withdrawal_id_fkey" FOREIGN KEY ("withdrawal_id") REFERENCES "withdrawals" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ledger_entries_kind_check" CHECK ("kind" IN ('topup', 'hold', 'refund', 'payout', 'commission', 'withdrawal', 'withdrawal_reversal')),
    CONSTRAINT "ledger_entries_amount_check" CHECK ("amount_kopecks" <> 0)
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "student_id" TEXT NOT NULL,
    "amount_kopecks" INTEGER NOT NULL,
    "card_number" TEXT,
    "card_last4" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "processed_by" TEXT,
    "processed_at" DATETIME,
    "reason" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "withdrawals_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "withdrawals_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "withdrawals_amount_check" CHECK ("amount_kopecks" > 0),
    CONSTRAINT "withdrawals_status_check" CHECK ("status" IN ('requested', 'paid', 'rejected')),
    CONSTRAINT "withdrawals_last4_check" CHECK (length("card_last4") = 4),
    CONSTRAINT "withdrawals_card_retention_check" CHECK ("status" = 'requested' OR "card_number" IS NULL)
);

-- CreateTable
CREATE TABLE "experience_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "student_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "completed_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "experience_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "experience_records_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL,
    "updated_by" TEXT,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "settings_key_check" CHECK ("key" IN ('commission_bp', 'min_price_kopecks', 'max_price_kopecks'))
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "data_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_tokens_user_id_purpose_idx" ON "email_tokens"("user_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "files_owner_id_idx" ON "files"("owner_id");

-- CreateIndex
CREATE INDEX "verification_requests_status_created_at_idx" ON "verification_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "tasks_status_published_at_idx" ON "tasks"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "tasks_customer_id_created_at_idx" ON "tasks"("customer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "tasks_executor_id_status_idx" ON "tasks"("executor_id", "status");

-- CreateIndex
CREATE INDEX "applications_student_id_created_at_idx" ON "applications"("student_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "applications_task_id_student_id_key" ON "applications"("task_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_versions_task_id_version_key" ON "result_versions"("task_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "result_files_file_id_key" ON "result_files"("file_id");

-- CreateIndex
CREATE INDEX "messages_task_id_id_idx" ON "messages"("task_id", "id");

-- CreateIndex
CREATE INDEX "notifications_user_id_id_idx" ON "notifications"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "escrows_task_id_key" ON "escrows"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrows_idempotency_key_key" ON "escrows"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_entries_owner_id_created_at_idx" ON "ledger_entries"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "withdrawals_status_created_at_idx" ON "withdrawals"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "experience_records_task_id_key" ON "experience_records"("task_id");

-- CreateIndex
CREATE INDEX "experience_records_student_id_completed_at_idx" ON "experience_records"("student_id", "completed_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_entity_entity_id_idx" ON "audit_events"("entity", "entity_id");

-- ---------------------------------------------------------------------------
-- Hand-written part (Prisma cannot express these; see docs/architecture/data-model.md).
-- CHECK constraints are inside the CREATE TABLE statements above.
-- ---------------------------------------------------------------------------

-- Emails and skills are unique ignoring case (INV-01).
CREATE UNIQUE INDEX "users_email_nocase_key" ON "users"("email" COLLATE NOCASE);
CREATE UNIQUE INDEX "skills_name_nocase_key" ON "skills"("name" COLLATE NOCASE);

-- At most one pending verification request per user (INV-04).
CREATE UNIQUE INDEX "verification_requests_one_pending_key" ON "verification_requests"("user_id") WHERE "status" = 'pending';

-- At most one accepted application per task (INV-10).
CREATE UNIQUE INDEX "applications_one_accepted_key" ON "applications"("task_id") WHERE "status" = 'accepted';

-- At most one open result version per task.
CREATE UNIQUE INDEX "result_versions_one_open_key" ON "result_versions"("task_id") WHERE "status" IN ('draft', 'submitted');

-- One hold, refund, payout and commission entry per task; one entry of each kind per withdrawal (INV-12, INV-19).
CREATE UNIQUE INDEX "ledger_entries_task_kind_key" ON "ledger_entries"("task_id", "kind") WHERE "task_id" IS NOT NULL;
CREATE UNIQUE INDEX "ledger_entries_withdrawal_kind_key" ON "ledger_entries"("withdrawal_id", "kind") WHERE "withdrawal_id" IS NOT NULL;

-- Fast lookup of unread notifications.
CREATE INDEX "notifications_unread_idx" ON "notifications"("user_id") WHERE "read_at" IS NULL;
