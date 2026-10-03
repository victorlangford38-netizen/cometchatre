import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CometChatProvider } from "@cometchat/chat-uikit-react";
import type { GameView } from "../shared/types";
import { api, useGameState } from "./lib/api";
import { loginAs, seatStore } from "./lib/cometchat";
import { MessageReporter } from "./components/ChatPanel";
import { Lobby } from "./screens/Lobby";
import { Spin, Faceoff } from "./screens/Show";
import { Arena } from "./screens/Arena";
import { Verdict } from "./screens/Verdict";

export function App({ llm }: { llm: string }) {
  const [seat, setSeat] = useState(seatStore.get());
  const [chatReady, setChatReady] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = useGameState<GameView>(seat?.uid ?? null);

  useEffect(() => {
    if (!state || !seat || state.me || state.phase !== "lobby") return;
    api("join", { name: seat.name, uid: seat.uid })
      .then((s) => {
        const next = { uid: s.uid, name: s.name };
        seatStore.set(next);
        setSeat(next);
      })
      .catch(() => {
        seatStore.clear();
        setSeat(null);
      });
  }, [state?.me, state?.phase, seat]);

  useEffect(() => {
    if (!seat) return;
    setChatReady(null);
    loginAs(seat.uid)
      .then(() => setChatReady(seat.uid))
      .catch((e) => setError(`CometChat login failed: ${e?.message ?? e}`));
  }, [seat?.uid]);

  const join = async (name: string) => {
    const s = await api("join", { name });
    const next = { uid: s.uid, name: s.name };
    seatStore.set(next);
    setSeat(next);
  };

  if (error) return <div className="screen center error">{error}</div>;
  if (!state) return <div className="backdrop" />;

  const inRoom = !!(seat && state.me && chatReady === seat.uid);
  const p = state.phase;
  const inGame = inRoom && p !== "lobby" && p !== "setup";
  const key = !inGame ? "lobby" : p === "spin" ? `spin-${state.gameNo}` : p === "faceoff" ? `faceoff-${state.gameNo}` : p === "verdict" ? `verdict-${state.gameNo}` : `arena-${state.gameNo}`;

  const content = (
    <AnimatePresence mode="wait">
      <motion.div
        key={key}
        className="phase"
        initial={{ opacity: 0, scale: 1.02 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.35 }}
      >
        {!inGame ? (
          <Lobby state={state} joined={inRoom} onJoin={join} llm={llm} />
        ) : p === "spin" ? (
          <Spin state={state} />
        ) : p === "faceoff" ? (
          <Faceoff state={state} />
        ) : p === "verdict" ? (
          <Verdict state={state} />
        ) : (
          <Arena state={state} />
        )}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <>
      <div className="backdrop">
        <div className="beam beam--l" />
        <div className="beam beam--r" />
      </div>
      {inRoom ? (
        <CometChatProvider theme="dark" config={{ hideReceipts: true }}>
          <MessageReporter uid={seat!.uid} />
          {content}
        </CometChatProvider>
      ) : (
        content
      )}
    </>
  );
}
