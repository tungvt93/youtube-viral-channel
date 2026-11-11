import * as argon2 from "argon2";
import { Prisma, PrismaClient } from "../../../packages/db/generated/client";

const prisma = new PrismaClient();

/**
 * Seeds the 4 MVP markets ([[0001-mvp-scope-decisions]]: US/UK/DE/FR, not the
 * PRD's US/JP/KR example), 6 seed topics with en/de/fr localized keywords,
 * and one `most_popular` + one `recent_search` DiscoveryQuery per topic per
 * market, per the plan's Scope section. `max_pages_per_run` is kept at 1 to
 * conserve quota during initial real-API testing.
 *
 * "UK" uses ISO 3166-1 alpha-2 code `GB` — `UK` is not a valid YouTube API
 * `regionCode`.
 */

interface MarketSeed {
  code: string;
  name: string;
  defaultLanguage: string;
  timezone: string;
}

const MARKETS: MarketSeed[] = [
  { code: "US", name: "United States", defaultLanguage: "en", timezone: "America/New_York" },
  { code: "GB", name: "United Kingdom", defaultLanguage: "en", timezone: "Europe/London" },
  { code: "DE", name: "Germany", defaultLanguage: "de", timezone: "Europe/Berlin" },
  { code: "FR", name: "France", defaultLanguage: "fr", timezone: "Europe/Paris" },
];

interface TopicSeed {
  slug: string;
  canonicalName: string;
  description: string;
  videoCategoryId: string;
  keywords: { en: string; de: string; fr: string };
}

const TOPICS: TopicSeed[] = [
  {
    slug: "pets",
    canonicalName: "Pets & Animals",
    description: "Funny and heartwarming pet/animal content.",
    videoCategoryId: "15",
    keywords: { en: "funny animals", de: "lustige tiere", fr: "animaux drôles" },
  },
  {
    slug: "cooking",
    canonicalName: "Cooking",
    description: "Quick recipes and cooking tips.",
    videoCategoryId: "26",
    keywords: { en: "quick recipes", de: "schnelle rezepte", fr: "recettes rapides" },
  },
  {
    slug: "diy",
    canonicalName: "DIY",
    description: "Do-it-yourself projects and crafts.",
    videoCategoryId: "26",
    keywords: { en: "diy projects", de: "diy projekte", fr: "projets diy" },
  },
  {
    slug: "gaming",
    canonicalName: "Gaming",
    description: "Gameplay highlights and gaming moments.",
    videoCategoryId: "20",
    keywords: { en: "gaming highlights", de: "gaming höhepunkte", fr: "moments de jeu" },
  },
  {
    slug: "tech",
    canonicalName: "Tech",
    description: "Tech reviews and gadget content.",
    videoCategoryId: "28",
    keywords: { en: "tech review", de: "technik review", fr: "test tech" },
  },
  {
    slug: "comedy",
    canonicalName: "Comedy",
    description: "Comedy sketches and funny moments.",
    videoCategoryId: "23",
    keywords: { en: "funny moments", de: "lustige momente", fr: "moments drôles" },
  },
];

const MAX_PAGES_PER_RUN = 1;
const MOST_POPULAR_FREQUENCY_MINUTES = 360;
const RECENT_SEARCH_FREQUENCY_MINUTES = 60;
const DAILY_QUOTA_BUDGET = 10_000;

function keywordForMarket(topic: TopicSeed, market: MarketSeed): string {
  return topic.keywords[market.defaultLanguage as "en" | "de" | "fr"] ?? topic.keywords.en;
}

interface DiscoveryQuerySeed {
  marketId: string;
  topicId: string;
  query: string;
  language: string;
  strategy: string;
  priority: number;
  enabled: boolean;
  maxPagesPerRun: number;
  frequencyMinutes: number;
  config: Prisma.InputJsonValue;
}

/**
 * `discovery_queries` has no unique constraint on (market, topic, strategy) —
 * schema changes are out of scope this phase (Context: "no schema changes
 * expected") — so re-running the seed looks the row up manually instead of
 * using `upsert`.
 */
