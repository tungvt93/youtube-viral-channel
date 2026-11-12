import { fetchApi } from "../../../lib/api";
import tableStyles from "../../../components/data-table.module.css";
import styles from "./search.module.css";
import { ackKeywordSearch, createKeywordSearch } from "./actions";

interface KeywordSearchDto {
  id: string;
  query: string;
  marketId: string;
  marketCode: string;
  language: string;
  status: "queued" | "running" | "completed" | "failed";
  videosFound: number | null;
  recommendedVideosFound: number | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
  acknowledgedAt: string | null;
}

interface MarketDto {
  id: string;
  code: string;
  name: string;
  defaultLanguage: string;
  timezone: string;
  enabled: boolean;
}

export default async function SearchPage({ searchParams }: { searchParams: { error?: string } }) {
  const [history, markets] = await Promise.all([
    fetchApi<KeywordSearchDto[]>("/keyword-searches"),
    fetchApi<MarketDto[]>("/markets"),
  ]);

  return (
    <div>
      <h1 className={styles.heading}>Search</h1>

      {searchParams.error === "rate_limited" ? (
        <p className={styles.error}>Too many searches — wait a minute and try again.</p>
      ) : null}

      <div className={styles.panel}>
        <p className={styles.panelTitle}>New search</p>
        <form action={createKeywordSearch} className={styles.createForm}>
          <input type="text" name="query" placeholder="Query" required />
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
          <input type="text" name="language" placeholder="Language (e.g. en)" required />
          <button type="submit">Search</button>
        </form>
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>History</p>
        {history.length > 0 ? (
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Query</th>
                <th>Market</th>
                <th>Status</th>
                <th>Videos found</th>
                <th>Recommended found</th>
                <th>Started</th>
                <th>Error</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{row.query}</td>
                  <td>{row.marketCode}</td>
                  <td>{row.status}</td>
                  <td>{row.videosFound ?? "—"}</td>
                  <td>{row.recommendedVideosFound ?? "—"}</td>
                  <td>{row.createdAt.slice(0, 16).replace("T", " ")}</td>
                  <td>{row.errorMessage ?? "—"}</td>
                  <td>
                    {(row.status === "completed" || row.status === "failed") && row.acknowledgedAt === null ? (
                      <form action={ackKeywordSearch.bind(null, row.id)}>
                        <button type="submit">Dismiss</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={tableStyles.empty}>No searches yet.</p>
        )}
      </div>
    </div>
  );
}
