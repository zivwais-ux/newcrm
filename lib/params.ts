import { z } from "zod";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

export function pageParam(params: Record<string, string | string[] | undefined>) {
  const n = Number(param(params, "page") ?? 1);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10_000) : 1;
}

export function uuidList(value: string | undefined, max = 500): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => z.string().uuid().safeParse(s).success)
    .slice(0, max);
}

/** Strips characters that would break PostgREST filter syntax. */
export function searchTerm(value: string | undefined) {
  return (value ?? "").trim().slice(0, 80).replace(/[%,()*\\]/g, " ").trim();
}
