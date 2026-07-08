import { useState, useEffect } from 'react';

const WSS_URL = 'wss://gapi.getipass.com/ivr/relay-server-open/dev/browser-ui/streaming';
const MAX_BACKOFF_MS = 30000;

// Formatted card numbers (16-digit grouped, 15-digit Amex, MM/YY expiry)
const CARD_16_RE = /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g;
const CARD_15_RE = /\b\d{4}[ -]?\d{6}[ -]?\d{5}\b/g;
const EXPIRY_RE = /\b(0?[1-9]|1[0-2])[/\s]\d{2}(?:\d{2})?\b/g;

const CARD_REQUEST_RE = new RegExp(
  [
    'card\\s*(number|no\\.?|num|digit|detail)',
    'expir',
    'valid\\s*(through|thru|until|till)',
    'month.*year|year.*month',
    '\\bcv[a-z]?\\b',
    'security\\s*code',
    'verification\\s*code',
    '(three|3)[\\s-]?digit',
    '(four|4)[\\s-]?digit',
    'back.*card|card.*back',
  ].join('|'),
  'i'
);

function normalizeTranscript(text) {
  if (!text) return text ?? '';
  return text
    .replace(/\bipad\b/gi, 'i-Pass')
    .replace(/\bipod\b/gi, 'i-Pass')
    .replace(/\bipass\b/gi, 'i-Pass')
    .replace(/\bi-pass\b/gi, 'i-Pass')
    .replace(/\bi pass\b/gi, 'i-Pass');
}

function redactSensitiveData(text) {
  if (!text) return text;
  return text
    .replace(CARD_16_RE, '**** **** **** ****')
    .replace(CARD_15_RE, '**** ****** *****')
    .replace(EXPIRY_RE, '**/**');
}

const EMPTY_STATE = {
  preCall: null,
  transcript: [],
  sentiment: null,
  postCall: null,
  connected: false,
  error: null,
};

// One WebSocket per task SID, shared across all hook instances.
// Entry shape: { state, listeners, ws, retryCount, reconnectTimer, intentionalClose,
//                callSid, taskAttrs, token, email, awaitingCardTurns }
const registry = new Map();

function notify(taskSid) {
  const entry = registry.get(taskSid);
  if (!entry) return;
  const snap = { ...entry.state, transcript: entry.state.transcript };
  entry.listeners.forEach((fn) => fn(snap));
}

function openConnection(taskSid) {
  const entry = registry.get(taskSid);
  if (!entry || entry.ws) return;

  const token = entry.token;
  const agentEmail = entry.email;

  if (!token || typeof token !== 'string') {
    entry.state.error = 'No auth token available';
    console.error('[AA] token invalid — pass ?token=... in the iframe URL');
    notify(taskSid);
    return;
  }

  entry.intentionalClose = false;
  console.log('[AA] opening WebSocket for task', taskSid);

  // Token passed via Sec-WebSocket-Protocol header — keeps it out of URL/logs.
  const ws = new WebSocket(WSS_URL, [`Bearer.${token}`]);
  entry.ws = ws;

  ws.onopen = () => {
    console.log('[AA] WebSocket connected ✅');
    entry.state.connected = true;
    entry.state.error = null;
    notify(taskSid);

    const subscribeMsg = {
      type: 'subscribe',
      callSid: entry.callSid,
      agentEmail,
    };
    console.log('[AA] sending subscribe:', JSON.stringify(subscribeMsg));
    try {
      ws.send(JSON.stringify(subscribeMsg));
    } catch (e) {
      console.error('[AA] failed to send subscribe', e);
    }
  };

  ws.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    entry.retryCount = 0;
    const p = data.payload || data;
    switch (data.type) {
      case 'pre_call_summary':
        console.log('[AA] ✅ pre_call_summary received');
        entry.state.preCall = {
          authenticationStatus: p.authenticationStatus,
          lastOpenIntent: p.lastOpenIntent,
          IVRPathSummary: p.IVRPathSummary,
          statedReason: p.statedReason,
          sentimentAnalysis: p.sentimentAnalysis,
          callersPhoneNumber: p.callersPhoneNumber,
        };
        break;
      case 'transcript': {
        console.log(`[AA] ✅ transcript [${p.speaker}]:`, p.transcript);
        const inCardContext = p.speaker === 'customer' && entry.awaitingCardTurns > 0;
        const redacted = inCardContext
          ? '[card data not logged]'
          : normalizeTranscript(redactSensitiveData(p.transcript));
        if (p.speaker === 'agent' && CARD_REQUEST_RE.test(p.transcript)) {
          entry.awaitingCardTurns = 2;
        } else if (p.speaker === 'customer' && entry.awaitingCardTurns > 0) {
          entry.awaitingCardTurns -= 1;
        }
        entry.state.transcript = [
          ...entry.state.transcript,
          { transcript: redacted, speaker: p.speaker, ts: p.ts },
        ];
        break;
      }
      case 'sentiment':
        console.log('[AA] ✅ sentiment:', p.sentimentLabel, p.sentimentScore);
        entry.state.sentiment = {
          sentimentLabel: p.sentimentLabel,
          sentimentScore: p.sentimentScore,
        };
        break;
      case 'post_call_summary':
        console.log('[AA] ✅ post_call_summary:', p.summary?.slice(0, 80));
        entry.state.postCall = {
          summary: p.summary,
          overallSentiment: p.overallSentiment,
          callDurationSeconds: p.callDurationSeconds,
        };
        break;
      default:
        console.log('[AA] unknown message type:', data.type, data);
        break;
    }
    notify(taskSid);
  };

  ws.onerror = () => {
    console.error('[AA] WebSocket error ❌');
    entry.state.connected = false;
    entry.state.error = 'WebSocket connection error';
    entry.ws = null;
    notify(taskSid);
  };

  ws.onclose = (e) => {
    console.log('[AA] WebSocket closed — code:', e.code, 'intentional:', entry.intentionalClose);
    entry.state.connected = false;
    entry.ws = null;
    notify(taskSid);
    entry.state.error = null;
  };
}

