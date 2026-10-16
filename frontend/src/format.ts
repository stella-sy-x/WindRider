/** 83456 -> "1:23.45" */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 10));
  const centis = total % 100;
  const seconds = Math.floor(total / 100) % 60;
  const minutes = Math.floor(total / 6000);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

/** Until the next UTC midnight, when today's course and run change: "7:05:09" */
export function untilTomorrow(): string {
  const now = new Date();
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Six letters or digits (32^6 codes, so a guessed code almost never lands in someone's race) */
export function randomRoomCode(): string {
  // 32 letters: each random byte maps to one without bias
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join("");
}
