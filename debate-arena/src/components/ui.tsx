import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { serverNow, useNow } from "../lib/api";
import { sfx } from "../lib/sfx";
import { REC } from "../lib/rec";

export function TimerRing({ endsAt, total, size = 64, label }: { endsAt: number | null; total: number; size?: number; label?: string }) {
  const now = useNow(100);
  const left = endsAt ? Math.max(0, endsAt - now) : 0;
  const secs = Math.ceil(left / 1000);
  const last = useRef(secs);
  useEffect(() => {
    if (secs !== last.current && secs <= 5 && secs > 0) sfx.tick();
    last.current = secs;
  }, [secs]);
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const frac = total ? left / total : 0;
  const urgent = secs <= 10;
  return (
    <div className={`timer ${urgent ? "timer--urgent" : ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} className="timer__track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="timer__bar"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="timer__text">
        <span>{secs}</span>
        {label && <small>{label}</small>}
      </div>
    </div>
  );
}

export function Avatar({ src, color, size = 44, glow }: { src: string; color?: string; size?: number; glow?: boolean }) {
  return (
    <div
      className={`avatar ${glow ? "avatar--glow" : ""}`}
      style={{ width: size, height: size, ["--c" as string]: color ?? "#8b5cf6" }}
    >
      <img src={src} alt="" draggable={false} />
    </div>
  );
}

export function TypingDots({ color }: { color?: string }) {
  return (
    <span className="typing" style={{ ["--c" as string]: color ?? "currentColor" }}>
      <i />
      <i />
      <i />
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  big,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
  big?: boolean;
}) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={`btn btn--${variant} ${big ? "btn--big" : ""}`}
      disabled={disabled}
      onClick={() => {
        sfx.unlock();
        onClick?.();
      }}
    >
      {children}
    </motion.button>
  );
}

export function MuteButton() {
  const [muted, setMuted] = useState(sfx.isMuted());
  if (REC) return null;
  return (
    <button className="icon-btn" title={muted ? "Unmute" : "Mute"} onClick={() => setMuted(sfx.toggleMute())}>
      {muted ? "🔇" : "🔊"}
    </button>
  );
}

/** Elapsed ms since a server timestamp, re-rendering frequently for timed sequences. */
export function useElapsed(since: number, interval = 100) {
  const now = useNow(interval);
  return Math.max(0, now - since);
}

export function useOnce(condition: boolean, fn: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (condition && !done.current) {
      done.current = true;
      fn();
    }
  }, [condition, fn]);
}

export function Toasts({ items }: { items: { id: number; node: ReactNode }[] }) {
  return (
    <div className="toasts">
      {items.map((t) => (
        <motion.div
          key={t.id}
          className="toast"
          initial={{ opacity: 0, y: -16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
        >
          {t.node}
        </motion.div>
      ))}
    </div>
  );
}

export function useToasts() {
  const [items, setItems] = useState<{ id: number; node: ReactNode }[]>([]);
  const push = (node: ReactNode, ms = 3500) => {
    const id = serverNow() + Math.random();
    setItems((x) => [...x.slice(-2), { id, node }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), ms);
  };
  return { items, push };
}
