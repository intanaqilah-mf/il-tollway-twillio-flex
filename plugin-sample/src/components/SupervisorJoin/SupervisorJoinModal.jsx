import React, { useState, useEffect, useCallback } from 'react';
import { Manager, Actions } from '@twilio/flex-ui';
import { sendToTask } from '../../hooks/useAgentAssistWebSocket';

const colors = {
  navy: '#1a3352',
  white: '#ffffff',
  border: '#e0e0e0',
  textPrimary: '#32363a',
  textSecondary: '#6e7677',
  success: '#107869',
  error: '#d0312d',
  available: '#107869',
  offline: '#9e9e9e',
};

const MODES = [
  {
    value: 'full',
    label: 'Full Participant',
    desc: 'Supervisor can speak to everyone on the call',
  },
  {
    value: 'listen',
    label: 'Listen Only',
    desc: 'Supervisor listens silently — cannot be heard by anyone',
  },
  {
    value: 'coach',
    label: 'Coaching',
    desc: 'Only the agent can hear the supervisor — customer cannot',
  },
  {
    value: 'takeover',
    label: 'Takeover',
    desc: 'Supervisor joins and agent is removed from the call',
  },
];

// Flex 2.x stores worker data in different Redux paths depending on the user's role.
// We probe all known paths and return the first non-empty supervisor list found.
function getSupervisors() {
  const state = Manager.getInstance().store.getState().flex;

  const sources = [
    state.supervisor?.workers,       // populated for supervisor-role users
    state.workerDirectory?.workers,  // populated via WorkerDirectory feature
    state.directory?.workers,        // transfer directory (all users)
  ];

  for (const source of sources) {
    if (!source) continue;
    const list = Array.isArray(source) ? source : Object.values(source);
    if (list.length === 0) continue;

    const supervisors = list
      .filter(w => {
        const attrs = (w.worker || w).attributes || {};
        const roles = attrs.roles || [];
        return Array.isArray(roles)
          ? roles.includes('supervisor')
          : roles === 'supervisor';
      })
      .map(w => {
        const worker = w.worker || w;
        const attrs = worker.attributes || {};
        return {
          sid: worker.sid,
          name: attrs.full_name || worker.friendlyName || attrs.email || worker.sid,
          email: attrs.email || '',
          // contact_uri is the SIP/client address Flex uses to reach this worker
          contactUri: attrs.contact_uri || null,
          activityName: worker.activityName || '',
          available: worker.available ?? false,
        };
      });

    if (supervisors.length > 0) return supervisors;
  }

  return [];
}

// ─── Global event bus ────────────────────────────────────────────────────────
// IsthaAgentAssistPlugin.js calls openSupervisorModal(task) to trigger the modal
// from outside React (e.g. from an Actions.replaceAction override).
const _listeners = new Set();
export function onOpenSupervisorModal(fn) { _listeners.add(fn); }
export function offOpenSupervisorModal(fn) { _listeners.delete(fn); }
export function openSupervisorModal(task) { _listeners.forEach(fn => fn(task)); }
// ─────────────────────────────────────────────────────────────────────────────

const SupervisorJoinModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [task, setTask] = useState(null);
  const [supervisors, setSupervisors] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('full');
  const [status, setStatus] = useState('idle'); // idle | joining | done | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handler = (incomingTask) => {
      setSupervisors(getSupervisors());
      setTask(incomingTask);
      setSelected(null);
      setMode('full');
      setStatus('idle');
      setErrorMsg('');
      setIsOpen(true);
    };
    onOpenSupervisorModal(handler);
    return () => offOpenSupervisorModal(handler);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setStatus('idle');
  }, []);

  const handleJoin = useCallback(async () => {
    if (!selected || !task) return;
    setStatus('joining');
    setErrorMsg('');

    try {
      const fnUrl = process.env.REACT_APP_SUPERVISOR_FN_URL;
      console.log('[SupervisorJoin] fnUrl:', fnUrl);
      console.log('[SupervisorJoin] selected supervisor:', JSON.stringify(selected));
      console.log('[SupervisorJoin] mode:', mode);
      // Log all keys so we can see the full conference object shape
      console.log('[SupervisorJoin] task.conference keys:', Object.keys(task.conference || {}));
      console.log('[SupervisorJoin] task.conference.sid:', task.conference?.sid);
      console.log('[SupervisorJoin] task.conference.conferenceSid:', task.conference?.conferenceSid);

      if (!fnUrl) {
        throw new Error(
          'REACT_APP_SUPERVISOR_FN_URL is not set.\n\n' +
          'Add it to plugin-sample/.env and rebuild:\n' +
          'REACT_APP_SUPERVISOR_FN_URL=https://supervisor-join-3155.twil.io/add-supervisor-to-conference'
        );
      }

      // task.conference.sid returns the Task SID (WT...), not the Conference SID (CF...).
      // The actual conference SID lives at conferenceSid.
      const conferenceSid = task.conference?.conferenceSid || task.conference?.sid;
      console.log('[SupervisorJoin] using conferenceSid:', conferenceSid);
      if (!conferenceSid || !conferenceSid.startsWith('CF')) {
        throw new Error(
          `Conference SID looks wrong: "${conferenceSid}" (expected CF...). ` +
          'Check the console for "task.conference keys" to find the right field.'
        );
      }

      const params = new URLSearchParams({ conferenceSid, to: selected.contactUri, mode });
      console.log('[SupervisorJoin] POST params:', params.toString());

      // Coach and takeover both need the agent's call SID
      if (mode === 'coach' || mode === 'takeover') {
        const parts = task.conference?.participants || {};
        const safeParts = Object.fromEntries(
          Object.entries(parts).map(([k, v]) => [k, { callSid: v?.callSid, participantType: v?.participantType }])
        );
        console.log('[SupervisorJoin] all participants:', JSON.stringify(safeParts));

        const agentCallSid =
          parts.worker?.callSid ||
          Object.values(parts).find(p => p?.participantType === 'worker')?.callSid ||
          Object.values(parts).find(p => p?.callSid && p !== parts.customer)?.callSid;

        console.log('[SupervisorJoin] resolved agentCallSid:', agentCallSid);

        if (!agentCallSid) {
          throw new Error(
            'Agent call SID not found in conference participants.\n' +
            'Check the browser console — search for "[SupervisorJoin] all participants"'
          );
        }
        params.set('agentCallSid', agentCallSid);
      }

      console.log('[SupervisorJoin] calling function...');
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      console.log('[SupervisorJoin] response status:', res.status);
      const responseText = await res.text();
      console.log('[SupervisorJoin] response body:', responseText);

      if (!res.ok) {
        throw new Error(`Function returned ${res.status}: ${responseText}`);
      }

      // Tell the relay which call SID belongs to the supervisor so it can route
      // their Voice Intelligence transcription callbacks as "supervisor" speech.
      try {
        const body = JSON.parse(responseText);
        if (body.participantCallSid && task?.taskSid) {
          sendToTask(task.taskSid, {
            type: 'supervisor_joined',
            supervisorCallSid: body.participantCallSid,
          });
          console.log('[SupervisorJoin] notified relay of supervisorCallSid:', body.participantCallSid);
        }
      } catch {}

      setStatus('done');
      setTimeout(handleClose, 1500);
    } catch (e) {
      console.error('[SupervisorJoin] error:', e);
      setStatus('error');
      setErrorMsg(e.message);
    }
  }, [selected, task, mode, handleClose]);

  if (!isOpen) return null;

  const isActionable = !!selected && status !== 'joining' && status !== 'done';

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: colors.white,
        borderRadius: '6px',
        width: '460px', maxWidth: '90vw', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        overflow: 'hidden',
        fontFamily: '"72", "72full", Arial, Helvetica, sans-serif',
        fontSize: '13px',
      }}>

        {/* Header */}
        <div style={{
          background: colors.navy, color: colors.white,
          padding: '14px 18px',
          fontWeight: '700', fontSize: '14px',
          letterSpacing: '0.6px', textTransform: 'uppercase',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          Add Supervisor to Call
          <button
            onClick={handleClose}
            style={{
              background: 'none', border: 'none',
              color: colors.white, cursor: 'pointer',
              fontSize: '20px', lineHeight: 1, padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

          {/* Supervisor list */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontWeight: '600', color: colors.textPrimary, marginBottom: '8px' }}>
              Select Supervisor
            </div>

            {supervisors.length === 0 ? (
              <div style={{
                color: colors.textSecondary, fontStyle: 'italic',
                padding: '10px 12px',
                border: `1px dashed ${colors.border}`, borderRadius: '4px',
              }}>
                No supervisors found in this session. Ensure workers have{' '}
                <code style={{ fontSize: '12px' }}>"supervisor"</code> in their{' '}
                <code style={{ fontSize: '12px' }}>roles</code> attribute in TaskRouter.
              </div>
            ) : (
              supervisors.map(sup => (
                <div
                  key={sup.sid}
                  onClick={() => setSelected(sup)}
                  style={{
                    padding: '10px 12px',
                    border: `2px solid ${selected?.sid === sup.sid ? colors.navy : colors.border}`,
                    borderRadius: '4px', marginBottom: '6px',
                    cursor: 'pointer',
                    background: selected?.sid === sup.sid ? '#f0f4f8' : colors.white,
                    display: 'flex', alignItems: 'center', gap: '10px',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                    background: sup.available ? colors.available : colors.offline,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', color: colors.textPrimary }}>{sup.name}</div>
                    <div style={{ color: colors.textSecondary, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sup.email}{sup.activityName ? ` · ${sup.activityName}` : ''}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Mode selector */}
          <div>
            <div style={{ fontWeight: '600', color: colors.textPrimary, marginBottom: '8px' }}>
              Join Mode
            </div>
            {MODES.map(m => (
              <label
                key={m.value}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '9px 12px',
                  border: `2px solid ${mode === m.value ? colors.navy : colors.border}`,
                  borderRadius: '4px', marginBottom: '6px',
                  cursor: 'pointer',
                  background: mode === m.value ? '#f0f4f8' : colors.white,
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <input
                  type="radio" name="supervisor-join-mode" value={m.value}
                  checked={mode === m.value}
                  onChange={() => setMode(m.value)}
                  style={{ marginTop: '3px', flexShrink: 0, accentColor: colors.navy }}
                />
                <div>
                  <div style={{ fontWeight: '600', color: colors.textPrimary }}>{m.label}</div>
                  <div style={{ color: colors.textSecondary, fontSize: '12px', marginTop: '2px' }}>
                    {m.desc}
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* Feedback */}
          {status === 'error' && (
            <div style={{
              marginTop: '12px', padding: '10px 12px',
              background: '#fff5f5',
              border: `1px solid ${colors.error}`,
              borderRadius: '4px', color: colors.error,
              fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: '1.5',
            }}>
              {errorMsg}
            </div>
          )}
          {status === 'done' && (
            <div style={{
              marginTop: '12px', padding: '10px 12px',
              background: '#f0fdf8',
              border: `1px solid ${colors.success}`,
              borderRadius: '4px', color: colors.success, fontWeight: '600',
            }}>
              Supervisor is being connected…
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: `1px solid ${colors.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: '10px',
          flexShrink: 0,
        }}>
          <button
            onClick={handleClose}
            style={{
              padding: '8px 16px',
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              background: colors.white, color: colors.textPrimary,
              cursor: 'pointer', fontWeight: '600',
              fontFamily: 'inherit', fontSize: '13px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleJoin}
            disabled={!isActionable}
            style={{
              padding: '8px 20px', border: 'none', borderRadius: '4px',
              background: isActionable ? colors.navy : colors.offline,
              color: colors.white,
              cursor: isActionable ? 'pointer' : 'not-allowed',
              fontWeight: '600', fontFamily: 'inherit', fontSize: '13px',
              transition: 'background 0.15s',
            }}
          >
            {status === 'joining' ? 'Connecting…' : status === 'done' ? 'Connected!' : 'Add to Call'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupervisorJoinModal;
