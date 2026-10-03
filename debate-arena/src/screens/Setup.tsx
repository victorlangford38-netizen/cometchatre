export function Setup({ missing }: { missing: string[] }) {
  return (
    <div className="screen center">
      <div className="card setup">
        <h1>Almost there</h1>
        <p>This game needs CometChat credentials. Missing:</p>
        <ul>
          {missing.map((m) => (
            <li key={m}>
              <code>{m}</code>
            </li>
          ))}
        </ul>
        <ol>
          <li>
            Run <code>npx @cometchat/skills-cli auth login</code> then <code>npx @cometchat/skills-cli provision run</code>{" "}
            in this folder (fills App ID, Region, Auth Key), or copy them from the dashboard into <code>.env</code>.
          </li>
          <li>
            Add <code>COMETCHAT_REST_API_KEY</code> to <code>.env</code> (Dashboard → API &amp; Auth Keys).
          </li>
          <li>
            Optionally add <code>LLM_API_KEY</code> (OpenAI, Anthropic or Gemini), then restart <code>npm run dev</code>.
          </li>
        </ol>
      </div>
    </div>
  );
}
