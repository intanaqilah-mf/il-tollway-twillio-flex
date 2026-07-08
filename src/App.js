import React from 'react';
import { CallProvider } from './context/CallContext';
import SAICPanel from './components/SAICPanel/SAICPanel';
import LiveTranscript from './components/LiveTranscript/LiveTranscript';
import AgentAssistPanel from './components/AgentAssistPanel/AgentAssistPanel';
import './App.css';

function App() {
  return (
    <CallProvider>
      <div className="app-layout">
        <div className="panel panel-left">
          <SAICPanel />
        </div>
        <div className="panel panel-right">
          <div className="panel-right-top">
            <LiveTranscript />
          </div>
          <div className="panel-right-bottom">
            <AgentAssistPanel />
          </div>
        </div>
      </div>
    </CallProvider>
  );
}

export default App;
