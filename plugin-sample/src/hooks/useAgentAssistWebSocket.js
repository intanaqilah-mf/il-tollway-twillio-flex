import { useState, useEffect } from 'react';
import { Manager, Actions } from '@twilio/flex-ui';

const WSS_URL = 'wss://gapi.getipass.com/ivr/relay-server-open/dev/browser-ui/streaming';
const MAX_BACKOFF_MS = 30000;

const EMPTY_STATE = {
  preCall: null,
  transcript: [],
  sentiment: null,
  postCall: null,
  connected: false,
  error: null,
};

// One WebSocket per task SID, shared across ALL hook instances (SAICPanel,
// LiveTranscript, AgentAssistPanel).
// Entry shape: { state, listeners, ws, retryCount, reconnectTimer, intentionalClose, callSid, taskAttrs }
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

  let flexToken;
  try {
    flexToken = Manager.getInstance().user.token;
  } catch {
    entry.state.error = 'Failed to retrieve Flex token';
    notify(taskSid);
    return;
  }

  if (!flexToken || typeof flexToken !== 'string') {
    entry.state.error = 'No Flex token available';
    console.error('[AA] token invalid:', typeof flexToken);
    notify(taskSid);
    return;
  }

  entry.intentionalClose = false;
  console.log('[AA] opening WebSocket for task', taskSid);

  // Token passed via Sec-WebSocket-Protocol header (second arg) — keeps it out
  // of the URL and server access logs. Server must echo back the subprotocol.
  const ws = new WebSocket(WSS_URL, [`Bearer.${flexToken}`]);
  entry.ws = ws;

  ws.onopen = () => {
    console.log('[AA] WebSocket connected ✅');
    console.log('[AA] token prefix:', flexToken?.slice(0, 30));
    console.log('[AA] task attrs on open:', JSON.stringify(entry.taskAttrs));
    entry.state.connected = true;
    entry.state.error = null;
    notify(taskSid);

    let agentEmail = null;
    try {
      agentEmail =
        Manager.getInstance().user?.email ||
        Manager.getInstance().store.getState()?.flex?.worker?.attributes?.email ||
        null;
    } catch {}

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

    // Server sent real data — connection is stable, reset retry counter
    entry.retryCount = 0;
    // Support both flat shape { type, field } and wrapped shape { type, payload: { field } }
    const p = data.payload || data;
    switch (data.type) {
      case 'pre_call_summary':
        console.log('[AA] ✅ pre_call_summary received:', {
          callersPhoneNumber: p.callersPhoneNumber,
          authenticationStatus: p.authenticationStatus,
          lastOpenIntent: p.lastOpenIntent,
          IVRPathSummary: p.IVRPathSummary,
          statedReason: p.statedReason,
          sentimentAnalysis: p.sentimentAnalysis,
        });
        entry.state.preCall = {
          authenticationStatus: p.authenticationStatus,
          lastOpenIntent: p.lastOpenIntent,
          IVRPathSummary: p.IVRPathSummary,
          statedReason: p.statedReason,
          sentimentAnalysis: p.sentimentAnalysis,
          callersPhoneNumber: p.callersPhoneNumber,
        };
        break;
      case 'transcript':
        console.log(`[AA] ✅ transcript [${p.speaker}]:`, p.transcript);
        entry.state.transcript = [
          ...entry.state.transcript,
          { transcript: p.transcript, speaker: p.speaker, ts: p.ts },
        ];
        break;
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
    // scheduleReconnect(taskSid); // TEMP: disabled — reconnect loop was crashing the server
  };

  ws.onclose = (e) => {
    console.log('[AA] WebSocket closed — code:', e.code, 'intentional:', entry.intentionalClose);
    entry.state.connected = false;
    entry.ws = null;
    notify(taskSid);
    // onerror fires before onclose on error — only reconnect here for clean unexpected closes
    // if (!entry.intentionalClose && entry.state.error === null) {
    //   scheduleReconnect(taskSid); // TEMP: disabled — reconnect loop was crashing the server
    // }
    // Reset error so the next close (from onclose only, no onerror) triggers reconnect
    entry.state.error = null;
  };
}

function scheduleReconnect(taskSid) {
  const entry = registry.get(taskSid);
  if (!entry || entry.intentionalClose || entry.reconnectTimer) return;

  entry.retryCount += 1;
  // Exponential backoff: 2s, 4s, 8s, 16s, 30s, 30s, … (no total retry cap)
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
export function useAgentAssistWebSocket(task) {
  // Use stable primitive SID — NOT the task object — as the dependency key.
  // The task object gets a new reference on every Twilio event which previously
  // tore down and rebuilt the WebSocket connection 9+ times per call.
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

      // Seed preCall from task attributes immediately — no WebSocket needed for this.
      // WebSocket pre_call_summary will override if/when it arrives.
      const seededPreCall = {
        callersPhoneNumber: attrs.from || attrs.caller || null,
        authenticationStatus: attrs.authenticationStatus || null,
        lastOpenIntent: attrs.lastOpenIntent || attrs.intentIdentified || null,
        IVRPathSummary: attrs.IVRPathSummary || null,
        statedReason: attrs.statedReason || null,
        sentimentAnalysis: attrs.sentimentAnalysis || null,
      };
      const hasAttrData = Object.values(seededPreCall).some(Boolean);
      if (hasAttrData) {
        console.log('[AA] pre-call data seeded from task.attributes immediately:', seededPreCall);
      }

      registry.set(taskSid, {
        state: { ...EMPTY_STATE, preCall: hasAttrData ? seededPreCall : null },
        listeners: new Set(),
        ws: null,
        retryCount: 0,
        reconnectTimer: null,
        intentionalClose: false,
        callSid,
        taskAttrs: attrs,
      });
    }

    const entry = registry.get(taskSid);

    // Relay server marks a call "active for agent" only after the conference bridge
    // is established — which happens when the agent accepts. Listen for the Flex
    // afterAcceptTask action (fires post-acceptance) instead of connecting immediately,
    // which would always get a 1008 rejection because the call isn't active yet.
    const onAfterAccept = (payload) => {
      const acceptedSid = payload?.task?.taskSid || payload?.task?.sid;
      if (acceptedSid === taskSid && !entry.ws) {
        openConnection(taskSid);
      }
    };
    Actions.addListener('afterAcceptTask', onAfterAccept);

    // If component mounts mid-call (e.g. panel re-render during active call),
    // the afterAcceptTask event already fired — open immediately.
    const alreadyActive = task?.status === 'assigned' || task?.status === 'wrapping';
    if (alreadyActive && !entry.ws) {
      openConnection(taskSid);
    }

    setState({ ...entry.state });
    const listener = (snap) => setState(snap);
    entry.listeners.add(listener);

    return () => {
      Actions.removeListener('afterAcceptTask', onAfterAccept);
      const e = registry.get(taskSid);
      if (!e) return;
      e.listeners.delete(listener);

      if (e.listeners.size === 0) {
        teardownConnection(taskSid);
        registry.delete(taskSid);
      }
    };
  }, [taskSid]);

  return state;
}
