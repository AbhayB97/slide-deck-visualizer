"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

type ListsResponse = {
  success: boolean;
  rouletteUsers: string[];
  highRiskUsers: string[];
  activeUsers?: string[];
  error?: string;
};

interface Blip {
  name: string;
  nx: number; // normalised -1..1
  ny: number;
  angle: number; // atan2(ny, nx)
  dist: number;  // 0..1
}

function generateBlips(users: string[]): Blip[] {
  const blips: Blip[] = [];
  const MIN_D = 0.25;
  const MAX_D = 0.88;
  const MIN_SEPARATION = 0.14;

  for (const name of users) {
    let nx = 0, ny = 0, dist = 0, angle = 0;
    let attempts = 0;
    do {
      angle = Math.random() * Math.PI * 2;
      dist = MIN_D + Math.random() * (MAX_D - MIN_D);
      nx = Math.cos(angle) * dist;
      ny = Math.sin(angle) * dist;
      attempts++;
    } while (
      attempts < 60 &&
      blips.some((b) => Math.hypot(b.nx - nx, b.ny - ny) < MIN_SEPARATION)
    );
    blips.push({ name, nx, ny, angle, dist });
  }
  return blips;
}

export function SlotMachine() {
  const [eligibleUsers, setEligibleUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blipsRef = useRef<Blip[]>([]);
  const sweepAngleRef = useRef(-Math.PI / 2); // start at top
  const velRef = useRef(0);
  const spinningRef = useRef(false);
  const stoppingRef = useRef(false);
  const winnerBlipRef = useRef<Blip | null>(null);
  const rafRef = useRef<number>(0);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastPingAngleRef = useRef<number>(-999);

  async function loadEligible() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/current-lists", { signal: controller.signal });
      const json: ListsResponse = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load lists");
      const hasHighRisk = Array.isArray(json.highRiskUsers) && json.highRiskUsers.length > 0;
      const active = Array.isArray(json.activeUsers) ? json.activeUsers : [];
      const users = hasHighRisk ? json.rouletteUsers || [] : active;
      if (!mountedRef.current) return;
      setEligibleUsers(users);
      blipsRef.current = generateBlips(users);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (!mountedRef.current) return;
      setError(err?.message || "Failed to load lists");
      setEligibleUsers([]);
      blipsRef.current = [];
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  // ── audio ──────────────────────────────────────────────────────────────────

  function pingSound(freq = 880) {
    try {
      const ACtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = audioCtxRef.current ?? new ACtx();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {}
  }

  function winnerSound() {
    try {
      const ACtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = audioCtxRef.current ?? new ACtx();
      audioCtxRef.current = ctx;
      [0, 0.15, 0.3].forEach((delay, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const freqs = [523, 659, 784];
        osc.type = "sine";
        osc.frequency.value = freqs[i];
        gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.55);
      });
    } catch {}
  }

  // ── canvas draw ────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(cx, cy) - 16;
    const sweep = sweepAngleRef.current;
    const TRAIL = Math.PI * 0.55; // ~100° glow trail

    // ── background ──────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);

    // Radar face
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = "#010d02";
    ctx.fill();
    ctx.restore();

    // Vignette
    const vignette = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,30,5,0.65)");
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = vignette;
    ctx.fill();
    ctx.restore();

    // ── grid ────────────────────────────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = "rgba(0,180,50,0.18)";
    ctx.lineWidth = 1;

    // Concentric rings
    for (let r = 0.25; r <= 1.01; r += 0.25) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Spokes every 45°
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
    }
    ctx.restore();

    // Outer ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,220,60,0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // ── sweep trail ─────────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R - 2, 0, Math.PI * 2);
    ctx.clip();

    const STEPS = 40;
    for (let i = 0; i < STEPS; i++) {
      const t0 = i / STEPS;
      const t1 = (i + 1) / STEPS;
      const a0 = sweep - TRAIL * (1 - t0);
      const a1 = sweep - TRAIL * (1 - t1);
      const alpha = Math.pow(t1, 1.6) * 0.45;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R - 2, a0, a1);
      ctx.closePath();
      ctx.fillStyle = `rgba(0,255,70,${alpha})`;
      ctx.fill();
    }
    ctx.restore();

    // ── sweep line ──────────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * (R - 1), cy + Math.sin(sweep) * (R - 1));
    ctx.strokeStyle = "rgba(0,255,80,0.95)";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#00ff46";
    ctx.stroke();
    ctx.restore();

    // ── centre dot ──────────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#00ff46";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#00ff46";
    ctx.fill();
    ctx.restore();

    // ── blips ───────────────────────────────────────────────────────────────
    const blips = blipsRef.current;
    const wb = winnerBlipRef.current;
    const now = Date.now();

    for (const blip of blips) {
      const bx = cx + blip.nx * R;
      const by = cy + blip.ny * R;
      const isWinner = wb && blip.name === wb.name;

      if (isWinner && !spinningRef.current && wb) {
        // Flash red
        const flash = Math.floor(now / 300) % 2 === 0;
        ctx.save();
        if (flash) {
          // Outer pulse
          ctx.beginPath();
          ctx.arc(bx, by, 14, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,0,0,0.15)";
          ctx.fill();
          // Inner dot
          ctx.beginPath();
          ctx.arc(bx, by, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#ff3030";
          ctx.shadowBlur = 22;
          ctx.shadowColor = "#ff0000";
          ctx.fill();
        }
        ctx.restore();
        continue;
      }

      // How recently did the sweep pass this blip?
      let diff = ((sweep - blip.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const brightness = diff < TRAIL ? 1 - (diff / TRAIL) * 0.75 : 0.12;

      // Glow halo
      const glowR = 5 + brightness * 6;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, glowR);
      g.addColorStop(0, `rgba(0,255,70,${brightness * 0.9})`);
      g.addColorStop(1, "rgba(0,255,70,0)");
      ctx.save();
      ctx.beginPath();
      ctx.arc(bx, by, glowR, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();

      // Core dot
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,255,70,${Math.max(brightness, 0.2)})`;
      ctx.shadowBlur = brightness > 0.5 ? 8 : 0;
      ctx.shadowColor = "#00ff46";
      ctx.fill();
      ctx.restore();

      // Label: show when bright or list is small
      if (brightness > 0.45 || blips.length <= 12) {
        const labelAlpha = Math.max(brightness, blips.length <= 12 ? 0.35 : 0);
        const fontSize = Math.max(9, Math.min(12, 130 / Math.max(blips.length, 1)));
        ctx.save();
        ctx.font = `${fontSize}px monospace`;
        ctx.fillStyle = `rgba(0,255,70,${labelAlpha})`;
        ctx.textBaseline = "middle";
        ctx.textAlign = blip.nx < 0 ? "right" : "left";
        ctx.fillText(blip.name, bx + (blip.nx < 0 ? -9 : 9), by);
        ctx.restore();
      }
    }
  }, []);

  // ── animation loop ─────────────────────────────────────────────────────────

  const animate = useCallback(() => {
    if (spinningRef.current) {
      if (!stoppingRef.current) {
        // Accelerate up to max
        velRef.current = Math.min(velRef.current + 0.0018, 0.13);
      } else {
        // Decelerate
        velRef.current *= 0.91;
        if (velRef.current < 0.004) {
          // Snap to nearest blip (or pick random if somehow no blips)
          const blips = blipsRef.current;
          if (blips.length) {
            const sa = sweepAngleRef.current;
            let best = blips[0];
            let bestDiff = Infinity;
            for (const b of blips) {
              const diff = ((sa - b.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
              const dist = Math.min(diff, Math.PI * 2 - diff);
              if (dist < bestDiff) { bestDiff = dist; best = b; }
            }
            winnerBlipRef.current = best;
            sweepAngleRef.current = best.angle;
            setWinner(best.name);
            winnerSound();
          }
          velRef.current = 0;
          spinningRef.current = false;
          stoppingRef.current = false;
          setSpinning(false);
        }
      }
      sweepAngleRef.current += velRef.current;

      // Ping sound each time sweep crosses a blip
      if (spinningRef.current) {
        const blips = blipsRef.current;
        const sa = sweepAngleRef.current;
        for (const b of blips) {
          const diff = ((sa - b.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          if (diff < velRef.current * 2) {
            const lastDiff = ((lastPingAngleRef.current - b.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
            if (lastDiff > velRef.current * 3) {
              const rate = velRef.current / 0.13;
              pingSound(400 + rate * 480);
            }
          }
        }
        lastPingAngleRef.current = sa;
      }
    }

    draw();
    rafRef.current = requestAnimationFrame(animate);
  }, [draw]);

  // ── lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    loadEligible();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  // ── controls ───────────────────────────────────────────────────────────────

  const startSpin = () => {
    if (!eligibleUsers.length || spinningRef.current) return;
    setWinner(null);
    winnerBlipRef.current = null;
    velRef.current = 0.02;
    spinningRef.current = true;
    stoppingRef.current = false;
    lastPingAngleRef.current = -999;
    setSpinning(true);

    const duration = 3500 + Math.random() * 2500;
    if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
    autoStopTimerRef.current = setTimeout(() => {
      if (spinningRef.current) stoppingRef.current = true;
    }, duration);

    pingSound(660);
  };

  return (
    <div className="min-h-screen bg-[#000e02] px-6 py-8 flex justify-center font-mono text-gray-100">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-green-500">Draw</p>
            <h1 className="text-3xl font-bold text-green-100">Radar Sweep</h1>
            <p className="text-sm text-green-500/70">
              {loading
                ? "Loading contacts…"
                : `${eligibleUsers.length} contact${eligibleUsers.length !== 1 ? "s" : ""} on scope`}
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/" className="text-sm text-green-400 underline">
              Dashboard
            </Link>
            <button
              onClick={loadEligible}
              className="px-3 py-2 text-sm rounded border border-green-700 text-green-300 hover:bg-green-900/30"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-900/20 p-4 text-sm text-red-300">
            {error}
          </div>
        )}
        {!loading && !eligibleUsers.length && !error && (
          <div className="rounded-lg border border-yellow-600/40 bg-yellow-900/20 p-4 text-sm text-yellow-300">
            No eligible users for this week's draw.
          </div>
        )}

        {/* Radar */}
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-green-800/50 shadow-[0_0_40px_rgba(0,255,70,0.08)] bg-[#000e02] p-6">
          <canvas
            ref={canvasRef}
            width={500}
            height={500}
            style={{ maxWidth: "100%", borderRadius: "50%" }}
          />

          <button
            onClick={startSpin}
            disabled={!eligibleUsers.length || loading || spinning}
            className="px-8 py-3 rounded border border-green-600 bg-green-900/40 text-green-200 text-sm font-semibold hover:bg-green-800/50 disabled:opacity-40 tracking-widest uppercase"
          >
            {spinning ? "Scanning…" : "Initiate Scan"}
          </button>

          {winner && (
            <div className="text-center" aria-live="polite">
              <p className="text-xs uppercase tracking-widest text-green-600 mb-1">
                Target Acquired
              </p>
              <p className="text-3xl font-bold text-red-400 animate-pulse drop-shadow-[0_0_18px_rgba(255,50,50,0.9)]">
                {winner}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
