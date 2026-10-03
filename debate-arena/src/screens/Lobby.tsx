import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { GameView, Role, Side } from "../../shared/types";
import { api } from "../lib/api";
import { sfx } from "../lib/sfx";
import { REC } from "../lib/rec";
import { SIDE, fighter } from "../lib/sides";
import { Avatar, Button, MuteButton } from "../components/ui";

function Podium({ state, side, joined, onTake }: { state: GameView; side: Side; joined: boolean; onTake: (role: Role) => void }) {
  const f = fighter(state, side);
  const s = SIDE[side];
  const mine = f && f.uid === state.me?.uid;
  return (
    <motion.button
      className={`seat seat--${side} ${f ? "seat--taken" : ""} ${mine ? "seat--me" : ""}`}
      onClick={() => onTake(side)}
      disabled={!joined || !!mine}
      whileHover={joined && !mine ? { y: -4 } : undefined}
      initial={{ opacity: 0, x: side === "pro" ? -40 : 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 160, damping: 18, delay: 0.15 }}
    >
      <div className="seat__tag">
        {s.label} <small>argues {s.stance}</small>
      </div>
      <AnimatePresence mode="wait">
        {f ? (
          <motion.div key={f.uid} className="seat__who" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}>
            <Avatar src={f.avatar} color={s.color} size={84} glow />
            <b>{f.name}</b>
            {mine ? <em>that's you</em> : joined && <em>click to challenge for this podium</em>}
          </motion.div>
        ) : (
          <motion.div key="empty" className="seat__empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="seat__mic">🎤</div>
            <b>{joined ? "Step up" : "Empty podium"}</b>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export function Lobby({ state, joined, onJoin, llm }: { state: GameView; joined: boolean; onJoin: (name: string) => Promise<void>; llm: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const count = state.players.length;
  const prev = useRef(count);
  const ready = !!fighter(state, "pro") && !!fighter(state, "con");
  const crowd = state.players.filter((p) => p.role === "crowd");

  useEffect(() => {
    if (count > prev.current) sfx.join();
    prev.current = count;
  }, [count]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const take = (role: Role) => {
    if (!joined || !state.me || state.phase !== "lobby") return;
    sfx.pop();
    void api("role", { uid: state.me.uid, role });
  };

  return (
    <div className="screen lobby">
      <header className="topbar">
        <div className="brand">
          ⚖️ <span>DEBATE ARENA</span>
        </div>
        <div className="topbar__right">
          <MuteButton />
        </div>
      </header>

      <div className="lobby__hero">
        <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 120 }}>
          Two debaters. <span className="pro">One</span> <span className="con">AI judge.</span>
          <br />
          No dodging.
        </motion.h1>
        <p className="lobby__sub">
          A random motion. Three fast rounds in a live chat. The AI judge scores every message for evidence, logic, clarity and rebuttals, and calls out every
          dodge and fallacy in real time. The crowd hypes and votes. Then the verdict.
        </p>
      </div>

      <div className="lobby__ring">
        <Podium state={state} side="pro" joined={joined} onTake={take} />
        <div className="lobby__vs">
          <motion.div className="vs-badge" animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.8 }}>
            VS
          </motion.div>
          <div className="judge-chip">
            <span>⚖️</span> The Judge <small>{llm}</small>
          </div>
        </div>
        <Podium state={state} side="con" joined={joined} onTake={take} />
      </div>

      <div className="lobby__crowd">
        <div className="lobby__crowdlist">
          <span className="muted">Crowd</span>
          <AnimatePresence>
            {crowd.map((p) => (
              <motion.div key={p.uid} className={`chip ${p.uid === state.me?.uid ? "chip--me" : ""}`} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <Avatar src={p.avatar} size={26} color="#a1a1aa" />
                {p.name}
              </motion.div>
            ))}
          </AnimatePresence>
          {joined && state.me?.role !== "crowd" && (
            <button className="chip chip--ghost" onClick={() => take("crowd")}>
              + join the crowd
            </button>
          )}
          {!crowd.length && <span className="muted small">spectators react live and vote on the winner</span>}
        </div>

        <div className="lobby__actions">
          {state.phase !== "lobby" && !joined ? (
            <div className="notice">A debate is live right now. Join the next one.</div>
          ) : !joined ? (
            <form
              className="join"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) void run(() => onJoin(name));
              }}
            >
              <input autoFocus maxLength={18} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button big disabled={busy || !name.trim()}>
                Enter the arena
              </Button>
            </form>
          ) : (
            <>
              <Button big disabled={busy || !ready || state.phase !== "lobby"} onClick={() => void run(() => api("start"))}>
                {state.phase === "setup" ? "Setting the stage…" : ready ? "🎰 Spin the motion" : "Waiting for two debaters…"}
              </Button>
              {!REC && (
                <div className="hint">
                  Invite a rival: open <code>{location.host}</code> in another tab or device.
                </div>
              )}
            </>
          )}
          {err && <div className="error-text">{err}</div>}
        </div>
      </div>

      <footer className="footer">
        Live debate chat by <b>CometChat</b> · Judge: {llm}
      </footer>
    </div>
  );
}
