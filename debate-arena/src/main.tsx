import { createRoot } from "react-dom/client";
import "@cometchat/chat-uikit-react/styles";
import "./styles.css";
import { getConfig } from "./lib/api";
import { initCometChat } from "./lib/cometchat";
import { App } from "./App";
import { Setup } from "./screens/Setup";

const root = createRoot(document.getElementById("root")!);

getConfig().then(async (cfg) => {
  if (cfg.missing.length) {
    root.render(<Setup missing={cfg.missing} />);
    return;
  }
  await initCometChat(cfg);
  root.render(<App llm={cfg.llm} />);
}).catch(() => { root.render(<div className="screen center"><p>The arena could not connect. Please reload to try again.</p><button onClick={() => location.reload()}>Reload</button></div>); });
