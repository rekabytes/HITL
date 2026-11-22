import { Badge, PageHeader, PanelHead } from "@/components/ui";

const base = process.env.APP_URL?.replace(/\/$/, "") || "https://your-hitl-domain.example";

function CodeBlock({ children }: { children: string }) {
  return <pre className="api-code"><code>{children}</code></pre>;
}

function Endpoint({ method, path, description, children }: { method: string; path: string; description: string; children: React.ReactNode }) {
  return (
    <section className="panel api-endpoint">
      <div className="api-endpoint-head">
        <div>
          <div className="api-method"><Badge tone="ok">{method}</Badge><code>{path}</code></div>
          <p className="api-description">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function DocsPage() {
  return (
    <main className="docs-page">
      <PageHeader
        eyebrow={{ icon: "info", text: "Developer reference" }}
        title="HITL public API"
        sub="Read-only v1 endpoints for backend monitoring of service health, ESP32 connectivity, and sensor readings."
      />

      <div className="docs-intro panel">
        <div>
          <Badge tone="ok" icon="lock">Public · read-only · v1</Badge>
          <h2>Getting started</h2>
          <p>All endpoints use <code>GET</code>, return JSON, and are available without authentication.</p>
        </div>
        <CodeBlock>{`curl ${base}/v1/health`}</CodeBlock>
      </div>

      <div className="stack">
        <Endpoint method="GET" path="/v1/health" description="Checks the database, Redis cache, and ML service.">
          <CodeBlock>{`{
  "status": "ok",
  "timestamp": "2026-11-22T12:00:00.000Z",
  "services": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "ml": { "status": "up", "model": "random_forest", "trainedAt": "..." }
  }
}`}</CodeBlock>
          <p className="api-note">Returns <code>503</code> when the database is down. Redis or ML can be down while the overall health response remains available.</p>
        </Endpoint>

        <Endpoint method="GET" path="/v1/esp32-status" description="Returns connectivity status for every registered ESP32 device.">
          <div className="api-subhead"><PanelHead title="Optional query" /></div>
          <p className="api-note"><code>?deviceId=esp32-l21-prod-a</code> filters the response to one device.</p>
          <CodeBlock>{`{
  "status": "ok",
  "timestamp": "...",
  "thresholds": { "onlineMinutes": 3 },
  "summary": { "total": 3, "online": 1, "offline": 2, "inactive": 0, "neverReported": 0 },
  "devices": [{
    "deviceId": "esp32-l21-prod-a",
    "label": "Sensor",
    "firmwareVersion": "hitl-1.4.0",
    "active": true,
    "status": "online",
    "lastSeenAt": "...",
    "lastHeartbeatAt": "...",
    "rooms": ["L21"]
  }]
}`}</CodeBlock>
        </Endpoint>

        <Endpoint method="GET" path="/v1/sensor-status" description="Returns hardware status and last readings for the environmental sensor and optional CO₂ sensor.">
          <div className="api-subhead"><PanelHead title="Optional query" /></div>
          <p className="api-note"><code>?deviceId=esp32-l21-prod-a</code> filters the response to one sensor.</p>
          <CodeBlock>{`{
  "status": "ok",
  "timestamp": "...",
  "thresholds": { "onlineMinutes": 3 },
  "summary": { "total": 3, "online": 1, "offline": 1, "unknown": 1, "inactive": 0 },
  "sensors": [{
    "deviceId": "esp32-l21-prod-a",
    "label": "Sensor",
    "firmwareVersion": "hitl-1.4.0",
    "status": "online",
    "active": true,
    "lastReadingAt": "...",
    "temperatureC": 26.38,
    "humidityPct": 58.45,
    "pressureHpa": null,
    "co2": { "status": "online", "lastReadingAt": "...", "ppm": 413 },
    "rooms": ["L21"]
  }]
}`}</CodeBlock>
        </Endpoint>
      </div>

      <div className="grid grid-2 mt">
        <section className="panel">
          <PanelHead icon="activity" title="Status rules" />
          <dl className="api-definitions">
            <dt>ESP32 online</dt><dd>Active and in contact within 3 minutes.</dd>
            <dt>ESP32 offline</dt><dd>Active, with no contact for at least 3 minutes.</dd>
            <dt>Sensor online</dt><dd>The connected ESP32 successfully read the environmental sensor.</dd>
            <dt>Sensor offline</dt><dd>The connected ESP32 could not read the environmental sensor.</dd>
            <dt>Sensor unknown</dt><dd>The ESP32 is offline or has not reported a sensor check.</dd>
            <dt>CO₂</dt><dd>Reported separately. In addition to online, offline, unknown and inactive, CO₂ can be warming_up or not_installed (no CO₂ check reported by the connected firmware). The last ppm value can be historical.</dd>
            <dt>Inactive</dt><dd>Device is disabled in the admin.</dd>
            <dt>Never reported</dt><dd>No accepted timestamp or reading exists.</dd>
          </dl>
        </section>
        <section className="panel">
          <PanelHead icon="shield" title="Limits and errors" />
          <dl className="api-definitions">
            <dt>Rate limit</dt><dd>60 requests per client IP per minute.</dd>
            <dt>400</dt><dd>The <code>deviceId</code> value is invalid.</dd>
            <dt>404</dt><dd>The requested device does not exist.</dd>
            <dt>503</dt><dd>The backend could not read the required data.</dd>
            <dt>Cache</dt><dd>Responses use <code>Cache-Control: no-store</code>.</dd>
          </dl>
        </section>
      </div>

      <p className="docs-footnote">Public responses contain monitoring data only. Device keys, key hashes, database IDs, user data, and internal error details are never returned.</p>
    </main>
  );
}
