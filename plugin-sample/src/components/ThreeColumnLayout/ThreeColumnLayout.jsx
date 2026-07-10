import React, { useState, useEffect, useRef } from 'react';
import { Manager } from '@twilio/flex-ui';
import CallControlsPanel from '../CallControlsPanel/CallControlsPanel';
import SAICPanel from '../SAICPanel/SAICPanel';
import LiveTranscript from '../LiveTranscript/LiveTranscript';

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

const DIVIDER_PX = 5;
const MIN_COL1 = 100;
const MAX_COL1 = 300;
const MIN_COL3 = 180;
const MAX_COL3 = 700;

const ThreeColumnLayout = () => {
  // Task resolution — passed explicitly to children so Panel1 context issues don't
  // break the WebSocket hook (withTaskContext behaves differently in Panel1 vs Panel2).
  // Use functional setState and compare by SID to avoid spurious re-renders when
  // getFlexTask() returns a new object reference for the same task.
  const [task, setTask] = useState(() => getFlexTask());
  useEffect(() => {
    const update = () => setTask(prev => {
      const next = getFlexTask();
      const prevSid = prev?.taskSid || prev?.sid;
      const nextSid = next?.taskSid || next?.sid;
      return prevSid === nextSid ? prev : next;
    });
    update();
    try {
      return Manager.getInstance().store.subscribe(update);
    } catch { return undefined; }
  }, []);

  // Resizable columns
  const [col1Width, setCol1Width] = useState(160);
  const [col3Width, setCol3Width] = useState(null); // null = flex:1 (balanced with col2 by default)
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const col3Ref = useRef(null);

  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.startX;
      if (drag.current.which === 1) {
        setCol1Width(Math.max(MIN_COL1, Math.min(MAX_COL1, drag.current.startW + dx)));
      } else {
        setCol3Width(Math.max(MIN_COL3, Math.min(MAX_COL3, drag.current.startW - dx)));
      }
    };
    const onUp = () => {
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startDrag = (which) => (e) => {
    e.preventDefault();
    const startW = which === 1
      ? col1Width
      : (col3Ref.current?.offsetWidth ?? MIN_COL3);
    drag.current = { which, startX: e.clientX, startW };
    if (which === 2 && col3Width === null) setCol3Width(startW);
    setDragging(true);
  };

  const dividerStyle = (hovered) => ({
    width: `${DIVIDER_PX}px`,
    flexShrink: 0,
    cursor: 'col-resize',
    background: hovered ? '#0070b9' : '#d9d9d7',
    transition: 'background 0.15s',
    zIndex: 1,
  });

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      overflow: 'hidden',
      background: '#f0f0ee',
      userSelect: dragging ? 'none' : 'auto',
    }}>

      {/* Column 1 — Call Controls */}
      <div style={{ width: col1Width, flexShrink: 0, overflow: 'hidden' }}>
        <CallControlsPanel />
      </div>

      {/* Drag handle 1 */}
      <DividerHandle onMouseDown={startDrag(1)} dividerStyle={dividerStyle} />

      {/* Column 2 — Pre-call + Post-call */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        <SAICPanel task={task} />
      </div>

      {/* Drag handle 2 */}
      <DividerHandle onMouseDown={startDrag(2)} dividerStyle={dividerStyle} />

      {/* Column 3 — Live Transcript: flex:1 by default (matches col2), fixed once user drags */}
      <div
        ref={col3Ref}
        style={col3Width !== null
          ? { width: col3Width, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
          : { flex: 1, minWidth: MIN_COL3, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
        }
      >
        <LiveTranscript task={task} />
      </div>

    </div>
  );
};

function DividerHandle({ onMouseDown, dividerStyle }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={dividerStyle(hovered)}
    />
  );
}

export default ThreeColumnLayout;
