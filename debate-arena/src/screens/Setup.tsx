export function Setup({ missing }: { missing: string[] }) {
  return <div className="screen center"><div className="card setup"><h1>The arena is getting ready</h1><p>The host needs to finish setting up this arena. Please try again later.</p>{import.meta.env.DEV && <details><summary>Local setup details</summary><p>Set these server environment variables, then restart:</p><ul>{missing.map(m => <li key={m}><code>{m}</code></li>)}</ul></details>}<button onClick={() => location.reload()}>Try again</button></div></div>;
}
