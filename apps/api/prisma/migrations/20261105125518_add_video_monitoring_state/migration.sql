-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "last_snapshot_at" TIMESTAMP(3),
ADD COLUMN     "monitoring_state" VARCHAR(20) NOT NULL DEFAULT 'candidate',
ADD COLUMN     "next_snapshot_due_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "videos_monitoring_state_next_snapshot_due_at_idx" ON "videos"("monitoring_state", "next_snapshot_due_at");
