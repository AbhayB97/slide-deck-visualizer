"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

type ListsResponse = {
  success: boolean;
  rouletteUsers: string[];
  highRiskUsers: string[];
  error?: string;
};

const VISIBLE_ROWS = 7;
const CENTER_INDEX = 3;
const ROW_HEIGHT = 48;
const REEL_HEIGHT = VISIBLE_ROWS * ROW_HEIGHT;
const BASE_DELAY = 60;

function randomOf(list: string[]) {
  if (!list.length) return "";
  return list[Math.floor(Math.random() * list.length)];
}

export function SlotMachine() {
  const [eligibleUsers, setEligibleUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [slowing, setSlowing] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoStopRef = useRef<NodeJS.Timeout | null>(null);
  const currentDelayRef = useRef(BASE_DELAY);
  const winnerRef = useRef<string | null>(null);
  const slowingRef = useRef(false);
  const spinningRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const drumOscRef = useRef<OscillatorNode | null>(null);
  const drumGainRef = useRef<GainNode | null>(null);

  async function loadEligible() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/current-lists");
      const json: ListsResponse = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load lists");
      }
      const users = json.rouletteUsers || [];
      setEligibleUsers(users);
      const startNames = Array.from({ length: VISIBLE_ROWS }, () => randomOf(users));
      setNames(startNames);
    } catch (err: any) {
      setError(err?.message || "Failed to load lists");
      setEligibleUsers([]);
      setNames([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEligible();
    return () => {
      clearTimer();
      clearAutoStop();
      stopDrumroll(true);
    };
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const clearAutoStop = () => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  };

  const tick = () => {
    setNames((prev) => {
      const next = [...prev];
      next.shift();
      next.push(randomOf(eligibleUsers));
      return next;
    });

    let nextDelay = currentDelayRef.current;

    if (slowingRef.current && winnerRef.current) {
      // decelerate
      nextDelay = Math.min(nextDelay + 30, 320);
      // When slow enough, snap winner
      if (nextDelay >= 300) {
        clearTimer();
        const final = Array.from({ length: VISIBLE_ROWS }, () => randomOf(eligibleUsers));
        final[CENTER_INDEX] = winnerRef.current;
        setNames(final);
        setSpinning(false);
        spinningRef.current = false;
        setSlowing(false);
        slowingRef.current = false;
        setWinner(winnerRef.current);
        stopDrumroll();
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 1200);
        currentDelayRef.current = BASE_DELAY;
        return;
      }
    }

    currentDelayRef.current = nextDelay;
    clearTimer();
    timerRef.current = setTimeout(tick, nextDelay);
  };

  const startSpin = () => {
    if (!eligibleUsers.length || spinningRef.current) return;
    setWinner(null);
    winnerRef.current = null;
    setSpinning(true);
    spinningRef.current = true;
    setSlowing(false);
    slowingRef.current = false;
    currentDelayRef.current = BASE_DELAY;
    clearTimer();
    clearAutoStop();
    timerRef.current = setTimeout(tick, BASE_DELAY);

    // Auto-stop after a random duration between 3s and 5s
    const duration = 3000 + Math.random() * 2000;
    autoStopRef.current = setTimeout(() => stopSpin(), duration);
    startDrumroll();
  };

  const stopSpin = () => {
    clearAutoStop();
    if (!spinningRef.current || slowingRef.current) return;
    const selected = randomOf(eligibleUsers);
    winnerRef.current = selected;
    setSlowing(true);
    slowingRef.current = true;
  };

  const startDrumroll = () => {
    if (drumOscRef.current) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = audioCtxRef.current || new AudioCtx();
    audioCtxRef.current = ctx;
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 120;
    gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    const now = ctx.currentTime;
    gain.gain.linearRampToValueAtTime(0.03, now + 0.05);
    drumOscRef.current = osc;
    drumGainRef.current = gain;
  };

  const stopDrumroll = (immediate = false) => {
    const osc = drumOscRef.current;
    const gain = drumGainRef.current;
    const ctx = audioCtxRef.current;
    if (!osc || !gain || !ctx) return;
    const now = ctx.currentTime;
    if (immediate) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0, now);
    } else {
      gain.gain.linearRampToValueAtTime(0, now + 0.2);
    }
    osc.stop(now + (immediate ? 0 : 0.25));
    drumOscRef.current = null;
    drumGainRef.current = null;
  };

  const scanlineStyle = {
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
    backgroundSize: "100% 6px, 6px 100%",
    animation: "flicker 2s infinite",
  } as React.CSSProperties;

  return (
    <div className="min-h-screen bg-[#0b0f16] px-6 py-8 flex justify-center font-mono text-gray-100">
      <div className="w-full max-w-5xl flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-teal-400">Draw</p>
            <h1 className="text-3xl font-bold text-gray-100">Slot Machine</h1>
            <p className="text-sm text-gray-400">
              Spin the reel to pick a random compliant user. Eligible: {eligibleUsers.length}
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/" className="text-sm text-teal-300 underline">
              Back to dashboard
            </Link>
            <button
              onClick={loadEligible}
              className="px-3 py-2 text-sm rounded-md border border-teal-500 text-teal-200 bg-[#111827] hover:bg-[#0f172a]"
            >
              Refresh list
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-900/30 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {!loading && !eligibleUsers.length && !error && (
          <div className="rounded-lg border border-yellow-500/50 bg-yellow-900/30 p-4 text-sm text-yellow-200">
            No eligible users for this week's draw.
          </div>
        )}

        <div
          className="relative rounded-2xl border border-teal-500/60 shadow-[0_0_25px_rgba(34,211,238,0.35)] p-6 bg-[#0d1117]"
          style={scanlineStyle}
        >
          <div
            className="relative mx-auto w-full max-w-md overflow-hidden rounded-xl"
            style={{
              height: REEL_HEIGHT,
              border: "1px solid rgba(56,189,248,0.4)",
              boxShadow: "0 0 20px rgba(34,211,238,0.25)",
              backgroundColor: "#0f172a",
            }}
          >
            <div className="absolute inset-0">
              {names.map((name, idx) => (
                <div
                  key={`${name}-${idx}-${Math.random()}`}
                  className="flex items-center justify-center text-sm font-semibold"
                  style={{
                    height: ROW_HEIGHT,
                    color: idx === CENTER_INDEX ? "#67e8f9" : "#cbd5f5",
                    textShadow: idx === CENTER_INDEX ? "0 0 12px rgba(103,232,249,0.8)" : "none",
                  }}
                >
                  {name}
                </div>
              ))}
            </div>
            <div
              className="pointer-events-none absolute left-0 right-0"
              style={{
                top: CENTER_INDEX * ROW_HEIGHT,
                height: ROW_HEIGHT,
                borderTop: "1px solid rgba(56,189,248,0.8)",
                borderBottom: "1px solid rgba(56,189,248,0.8)",
                boxShadow: "0 0 15px rgba(56,189,248,0.35)",
                background:
                  "linear-gradient(90deg, rgba(56,189,248,0.05), rgba(56,189,248,0.15), rgba(56,189,248,0.05))",
              }}
            ></div>
          </div>

          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={startSpin}
              disabled={!eligibleUsers.length || loading || spinning}
              className="inline-flex items-center px-5 py-3 rounded-md bg-teal-600 text-white text-sm font-semibold shadow-sm hover:bg-teal-500 disabled:opacity-50"
            >
              {spinning ? "Spinning..." : "Spin"}
            </button>
          </div>

          {winner && (
            <div className="mt-4 text-center" aria-live="polite">
              <p className="text-sm text-gray-300">Winner</p>
              <p className="text-2xl font-bold text-teal-300 drop-shadow-[0_0_12px_rgba(45,212,191,0.8)]">
                {winner}
              </p>
            </div>
          )}
        </div>
      </div>
      <style jsx global>{`
        @keyframes flicker {
          0% { opacity: 0.97; }
          50% { opacity: 1; }
          100% { opacity: 0.96; }
        }
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
      {celebrate && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 confetti" />
        </div>
      )}
    </div>
  );
}
