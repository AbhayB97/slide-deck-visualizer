"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type ListsResponse = {
  success: boolean;
  rouletteUsers: string[];
  highRiskUsers: string[];
  activeUsers?: string[];
  error?: string;
};

type MegaGridProps = {
  standalone?: boolean;
  blobBaseUrl?: string;
};

const FAST_DELAY_MS = 70;
const SLOW_DELAY_MS = 320;
const FAST_PHASE_MS = 3000;
const TOTAL_DRAW_MS = 5600;
const REVEAL_DELAY_MS = 450;

function formatNameForBlob(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getAvatarUrl(name: string, blobBaseUrl: string) {
  const formattedName = formatNameForBlob(name);
  const safeBaseUrl = blobBaseUrl.replace(/\/+$/, "");
  return `${safeBaseUrl}/avatars/${formattedName}.jpg`;
}

function getFallbackAvatarUrl(name: string) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name
  )}&background=random&color=ffffff&size=256&bold=true`;
}

function randomIndex(length: number, exclude?: number | null) {
  if (length <= 0) return -1;
  if (length === 1) return 0;
  let next = exclude ?? -1;
  while (next === exclude) {
    next = Math.floor(Math.random() * length);
  }
  return next;
}

function drawDelayForElapsed(elapsedMs: number) {
  if (elapsedMs <= FAST_PHASE_MS) return FAST_DELAY_MS;
  const progress = Math.min(
    1,
    (elapsedMs - FAST_PHASE_MS) / (TOTAL_DRAW_MS - FAST_PHASE_MS)
  );
  return Math.round(
    FAST_DELAY_MS + (SLOW_DELAY_MS - FAST_DELAY_MS) * progress * progress
  );
}

function buildTitle(standalone: boolean) {
  return standalone ? "Mega-Grid Draw" : "Weekly Draw";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to load lists";
}

export function MegaGrid({
  standalone = false,
  blobBaseUrl = process.env.NEXT_PUBLIC_BLOB_BASE_URL ?? "",
}: MegaGridProps) {
  const [eligibleUsers, setEligibleUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "darting" | "slowing" | "locked">(
    "idle"
  );
  const [imageFallbackMap, setImageFallbackMap] = useState<Record<string, boolean>>(
    {}
  );

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const activeIndexRef = useRef<number | null>(null);

  const winner =
    winnerIndex !== null && winnerIndex >= 0 ? eligibleUsers[winnerIndex] : null;
  const hasBlobBaseUrl = blobBaseUrl.trim().length > 0;

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    mountedRef.current = true;
    void loadEligibleUsers();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  async function loadEligibleUsers() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/current-lists", { signal: controller.signal });
      const json = (await res.json()) as ListsResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load lists");
      }

      const hasHighRiskUsers =
        Array.isArray(json.highRiskUsers) && json.highRiskUsers.length > 0;
      const activeUsers = Array.isArray(json.activeUsers) ? json.activeUsers : [];
      const users = hasHighRiskUsers ? json.rouletteUsers || [] : activeUsers;

      if (!mountedRef.current) return;
      setEligibleUsers(users);
      setImageFallbackMap({});
      setActiveIndex(users.length ? 0 : null);
      setWinnerIndex(null);
      setShowReveal(false);
      setPhase("idle");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (!mountedRef.current) return;
      setEligibleUsers([]);
      setError(getErrorMessage(err));
      setActiveIndex(null);
      setWinnerIndex(null);
      setShowReveal(false);
      setPhase("idle");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }

  function stopTimers() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }

  function startDraw() {
    if (!eligibleUsers.length || isRunning) return;

    stopTimers();
    const nextWinnerIndex = Math.floor(Math.random() * eligibleUsers.length);
    const startTime = performance.now();

    setWinnerIndex(nextWinnerIndex);
    setShowReveal(false);
    setIsRunning(true);
    setPhase("darting");

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const nextIndex =
        elapsed >= TOTAL_DRAW_MS
          ? nextWinnerIndex
          : randomIndex(eligibleUsers.length, activeIndexRef.current);

      setActiveIndex(nextIndex);

      if (elapsed >= FAST_PHASE_MS && elapsed < TOTAL_DRAW_MS) {
        setPhase("slowing");
      }

      if (elapsed >= TOTAL_DRAW_MS) {
        setPhase("locked");
        setIsRunning(false);
        revealTimerRef.current = setTimeout(() => {
          setShowReveal(true);
        }, REVEAL_DELAY_MS);
        return;
      }

      timerRef.current = setTimeout(tick, drawDelayForElapsed(elapsed));
    };

    tick();
  }

  function closeReveal() {
    setShowReveal(false);
    setPhase("idle");
  }

  function cardImageUrl(name: string) {
    if (!hasBlobBaseUrl) return getFallbackAvatarUrl(name);
    const shouldFallback = imageFallbackMap[name];
    return shouldFallback
      ? getFallbackAvatarUrl(name)
      : getAvatarUrl(name, blobBaseUrl);
  }

  function handleImageError(name: string) {
    setImageFallbackMap((current) => {
      if (current[name]) return current;
      return { ...current, [name]: true };
    });
  }

  const wrapperClassName = standalone
    ? "min-h-screen bg-[radial-gradient(circle_at_top,#14324a_0%,#081018_45%,#04070b_100%)] px-4 py-8 md:px-6"
    : "bg-[radial-gradient(circle_at_top,#16324a_0%,#0d1721_48%,#091018_100%)]";
  const shellClassName = standalone
    ? "mx-auto flex w-full max-w-7xl flex-col gap-6"
    : "flex w-full flex-col gap-5 rounded-3xl border border-cyan-400/20 p-5 shadow-[0_20px_80px_rgba(8,145,178,0.2)]";
  const gridClassName = standalone
    ? "grid grid-cols-5 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12"
    : "grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 xl:grid-cols-8";

  return (
    <div className={wrapperClassName}>
      <div className={shellClassName}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/80">
              Draw
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">
              {buildTitle(standalone)}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Every eligible employee is visible at once. The selector darts across
              the full field, slows under tension, and locks onto one winner.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {standalone && (
              <Link
                href="/"
                className="rounded-full border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/10"
              >
                Back to dashboard
              </Link>
            )}
            <button
              type="button"
              onClick={() => void loadEligibleUsers()}
              className="rounded-full border border-slate-500/40 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5"
            >
              Refresh List
            </button>
            <button
              type="button"
              onClick={startDraw}
              disabled={loading || !eligibleUsers.length || isRunning}
              className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-black text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.45)] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {isRunning ? "Drawing..." : "Start Draw"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            Eligible: {eligibleUsers.length}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            Phase: {phase}
          </span>
          {!hasBlobBaseUrl && (
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-200">
              `NEXT_PUBLIC_BLOB_BASE_URL` not set
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        {!loading && !eligibleUsers.length && !error && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            No eligible users are available for the draw.
          </div>
        )}

        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/60 p-3 shadow-[inset_0_0_80px_rgba(34,211,238,0.08)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:22px_22px]" />

          {loading ? (
            <div className="flex min-h-[18rem] items-center justify-center text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">
              Loading eligible employees...
            </div>
          ) : (
            <div className={`relative ${gridClassName}`}>
              {eligibleUsers.map((name, index) => {
                const isActive = index === activeIndex;
                const isWinner = index === winnerIndex && phase === "locked";
                const highlightClass = isWinner
                  ? "ring-4 ring-amber-300 brightness-125 z-20 scale-[1.12] shadow-[0_0_28px_rgba(252,211,77,0.85)]"
                  : isActive
                    ? "ring-4 ring-cyan-300 brightness-125 z-10 scale-110 shadow-[0_0_26px_rgba(34,211,238,0.8)]"
                    : "ring-1 ring-white/10";

                return (
                  <div
                    key={name}
                    className={`group relative aspect-square overflow-hidden rounded-2xl bg-slate-900 transition-all duration-100 ${highlightClass}`}
                    title={name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cardImageUrl(name)}
                      alt={name}
                      onError={() => handleImageError(name)}
                      className="h-full w-full object-cover"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 px-2 pb-2">
                      <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-white/95 md:text-[11px]">
                        {name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!standalone && (
          <div className="flex justify-end">
            <Link
              href="/draw/slot-machine"
              className="text-sm font-semibold text-cyan-200 underline decoration-cyan-400/60 underline-offset-4"
            >
              Open full-screen draw
            </Link>
          </div>
        )}
      </div>

      {showReveal && winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/92 px-4 backdrop-blur-md">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.28),transparent_40%)]" />
          <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center text-center">
            <div className="mb-4 rounded-full border border-amber-300/30 bg-amber-300/10 px-5 py-2 text-sm font-black uppercase tracking-[0.24em] text-amber-100">
              Winner: $10 Gift Card!
            </div>

            <div className="relative overflow-hidden rounded-[2.5rem] border-4 border-cyan-300 bg-slate-900 shadow-[0_0_80px_rgba(34,211,238,0.55)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cardImageUrl(winner)}
                alt={winner}
                onError={() => handleImageError(winner)}
                className="h-[18rem] w-[18rem] object-cover sm:h-[24rem] sm:w-[24rem]"
              />
            </div>

            <p className="mt-8 text-sm font-semibold uppercase tracking-[0.32em] text-cyan-200">
              Selected Employee
            </p>
            <h3 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl">
              {winner}
            </h3>

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={closeReveal}
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5"
              >
                Close
              </button>
              <button
                type="button"
                onClick={startDraw}
                className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-cyan-300"
              >
                Draw Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
