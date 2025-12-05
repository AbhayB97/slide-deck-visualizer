"use client";

import React from "react";

type ReelProps = {
  items: string[];
  transform: string;
  transition: string;
  height: number;
  rowHeight: number;
};

export function Reel({ items, transform, transition, height, rowHeight }: ReelProps) {
  return (
    <div
      className="relative w-1/3 max-w-xs overflow-hidden rounded-xl border bg-gray-50 shadow-inner"
      style={{ height }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={{
          transform,
          transition,
        }}
      >
        {items.map((name, i) => (
          <div
            key={`${name}-${i}`}
            className="flex items-center justify-center text-sm font-medium text-gray-900"
            style={{ height: rowHeight }}
          >
            {name}
          </div>
        ))}
      </div>
      <div
        className="pointer-events-none absolute left-0 right-0 border-y border-blue-300"
        style={{
          top: (height - rowHeight) / 2,
          height: rowHeight,
          boxShadow: "0 0 0 1px rgba(59,130,246,0.25)",
        }}
      ></div>
    </div>
  );
}
