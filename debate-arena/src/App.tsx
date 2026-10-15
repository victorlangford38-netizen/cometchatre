import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CometChatProvider } from "@cometchat/chat-uikit-react";
import type { GameView } from "../shared/types";
import { api, useGameState, roomId, guestToken, enterRoom } from "./lib/api";
import { loginAs, seatStore } from "./lib/cometchat";
import { MessageReporter } from "./components/ChatPanel";
import { Lobby } from "./screens/Lobby";
import { Spin, Faceoff } from "./screens/Show";
import { Arena } from "./screens/Arena";
import { Verdict } from "./screens/Verdict";
import { LiveStage } from "./components/LiveStage";

export function App({ llm }: { llm: string }) {
  const [stageOpen, setStageOpen] = useState(false);
  const [seat, setSeat] = useState(seatStore.get());
  const [chatReady, setChatReady] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = useGameState<GameView>(seat?.uid ?? null);

  const [connection, setConnection] = useState("");
  useEffect(() => {
    const connect = (e: Event) => setConnection((e as CustomEvent).detail);
    const fail = (e: Event) => setError((e as CustomEvent).detail);
    window.addEventListener("arena-connection", connect);
    window.addEventListener("arena-error", fail);
    return () => { window.removeEventListener("arena-connection", connect); window.removeEventListener("arena-error", fail); };
  }, []);

  useEffect(() => {
    if (!seat) return;
    setChatReady(null);
    loginAs(seat.uid, seat.authToken)
      .then(() => setChatReady(seat.uid))
      .catch((e) => setError(`CometChat login failed: ${e?.message ?? e}`));
  }, [seat?.uid]);

  const join = async (name: string) => {
    const token = guestToken();
    const id = roomId() ?? crypto.randomUUID().replaceAll("-", "");
    const s = await api(roomId() ? "join" : "create", { name, room: id });
    enterRoom(s.roomId, token);
    const next = { uid: s.uid, name: s.name, authToken: s.authToken };
    seatStore.set(next);
    setSeat(next);
  };

  if (!state) return <div className="screen center"><p role="status">{connection || "Opening the arena…"}</p>{connection && <a href="/">Create a new arena</a>}</div>;

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
          <Verdict state={state} onOpenStage={() => setStageOpen(true)} />
        ) : (
          <Arena state={state} onOpenStage={() => setStageOpen(true)} />
        )}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <>
      {(connection || error) && <div className="connection-notice" role="status">{error || connection}{error && <button onClick={() => { setError(null); location.reload(); }}>Retry</button>} <a href="/">New arena</a></div>}
      <div className="backdrop">
        <div className="beam beam--l" />
        <div className="beam beam--r" />
      </div>
      {inRoom ? (
        <CometChatProvider theme="dark" config={{ hideReceipts: true }}>
          <MessageReporter uid={seat!.uid} />
          {content}
          {stageOpen && state.groupGuid && <LiveStage key={state.groupGuid} state={state} onClose={() => setStageOpen(false)} />}
        </CometChatProvider>
      ) : (
        content
      )}
    </>
  );
}
