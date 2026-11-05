-- AlterTable
ALTER TABLE "trend_snapshots" ADD COLUMN     "lifecycle_state" VARCHAR(20) NOT NULL DEFAULT 'candidate',
ADD COLUMN     "score_breakdown" JSONB;

-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
