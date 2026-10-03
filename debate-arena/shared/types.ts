export type Phase = "lobby" | "setup" | "spin" | "faceoff" | "round" | "deliberating" | "verdict";
export type Side = "pro" | "con";
export type Role = Side | "crowd";

export interface Scores {
  evidence: number;
  logic: number;
  clarity: number;
  rebuttal: number;
}

export type FlagType = "dodge" | "fallacy" | "unsupported" | "strong" | "receipts" | "burn";

export interface Flag {
  id: number;
  side: Side;
  type: FlagType;
  label: string;
  note: string;
  at: number;
}

export interface OpenQuestion {
  to: Side;
  q: string;
}

export interface PlayerView {
  uid: string;
  name: string;
  avatar: string;
  role: Role;
  online: boolean;
}

export interface VerdictView {
  winner: Side | "tie";
  summary: string;
  keyMoment: { side: Side; quote: string; why: string } | null;
  final: Record<Side, Scores>;
  crowdWinner: Side | "tie";
}

export interface RoundInfo {
  name: string;
  hint: string;
  secs: number;
}

export interface GameView {
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  serverNow: number;
  gameNo: number;
  me: { uid: string; role: Role } | null;
  players: PlayerView[];
  judgeUid: string;
  groupGuid: string | null;
  topic: string | null;
  topicReel: string[];
  rounds: RoundInfo[];
  roundIndex: number;
  scores: Record<Side, Scores>;
  momentum: number;
  flags: Flag[];
  openQuestions: OpenQuestion[];
  crowd: Record<Side, number>;
  myCrowdVote: Side | null;
  hype: Record<Side, number>;
  judgeThinking: boolean;
  verdict: VerdictView | null;
  llm: string;
}
