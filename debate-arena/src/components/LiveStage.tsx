import { useEffect, useRef, useState } from "react";
import { CometChat } from "@cometchat/chat-sdk-javascript";
import type { CometChatCalls as CallsSDK } from "@cometchat/calls-sdk-javascript";
import type { GameView } from "../../shared/types";
import { getConfig, api } from "../lib/api";
import { SIDE, fighter, total } from "../lib/sides";
import { ChatPanel } from "./ChatPanel";
import "./live-stage.css";

let initialization: Promise<typeof CallsSDK> | null = null;
async function getCalls() {
  initialization ??= (async () => {
    const [{ CometChatCalls }, config] = await Promise.all([import("@cometchat/calls-sdk-javascript"), getConfig()]);
    const result = await CometChatCalls.init({ appId: config.appId, region: config.region as "us" | "eu" | "in" });
    if (!result.success) throw new Error(result.error.message);
    return CometChatCalls;
  })().catch((e) => { initialization = null; throw e; });
  return initialization;
}

export function LiveStage({ state, onClose }: { state: GameView; onClose: () => void }) {
  const [mode, setMode] = useState<"camera" | "voice" | "quiet" | null>(null);
  const [speaker, setSpeaker] = useState("");
  const [status, setStatus] = useState("Ready when you are");
  const [connected, setConnected] = useState(false);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const spectator = state.me?.role === "crowd";
  const sessionId = state.groupGuid ? `${state.groupGuid}-stage` : null;

  useEffect(() => {
    const previous = previousFocus.current;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key !== "Tab") return;
      const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); previous?.focus(); };
  }, []);

  useEffect(() => {
    if (!mode || !sessionId || !container.current) return;
    let cancelled = false;
    let calls: typeof CallsSDK | null = null;
    let started = false;
    const unsubscribers: (() => void)[] = [];
    setError(""); setStatus("Connecting to CometChat…"); setConnected(false); setSpeaker(""); setCount(0);
    (async () => {
      calls = await getCalls();
      if (cancelled) return;
      const user = await CometChat.getLoggedinUser();
      if (!user || user.getUid() !== state.me?.uid) throw new Error("Sign in again before joining the stage.");
      if (cancelled) return;
      unsubscribers.push(
        calls.addEventListener("onSessionJoined", () => { if (!cancelled) { setConnected(true); setStatus("Connected"); } }),
        calls.addEventListener("onParticipantListChanged", (participants) => { if (!cancelled) setCount(participants.length + (participants.some(p => p.uid === user.getUid()) ? 0 : 1)); }),
        calls.addEventListener("onParticipantAudioUnmuted", (participant) => { if (!cancelled) setSpeaker(participant.name); }),
        calls.addEventListener("onAudioUnMuted", () => { if (!cancelled) setSpeaker(user.getName()); }),
        calls.addEventListener("onParticipantAudioMuted", (participant) => { if (!cancelled) setSpeaker((name) => name === participant.name ? "" : name); }),
        calls.addEventListener("onAudioMuted", () => { if (!cancelled) setSpeaker((name) => name === user.getName() ? "" : name); }),
        calls.addEventListener("onSessionLeft", () => { if (!cancelled) closeRef.current(); }),
        calls.addEventListener("onLeaveSessionButtonClicked", () => closeRef.current()),
        calls.addEventListener("onConnectionLost", () => { if (!cancelled) { setConnected(false); setStatus("Reconnecting…"); } }),
        calls.addEventListener("onConnectionRestored", () => { if (!cancelled) { setConnected(true); setStatus("Connected"); } }),
        calls.addEventListener("onConnectionFailed", () => { if (!cancelled) { setError("The camera session could not connect. Check your connection and that Calls is enabled for this CometChat app."); setConnected(false); } }),
      );
      // Reuse the current per-tab Chat identity. Never store or display this token.
      const token = await calls.generateToken(sessionId, user.getAuthToken());
      if (cancelled || !container.current) return;
      started = true;
      const result = await calls.joinSession(token.token, {
        sessionType: "VIDEO", layout: "TILE", startAudioMuted: mode !== "voice" || spectator,
        startVideoPaused: mode !== "camera" || spectator,
        autoStartRecording: false, autoStartTranscription: false,
        hideRecordingButton: true, hideTranscriptionButton: true,
        hideChatButton: true, hideShareInviteButton: true, hideStreamingButton: true,
        hideToggleAudioButton: spectator, hideToggleVideoButton: spectator,
        hideScreenSharingButton: true, hideNetworkIndicator: false,
      }, container.current);
      if (cancelled) { calls.leaveSession(); return; }
      if (result.error) throw new Error(result.error.message);
    })().catch((e: unknown) => {
      if (!cancelled) { setError(e instanceof Error ? e.message : "Calling is unavailable. Check that Calls is enabled for this app."); setConnected(false); }
    });
    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      if (started) calls?.leaveSession();
    };
  }, [mode, sessionId, state.me?.uid, spectator]);

  return <section ref={dialog} className="live-stage" role="dialog" aria-modal="true" aria-labelledby="stage-title">
    <header className="live-stage__header">
      <div><span className="live-stage__eyebrow">DEBATE ARENA / COMETCHAT VIDEO</span><h2 id="stage-title">Face to face. Argument to argument.</h2></div>
      <button className="live-stage__close" onClick={onClose} autoFocus>{mode ? "Leave stage" : "Back to debate"} <span aria-hidden="true">↗</span></button>
    </header>
    <div className="live-stage__match"><span style={{color:SIDE.pro.color}}>PRO · {fighter(state,"pro")?.name} <b>{total(state.verdict?.final.pro ?? state.scores.pro).toFixed(1)}</b></span><p>{state.topic}</p><span style={{color:SIDE.con.color}}><b>{total(state.verdict?.final.con ?? state.scores.con).toFixed(1)}</b> {fighter(state,"con")?.name} · CON</span></div>
    <div className="live-stage__body">
      <div className="live-stage__video">
        <div ref={container} className="live-stage__sdk" aria-label="CometChat video stage" />
        {!mode && <div className="live-stage__welcome"><span className="live-stage__lens" aria-hidden="true">◉</span><h3>Bring the debate<br/>to life.</h3><p>{spectator ? "Watch the debaters on the live stage. Your camera and microphone stay off." : "Go face to face, or let your voice do the talking. Camera off? Your avatar takes your place."}</p><div className="live-stage__choices">{!spectator && <><button className="live-stage__join" onClick={() => setMode("camera")}>Join with camera <span aria-hidden="true">↗</span></button><button className="live-stage__quiet" onClick={() => setMode("voice")}>Join with voice</button></>}<button className={spectator ? "live-stage__join" : "live-stage__quiet"} onClick={() => setMode("quiet")}>{spectator ? "Watch stage" : "Join muted"}</button></div><small className="live-stage__consent">{!spectator && "Camera mode starts with your microphone muted. Voice mode turns on your microphone."}</small></div>}
        {mode && !connected && !error && <p className="live-stage__connection" role="status">{status}</p>}
        {error && <div className="live-stage__failure" role="alert"><h3>Couldn’t join the stage</h3><p>{error}</p><button onClick={() => {setMode(null);setError("");}}>Try again</button></div>}
      </div>
      <aside className="live-stage__chat"><div className="live-stage__chat-title"><span>THE ARGUMENT</span><small>Text scored live by the AI judge</small></div><ChatPanel guid={state.groupGuid} readOnly={spectator || state.phase !== "round"} placeholder="Make your case…" onTyping={() => void api("typing", {uid:state.me?.uid}).catch(() => {})} emptyView={<p className="live-stage__empty">Keep your evidence in the chat.</p>}/></aside>
    </div>
    <footer className="live-stage__footer"><span><i className={connected ? "is-connected" : ""}/>{connected ? `Connected${count ? ` · ${count} on stage` : ""}` : error ? "Not connected" : mode ? status : "Camera is off"}</span>{connected && speaker && <span className="live-stage__speaker"><span className="voice-bars" aria-hidden="true">{[0,1,2,3,4].map(i=><i key={i} style={{animationDelay:`${i*.11}s`}}/>)}</span>{speaker} · voice live</span>}<p>The judge scores chat messages. Camera audio is not scored.</p></footer>
  </section>;
}
