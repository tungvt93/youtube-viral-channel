import { fetchApi } from "../../../lib/api";
import tableStyles from "../../../components/data-table.module.css";
import styles from "./settings.module.css";
import { updateMarketEnabled } from "./actions";

interface MarketDto {
  id: string;
  code: string;
  name: string;
  defaultLanguage: string;
  timezone: string;
  enabled: boolean;
}

/** Settings page (PRD §16.2, FR-MKT-02) — market list with an enable/disable toggle only; no market-health UI (plan Scope does not mention `GET /markets/:id/health`, see plan Decisions). */
export default async function SettingsPage() {
  const markets = await fetchApi<MarketDto[]>("/markets");

  return (
    <div>
      <h1 className={styles.heading}>Settings</h1>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Markets</p>
        {markets.length > 0 ? (
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Language</th>
                <th>Timezone</th>
                <th>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((market) => (
                <tr key={market.id}>
                  <td>{market.code}</td>
                  <td>{market.name}</td>
                  <td>{market.defaultLanguage}</td>
                  <td>{market.timezone}</td>
                  <td>
                    <form action={updateMarketEnabled.bind(null, market.id, !market.enabled)}>
                      <button type="submit">{market.enabled ? "Disable" : "Enable"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={tableStyles.empty}>No markets configured.</p>
        )}
      </div>
    </div>
  );
}
