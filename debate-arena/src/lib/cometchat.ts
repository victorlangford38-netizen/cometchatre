import { CometChat } from "@cometchat/chat-sdk-javascript";
import { CometChatUIKit, UIKitSettingsBuilder } from "@cometchat/chat-uikit-react";
import { roomId, type AppConfig } from "./api";

let initialized: Promise<unknown> | null = null;

export function initCometChat(cfg: AppConfig) {
  initialized ??= CometChatUIKit.init(
    new UIKitSettingsBuilder()
      .setAppId(cfg.appId)
      .setRegion(cfg.region)
      .setAuthKey("")
      .subscribePresenceForAllUsers()
      // Per-tab sessions so several players can share one browser.
      .setStorageMode(CometChat.StorageMode.SESSION)
      .build(),
  );
  return initialized;
}

export async function loginAs(uid: string, authToken: string) {
  const current = CometChatUIKit.getLoggedInUser();
  if (current?.getUid() === uid) return current;
  if (current) await CometChatUIKit.logout();
  return CometChatUIKit.loginWithAuthToken(authToken);
}

const seatKey = () => `arena-seat:${roomId() ?? "new"}`;
type Seat = { uid: string; name: string; authToken: string };
export const seatStore = {
  get: (): Seat | null => { try { return JSON.parse(sessionStorage.getItem(seatKey()) ?? "null"); } catch { return null; } },
  set: (seat: Seat) => sessionStorage.setItem(seatKey(), JSON.stringify(seat)),
  clear: () => sessionStorage.removeItem(seatKey()),
};