function scheduleReconnect(taskSid) {
  const entry = registry.get(taskSid);
  if (!entry || entry.intentionalClose || entry.reconnectTimer) return;

  entry.retryCount += 1;
  const delay = Math.min(2000 * Math.pow(2, entry.retryCount - 1), MAX_BACKOFF_MS);
  console.log(`[AA] scheduling reconnect (attempt ${entry.retryCount}) in ${Math.round(delay / 1000)}s`);
  entry.reconnectTimer = setTimeout(() => {
    entry.reconnectTimer = null;
    if (registry.has(taskSid) && !entry.intentionalClose) {
      openConnection(taskSid);
    }
  }, delay);
}

function teardownConnection(taskSid) {
  const entry = registry.get(taskSid);
  if (!entry) return;
  entry.intentionalClose = true;
  if (entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }
  if (entry.ws) {
    entry.ws.close();
    entry.ws = null;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
// task  — call/task object with taskSid, status, attributes
// token — JWT for WebSocket auth (from CallContext)
// email — agent email for subscribe message (from CallContext)
export function useAgentAssistWebSocket(task, { token = '', email = '' } = {}) {
  const taskSid = task?.taskSid || task?.sid || null;

  const [state, setState] = useState({ ...EMPTY_STATE });

  useEffect(() => {
    if (!taskSid) {
      setState({ ...EMPTY_STATE });
      return;
    }

    if (!registry.has(taskSid)) {
      const attrs = task?.attributes || {};
      const callSid = attrs.call_sid || attrs.callSid || attrs.CallSid || null;
      console.log('[AA] registering task', taskSid, '| callSid:', callSid);

      const seededPreCall = {
        callersPhoneNumber: attrs.from || attrs.caller || null,
        authenticationStatus: attrs.authenticationStatus || null,
        lastOpenIntent: attrs.lastOpenIntent || attrs.intentIdentified || null,
        IVRPathSummary: attrs.IVRPathSummary || null,
        statedReason: attrs.statedReason || null,
        sentimentAnalysis: attrs.sentimentAnalysis || null,
      };
      const hasAttrData = Object.values(seededPreCall).some(Boolean);

      registry.set(taskSid, {
        state: { ...EMPTY_STATE, preCall: hasAttrData ? seededPreCall : null },
        listeners: new Set(),
        ws: null,
        retryCount: 0,
        reconnectTimer: null,
        intentionalClose: false,
        awaitingCardTurns: 0,
        callSid,
        taskAttrs: attrs,
        token,
        email,
      });
    }

    const entry = registry.get(taskSid);

    // In standalone iframe mode the call is already active when the frame loads —
    // connect immediately instead of waiting for a Twilio afterAcceptTask event.
    if (!entry.ws) {
      openConnection(taskSid);
    }

    setState({ ...entry.state });
    const listener = (snap) => setState(snap);
    entry.listeners.add(listener);

    return () => {
      const e = registry.get(taskSid);
      if (!e) return;
      e.listeners.delete(listener);

      if (e.listeners.size === 0) {
        teardownConnection(taskSid);
        registry.delete(taskSid);
      }
    };
  }, [taskSid]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
