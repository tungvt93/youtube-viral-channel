import { fetchApi } from "../../../lib/api";
import tableStyles from "../../../components/data-table.module.css";
import styles from "./discovery.module.css";
import { createDiscoveryQuery, triggerDiscoveryRun, updateDiscoveryQueryEnabled } from "./actions";

/** `discovery_queries.strategy` values seeded in `apps/api/prisma/seed.ts` — a plain string column, duplicated here the same way `CHANNEL_TIERS` is duplicated in the channels page. */
const DISCOVERY_STRATEGIES = ["most_popular", "recent_search"];

interface DiscoveryQueryDto {
  id: string;
  marketId: string;
  marketCode: string;
  topicId: string | null;
  query: string;
  language: string;
  strategy: string;
  priority: number;
  maxPagesPerRun: number;
  frequencyMinutes: number;
  enabled: boolean;
  lastRunAt: string | null;
}

interface MarketDto {
  id: string;
  code: string;
  name: string;
  defaultLanguage: string;
  timezone: string;
  enabled: boolean;
}

interface JobRunDto {
  id: string;
  jobName: string;
  queue: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  resultCount: number | null;
  errorMessage: string | null;
}

/** Discovery Sources page (PRD §16.6, FR-DIS-01/FR-DIS-10) — query list with enable/disable + manual run, a create form, and a recent jobs table. */
export default async function DiscoveryPage({ searchParams }: { searchParams: { error?: string } }) {
  const [queries, markets, jobs] = await Promise.all([
    fetchApi<DiscoveryQueryDto[]>("/discovery/queries"),
    fetchApi<MarketDto[]>("/markets"),
    fetchApi<JobRunDto[]>("/discovery/jobs"),
  ]);

  return (
    <div>
      <h1 className={styles.heading}>Discovery Sources</h1>

      {searchParams.error === "rate_limited" ? (
        <p className={styles.error}>Too many manual runs — wait a minute and try again.</p>
      ) : null}

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Queries</p>
        {queries.length > 0 ? (
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Market</th>
                <th>Query</th>
                <th>Strategy</th>
                <th>Priority</th>
                <th>Frequency (min)</th>
                <th>Last run</th>
                <th>Enabled</th>
                <th>Run</th>
              </tr>
            </thead>
            <tbody>
              {queries.map((query) => (
                <tr key={query.id}>
                  <td>{query.marketCode}</td>
                  <td>{query.query}</td>
                  <td>{query.strategy}</td>
                  <td>{query.priority}</td>
                  <td>{query.frequencyMinutes}</td>
                  <td>{query.lastRunAt ? query.lastRunAt.slice(0, 16).replace("T", " ") : "—"}</td>
                  <td>
                    <form action={updateDiscoveryQueryEnabled.bind(null, query.id, !query.enabled)}>
                      <button type="submit">{query.enabled ? "Disable" : "Enable"}</button>
                    </form>
                  </td>
                  <td>
                    <form action={triggerDiscoveryRun.bind(null, query.id)}>
                      <button type="submit">Run now</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={tableStyles.empty}>No discovery queries configured.</p>
        )}
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Create query</p>
        <form action={createDiscoveryQuery} className={styles.createForm}>
          <select name="marketId" required defaultValue="">
            <option value="" disabled>
              Market
            </option>
            {markets.map((market) => (
              <option key={market.id} value={market.id}>
                {market.code}
              </option>
            ))}
          </select>
          <input type="text" name="query" placeholder="Query" required />
          <input type="text" name="topicId" placeholder="Topic ID (optional)" />
          <input type="text" name="language" placeholder="Language (e.g. en)" required />
          <select name="strategy" required defaultValue="">
            <option value="" disabled>
              Strategy
            </option>
            {DISCOVERY_STRATEGIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <input type="number" name="priority" placeholder="Priority" required />
          <input type="number" name="maxPagesPerRun" placeholder="Max pages/run" required />
          <input type="number" name="frequencyMinutes" placeholder="Frequency (min)" required />
          <button type="submit">Create</button>
        </form>
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Recent jobs</p>
        {jobs.length > 0 ? (
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Job</th>
                <th>Queue</th>
                <th>Status</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Results</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.jobName}</td>
                  <td>{job.queue}</td>
                  <td>{job.status}</td>
                  <td>{job.startedAt.slice(0, 16).replace("T", " ")}</td>
                  <td>{job.durationMs !== null ? `${job.durationMs}ms` : "—"}</td>
                  <td>{job.resultCount ?? "—"}</td>
                  <td>{job.errorMessage ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={tableStyles.empty}>No jobs recorded yet.</p>
        )}
      </div>
    </div>
  );
}
