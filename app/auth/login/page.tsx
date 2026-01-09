"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function AuthLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/status");
        const data = await res.json();
        if (data?.authenticated) {
          router.replace(nextPath);
        }
      } catch {
        // ignore status errors
      }
    };
    checkAuth();
  }, [nextPath, router]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Invalid credentials.");
      }
      router.replace(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-lg">
        <h1 className="text-2xl font-bold text-gray-900">Sign in</h1>
        <p className="text-sm text-gray-600 mt-2">
          Enter credentials to access restricted tools.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input
            type="text"
            value={form.username}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, username: event.target.value }))
            }
            className="w-full rounded-md border px-3 py-2 text-sm text-gray-900"
            placeholder="Username"
            aria-label="Username"
          />
          <input
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, password: event.target.value }))
            }
            className="w-full rounded-md border px-3 py-2 text-sm text-gray-900"
            placeholder="Password"
            aria-label="Password"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <div className="mt-4 text-sm text-gray-600">
          <Link href="/" className="underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
