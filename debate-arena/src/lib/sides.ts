import type { FlagType, GameView, Scores, Side } from "../../shared/types";

export const SIDE = {
  pro: { label: "PRO", stance: "FOR", color: "#38bdf8", glow: "rgba(56,189,248,.55)", emoji: "🔵" },
  con: { label: "CON", stance: "AGAINST", color: "#fb3b5c", glow: "rgba(251,59,92,.55)", emoji: "🔴" },
} as const;

export const CATS: { key: keyof Scores; label: string; icon: string }[] = [
  { key: "evidence", label: "Evidence", icon: "🧾" },
  { key: "logic", label: "Logic", icon: "🧠" },
  { key: "clarity", label: "Clarity", icon: "💎" },
  { key: "rebuttal", label: "Rebuttal", icon: "🥊" },
];

export const FLAG_META: Record<FlagType, { emoji: string; title: string; good: boolean }> = {
  dodge: { emoji: "🦆", title: "DODGE", good: false },
  fallacy: { emoji: "🧠", title: "FALLACY", good: false },
  unsupported: { emoji: "❓", title: "CITATION NEEDED", good: false },
  strong: { emoji: "💪", title: "STRONG POINT", good: true },
  receipts: { emoji: "🧾", title: "RECEIPTS", good: true },
  burn: { emoji: "🔥", title: "BURN", good: true },
};

export const HYPE = ["🔥", "👏", "😂", "💀", "🤯", "🍅"];

export const total = (s: Scores) => CATS.reduce((a, c) => a + s[c.key], 0);

export const fighter = (state: GameView, side: Side) => state.players.find((p) => p.role === side);
