import React, { useState, useCallback, useRef } from 'react';
import { CallProvider } from './context/CallContext';
import SAICPanel from './components/SAICPanel/SAICPanel';
import LiveTranscript from './components/LiveTranscript/LiveTranscript';
import './App.css';

function App() {
  const [leftWidth, setLeftWidth] = useState(38); // percentage
  const dragging = useRef(false);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    const pct = (e.clientX / window.innerWidth) * 100;
    setLeftWidth(Math.min(Math.max(pct, 20), 70));
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  return (
    <CallProvider>
      <div
        className="app-layout"
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
      >
        <div className="panel panel-left" style={{ width: `${leftWidth}%` }}>
          <SAICPanel />
        </div>

        <div className="resize-handle" onMouseDown={onMouseDown} />

        <div className="panel panel-right" style={{ width: `${100 - leftWidth}%` }}>
          <LiveTranscript />
        </div>
      </div>
    </CallProvider>
  );
}

export default App;
