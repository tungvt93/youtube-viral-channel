import { fetchApi } from "../../../lib/api";
import { Card } from "../../../components/card";
import tableStyles from "../../../components/data-table.module.css";
import styles from "./system.module.css";

interface SystemHealthDto {
  status: "ok" | "degraded";
  quotaPercentUsed: number;
  failedCallsToday: number;
  recentJobFailures: number;
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

interface SystemQuotaDto {
  budget: number;
  usedToday: number;
  percentUsed: number;
  band: "ok" | "warn" | "high" | "critical";
  remainingBudget: number;
  projectedEndOfDay: number;
}

interface ApiUsageByEndpointDto {
  endpoint: string;
  totalQuota: number;
}

interface ApiUsageByMarketDto {
  marketId: string | null;
  marketCode: string | null;
  totalQuota: number;
}

interface SystemApiUsageDto {
  byEndpoint: ApiUsageByEndpointDto[];
  byMarket: ApiUsageByMarketDto[];
}

/** System Health page (PRD §16.7, §11.8, §18.2-18.4) — health status, quota banding, and API usage breakdowns, all read-only. */
export default async function SystemPage() {
  const [health, jobs, quota, apiUsage] = await Promise.all([
    fetchApi<SystemHealthDto>("/system/health"),
    fetchApi<JobRunDto[]>("/system/jobs"),
    fetchApi<SystemQuotaDto>("/system/quota"),
    fetchApi<SystemApiUsageDto>("/system/api-usage"),
  ]);

  return (
    <div>
      <h1 className={styles.heading}>System Health</h1>

      <div className={styles.cards}>
        <Card label="Status" value={health.status} />
        <Card label="Quota used today" value={`${health.quotaPercentUsed}%`} />
        <Card label="Failed calls today" value={health.failedCallsToday} />
        <Card label="Recent job failures" value={health.recentJobFailures} />
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Quota budget ({quota.band})</p>
        <div className={styles.cards}>
          <Card label="Budget" value={quota.budget} />
          <Card label="Used today" value={quota.usedToday} />
          <Card label="Percent used" value={`${quota.percentUsed}%`} />
          <Card label="Remaining budget" value={quota.remainingBudget} />
          <Card label="Projected end of day" value={quota.projectedEndOfDay} />
        </div>
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>API usage by endpoint</p>
        {apiUsage.byEndpoint.length > 0 ? (
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Quota used today</th>
              </tr>
            </thead>
            <tbody>
              {apiUsage.byEndpoint.map((row) => (
                <tr key={row.endpoint}>
                  <td>{row.endpoint}</td>
                  <td>{row.totalQuota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={tableStyles.empty}>No API usage recorded today.</p>
        )}
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>API usage by market</p>
        {apiUsage.byMarket.length > 0 ? (
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Market</th>
                <th>Quota used today</th>
              </tr>
            </thead>
            <tbody>
              {apiUsage.byMarket.map((row, index) => (
                <tr key={row.marketId ?? index}>
                  <td>{row.marketCode ?? "—"}</td>
                  <td>{row.totalQuota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={tableStyles.empty}>No API usage recorded today.</p>
        )}
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
