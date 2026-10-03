import { useEffect, useRef, useState, type ReactNode } from "react";
import { CometChat } from "@cometchat/chat-sdk-javascript";
import { CometChatMessageComposer, CometChatMessageList, useCometChatEvents } from "@cometchat/chat-uikit-react";
import { api } from "../lib/api";

type Entity = { group: CometChat.Group } | { user: CometChat.User };

/** A CometChat conversation (group or 1:1) styled for the game. */
export function ChatPanel({
  guid,
  uid,
  placeholder,
  emptyView,
  readOnly,
  onTyping,
  footer,
}: {
  guid?: string | null;
  uid?: string | null;
  placeholder?: string;
  emptyView?: ReactNode;
  readOnly?: boolean;
  onTyping?: () => void;
  footer?: ReactNode;
}) {
  const [entity, setEntity] = useState<Entity | null>(null);

  useEffect(() => {
    let alive = true;
    setEntity(null);
    const load = async (tries = 0) => {
      try {
        const e = guid ? { group: await CometChat.getGroup(guid) } : { user: await CometChat.getUser(uid!) };
        if (alive) setEntity(e);
      } catch {
        if (alive && tries < 10) setTimeout(() => load(tries + 1), 700);
      }
    };
    if (guid || uid) void load();
    return () => {
      alive = false;
    };
  }, [guid, uid]);

  const lastTyping = useRef(0);
  const handleText = (text: string) => {
    if (!onTyping || !text) return;
    const now = Date.now();
    if (now - lastTyping.current > 1500) {
      lastTyping.current = now;
      onTyping();
    }
  };

  if (!entity) {
    return (
      <div className="chat-panel chat-panel--loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel__list">
        <CometChatMessageList
          key={guid ?? uid ?? ""}
          {...entity}
          hideReceipts
          hideGroupActionMessages
          hideReplyInThreadOption
          hideMessagePrivatelyOption
          hideTranslateMessageOption
          hideMessageInfoOption
          hideFlagMessageOption
          hideEditMessageOption
          hideDeleteMessageOption
          hidePinMessageOption
          hideSaveMessageOption
          hideThreadSubscriptionOption
          hideStickyDate
          hideDateSeparator
          disableSoundForMessages
          scrollToBottomOnNewMessages
          emptyView={emptyView}
        />
      </div>
      {footer}
      {!readOnly && (
        <div className="chat-panel__composer">
          <CometChatMessageComposer
            {...entity}
            placeholder={placeholder}
            hideAttachmentButton
            hideVoiceRecordingButton
            hideStickersButton
            disableTypingEvents
            disableMentions
            disableSoundForMessage
            onTextChange={handleText}
          />
        </div>
      )}
    </div>
  );
}

/** Tells the game server about every message this player sends through CometChat. */
export function MessageReporter({ uid }: { uid: string }) {
  useCometChatEvents(
    (e) => {
      if (e.type !== "ui:message/sent" || String(e.status) !== "success") return;
      const m = e.message;
      if (!(m instanceof CometChat.TextMessage)) return;
      void api("message", { uid, receiverType: m.getReceiverType(), receiver: m.getReceiverId(), text: m.getText() });
    },
    [uid],
  );
  return null;
}
