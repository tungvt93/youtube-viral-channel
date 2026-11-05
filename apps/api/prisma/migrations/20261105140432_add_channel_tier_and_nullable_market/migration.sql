-- DropForeignKey
ALTER TABLE "discovery_events" DROP CONSTRAINT "discovery_events_market_id_fkey";

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "channel_tier" VARCHAR(20) NOT NULL DEFAULT 'newcomer',
ADD COLUMN     "last_video_discovery_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "discovery_events" ALTER COLUMN "market_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "channels_channel_tier_idx" ON "channels"("channel_tier");

-- AddForeignKey
ALTER TABLE "discovery_events" ADD CONSTRAINT "discovery_events_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
