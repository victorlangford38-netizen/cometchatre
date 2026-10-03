import { useEffect, useState } from "react";
import { animate, motion, useMotionValue } from "framer-motion";
import type { GameView, Side } from "../../shared/types";
import { sfx } from "../lib/sfx";
import { SIDE, fighter } from "../lib/sides";
import { Avatar, useElapsed } from "../components/ui";

const ITEM = 96;

export function Spin({ state }: { state: GameView }) {
  const reel = state.topicReel;
  const y = useMotionValue(0);
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    let last = 0;
    const unsub = y.on("change", (v) => {
      const i = Math.round(-v / ITEM);
      if (i !== last) {
        last = i;
        sfx.tick();
      }
    });
    sfx.whoosh();
    const ctl = animate(y, -(reel.length - 1) * ITEM, {
      duration: 3.2,
      ease: [0.12, 0.72, 0.2, 1],
      onComplete: () => {
        setLanded(true);
        sfx.boom();
      },
    });
    return () => {
      unsub();
      ctl.stop();
    };
  }, [reel.length, y]);

  return (
    <div className="screen center spin">
      <motion.div className="spin__kicker" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        Tonight's motion
      </motion.div>
      <div className={`reel ${landed ? "reel--landed" : ""}`}>
        <motion.div className="reel__track" style={{ y }}>
          {reel.map((t, i) => (
            <div key={i} className="reel__item">
              {t}
            </div>
          ))}
        </motion.div>
        <div className="reel__fade" />
      </div>
      <motion.div className="spin__sides" initial={{ opacity: 0 }} animate={{ opacity: landed ? 1 : 0 }}>
        <span style={{ color: SIDE.pro.color }}>{fighter(state, "pro")?.name} argues FOR</span>
        <span className="muted">·</span>
        <span style={{ color: SIDE.con.color }}>{fighter(state, "con")?.name} argues AGAINST</span>
      </motion.div>
    </div>
  );
}

function FaceoffSide({ state, side }: { state: GameView; side: Side }) {
  const f = fighter(state, side);
  const s = SIDE[side];
  const dir = side === "pro" ? -1 : 1;
  return (
    <motion.div
      className={`faceoff__side faceoff__side--${side}`}
      initial={{ x: `${dir * 110}%`, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 90, damping: 14, delay: 0.1 }}
    >
      <Avatar src={f?.avatar ?? ""} color={s.color} size={180} glow />
      <div className="faceoff__name">{f?.name}</div>
      <div className="faceoff__stance" style={{ color: s.color }}>
        {s.label} · {s.stance}
      </div>
    </motion.div>
  );
}

export function Faceoff({ state }: { state: GameView }) {
  const t = useElapsed(state.phaseStartedAt, 50);
  const slam = t > 850;
  const round = t > 3000;

  useEffect(() => {
    sfx.whoosh();
    const a = setTimeout(() => sfx.boom(), 850);
    const b = setTimeout(() => sfx.bell(), 3100);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  return (
    <motion.div className="screen faceoff" animate={slam ? { x: [0, -14, 12, -8, 5, 0] } : undefined} transition={{ duration: 0.45 }}>
      <motion.div className="faceoff__motion" initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <small>The motion</small>“{state.topic}”
      </motion.div>
      <div className="faceoff__row">
        <FaceoffSide state={state} side="pro" />
        <motion.div
          className="faceoff__vs"
          initial={{ scale: 6, opacity: 0, rotate: -20 }}
          animate={slam ? { scale: 1, opacity: 1, rotate: 0 } : {}}
          transition={{ type: "spring", stiffness: 400, damping: 16 }}
        >
          VS
        </motion.div>
        <FaceoffSide state={state} side="con" />
      </div>
      <motion.div className="faceoff__round" initial={{ opacity: 0, y: 30 }} animate={round ? { opacity: 1, y: 0 } : {}}>
        Round 1 · {state.rounds[0]?.name}
      </motion.div>
      {slam && <div className="faceoff__flash" />}
    </motion.div>
  );
}
