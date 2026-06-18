import { useState, useEffect } from 'react';
import { Manager } from '@twilio/flex-ui';

const WSS_URL = 'wss://gapi.getipass.com/ivr/relay-server-open/dev/browser-ui/streaming';
const MAX_RETRIES = 3;

const EMPTY_STATE = {
  preCall: null,
  transcript: [],
  sentiment: null,
  postCall: null,
  connected: false,
  error: null,
};

// ─── Singleton connection registry ────────────────────────────────────────────
// One WebSocket per task SID, shared across ALL hook instances (SAICPanel,
// LiveTranscript, AgentAssistPanel). Prevents 3× connections and stops the
// reconnect storm caused by task object reference changes.
//
// Entry shape: { state, listeners, ws, retryCount, reconnectTimer, intentionalClose, callSid, taskAttrs }
const registry = new Map();

function notify(taskSid) {
  const entry = registry.get(taskSid);
  if (!entry) return;
  // Shallow-copy state so each subscriber's useState sees a new reference
  const snap = {
    ...entry.state,
    transcript: entry.state.transcript, // already a new array on every push
  };
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

  // Auth: raw JWT sent as Sec-WebSocket-Protocol header — NOT in the URL
  const ws = new WebSocket(WSS_URL, [`Bearer.${flexToken}`]);
  entry.ws = ws;

  ws.onopen = () => {
    console.log('[AA] WebSocket connected ✅');
    console.log('[AA] task attrs on open:', JSON.stringify(entry.taskAttrs));
    entry.state.connected = true;
    entry.state.error = null;
    entry.retryCount = 0;
    notify(taskSid);

    // Tell the server which task/call to stream data for.
    // The relay server likely indexes calls by Call SID (CA...) not Task SID (WT...).
    // Send both so the server can use whichever it recognises.
    const subscribeMsg = {
      type: 'subscribe',
      taskSid,
      ...(entry.callSid ? { callSid: entry.callSid } : {}),
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

    console.log('[AA] message received:', data.type);
    switch (data.type) {
      case 'pre_call_summary':
        entry.state.preCall = {
          authenticationStatus: data.authenticationStatus,
          lastOpenIntent: data.lastOpenIntent,
          IVRPathSummary: data.IVRPathSummary,
          statedReason: data.statedReason,
          sentimentAnalysis: data.sentimentAnalysis,
          callersPhoneNumber: data.callersPhoneNumber,
        };
        break;
      case 'transcript':
        entry.state.transcript = [
          ...entry.state.transcript,
          { transcript: data.transcript, speaker: data.speaker, ts: data.ts },
        ];
        break;
      case 'sentiment':
        entry.state.sentiment = {
          sentimentLabel: data.sentimentLabel,
          sentimentScore: data.sentimentScore,
        };
        break;
      case 'post_call_summary':
        entry.state.postCall = {
          summary: data.summary,
          overallSentiment: data.overallSentiment,
          callDurationSeconds: data.callDurationSeconds,
        };
        break;
      default:
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
    scheduleReconnect(taskSid);
  };

  ws.onclose = (e) => {
    console.log('[AA] WebSocket closed — code:', e.code, 'intentional:', entry.intentionalClose);
    entry.state.connected = false;
    entry.ws = null;
    notify(taskSid);
    // onerror fires before onclose on error — only reconnect here for clean unexpected closes
    if (!entry.intentionalClose && entry.state.error === null) {
      scheduleReconnect(taskSid);
    }
  };
}

function scheduleReconnect(taskSid) {
  const entry = registry.get(taskSid);
  if (!entry || entry.intentionalClose || entry.reconnectTimer) return;
  if (entry.retryCount >= MAX_RETRIES) return;

  entry.retryCount += 1;
  const delay = entry.retryCount === 1 ? 2000 : 3000;
  console.log(`[AA] scheduling reconnect (attempt ${entry.retryCount}/${MAX_RETRIES}) in ${delay}ms`);
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
  // The task object gets a new reference on every Twilio event (task.updated,
  // reservation.accepted, etc.) which previously tore down and rebuilt the
  // WebSocket connection 9+ times per call.
  const taskSid = task?.taskSid || task?.sid || null;

  const [state, setState] = useState({ ...EMPTY_STATE });

  useEffect(() => {
    if (!taskSid) {
      setState({ ...EMPTY_STATE });
      return;
    }

    // Create registry entry if this is the first subscriber for this task SID
    if (!registry.has(taskSid)) {
      const attrs = task?.attributes || {};
      // Call SID (CA...) is what the relay server uses to look up a call —
      // not the TaskRouter task SID (WT...). Extract it from task attributes.
      const callSid =
        attrs.callSid ||
        attrs.call_sid ||
        attrs.CallSid ||
        null;
      console.log('[AA] registering task', taskSid, '| callSid:', callSid, '| all attrs:', JSON.stringify(attrs));
      registry.set(taskSid, {
        state: { ...EMPTY_STATE },
        listeners: new Set(),
        ws: null,
        retryCount: 0,
        reconnectTimer: null,
        intentionalClose: false,
        callSid,
        taskAttrs: attrs,
      });
      openConnection(taskSid);
    }

    const entry = registry.get(taskSid);

    // Sync current snapshot immediately so this component doesn't show stale state
    setState({ ...entry.state });

    // Subscribe to future state updates
    const listener = (snap) => setState(snap);
    entry.listeners.add(listener);

    return () => {
      const e = registry.get(taskSid);
      if (!e) return;
      e.listeners.delete(listener);

      // Close connection only when the LAST subscriber unmounts
      if (e.listeners.size === 0) {
        teardownConnection(taskSid);
        registry.delete(taskSid);
      }
    };
  }, [taskSid]); // ← stable string, not task object

  return state;
}
