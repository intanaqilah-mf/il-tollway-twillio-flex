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
  border: '#e0e0e0',
  textPrimary: '#32363a',
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

  const handleTransfer = () => {
    if (!task) return;
    // Try Flex's built-in transfer actions in order of preference
    const attempts = ['ShowDirectory', 'TransferTask', 'StartWarmTransfer'];
    for (const action of attempts) {
      try { Actions.invokeAction(action, { task }); return; } catch {}
    }
  };

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

      </div>

    </div>
  );
};

export default CallControlsPanel;
