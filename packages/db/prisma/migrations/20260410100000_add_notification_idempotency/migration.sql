-- AlterTable: add idempotencyKey, subject, body to notifications
ALTER TABLE "notifications" ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "subject" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "body" TEXT NOT NULL DEFAULT '';

-- CreateIndex: unique constraint for idempotency
CREATE UNIQUE INDEX "notifications_idempotency_key_user_id_channel_key" ON "notifications"("idempotency_key", "user_id", "channel");
