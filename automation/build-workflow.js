/**
 * Builds workflow.n8n.json from n8n-agent.js so the agent code is embedded
 * with correct JSON escaping. Run: node automation/build-workflow.js
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const jsCode = fs.readFileSync(path.join(dir, 'n8n-agent.js'), 'utf8');

const PATH = 'umfaris-wa';

const workflow = {
  name: 'Umfaris WhatsApp Agent',
  nodes: [
    {
      parameters: {
        httpMethod: 'GET',
        path: PATH,
        responseMode: 'responseNode',
        options: {},
      },
      id: 'webhook-verify',
      name: 'Webhook Verify (GET)',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [240, 120],
      webhookId: 'umfaris-wa-verify',
    },
    {
      parameters: {
        respondWith: 'text',
        responseBody: "={{ $json.query['hub.challenge'] }}",
        options: {},
      },
      id: 'respond-challenge',
      name: 'Respond Challenge',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [480, 120],
    },
    {
      parameters: {
        httpMethod: 'POST',
        path: PATH,
        responseMode: 'onReceived',
        responseCode: 200,
        options: {},
      },
      id: 'webhook-messages',
      name: 'Webhook Messages (POST)',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [240, 360],
      webhookId: 'umfaris-wa-messages',
    },
    {
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode,
      },
      id: 'agent',
      name: 'Agent',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [480, 360],
    },
  ],
  connections: {
    'Webhook Verify (GET)': {
      main: [[{ node: 'Respond Challenge', type: 'main', index: 0 }]],
    },
    'Webhook Messages (POST)': {
      main: [[{ node: 'Agent', type: 'main', index: 0 }]],
    },
  },
  active: false,
  settings: { executionOrder: 'v1' },
  pinData: {},
};

fs.writeFileSync(path.join(dir, 'workflow.n8n.json'), JSON.stringify(workflow, null, 2));
console.log('Wrote workflow.n8n.json (placeholders, safe to commit) — ' + jsCode.length + ' chars embedded');

// If a gitignored secrets file exists, also emit a FILLED workflow.local.json for import.
const secretsPath = path.join(dir, 'secrets.local.json');
if (fs.existsSync(secretsPath)) {
  const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
  let filled = jsCode;
  for (const [k, v] of Object.entries(secrets)) filled = filled.split(k).join(v);
  const missing = (filled.match(/PASTE_[A-Z_]+/g) || []);
  const wf = JSON.parse(JSON.stringify(workflow));
  wf.nodes.find(n => n.name === 'Agent').parameters.jsCode = filled;
  fs.writeFileSync(path.join(dir, 'workflow.local.json'), JSON.stringify(wf, null, 2));
  console.log('Wrote workflow.local.json (FILLED, gitignored)' + (missing.length ? ' — still missing: ' + missing.join(', ') : ' — all secrets filled'));
}
