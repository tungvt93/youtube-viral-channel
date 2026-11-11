"use client";

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <p>Something went wrong loading this page: {error.message}</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
