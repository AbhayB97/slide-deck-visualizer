"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Reel } from "@/components/Reel";

type ListsResponse = {
  success: boolean;
  rouletteUsers: string[];
  highRiskUsers: string[];
  error?: string;
};

const REEL_COUNT = 3;
const ROW_HEIGHT = 48;
const REEL_HEIGHT = 360;

const easing = "cubic-bezier(0.2, 0.8, 0.2, 1)";

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function SlotMachine() {
  const [eligibleUsers, setEligibleUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reels, setReels] = useState<string[][]>(Array(REEL_COUNT).fill([]));
  const [transforms, setTransforms] = useState<string[]>(Array(REEL_COUNT).fill("translateY(0)"));
  const [transitions, setTransitions] = useState<string[]>(Array(REEL_COUNT).fill("transform 0ms linear"));
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const reelDurations = useMemo(() => [2000, 2300, 2600], []);

  async function loadEligible() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/current-lists");
      const json: ListsResponse = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load lists");
      }
      setEligibleUsers(json.rouletteUsers || []);
      setReels(Array.from({ length: REEL_COUNT }, () => [...(json.rouletteUsers || [])]));
    } catch (err: any) {
      setError(err?.message || "Failed to load lists");
      setEligibleUsers([]);
      setReels(Array(REEL_COUNT).fill([]));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEligible();
  }, []);

  const spin = () => {
    if (!eligibleUsers.length || spinning) return;
    setSpinning(true);
    setWinner(null);
    setCelebrate(false);

    const centerOffset = (REEL_HEIGHT - ROW_HEIGHT) / 2;

    // Create per-reel shuffled lists and repeated data
    const baseLists = Array.from({ length: REEL_COUNT }, () => shuffle(eligibleUsers));
    const reelData = baseLists.map((list) => Array.from({ length: 3 }).flatMap(() => list));

    // Pick a winner from eligible list (after spin starts)
    const winningName = eligibleUsers[Math.floor(Math.random() * eligibleUsers.length)];

    // Compute target offsets with multiple spins
    const newTransforms: string[] = Array(REEL_COUNT).fill("translateY(0)");
    const newTransitions: string[] = Array(REEL_COUNT).fill("");

    baseLists.forEach((list, idx) => {
      const repeated = reelData[idx];
      const baseIdx = list.indexOf(winningName);
      const targetIdx = baseIdx >= 0 ? baseIdx + list.length : 0; // align to middle repetition
      const extraSpins = Math.floor(Math.random() * 3) + 3; // 3-5 extra spins
      const totalSteps = extraSpins * list.length + targetIdx;
      const targetOffset = -1 * totalSteps * ROW_HEIGHT + centerOffset;

      // tick stub for sound
      console.debug("tick", idx);

      newTransitions[idx] = `transform ${reelDurations[idx]}ms ${easing}`;
      newTransforms[idx] = `translateY(${targetOffset}px)`;
    });

    setReels(reelData);
    // reset transforms before applying transitions (force reflow)
    requestAnimationFrame(() => {
      setTransforms(Array(REEL_COUNT).fill("translateY(0)"));
      setTransitions(Array(REEL_COUNT).fill("transform 0ms linear"));
      requestAnimationFrame(() => {
        setTransitions(newTransitions);
        setTransforms(newTransforms);
      });
    });

    // After all reels finish, normalize and show winner
    const maxDuration = Math.max(...reelDurations) + 50;
    setTimeout(() => {
      const normalizedTransforms = baseLists.map((list, idx) => {
        const baseIdx = list.indexOf(winningName);
        const targetIdx = baseIdx >= 0 ? baseIdx : 0;
        const snapOffset = -1 * targetIdx * ROW_HEIGHT + centerOffset;
        return `translateY(${snapOffset}px)`;
      });
      setTransitions(Array(REEL_COUNT).fill("transform 0ms linear"));
      setTransforms(normalizedTransforms);
      setWinner(winningName);
      setSpinning(false);
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 1200);
    }, maxDuration);
  };

  const spinAgain = () => {
    if (spinning) return;
    setWinner(null);
    setTransforms(Array(REEL_COUNT).fill("translateY(0)"));
    setTransitions(Array(REEL_COUNT).fill("transform 0ms linear"));
    spin();
  };

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-8 flex justify-center font-sans">
      <div className="w-full max-w-5xl flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Draw</p>
            <h1 className="text-3xl font-bold text-gray-900">Slot Machine</h1>
            <p className="text-sm text-gray-600">
              Spin the reels to pick a random compliant user. Eligible: {eligibleUsers.length}
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/" className="text-sm text-blue-700 underline">
              Back to dashboard
            </Link>
            <button
              onClick={loadEligible}
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

        {!loading && !eligibleUsers.length && !error && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            No eligible users for this week's draw.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg border p-6 flex flex-col gap-6">
          <div className="flex gap-4 justify-center">
            {reels.map((names, idx) => (
              <Reel
                key={idx}
                items={names}
                transform={transforms[idx]}
                transition={transitions[idx]}
                height={REEL_HEIGHT}
                rowHeight={ROW_HEIGHT}
              />
            ))}
          </div>

          <div className="flex justify-center gap-3">
            <button
              onClick={spin}
              disabled={!eligibleUsers.length || loading || spinning}
              className="inline-flex items-center px-5 py-3 rounded-md bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {spinning ? "Spinning..." : "Start"}
            </button>
            <button
              onClick={() => setSpinning(false)}
              disabled={!spinning}
              className="inline-flex items-center px-4 py-3 rounded-md border bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Stop
            </button>
            <button
              onClick={spinAgain}
              disabled={spinning || loading || !eligibleUsers.length}
              className="inline-flex items-center px-4 py-3 rounded-md border bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Spin Again
            </button>
          </div>

          {winner && (
            <div className="text-center" aria-live="polite">
              <p className="text-lg font-semibold text-gray-900">Winner</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{winner}</p>
            </div>
          )}
        </div>
      </div>
      {celebrate && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 confetti" />
          <style jsx>{`
            .confetti {
              background-image: radial-gradient(circle, rgba(16, 185, 129, 0.6) 2px, transparent 2px),
                radial-gradient(circle, rgba(59, 130, 246, 0.6) 2px, transparent 2px),
                radial-gradient(circle, rgba(234, 179, 8, 0.6) 2px, transparent 2px);
              background-size: 12px 12px, 14px 14px, 16px 16px;
              animation: confetti-fall 1.2s ease-out forwards;
            }
            @keyframes confetti-fall {
              0% {
                opacity: 0.9;
                transform: translateY(-20%) rotate(0deg);
              }
              100% {
                opacity: 0;
                transform: translateY(20%) rotate(35deg);
              }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
