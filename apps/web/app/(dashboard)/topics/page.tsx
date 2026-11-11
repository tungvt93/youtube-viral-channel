import Link from "next/link";
import { fetchApi } from "../../../lib/api";
import tableStyles from "../../../components/data-table.module.css";
import styles from "./topics.module.css";

interface TopicListItemDto {
  id: string;
  slug: string;
  canonicalName: string;
  description: string;
  status: string;
  confidence: number | null;
  latestMarketId: string | null;
  latestMomentumScore: number | null;
  latestLifecycleState: string | null;
  latestWindowEnd: string | null;
}

/** Duplicated from `apps/api/src/topics/topics.service.ts`'s repository comment — these are
 * task-local status values (not a schema enum), same reasoning as `CHANNEL_TIERS` in the
 * channels list page. */
const TOPIC_STATUSES = ["candidate", "active", "merged"];

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: { marketId?: string; status?: string };
}) {
  const params = new URLSearchParams();
  if (searchParams.marketId) params.set("marketId", searchParams.marketId);
  if (searchParams.status) params.set("status", searchParams.status);
  const query = params.toString();

  const topics = await fetchApi<TopicListItemDto[]>(`/topics${query ? `?${query}` : ""}`);

  return (
    <div>
      <h1 className={styles.heading}>Topic Trends</h1>

      <form method="get" className={styles.filters}>
        <input
          type="text"
          name="marketId"
          placeholder="Market ID"
          defaultValue={searchParams.marketId ?? ""}
        />
        <select name="status" defaultValue={searchParams.status ?? ""}>
          <option value="">All statuses</option>
          {TOPIC_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <button type="submit">Filter</button>
      </form>

      {topics.length === 0 ? (
        <p className={tableStyles.empty}>No topics found.</p>
      ) : (
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Confidence</th>
              <th>Momentum</th>
              <th>Lifecycle</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((topic) => (
              <tr key={topic.id}>
                <td>
                  <Link href={`/topics/${topic.id}`}>{topic.canonicalName}</Link>
                </td>
                <td>{topic.status}</td>
                <td>{topic.confidence ?? "—"}</td>
                <td>{topic.latestMomentumScore ?? "—"}</td>
                <td>{topic.latestLifecycleState ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
