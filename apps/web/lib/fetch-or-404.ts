import { notFound } from "next/navigation";
import { ApiError, fetchApi } from "./api";

/** Wraps `fetchApi` for a `GET /x/:id` detail page: a 404 from apps/api renders this route's not-found.tsx instead of the generic error boundary. */
export async function fetchApiOr404<T>(path: string): Promise<T> {
  try {
    return await fetchApi<T>(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