async function upsertDiscoveryQuery(seed: DiscoveryQuerySeed): Promise<void> {
  const existing = await prisma.discoveryQuery.findFirst({
    where: { marketId: seed.marketId, topicId: seed.topicId, strategy: seed.strategy },
  });
  if (existing) {
    await prisma.discoveryQuery.update({
      where: { id: existing.id },
      data: { query: seed.query, language: seed.language, maxPagesPerRun: seed.maxPagesPerRun, frequencyMinutes: seed.frequencyMinutes, config: seed.config },
    });
    return;
  }
  await prisma.discoveryQuery.create({ data: seed });
}

/**
 * Idempotent admin user upsert (plan Approach step 1, Decisions 2026-11-06).
 * Skips with a warning — never a default/blank password — when either env
 * var is absent, so an operator who forgets to set them gets a loud signal
 * instead of a silently-unseeded admin account or a weak default credential.
 */
export async function seedAdminUser(db: Pick<PrismaClient, "user">, env: { ADMIN_EMAIL?: string; ADMIN_PASSWORD?: string }): Promise<void> {
  const email = env.ADMIN_EMAIL;
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn("ADMIN_EMAIL and/or ADMIN_PASSWORD not set — skipping admin user seed.");
    return;
  }

  const passwordHash = await argon2.hash(password);
  await db.user.upsert({
    where: { email },
    create: { email, passwordHash, role: "admin" },
    update: { passwordHash },
  });
}

async function main(): Promise<void> {
  await seedAdminUser(prisma, process.env);

  const markets = new Map<string, { id: string; defaultLanguage: string }>();
  for (const market of MARKETS) {
    const row = await prisma.market.upsert({
      where: { code: market.code },
      create: {
        code: market.code,
        name: market.name,
        defaultLanguage: market.defaultLanguage,
        timezone: market.timezone,
        enabled: true,
      },
      update: {
        name: market.name,
        defaultLanguage: market.defaultLanguage,
        timezone: market.timezone,
        enabled: true,
      },
    });
    markets.set(market.code, { id: row.id, defaultLanguage: row.defaultLanguage });
  }

  for (const topic of TOPICS) {
    const topicRow = await prisma.topic.upsert({
      where: { slug: topic.slug },
      create: {
        slug: topic.slug,
        canonicalName: topic.canonicalName,
        description: topic.description,
        status: "active",
        confidence: 1,
        createdBy: "user",
      },
      update: {
        canonicalName: topic.canonicalName,
        description: topic.description,
      },
    });

    for (const language of ["en", "de", "fr"] as const) {
      await prisma.topicLocalization.upsert({
        where: { topicId_language: { topicId: topicRow.id, language } },
        create: {
          topicId: topicRow.id,
          language,
          localizedName: topic.keywords[language],
          seedKeywords: [topic.keywords[language]],
        },
        update: {
          localizedName: topic.keywords[language],
          seedKeywords: [topic.keywords[language]],
        },
      });
    }

    for (const market of MARKETS) {
      const marketRow = markets.get(market.code);
      if (!marketRow) {
        continue;
      }
      const keyword = keywordForMarket(topic, market);

      await upsertDiscoveryQuery({
        marketId: marketRow.id,
        topicId: topicRow.id,
        query: keyword,
        language: marketRow.defaultLanguage,
        strategy: "most_popular",
        priority: 1,
        enabled: true,
        maxPagesPerRun: MAX_PAGES_PER_RUN,
        frequencyMinutes: MOST_POPULAR_FREQUENCY_MINUTES,
        config: { videoCategoryId: topic.videoCategoryId },
      });

      await upsertDiscoveryQuery({
        marketId: marketRow.id,
        topicId: topicRow.id,
        query: keyword,
        language: marketRow.defaultLanguage,
        strategy: "recent_search",
        priority: 1,
        enabled: true,
        maxPagesPerRun: MAX_PAGES_PER_RUN,
        frequencyMinutes: RECENT_SEARCH_FREQUENCY_MINUTES,
        config: {},
      });
    }
  }

  await prisma.appSetting.upsert({
    where: { key: "youtube_daily_quota_budget" },
    create: { key: "youtube_daily_quota_budget", value: DAILY_QUOTA_BUDGET, description: "YouTube Data API v3 daily quota budget (units)." },
    update: {},
  });
}

// Guarded so importing `seedAdminUser` for a unit test doesn't also run the full seed against a real database.
if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
