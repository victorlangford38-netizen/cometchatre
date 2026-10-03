import { CometChat } from "@cometchat/chat-sdk-javascript";
import { CometChatUIKit, UIKitSettingsBuilder } from "@cometchat/chat-uikit-react";
import type { AppConfig } from "./api";

let initialized: Promise<unknown> | null = null;

export function initCometChat(cfg: AppConfig) {
  initialized ??= CometChatUIKit.init(
    new UIKitSettingsBuilder()
      .setAppId(cfg.appId)
      .setRegion(cfg.region)
      .setAuthKey(cfg.authKey)
      .subscribePresenceForAllUsers()
      // Per-tab sessions so several players can share one browser.
      .setStorageMode(CometChat.StorageMode.SESSION)
      .build(),
  );
  return initialized;
}

export async function loginAs(uid: string) {
  const current = CometChatUIKit.getLoggedInUser();
  if (current?.getUid() === uid) return current;
  if (current) await CometChatUIKit.logout();
  return CometChatUIKit.login(uid);
}

const seatKey = `${location.pathname}:seat`;
export const seatStore = {
  get: (): { uid: string; name: string } | null => JSON.parse(sessionStorage.getItem(seatKey) ?? "null"),
  set: (seat: { uid: string; name: string }) => sessionStorage.setItem(seatKey, JSON.stringify(seat)),
  clear: () => sessionStorage.removeItem(seatKey),
};
