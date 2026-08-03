import { useState, useEffect, useCallback } from 'react';
import { Manager, Actions } from '@twilio/flex-ui';

const WSS_URL = 'wss://gapi.getipass.com/ai/agent-assist/subscriber/dev/browser-ui/streaming';
const MAX_BACKOFF_MS = 30000;


// Speech-to-text often mishears "i-Pass" as: iPad, IPad, iPass, ipass, i pass, i-pass
function normalizeTranscript(text) {
  if (!text) return text ?? '';
  return text
    .replace(/\bipad\b/gi, 'i-Pass')
    .replace(/\bipod\b/gi, 'i-Pass')
    .replace(/\bipass\b/gi, 'i-Pass')
    .replace(/\bi-pass\b/gi, 'i-Pass')
    .replace(/\bi pass\b/gi, 'i-Pass');
}


const EMPTY_STATE = {
  preCall: null,
  transcript: [],
  sentiment: null,
  postCall: null,
  transferSummary: null,
  connected: false,
  error: null,
};

// One WebSocket per task SID, shared across ALL hook instances (SAICPanel,
// LiveTranscript, AgentAssistPanel).
// Entry shape: { state, listeners, ws, retryCount, reconnectTimer, intentionalClose, callSid, taskAttrs }
const registry = new Map();

const INACTIVE = ['pending', 'reserved', 'canceled', 'completed'];

