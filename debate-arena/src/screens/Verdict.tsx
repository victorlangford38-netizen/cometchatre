import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import type { GameView, Side } from "../../shared/types";
import { api, reportError } from "../lib/api";
import { sfx } from "../lib/sfx";
import { CATS, FLAG_META, SIDE, fighter, total } from "../lib/sides";
import { Avatar, Button, MuteButton, useElapsed } from "../components/ui";
import { Num } from "./Arena";

const T = { title: 0, rows: 900, row: 650, totals: 3800, winner: 5600, words: 7000, crowd: 8300, actions: 9000 };

export function Verdict({ state, onOpenStage }: { state: GameView; onOpenStage: () => void }) {
  const v = state.verdict!;
  const t = useElapsed(state.phaseStartedAt, 60);
  const [busy, setBusy] = useState(false);
  const winner = v.winner;
  const shownRows = Math.max(0, Math.min(CATS.length, Math.floor((t - T.rows) / T.row) + 1));
  const showTotals = t > T.totals;
  const showWinner = t > T.winner;

  useEffect(() => {
    const timers = [
      ...CATS.map((_, i) => setTimeout(() => sfx.pop(), T.rows + i * T.row)),
      setTimeout(() => sfx.drumroll(1.6), T.totals),
      setTimeout(() => {
        sfx.boom();
        if (winner === "tie") return sfx.lose();
        sfx.win();
        const colors = [SIDE[winner].color, "#ffffff", "#f5c542"];
        const origin = winner === "pro" ? 0.25 : 0.75;
        confetti({ particleCount: 160, spread: 90, origin: { x: origin, y: 0.45 }, colors });
        setTimeout(() => confetti({ particleCount: 120, spread: 120, origin: { x: 0.5, y: 0.3 }, colors }), 350);
      }, T.winner),
      setTimeout(() => sfx.gavel(), T.words),
    ];
    return () => timers.forEach(clearTimeout);
  }, [winner]);

  const fighterCard = (side: Side) => {
    const f = fighter(state, side);
    const s = SIDE[side];
    const won = showWinner && winner === side;
    const lost = showWinner && winner !== "tie" && winner !== side;
    const counts = state.flags.filter((x) => x.side === side).reduce<Record<string, number>>((a, x) => ({ ...a, [x.type]: (a[x.type] ?? 0) + 1 }), {});
    return (
      <motion.div
        className={`vfighter vfighter--${side} ${won ? "vfighter--won" : ""} ${lost ? "vfighter--lost" : ""}`}
        style={{ ["--c" as string]: s.color, ["--g" as string]: s.glow }}
        animate={won ? { scale: 1.08 } : lost ? { scale: 0.92 } : { scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
      >
        {won && (
          <motion.div className="vfighter__crown" initial={{ y: -40, opacity: 0, rotate: -30 }} animate={{ y: 0, opacity: 1, rotate: 0 }}>
            👑
          </motion.div>
        )}
        <Avatar src={f?.avatar ?? ""} color={s.color} size={won ? 120 : 96} glow />
        <b>{f?.name}</b>
        <small>
          {s.label} · {s.stance}
        </small>
        <div className="vfighter__total">{showTotals ? <Num value={total(v.final[side])} /> : "—"}</div>
        <div className="vfighter__flags">
          {Object.entries(counts).map(([k, n]) => (
            <span key={k} title={FLAG_META[k as keyof typeof FLAG_META].title}>
              {FLAG_META[k as keyof typeof FLAG_META].emoji}×{n}
            </span>
          ))}
        </div>
      </motion.div>
    );
  };

  const judgeAgrees = v.crowdWinner !== "tie" && v.crowdWinner === winner;
  const crowdVotes = state.crowd.pro + state.crowd.con;

  return (
    <div className="screen verdict">
      <header className="topbar">
        <div className="brand">
          ⚖️ <span>DEBATE ARENA</span>
        </div>
        <div className="arena__motion">
          <small>Motion</small>
          {state.topic}
        </div>
        <div className="topbar__right">
          <button className="stage-trigger" onClick={onOpenStage} disabled={!state.groupGuid}>Live stage</button>
          <MuteButton />
        </div>
      </header>

      <motion.h1 className="verdict__title" initial={{ opacity: 0, scale: 1.6, letterSpacing: "0.5em" }} animate={{ opacity: 1, scale: 1, letterSpacing: "0.08em" }}>
        {showWinner ? (winner === "tie" ? "DEAD HEAT" : `${fighter(state, winner)?.name} WINS`) : "THE VERDICT"}
      </motion.h1>

      <div className="verdict__ring">
        {fighterCard("pro")}

        <div className="scorecard">
          {CATS.map((c, i) => {
            const a = v.final.pro[c.key];
            const b = v.final.con[c.key];
            const on = i < shownRows;
            return (
              <div key={c.key} className={`srow ${on ? "srow--on" : ""}`}>
                <span className={`srow__val ${on && a > b ? "win" : ""}`}>{on ? a.toFixed(1) : ""}</span>
                <div className="srow__bar srow__bar--pro">
                  <motion.div animate={{ width: on ? `${a * 10}%` : 0 }} transition={{ type: "spring", stiffness: 80, damping: 16 }} />
                </div>
                <span className="srow__label">
                  {c.icon}
                  <small>{c.label}</small>
                </span>
                <div className="srow__bar srow__bar--con">
                  <motion.div animate={{ width: on ? `${b * 10}%` : 0 }} transition={{ type: "spring", stiffness: 80, damping: 16 }} />
                </div>
                <span className={`srow__val ${on && b > a ? "win" : ""}`}>{on ? b.toFixed(1) : ""}</span>
              </div>
            );
          })}
        </div>

        {fighterCard("con")}
      </div>

      <AnimatePresence>
        {t > T.words && (
          <motion.div className="verdict__words" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
            <div className="ruling">
              <div className="ruling__who">⚖️ The Judge rules</div>
              <p>{v.summary}</p>
            </div>
            {v.keyMoment && (
              <motion.div className={`moment moment--${v.keyMoment.side}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
                <div className="moment__label">🎯 Key moment · {fighter(state, v.keyMoment.side)?.name}</div>
                <blockquote>“{v.keyMoment.quote}”</blockquote>
                {v.keyMoment.why && <small>{v.keyMoment.why}</small>}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {t > T.crowd && (
          <motion.div className="verdict__crowd" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            {!crowdVotes
              ? "👥 No crowd votes this time. Bring spectators next round."
              : v.crowdWinner === "tie"
                ? `👥 The crowd was split ${state.crowd.pro}–${state.crowd.con}.`
                : judgeAgrees
                  ? `👥 The crowd agreed with the judge (${state.crowd.pro}–${state.crowd.con}) ✅`
                  : `🍅 The crowd disagreed! They backed ${fighter(state, v.crowdWinner)?.name} ${Math.max(state.crowd.pro, state.crowd.con)}–${Math.min(state.crowd.pro, state.crowd.con)}. Humans vs AI.`}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {t > T.actions && (
          <motion.div className="verdict__actions" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Button
              big
              disabled={busy || state.hostUid !== state.me?.uid}
              onClick={async () => {
                setBusy(true);
                await api("rematch").catch(reportError).finally(() => setBusy(false));
              }}
            >
              🔁 Rematch, swap sides
            </Button>
            <Button variant="ghost" big disabled={busy || state.hostUid !== state.me?.uid} onClick={() => void api("reset").catch(reportError)}>
              New lineup
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
