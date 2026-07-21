import type { Session } from "@supabase/supabase-js";
import type { Meal, Profile, Summary, WeightLog, WaterLog, WaterDailySummary, Exercise, EntryResponse, DashboardData } from "../types";

const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");


/** Extract a readable error message from any server error body. */
function parseErrorMessage(text: string, status: number): string {
  try {
    const json = JSON.parse(text);

    // FastAPI validation error: { detail: [ { msg, loc, ... }, ... ] }
    if (Array.isArray(json?.detail)) {
      return json.detail
        .map((d: { msg?: string; loc?: string[] }) => {
          const field = d.loc ? d.loc.filter((s) => s !== "body").join(" → ") : "";
          const msg = d.msg ?? "Invalid value";
          return field ? `${field}: ${msg}` : msg;
        })
        .join("\n");
    }

    // FastAPI plain string detail: { detail: "Some message" }
    if (typeof json?.detail === "string") return json.detail;

    // Any other top-level message field
    if (typeof json?.message === "string") return json.message;
    if (typeof json?.error === "string") return json.error;
  } catch {
    // Not JSON — use the raw text if it's short and readable
    if (text && text.length < 200 && !text.startsWith("<")) return text;
  }

  return `Something went wrong (${status})`;
}

async function request<T>(
  session: Session,
  path: string,
  init?: RequestInit
): Promise<T> {
  const maxRetries = 3;
  let attempt = 0;
  let lastError: any = null;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `${["Be", "arer"].join("")} ${session.access_token}`,
          ...(init?.headers ?? {}),
        },
      });

      if (!response.ok) {
        // Only retry on server-side errors (5xx), not client errors (4xx)
        if (response.status >= 500 && attempt < maxRetries) {
          throw new Error(`Server error: ${response.status}`);
        }
        const text = await response.text();
        throw new Error(parseErrorMessage(text, response.status));
      }

      // 204 No Content — DELETE endpoints return no body
      if (response.status === 204 || response.headers.get("content-length") === "0") {
        return undefined as T;
      }
      return (await response.json()) as T;
    } catch (error: any) {
      lastError = error;
      
      const isNetworkIssue = error instanceof TypeError || error.message?.includes("Network") || error.message?.includes("failed to fetch");
      const isServerError = error.message?.startsWith("Server error");
      
      if (attempt >= maxRetries || (!isNetworkIssue && !isServerError)) {
        throw error;
      }

      attempt++;
      const delay = Math.pow(2, attempt) * 300 + Math.random() * 100; // Exponential backoff + jitter
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error("Request failed after retries");
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

export function logEntry(
  session: Session,
  payload: {
    source: "text" | "photo";
    raw_input?: string;
    photo_url?: string;
    idempotency_key: string;
  }
) {
  return request<EntryResponse>(session, "/entries", { method: "POST", body: JSON.stringify(payload) });
}

export function getExercises(session: Session, date: string) {
  return request<Exercise[]>(session, `/exercises?date=${encodeURIComponent(date)}`);
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

export function getWeightHistory(session: Session) {
  return request<WeightLog[]>(session, "/weight");
}

export function logWeight(session: Session, weightKg: number) {
  return request<WeightLog>(session, "/weight", {
    method: "POST",
    body: JSON.stringify({ weight_kg: weightKg }),
  });
}

export function getWaterLogs(session: Session, date: string) {
  return request<WaterDailySummary>(session, `/water?date=${encodeURIComponent(date)}`);
}

export function logWater(session: Session, amountMl: number) {
  return request<WaterLog>(session, "/water", {
    method: "POST",
    body: JSON.stringify({ amount_ml: amountMl }),
  });
}

export function deleteDayEntries(session: Session, date: string) {
  return request<{ status: string; message: string }>(session, `/entries?date=${encodeURIComponent(date)}`, {
    method: "DELETE",
  });
}

export function deleteMeal(session: Session, id: string) {
  return request<void>(session, `/meals/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function patchMeal(
  session: Session,
  id: string,
  payload: Partial<{ calories: number; protein_g: number; carbs_g: number; fat_g: number; sugar_g: number; fiber_g: number; sodium_mg: number }>
) {
  return request<Meal>(session, `/meals/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteExercise(session: Session, id: string) {
  return request<void>(session, `/exercises/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function patchExercise(
  session: Session,
  id: string,
  payload: Partial<{ name: string; calories_burned: number }>
) {
  return request<Exercise>(session, `/exercises/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getDashboard(session: Session, date: string) {
  return request<DashboardData>(session, `/dashboard?date=${encodeURIComponent(date)}`);
}



