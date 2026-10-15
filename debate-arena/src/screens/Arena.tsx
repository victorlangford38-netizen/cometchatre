import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import type { Flag, GameView, Side } from "../../shared/types";
import { api, reportError, useFx } from "../lib/api";
import { sfx } from "../lib/sfx";
import { CATS, FLAG_META, HYPE, SIDE, fighter, total } from "../lib/sides";
import { ChatPanel } from "../components/ChatPanel";
import { Avatar, MuteButton, TimerRing, TypingDots, useElapsed } from "../components/ui";

type Float = { id: number; side: Side; emoji: string; x: number };
type Burst = { id: number; flag: Flag };

let seq = 0;

export function Num({ value, digits = 1 }: { value: number; digits?: number }) {
  const [v, setV] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const c = animate(prev.current, value, { duration: 0.7, ease: "easeOut", onUpdate: setV });
    prev.current = value;
    return () => c.stop();
  }, [value]);
  return <>{v.toFixed(digits)}</>;
}

export function Arena({ state, onOpenStage }: { state: GameView; onOpenStage: () => void }) {
  const me = state.me!;
  const mySide = me.role === "crowd" ? null : me.role;
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [floats, setFloats] = useState<Float[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const round = state.rounds[state.roundIndex];
  const deliberating = state.phase === "deliberating";

  useFx((fx) => {
    if (fx.type === "typing") setTyping((t) => ({ ...t, [fx.uid]: Date.now() + fx.ms }));
    if (fx.type === "hype") {
      const f = { id: ++seq, side: fx.side, emoji: fx.emoji, x: 8 + Math.random() * 84 };
      setFloats((x) => [...x.slice(-40), f]);
      setTimeout(() => setFloats((x) => x.filter((y) => y.id !== f.id)), 1900);
    }
    if (fx.type === "flag") {
      const b = { id: ++seq, flag: fx.flag as Flag };
      FLAG_META[b.flag.type].good ? sfx.ding() : b.flag.type === "dodge" ? sfx.honk() : sfx.glitch();
      setBursts((x) => [...x, b]);
      setTimeout(() => setBursts((x) => x.filter((y) => y.id !== b.id)), 2800);
    }
    if (fx.type === "crowdvote") sfx.pop();
  });

  useEffect(() => {
    if (state.phase === "round") sfx.bell();
  }, [state.roundIndex, state.phase]);

  useEffect(() => {
    if (deliberating) sfx.drumroll(4);
  }, [deliberating]);

  const isTyping = (side: Side) => {
    const f = fighter(state, side);
    return !!f && (typing[f.uid] ?? 0) > Date.now();
  };

  const pct = 50 + state.momentum / 2;
  const leader = state.momentum > 4 ? "pro" : state.momentum < -4 ? "con" : null;

  return (
    <div className="screen arena">
      <header className="topbar topbar--arena">
        <div className="brand">
          ⚖️ <span>DEBATE ARENA</span>
        </div>
        <div className="arena__motion">
          <small>Motion</small>
          {state.topic}
        </div>
        <div className="topbar__right">
          <button className="stage-trigger" onClick={onOpenStage} disabled={!state.groupGuid}><span aria-hidden="true">◉</span> Live stage</button>
          <div className="rounds">
            {state.rounds.map((r, i) => (
              <span key={r.name} className={`rounds__pill ${i === state.roundIndex ? "on" : i < state.roundIndex ? "done" : ""}`}>
                {r.name}
              </span>
            ))}
          </div>
          {state.phase === "round" && <TimerRing endsAt={state.phaseEndsAt} total={round.secs * 1000} size={58} />}
          <MuteButton />
        </div>
      </header>

      <div className="momentum">
        <span className="momentum__label" style={{ color: SIDE.pro.color }}>
          PRO <b><Num value={total(state.scores.pro)} /></b>
        </span>
        <div className="momentum__track">
          <motion.div className="momentum__pro" animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 60, damping: 14 }} />
          <motion.div className="momentum__marker" animate={{ left: `${pct}%` }} transition={{ type: "spring", stiffness: 60, damping: 14 }}>
            ⚖️
          </motion.div>
        </div>
        <span className="momentum__label" style={{ color: SIDE.con.color }}>
          <b><Num value={total(state.scores.con)} /></b> CON
        </span>
        <div className="momentum__caption">{leader ? `${fighter(state, leader)?.name} has the judge's ear` : "Dead even"}</div>
      </div>

      <div className="arena__grid">
        <Corner state={state} side="pro" typing={isTyping("pro")} floats={floats} bursts={bursts} me={mySide === "pro"} />

        <section className="feed">
          <div className="feed__head">
            <span>
              <i className="live-dot" /> Live debate
            </span>
            <AnimatePresence>
              {state.judgeThinking && (
                <motion.span className="feed__judge" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  ⚖️ judge is reviewing <TypingDots color="#f5c542" />
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {state.openQuestions.map((q) => (
              <motion.div
                key={q.to + q.q}
                className={`owed owed--${q.to} ${q.to === mySide ? "owed--me" : ""}`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <b>❓ {q.to === mySide ? "You were asked" : `${SIDE[q.to].label} owes an answer`}</b> “{q.q}”
              </motion.div>
            ))}
          </AnimatePresence>
          <div className="feed__body">
            <ChatPanel
              guid={state.groupGuid}
              readOnly={!mySide || deliberating}
              placeholder={mySide ? `Argue ${SIDE[mySide].stance}: ${state.topic}` : undefined}
              onTyping={() => void api("typing", { uid: me.uid }).catch(() => {})}
              emptyView={<div className="feed__empty">The floor is open. Make your case.</div>}
            />
          </div>
          {!mySide && (
            <div className="feed__note">
              You're in the crowd. Hype your side below and vote before the verdict.
            </div>
          )}
        </section>

        <Corner state={state} side="con" typing={isTyping("con")} floats={floats} bursts={bursts} me={mySide === "con"} />
      </div>

      <CrowdBar state={state} />

      <RoundBanner state={state} />

      <AnimatePresence>{deliberating && <Deliberating />}</AnimatePresence>
    </div>
  );
}

function Corner({ state, side, typing, floats, bursts, me }: { state: GameView; side: Side; typing: boolean; floats: Float[]; bursts: Burst[]; me: boolean }) {
  const f = fighter(state, side);
  const s = SIDE[side];
  const sc = state.scores[side];
  const t = total(sc);
  const prev = useRef(t);
  const [deltas, setDeltas] = useState<{ id: number; v: number }[]>([]);

  useEffect(() => {
    const d = Math.round((t - prev.current) * 10) / 10;
    prev.current = t;
    if (!d) return;
    const item = { id: ++seq, v: d };
    setDeltas((x) => [...x, item]);
    setTimeout(() => setDeltas((x) => x.filter((y) => y.id !== item.id)), 1600);
  }, [t]);

  const myFlags = state.flags.filter((x) => x.side === side).slice(-4).reverse();

  return (
    <section className={`corner corner--${side} ${typing ? "corner--typing" : ""}`} style={{ ["--c" as string]: s.color, ["--g" as string]: s.glow }}>
      <div className="corner__head">
        <Avatar src={f?.avatar ?? ""} color={s.color} size={76} glow />
        <div>
          <div className="corner__stance">
            {s.label} · {s.stance}
          </div>
          <div className="corner__name">
            {f?.name} {me && <em>(you)</em>}
          </div>
          <div className="corner__typing">{typing ? <><TypingDots color={s.color} /> arguing…</> : f?.online === false ? "offline" : " "}</div>
        </div>
      </div>

      <div className="corner__total">
        <b>
          <Num value={t} />
        </b>
        <small>/ 40</small>
        <AnimatePresence>
          {deltas.map((d) => (
            <motion.span
              key={d.id}
              className={`delta ${d.v > 0 ? "delta--up" : "delta--down"}`}
              initial={{ opacity: 0, y: 10, scale: 0.6 }}
              animate={{ opacity: 1, y: -26, scale: 1 }}
              exit={{ opacity: 0, y: -44 }}
            >
              {d.v > 0 ? "+" : ""}
              {d.v.toFixed(1)}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      <div className="bars">
        {CATS.map((c) => (
          <div key={c.key} className="bar">
            <span className="bar__label">
              {c.icon} {c.label}
            </span>
            <div className="bar__track">
              <motion.div className="bar__fill" animate={{ width: `${sc[c.key] * 10}%` }} transition={{ type: "spring", stiffness: 70, damping: 15 }} />
            </div>
            <b className="bar__val">{sc[c.key].toFixed(1)}</b>
          </div>
        ))}
      </div>

      <div className="flags">
        <AnimatePresence initial={false}>
          {myFlags.map((fl) => {
            const m = FLAG_META[fl.type];
            return (
              <motion.div
                key={fl.id}
                layout
                className={`flag ${m.good ? "flag--good" : "flag--bad"}`}
                initial={{ opacity: 0, x: side === "pro" ? -30 : 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
              >
                <span className="flag__emoji">{m.emoji}</span>
                <div>
                  <b>{fl.type === "fallacy" ? fl.label : m.title}</b>
                  <small>{fl.note}</small>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {!myFlags.length && <div className="flags__empty">No calls from the judge yet</div>}
      </div>

      <div className="corner__hype">
        {state.hype[side] > 0 && (
          <>
            🔥 <Num value={state.hype[side]} digits={0} /> hype
          </>
        )}
      </div>

      <div className="floats">
        <AnimatePresence>
          {floats
            .filter((x) => x.side === side)
            .map((x) => (
              <motion.span
                key={x.id}
                className="float"
                style={{ left: `${x.x}%` }}
                initial={{ y: 0, opacity: 0, scale: 0.4 }}
                animate={{ y: -320, opacity: [0, 1, 1, 0], scale: [0.4, 1.3, 1, 0.9], rotate: (x.x - 50) / 2 }}
                transition={{ duration: 1.8, ease: "easeOut" }}
              >
                {x.emoji}
              </motion.span>
            ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {bursts
          .filter((b) => b.flag.side === side)
          .slice(-1)
          .map((b) => {
            const m = FLAG_META[b.flag.type];
            return (
              <motion.div
                key={b.id}
                className={`burst ${m.good ? "burst--good" : "burst--bad"}`}
                initial={{ scale: 3, opacity: 0, rotate: side === "pro" ? -18 : 18 }}
                animate={{ scale: 1, opacity: 1, rotate: side === "pro" ? -8 : 8 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 18 }}
              >
                <span>{m.emoji}</span>
                <b>{m.title}</b>
                {b.flag.type === "fallacy" && <small>{b.flag.label}</small>}
              </motion.div>
            );
          })}
      </AnimatePresence>
    </section>
  );
}

function CrowdBar({ state }: { state: GameView }) {
  const me = state.me!;
  const isCrowd = me.role === "crowd";
  const c = state.crowd;
  const votes = c.pro + c.con;
  const pct = votes ? (c.pro / votes) * 100 : 50;

  const hype = (side: Side, emoji: string) => {
    sfx.pop();
    void api("hype", { uid: me.uid, side, emoji }).catch(() => {});
  };

  return (
    <div className="crowd">
      {isCrowd ? <Pad side="pro" onHype={hype} /> : <div className="crowd__spacer" />}
      <div className="crowd__center">
        {isCrowd && (
          <div className="crowd__vote">
            {(["pro", "con"] as Side[]).map((s) => (
              <button
                key={s}
                className={`vote-btn vote-btn--${s} ${state.myCrowdVote === s ? "on" : ""}`}
                onClick={() => void api("vote", { uid: me.uid, side: s }).catch(reportError)}
              >
                I'm with {fighter(state, s)?.name ?? SIDE[s].label}
              </button>
            ))}
          </div>
        )}
        <div className="crowd__meter">
          <span>👥 Crowd</span>
          <div className="crowd__track">
            <motion.div className="crowd__pro" animate={{ width: `${pct}%` }} />
          </div>
          <span>
            {c.pro} – {c.con}
          </span>
        </div>
      </div>
      {isCrowd ? <Pad side="con" onHype={hype} /> : <div className="crowd__spacer" />}
    </div>
  );
}

function Pad({ side, onHype }: { side: Side; onHype: (side: Side, emoji: string) => void }) {
  return (
    <div className={`pad pad--${side}`}>
      {HYPE.map((e) => (
        <motion.button key={e} whileTap={{ scale: 1.4 }} onClick={() => onHype(side, e)} title={`Hype ${SIDE[side].label}`}>
          {e}
        </motion.button>
      ))}
    </div>
  );
}

function RoundBanner({ state }: { state: GameView }) {
  const t = useElapsed(state.phaseStartedAt, 100);
  const show = state.phase === "round" && t < 2300;
  const r = state.rounds[state.roundIndex];
  return (
    <AnimatePresence>
      {show && (
        <motion.div key={state.roundIndex} className="round-banner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.small initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            Round {state.roundIndex + 1} of {state.rounds.length}
          </motion.small>
          <motion.h1 initial={{ scale: 2.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}>
            {r.name}
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
            {r.hint} · {r.secs}s
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const LINES = ["Checking receipts…", "Counting dodges…", "Weighing the logic…", "Re-reading the burns…", "Ignoring the crowd (mostly)…", "Sharpening the gavel…"];

function Deliberating() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % LINES.length), 900);
    const g = setInterval(() => sfx.gavel(), 1800);
    return () => {
      clearInterval(t);
      clearInterval(g);
    };
  }, []);
  return (
    <motion.div className="deliberate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="deliberate__gavel" animate={{ rotate: [-35, 15, -35] }} transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}>
        🔨
      </motion.div>
      <h2>The judge is deliberating</h2>
      <AnimatePresence mode="wait">
        <motion.p key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          {LINES[i]}
        </motion.p>
      </AnimatePresence>
    </motion.div>
  );
}
