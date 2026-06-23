import type { Session } from "@supabase/supabase-js";
import type { Meal, Profile, Summary } from "../types";

const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(
  session: Session,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `${["Be", "arer"].join("")} ${session.access_token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function createMeal(
  session: Session,
  payload: {
    source: "text" | "photo";
    raw_input?: string;
    photo_url?: string;
    idempotency_key: string;
  }
) {
  return request<Meal>(session, "/meals", { method: "POST", body: JSON.stringify(payload) });
}

export function getMeals(session: Session, date: string) {
  return request<Meal[]>(session, `/meals?date=${encodeURIComponent(date)}`);
}

export function getSummary(session: Session, range: "week" | "month") {
  return request<Summary>(session, `/summary?range=${encodeURIComponent(range)}`);
}

export function getGoals(session: Session) {
  return request<Profile>(session, "/goals");
}

export function patchGoals(
  session: Session,
  payload: { daily_calorie_goal?: number; daily_protein_goal_g?: number }
) {
  return request<Profile>(session, "/goals", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