// Resolve the agent-leg callSid for a given task.
// Returns { callSid, confirmed } where confirmed=true means agentCallSids is set
// (conference-events has started the Media Stream, relay session exists).
// fallbackAttrs: task.attributes from the React prop — used when the outbound task is
// NOT in state.flex.worker.tasks (Flex internal outbound tasks bypass the standard map).
function resolveCallSid(taskSid, fallbackAttrs = null) {
  try {
    const store = Manager.getInstance().store.getState();
    const tasks = store?.flex?.worker?.tasks;
    const workerSid = Manager.getInstance().workerClient?.sid;

    const liveTask = tasks?.get(taskSid);
    // Use store attrs first, fall back to React prop attrs (needed for outbound tasks
    // which are NOT stored in state.flex.worker.tasks — Flex handles them internally).
    const a = liveTask?.attributes || fallbackAttrs || {};

    // agentCallSids is the authoritative signal: set by conference-events AFTER stream starts.
    // When present, the relay session exists and a subscribe will succeed.
    const agentCallSid = workerSid ? a.agentCallSids?.[workerSid]?.callSid : null;
    if (agentCallSid) return { callSid: agentCallSid, confirmed: true };

    // For callback tasks: agentCallSids lives on the linked OUTBOUND task, not here.
    if ((a.type === 'callback' || a.taskType === 'callback') && tasks) {
      for (const [, t] of tasks) {
        const ta = t.attributes || {};
        if (ta.callbackTaskSid === taskSid) {
          const confirmedSid = workerSid ? ta.agentCallSids?.[workerSid]?.callSid : null;
          if (confirmedSid) {
            console.log('[AA] resolveCallSid: confirmed via outbound task agentCallSids:', confirmedSid);
            return { callSid: confirmedSid, confirmed: true };
          }
          const unconfirmedSid = ta.conference?.participants?.worker || null;
          if (unconfirmedSid) return { callSid: unconfirmedSid, confirmed: false };
        }
      }
    }

    // Unconfirmed fallbacks — conference exists but stream may not have started yet
    const direct = a.call_sid || a.callSid || a.CallSid
      || a.agentCallSID
      || a.conference?.participants?.worker
      || null;
    return { callSid: direct, confirmed: false };
  } catch (_) {}
  return { callSid: null, confirmed: false };
}

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

    // Always resolve fresh — for callback tasks the callSid lives on the linked
    // outbound task, not on the callback task itself.
    const { callSid: freshCallSid, confirmed: freshConfirmed } = resolveCallSid(taskSid);
    if (freshCallSid) {
      entry.callSid = freshCallSid;
      console.log('[AA] callSid resolved at connection time:', freshCallSid, '| confirmed:', freshConfirmed);
    }

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
      entry.lastSubscribedCallSid = entry.callSid;
      // If we already have confirmed callSid at open time, mark confirmed so store subscriber
      // doesn't redundantly re-subscribe when agentCallSids event arrives again.
      if (freshConfirmed) entry.confirmedSubscribeSent = true;
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
      case 'transcript': {
        console.log(`[AA] ✅ transcript [${p.speaker}]:`, p.transcript);
        entry.state.transcript = [
          ...entry.state.transcript,
          { transcript: normalizeTranscript(p.transcript), speaker: p.speaker, ts: p.ts },
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
          customerCallSid: p.customerCallSid || null,
        };
        break;
      case 'transfer_summary': {
        const d = p.data || p;
        console.log('[AA] ✅ transfer_summary received, callSid:', d.callSid);
        entry.state.transferSummary = {
          text: d.transferSummary,
          sections: d.transferSummarySections || null,
        };
        break;
      }
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

function sendMessageToRelay(taskSid, payload) {
  const entry = registry.get(taskSid);
  if (!entry?.ws || entry.ws.readyState !== WebSocket.OPEN) {
    console.error('[AA] sendMessage: WebSocket not open for task', taskSid);
    return false;
  }
  try {
    entry.ws.send(JSON.stringify(payload));
    return true;
  } catch (e) {
    console.error('[AA] sendMessage failed:', e);
    return false;
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
      const callSid = attrs.call_sid || attrs.callSid || attrs.CallSid
        || attrs.conference?.participants?.customer
        || null;
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
        lastSubscribedCallSid: null,
        confirmedSubscribeSent: false, // true once we've re-subscribed AFTER stream confirmed
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
    const alreadyActive = task?.status != null && !INACTIVE.includes(task.status);
    console.log('[AA] useEffect for task', taskSid, '| status:', task?.status, '| active:', alreadyActive, '| ws:', !!entry.ws);
    if (alreadyActive && !entry.ws) {
      openConnection(taskSid);
    }

    // Fallback: for outbound/callback calls Flex may auto-accept without firing
    // afterAcceptTask. Also handles re-subscribing when callSid becomes available
    // after the WS is already open (conference data arrives via task.updated ~8s later).
    const unsubscribeStore = Manager.getInstance().store.subscribe(() => {
      const tasks = Manager.getInstance().store.getState()?.flex?.worker?.tasks;
      const liveTask = tasks?.get(taskSid);
      if (!liveTask) return;

      const status = liveTask?.status;
      const isActive = status != null && !INACTIVE.includes(status);

      // Open WS if task became active and WS isn't open yet.
      if (isActive && !entry.ws) {
        const { callSid: resolvedNow } = resolveCallSid(taskSid);
        console.log('[AA] store fallback — task', taskSid, 'status:', status, '— callSid:', resolvedNow, '— opening WS');
        if (resolvedNow) entry.callSid = resolvedNow;
        openConnection(taskSid);
        return;
      }

      // Re-subscribe when:
      // 1. callSid changed (different from what we last sent), OR
      // 2. agentCallSids just appeared for the first time (confirmed=true) and we haven't
      //    sent a post-confirmation subscribe yet — even if callSid VALUE is the same.
      //    This is critical: conference.participants.worker exists BEFORE stream starts but
      //    the relay session only exists AFTER conference-events starts the stream (~5s later).
      //    agentCallSids being set is the signal that re-subscribing now will actually work.
      if (entry.ws?.readyState === WebSocket.OPEN) {
        const { callSid: resolved, confirmed } = resolveCallSid(taskSid);
        const callSidChanged = resolved && resolved !== entry.lastSubscribedCallSid;
        const streamJustConfirmed = confirmed && !entry.confirmedSubscribeSent;
        if (callSidChanged || streamJustConfirmed) {
          if (confirmed) entry.confirmedSubscribeSent = true;
          entry.callSid = resolved;
          entry.lastSubscribedCallSid = resolved;
          let agentEmail = null;
          try { agentEmail = Manager.getInstance().user?.email || null; } catch {}
          console.log('[AA] re-subscribing — callSid:', resolved, '| confirmed:', confirmed, '| reason:', callSidChanged ? 'callSidChanged' : 'streamConfirmed');
          try {
            entry.ws.send(JSON.stringify({ type: 'subscribe', callSid: resolved, agentEmail }));
          } catch (e) { console.error('[AA] re-subscribe failed:', e); }
        }
      }
    });

    setState({ ...entry.state });
    const listener = (snap) => setState(snap);
    entry.listeners.add(listener);

    return () => {
      Actions.removeListener('afterAcceptTask', onAfterAccept);
      unsubscribeStore();
      const e = registry.get(taskSid);
      if (!e) return;
      e.listeners.delete(listener);

      if (e.listeners.size === 0) {
        teardownConnection(taskSid);
        registry.delete(taskSid);
      }
    };
  }, [taskSid]);

  // ── Props-based WS lifecycle ───────────────────────────────────────────────
  // The store subscriber above uses tasks.get(taskSid) which returns null for Flex
  // internal outbound tasks (they are NOT in state.flex.worker.tasks). This effect
  // uses the task object React already passes as a prop — when Flex re-renders the
  // component with an updated task (status change, attribute update), this fires.
  // It handles two things:
  //   1. Open WS when task status becomes active (replaces the store subscriber path)
  //   2. Re-subscribe when agentCallSids appears on the task attributes (stream confirmed)
  const workerSid = Manager.getInstance().workerClient?.sid;
  const agentCallSidFromAttrs =
    task?.attributes?.agentCallSids?.[workerSid]?.callSid || null;

  useEffect(() => {
    if (!taskSid) return;
    const entry = registry.get(taskSid);
    if (!entry) return;

    const isActive = task?.status != null && !INACTIVE.includes(task.status);

    // Open WS if task just became active
    if (isActive && !entry.ws) {
      console.log('[AA] props-based open — task', taskSid, 'status:', task.status);
      const { callSid: resolvedNow } = resolveCallSid(taskSid, task?.attributes);
      if (resolvedNow) entry.callSid = resolvedNow;
      openConnection(taskSid);
      return;
    }

    // Re-subscribe when agentCallSids appears (stream confirmed by conference-events).
    // This fires when agentCallSidFromAttrs changes from null → CA... via task.updated.
    // We MUST re-subscribe even if callSid value is the same — the first subscribe was
    // sent before the relay session existed (conference.participants.worker is set early
    // but the relay session only exists after conference-events starts the Media Stream).
    if (entry.ws?.readyState === WebSocket.OPEN && agentCallSidFromAttrs) {
      const { callSid: resolved, confirmed } = resolveCallSid(taskSid, task?.attributes);
      const streamJustConfirmed = confirmed && !entry.confirmedSubscribeSent;
      const callSidChanged = resolved && resolved !== entry.lastSubscribedCallSid;
      if (streamJustConfirmed || callSidChanged) {
        if (confirmed) entry.confirmedSubscribeSent = true;
        entry.callSid = resolved;
        entry.lastSubscribedCallSid = resolved;
        let agentEmail = null;
        try { agentEmail = Manager.getInstance().user?.email || null; } catch {}
        console.log('[AA] props-based re-subscribe — callSid:', resolved, '| confirmed:', confirmed);
        try {
          entry.ws.send(JSON.stringify({ type: 'subscribe', callSid: resolved, agentEmail }));
        } catch (e) { console.error('[AA] props re-subscribe failed:', e); }
      }
    }
  }, [taskSid, task?.status, agentCallSidFromAttrs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable across renders — only changes when taskSid changes — so wrapup
  // effects can include it as a dep without spurious re-fires.
  const sendMessage = useCallback(
    (payload) => (taskSid ? sendMessageToRelay(taskSid, payload) : false),
    [taskSid],
  );

  return { ...state, sendMessage };
}
