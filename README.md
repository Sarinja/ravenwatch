<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RavenWatch — README</title>

<style>
:root {
  --bg:#0b0d12;
  --panel:#141a26;
  --panel-2:#101521;
  --border:#2a3144;
  --text:#e8ecf3;
  --muted:#9aa4b5;
  --accent:#b38b4d;
  --accent-2:#d6b16c;
}

body {
  margin:0;
  font-family:Inter,system-ui;
  background:linear-gradient(#0c1018,#090c12);
  color:var(--text);
  padding:30px;
}

.wrap { max-width:900px; margin:auto; }

.card {
  background:linear-gradient(var(--panel),var(--panel-2));
  border:1px solid var(--border);
  border-radius:12px;
  padding:18px;
  margin-bottom:14px;
}

h1 { font-size:1.9rem; margin-bottom:6px; }
h2 {
  font-size:0.9rem;
  text-transform:uppercase;
  color:var(--accent-2);
  letter-spacing:.08em;
}

p { margin:10px 0; }

ul, ol { margin-left:18px; }

.callout {
  border-left:4px solid var(--accent);
  padding:10px;
  background:rgba(179,139,77,.08);
  border-radius:8px;
  margin-top:10px;
}
</style>
</head>

<body>
<div class="wrap">

<div class="card">
<h1>🐦 RavenWatch</h1>
<p><strong>Real-time faction intelligence for Torn players.</strong></p>

<p>
RavenWatch is a lightweight desktop companion built to keep the information that matters
<strong>visible, current, and actionable</strong> during chains, wars, and travel.
</p>

<div class="callout">
The goal is simple: <strong>stop guessing, stop digging, and react faster.</strong>
</div>
</div>

<div class="card">
<h2>Core Purpose</h2>
<ul>
<li>Track faction chain timing in real time</li>
<li>Provide escalating urgency as chains get critical</li>
<li>Surface likely war targets before and during faction wars</li>
<li>Keep key player stats visible without tab switching</li>
<li>Reduce mental load during long play sessions</li>
</ul>
</div>

<div class="card">
<h2>Main Features</h2>

<p><strong>ChainGuard</strong></p>
<ul>
<li>Real-time chain monitoring</li>
<li>Visual urgency escalation</li>
<li>Sound alerts with optional custom assets</li>
<li>Designed to prevent missed chains</li>
</ul>

<p><strong>War Targeting</strong></p>
<ul>
<li>Pre-War Targets for scouting before a war begins</li>
<li>War Targets during active faction wars</li>
<li>Save the Chain mode during critical chain windows</li>
<li>Configurable number of displayed targets</li>
<li>Attack and Profile links for rapid action</li>
<li>Optional FFScouter integration for fair-fight enrichment</li>
<li>RavenWatch fallback scoring when FFScouter data is unavailable</li>
<li>Battle stat ratio validation against your own stats</li>
<li>Confidence scoring (High / Medium / Low) for all targets</li>
<li>Estimated stat percentage shown relative to your character</li>
<li>Automatic detection and penalization of unreliable FF values</li>
<li>Traveling players automatically excluded from targeting</li>
</ul>

<div class="callout">
Targets are no longer ranked on FF alone. RavenWatch now cross-checks FFScouter data against estimated battle stats, filters out invalid targets (like travelers), and highlights confidence so you can make faster, smarter decisions.
</div>

<p><strong>Player View</strong></p>
<ul>
<li>Character stats, cooldowns, and bars</li>
<li>Battle stats with totals</li>
<li>Stocks owned and total value</li>
</ul>

<p><strong>Travel Tracker</strong></p>
<ul>
<li>YATA import support</li>
<li>Location to item to drops structure</li>
<li>Average interval tracking</li>
<li>Foundation in place for future watchlists and drop prediction tools</li>
</ul>

<p><strong>Alerts + Settings</strong></p>
<ul>
<li>Lightweight event log</li>
<li>Local storage persistence</li>
<li>Configurable refresh and behavior settings</li>
<li>Always on Top support</li>
</ul>

</div>

<div class="card">
<h2>How It Works</h2>
<ol>
<li>Enter your license key</li>
<li>Enter your Torn API key</li>
<li>Optionally add faction ID, YATA key, and FFScouter key</li>
<li>Click "Save"</li>
<li>Load your data</li>
<li>Enable auto refresh if desired</li>
<li>RavenWatch keeps timing, war state, and target awareness current</li>
</ol>

<div class="callout">
You focus on playing. RavenWatch handles awareness.
</div>
</div>

<div class="card">
<h2>Tabs</h2>
<ul>
<li><strong>Dashboard</strong> — command view for chain, war, and live target awareness</li>
<li><strong>Player</strong> — stats, battle stats, and owned stocks</li>
<li><strong>Travel</strong> — imported travel data and drop tracking</li>
<li><strong>Alerts</strong> — system event log</li>
<li><strong>Settings</strong> — API keys, behavior, sound, and window preferences</li>
<li><strong>Info</strong> — app information and bundled documentation</li>
</ul>
</div>

<div class="card">
<h2>Strengths</h2>
<ul>
<li>Fast and lightweight</li>
<li>Chain-focused design</li>
<li>Useful before and during war</li>
<li>Minimal UI clutter</li>
<li>Local, persistent data</li>
<li>Cross-platform desktop app for Mac and Windows</li>
</ul>

<h2>Limitations</h2>
<ul>
<li>Depends on Torn API availability</li>
<li>Some target ranking is only as good as available data</li>
<li>FFScouter enrichment is optional and external</li>
<li>Travel prediction tools are still evolving</li>
</ul>
</div>

<div class="card">
<h2>Security + Licensing</h2>
<ul>
<li>Server-backed license validation</li>
<li>Device-based activation tracking</li>
<li>Admin-controlled revoke and restore access</li>
<li>Automatic session token management</li>
<li>Offline grace mode for temporary connectivity loss</li>
<li>Mid-session validation for live enforcement</li>
</ul>

<div class="callout">
RavenWatch is designed to remain lightweight for users while maintaining strong control over access and distribution.
</div>
</div>

<div class="card">
<h2>Bottom Line</h2>
<p>
RavenWatch gives you a <strong>timing and awareness advantage</strong> during chains and faction wars.
</p>

<p>
Everything else exists to support that.
</p>
</div>

</div>
</body>
</html>
