import React, { useState, useEffect } from 'react';
import { Manager, Actions } from '@twilio/flex-ui';

function getFlexTask() {
  try {
    const flex = Manager.getInstance().store.getState()?.flex;
    const sid = flex?.view?.selectedTaskSid;
    const tasks = flex?.worker?.tasks;
    if (sid && tasks?.get) return tasks.get(sid) || null;
    if (tasks?.size > 0) return tasks.values().next().value || null;
  } catch {}
  return null;
}

const colors = {
  navy: '#1a3352',
  white: '#ffffff',
  blue: '#0070b9',
  green: '#107e3e',
  red: '#bb0000',
  border: '#e0e0e0',
  bg: '#f5f6f7',
  textPrimary: '#32363a',
  textMuted: '#6a6d70',
  textLabel: '#8c8c8c',
};

// ── Inline SVG icons ──────────────────────────────────────────────────
const MicIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

const MicOffIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

const PauseIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" rx="1"/>
    <rect x="14" y="4" width="4" height="16" rx="1"/>
  </svg>
);

const PlayIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5,3 19,12 5,21"/>
  </svg>
);

const EndCallIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.49 15c-0.28-2.35-1.35-4.5-3.09-6.23C15.65 7.03 13.44 6 11.08 5.71L9.28 3.91A19.4 19.4 0 0 1 12 3.75c5.63 0 10.56 3.6 12 9-.36 1.34-1.11 2.88-2.4 3.96L20.49 15zM3.51 9c.28 2.35 1.35 4.5 3.09 6.23C8.35 16.97 10.56 18 12.92 18.29l1.8 1.8A19.4 19.4 0 0 1 12 20.25C6.37 20.25 1.44 16.65 0 11.25c.36-1.34 1.11-2.88 2.4-3.96L3.51 9z"/>
    <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const TransferIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────────────
const CtrlBtn = ({ onClick, disabled, active, danger, icon, label }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      padding: '10px 12px',
      border: danger ? 'none' : `1px solid ${active ? colors.navy : colors.border}`,
      borderRadius: '4px',
      background: danger
        ? (disabled ? '#e0e0e0' : colors.red)
        : (active ? colors.navy : colors.white),
      color: danger ? colors.white : (active ? colors.white : colors.textPrimary),
      fontWeight: '600',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      fontFamily: 'inherit',
      fontSize: '13px',
      transition: 'background 0.15s, color 0.15s, border-color 0.15s',
    }}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const CallControlsPanel = () => {
  const [task, setTask] = useState(() => getFlexTask());
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);

  useEffect(() => {
    try {
      return Manager.getInstance().store.subscribe(() => {
        const t = getFlexTask();
        setTask(t);
        if (!t) { setIsMuted(false); setIsOnHold(false); }
      });
    } catch { return undefined; }
  }, []);

  const handleMute = () => {
    try { Actions.invokeAction('ToggleMute'); } catch {}
    setIsMuted((v) => !v);
  };

  const handleHold = () => {
    if (!task) return;
    const sid = task.taskSid || task.sid;
    try {
      Actions.invokeAction(isOnHold ? 'UnholdCall' : 'HoldCall', { sid });
    } catch {}
    setIsOnHold((v) => !v);
  };

  const handleHangup = () => {
    if (!task) return;
    try { Actions.invokeAction('HangupCall', { sid: task.taskSid || task.sid }); } catch {}
  };

  const handleTransfer = () => {
    if (!task) return;
    // Try Flex's built-in transfer actions in order of preference
    const attempts = ['ShowDirectory', 'TransferTask', 'StartWarmTransfer'];
    for (const action of attempts) {
      try { Actions.invokeAction(action, { task }); return; } catch {}
    }
  };

  const attrs = task?.attributes || {};
  const callerId = attrs.from || attrs.caller || null;
  const hasCall = !!task;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily: '"72", "72full", Arial, Helvetica, sans-serif',
      fontSize: '13px',
      background: colors.white,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: colors.navy,
        color: colors.white,
        padding: '10px 16px',
        fontWeight: '700',
        fontSize: '14px',
        letterSpacing: '0.6px',
        textTransform: 'uppercase',
        flexShrink: 0,
      }}>
        Call Controls
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Status */}
        <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '10px 12px' }}>
          <div style={{ fontSize: '10px', color: colors.textLabel, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' }}>
            Status
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
              background: hasCall ? colors.green : '#cccccc',
              animation: hasCall ? 'ctrl-pulse 1.8s ease-in-out infinite' : 'none',
            }} />
            <span style={{ fontWeight: '600', color: hasCall ? colors.green : colors.textMuted }}>
              {hasCall ? 'Live Call' : 'No Active Call'}
            </span>
          </div>
        </div>

        {/* Caller */}
        {callerId && (
          <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '10px 12px' }}>
            <div style={{ fontSize: '10px', color: colors.textLabel, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>
              Caller
            </div>
            <div style={{ fontWeight: '600', color: colors.textPrimary, fontSize: '13px' }}>{callerId}</div>
          </div>
        )}

        <div style={{ borderTop: `1px solid ${colors.border}` }} />

        {/* Mute */}
        <CtrlBtn
          onClick={handleMute}
          disabled={!hasCall}
          active={isMuted}
          icon={isMuted ? <MicOffIcon /> : <MicIcon />}
          label={isMuted ? 'Unmute' : 'Mute'}
        />

        {/* Hold */}
        <CtrlBtn
          onClick={handleHold}
          disabled={!hasCall}
          active={isOnHold}
          icon={isOnHold ? <PlayIcon /> : <PauseIcon />}
          label={isOnHold ? 'Resume' : 'Hold'}
        />

        {/* Transfer */}
        <CtrlBtn
          onClick={handleTransfer}
          disabled={!hasCall}
          active={false}
          icon={<TransferIcon />}
          label="Transfer"
        />

        <div style={{ borderTop: `1px solid ${colors.border}` }} />

        {/* Hang Up */}
        <CtrlBtn
          onClick={handleHangup}
          disabled={!hasCall}
          danger
          icon={<EndCallIcon />}
          label="Hang Up"
        />
      </div>

      <style>{`
        @keyframes ctrl-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

export default CallControlsPanel;
