"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ListsResponse = {
  success: boolean;
  rouletteUsers: string[];
  highRiskUsers: string[];
  error?: string;
};

const REEL_COUNT = 3;
const REEL_HEIGHT = 320;
const SPIN_DURATION_MS = 2600;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function SlotMachinePage() {
  const [rouletteUsers, setRouletteUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [offsets, setOffsets] = useState<number[]>(Array(REEL_COUNT).fill(0));
  const [winner, setWinner] = useState<string | null>(null);
  const [reels, setReels] = useState<string[][]>(Array(REEL_COUNT).fill([]));

  const segmentHeight = useMemo(() => {
    const maxDisplay = Math.min(10, rouletteUsers.length || 1);
    return Math.max(32, Math.floor(REEL_HEIGHT / maxDisplay));
  }, [rouletteUsers]);

  async function loadLists() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/current-lists");
      const json: ListsResponse = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load lists");
      }
      const names = json.rouletteUsers || [];
      setRouletteUsers(names);
      setReels(Array.from({ length: REEL_COUNT }, () => [...names]));
    } catch (err: any) {
      setError(err?.message || "Failed to load lists");
      setRouletteUsers([]);
      setReels(Array(REEL_COUNT).fill([]));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLists();
  }, []);

  const startSpin = () => {
    if (!rouletteUsers.length || spinning) return;
    setWinner(null);
    setSpinning(true);
    const reelNames = shuffle(rouletteUsers);
    const newOffsets = Array(REEL_COUNT).fill(0);
    const targetIndices = Array.from({ length: REEL_COUNT }, () =>
      Math.floor(Math.random() * (reelNames.length || 1))
    );

    const newReels = Array.from({ length: REEL_COUNT }, (_, idx) => {
      const fullSpins = Math.floor(Math.random() * 6) + 3; // 3–8 rotations
      const repeats = fullSpins + 1;
      const data = Array.from({ length: repeats }).flatMap(() => reelNames);
      const offset = -1 * segmentHeight * (fullSpins * reelNames.length + targetIndices[idx]);
      newOffsets[idx] = offset;
      return data;
    });

    const promises = newReels.map((_, idx) => {
      const duration = SPIN_DURATION_MS + idx * 400;
      return new Promise<void>((resolve) => setTimeout(resolve, duration));
    });

    setOffsets(newOffsets);
    setReels(newReels);

    Promise.all(promises).then(() => {
      const midIdx = targetIndices[1] ?? targetIndices[0] ?? 0;
      const finalName = reelNames[midIdx] || "";
      setWinner(finalName || null);
      setSpinning(false);
      // simple confetti substitute: trigger a CSS animation via class toggle
      document.documentElement.classList.add("slot-confetti");
      setTimeout(() => document.documentElement.classList.remove("slot-confetti"), 1200);
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-8 flex justify-center font-sans">
      <div className="w-full max-w-5xl flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Draw</p>
            <h1 className="text-3xl font-bold text-gray-900">Slot Machine</h1>
            <p className="text-sm text-gray-600">
              Spin the reels to pick a random compliant user. Eligible: {rouletteUsers.length}
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/" className="text-sm text-blue-700 underline">
              Back to dashboard
            </Link>
            <button
              onClick={loadLists}
              className="px-3 py-2 text-sm rounded-md border bg-white text-gray-700 hover:bg-gray-50"
            >
              Refresh list
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg border p-6 flex flex-col gap-6">
          <div className="flex gap-4 justify-center">
            {reels.map((names, idx) => (
              <div
                key={idx}
                className="relative w-1/3 max-w-xs overflow-hidden rounded-xl border bg-gray-50 shadow-inner"
                style={{ height: REEL_HEIGHT }}
              >
                <div
                  className={`absolute inset-0 transition-all ease-out`}
                  style={{
                    transform: `translateY(${offsets[idx]}px)`,
                    transitionDuration: spinning ? `${SPIN_DURATION_MS + idx * 400}ms` : "400ms",
                  }}
                >
                  {names.map((name: string, i: number) => (
                    <div
                      key={`${name}-${i}`}
                      className="h-12 flex items-center justify-center text-sm font-medium text-gray-900"
                      style={{ height: segmentHeight }}
                    >
                      {name}
                    </div>
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-y-1/3 left-0 right-0 border-y border-blue-300"></div>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-3">
            <button
              onClick={startSpin}
              disabled={!rouletteUsers.length || spinning || loading}
              className="inline-flex items-center px-5 py-3 rounded-md bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {spinning ? "Spinning..." : "Spin"}
            </button>
            <button
              onClick={() => {
                setOffsets(Array(REEL_COUNT).fill(0));
                setWinner(null);
              }}
              className="inline-flex items-center px-4 py-3 rounded-md border bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Spin Again
            </button>
          </div>

          {winner && (
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900">Winner</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{winner}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
