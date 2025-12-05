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
const REEL_HEIGHT = 360;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function Reel({
  items,
  duration,
  playing,
  transform,
  transition,
}: {
  items: string[];
  duration: number;
  playing: boolean;
  transform: string;
  transition: string;
}) {
  const doubled = useMemo(() => [...items, ...items], [items]);

  return (
    <div
      className="relative w-1/3 max-w-xs overflow-hidden rounded-xl border bg-gray-50 shadow-inner"
      style={{ height: REEL_HEIGHT }}
      aria-hidden="true"
    >
      <div
        className={`reel-track ${playing ? "reel-animating" : ""}`}
        style={{
          animationDuration: `${duration}ms`,
          transform,
          transition,
        }}
        aria-hidden="true"
      >
        {doubled.map((name, i) => (
          <div
            key={`${name}-${i}`}
            className="flex items-center justify-center text-sm font-medium text-gray-900"
            style={{ height: 48 }}
          >
            {name}
          </div>
        ))}
      </div>
      <div
        className="pointer-events-none absolute left-0 right-0 border-y border-blue-300"
        style={{
          top: (REEL_HEIGHT - 48) / 2,
          height: 48,
        }}
      ></div>

      <style jsx>{`
        .reel-track {
          position: absolute;
          inset: 0;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          transform: translateY(0);
        }
        .reel-animating {
          animation-name: reel-scroll;
        }
        @keyframes reel-scroll {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(-50%);
          }
        }
      `}</style>
    </div>
  );
}

export default function SlotMachinePage() {
  const [eligibleUsers, setEligibleUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState<string[][]>(Array(REEL_COUNT).fill([]));
  const [durations, setDurations] = useState<number[]>(Array(REEL_COUNT).fill(4000));
  const [transforms, setTransforms] = useState<string[]>(Array(REEL_COUNT).fill("translateY(0)"));
  const [transitions, setTransitions] = useState<string[]>(Array(REEL_COUNT).fill("transform 0ms linear"));
  const [winner, setWinner] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

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
      setEligibleUsers(names);
      setReels(Array.from({ length: REEL_COUNT }, () => [...names]));
    } catch (err: any) {
      setError(err?.message || "Failed to load lists");
      setEligibleUsers([]);
      setReels(Array(REEL_COUNT).fill([]));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLists();
  }, []);

  const startSpin = () => {
    if (!eligibleUsers.length || spinning) return;
    const shuffled = shuffle(eligibleUsers);
    const newReels = Array.from({ length: REEL_COUNT }, () => [...shuffled, ...shuffled]);
    const newDurations = Array.from({ length: REEL_COUNT }, (_, idx) => 3000 + idx * 500 + Math.floor(Math.random() * 800));
    setReels(newReels);
    setDurations(newDurations);
    setTransforms(Array(REEL_COUNT).fill("translateY(0)"));
    setTransitions(Array(REEL_COUNT).fill("transform 0ms linear"));
    setWinner(null);
    setCelebrate(false);
    setSpinning(true);

    // Pick winner right after spin starts
    const winningName = shuffled[Math.floor(Math.random() * shuffled.length)];
    const delays = [1000, 1400, 1800];
    const centerOffset = (REEL_HEIGHT - 48) / 2;

    delays.forEach((delay, idx) => {
      setTimeout(() => {
        const reelItems = newReels[idx];
        const targetIndex = reelItems.indexOf(winningName);
        const targetOffset = -1 * 48 * targetIndex + centerOffset;
        const overshoot = targetOffset - 48 * Math.min(3, reelItems.length - 1);
        // stop continuous animation
        setTransitions((prev) => {
          const copy = [...prev];
          copy[idx] = "transform 800ms cubic-bezier(0.2, 0.8, 0.2, 1)";
          return copy;
        });
        setTransforms((prev) => {
          const copy = [...prev];
          copy[idx] = `translateY(${overshoot}px)`;
          return copy;
        });
        setTimeout(() => {
          setTransitions((prev) => {
            const copy = [...prev];
            copy[idx] = "transform 450ms cubic-bezier(0.2, 0.8, 0.2, 1)";
            return copy;
          });
          setTransforms((prev) => {
            const copy = [...prev];
            copy[idx] = `translateY(${targetOffset}px)`;
            return copy;
          });
          if (idx === REEL_COUNT - 1) {
            setTimeout(() => {
              setSpinning(false);
              setWinner(winningName);
              setCelebrate(true);
              setTimeout(() => setCelebrate(false), 1200);
            }, 500);
          }
        }, 850);
      }, delay);
    });
  };

  const stopSpin = () => {
    setSpinning(false);
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
                duration={durations[idx]}
                playing={spinning}
                transform={transforms[idx]}
                transition={transitions[idx]}
              />
            ))}
          </div>

          <div className="flex justify-center gap-3">
            <button
              onClick={startSpin}
              disabled={!eligibleUsers.length || loading || spinning}
              className="inline-flex items-center px-5 py-3 rounded-md bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {spinning ? "Spinning..." : "Start"}
            </button>
            <button
              onClick={stopSpin}
              disabled={!spinning}
              className="inline-flex items-center px-4 py-3 rounded-md border bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Stop
            </button>
            <button
              onClick={() => {
                setSpinning(false);
                setWinner(null);
                startSpin();
              }}
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
