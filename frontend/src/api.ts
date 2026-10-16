import type { GhostData, GhostRun } from "./game/ghost";

export interface User {
  id: string;
  name: string;
  verified: boolean; // logged in through the VIScon portal
  has_played?: boolean; // ever finished a race or time trial (this login, or this browser for guests)
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  time_ms: number;
  is_me: boolean;
}

export interface RunResult {
  rank: number;
  personal_best_ms: number;
  leaderboard: LeaderboardEntry[];
}

export interface RoomPlayer {
  id: string;
  name: string;
  color: string;
  racing: boolean;
  finish_ms: number | null;
}

export interface RaceResult {
  id: string;
  name: string;
  color: string;
  time_ms: number;
}

export type RoomPhase = "lobby" | "countdown" | "racing";

export interface RoomInfo {
  type: "room";
  code: string;
  seed: number;
  phase: RoomPhase;
  start_at: number | null;
  race_id: number;
  /** The pilot who can restart a running race: the first one in, passed on when they leave */
  host: string | null;
  players: RoomPlayer[];
  results: RaceResult[];
  server_time: number;
}

/** Positions of everyone in the room: [id, x, y, z, qx, qy, qz, qw, speed, gates passed, t, boost, brake, dodge] */
export interface Snapshot {
  type: "snap";
  t: number;
  players: [string, number, number, number, number, number, number, number, number, number, number, number?, number?, number?][];
}

export interface Joined {
  id: string;
  token: string;
  room: RoomInfo;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** No answer within this long counts as a failed request (status 0) */
const REQUEST_TIMEOUT_MS = 10_000;

/** What to tell the player when the server's answer carries no message of its own */
const STATUS_MESSAGES: Record<number, string> = {
  422: "Invalid request",
  500: "Server error",
  502: "Server unavailable",
  503: "Server unavailable",
  504: "Server unavailable",
};

export async function request<T>(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method,
      headers: { "X-Flight-Rules": "speed-control-v3", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new ApiError(0, "The server took too long to respond");
    }
    throw e; // offline, DNS, CORS…: a plain network error
  }
  if (!response.ok) {
    let message = "";
    try {
      const detail: unknown = (await response.json()).detail;
      if (typeof detail === "string") message = detail;
      // FastAPI validation errors (422): a list of {loc, msg, type}
      else if (Array.isArray(detail)) {
        message = detail
          .map((item: unknown) => (item as { msg?: unknown } | null)?.msg)
          .filter((msg): msg is string => typeof msg === "string")
          .join("; ");
      }
    } catch {
      // Not JSON
    }
    message ||= STATUS_MESSAGES[response.status] ?? (response.statusText || `Error ${response.status}`);
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

// The browser's own id goes in a header, not the URL, so it stays out of logs and history
export function getMe(clientId: string): Promise<User> {
  return request("/api/me", "GET", undefined, { "X-Client-Id": clientId });
}

export function getLeaderboard(seed: number, clientId: string): Promise<LeaderboardEntry[]> {
  return request(`/api/leaderboard?seed=${seed}`, "GET", undefined, { "X-Client-Id": clientId });
}

export function getGhosts(seed: number, limit = 3): Promise<GhostRun[]> {
  return request(`/api/ghosts?seed=${seed}&limit=${limit}`);
}

export function startRun(seed: number): Promise<{ run_token: string }> {
  return request("/api/runs/start", "POST", { seed });
}

export function finishRun(body: {
  run_token: string;
  time_ms: number;
  client_id: string;
  nickname: string;
  ghost: GhostData;
}): Promise<RunResult> {
  return request("/api/runs/finish", "POST", body);
}
