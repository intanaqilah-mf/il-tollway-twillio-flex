import React from "react";
import { FlexPlugin } from "@twilio/flex-plugin";
import { Actions, useFlexSelector } from "@twilio/flex-ui";

const PLUGIN_NAME = "Ilt3ColumnLayoutPlugin";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const useActiveVoiceTask = () =>
  useFlexSelector((state) => {
    const tasks = state.flex.worker.tasks;
    if (!tasks) return null;
    for (const task of tasks.values()) {
      if (
        task.taskChannelUniqueName === "voice" &&
        task.status === "accepted"
      ) {
        return task;
      }
    }
    return null;
  });

const getCustomerParticipantSid = (task) =>
  task?.conference?.participants?.customer?.callSid ||
  task?.attributes?.conference?.participants?.customer ||
  null;

const isCustomerOnHold = (task) =>
  task?.conference?.participants?.customer?.onHold === true;

// -----------------------------------------------------------------------------
// Call Controls (left column)
// -----------------------------------------------------------------------------
const btnStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: "100%",
  padding: "10px 14px",
  marginBottom: 10,
  border: "1px solid #cbd6e2",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 500,
};

const CallControlsPanel = () => {
  const task = useActiveVoiceTask();
  const isOnHold = isCustomerOnHold(task);
  const isMuted = useFlexSelector((s) => s.flex.phone?.isMuted === true);

  const disabled = !task;

  // Mute — appears to work
  const handleMute = () => Actions.invokeAction("ToggleMute");

  // Hold — the only line that had to change. HoldCall is the legacy
  // pre-conference action; Flex 2.x uses HoldParticipant/UnholdParticipant
  // with { participantType, task, targetSid } (targetSid = customer callSid).
  const handleHold = () => {
    if (!task) return;
    const targetSid = getCustomerParticipantSid(task);
    if (!targetSid) return;
    Actions.invokeAction(isOnHold ? "UnholdParticipant" : "HoldParticipant", {
      participantType: "customer",
      task,
      targetSid,
    });
  };

  // Transfer — (working)
  const handleTransfer = () => Actions.invokeAction("ShowDirectory", { task });

  return (
    <div
      style={{
        width: 220,
        borderRight: "1px solid #e0e6ed",
        background: "#f7f9fc",
        padding: 16,
        boxSizing: "border-box",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          background: "#0b3a66",
          color: "#fff",
          padding: "10px 14px",
          margin: "-16px -16px 16px",
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: 0.6,
        }}
      >
        CALL CONTROLS
      </div>

      <button style={btnStyle} onClick={handleMute} disabled={disabled}>
        {isMuted ? "Unmute" : "Mute"}
      </button>
      <button style={btnStyle} onClick={handleHold} disabled={disabled}>
        {isOnHold ? "Resume" : "Hold"}
      </button>
      <button style={btnStyle} onClick={handleTransfer} disabled={disabled}>
        Transfer
      </button>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Pre/Post-Call Information (middle column)
// -----------------------------------------------------------------------------
const Field = ({ label, value, dot, pill }) => (
  <div style={{ marginBottom: 14 }}>
    <div
      style={{
        fontSize: 11,
        color: "#6b7c93",
        letterSpacing: 0.5,
        marginBottom: 4,
      }}
    >
      {label}
    </div>
    {pill ? (
      <span
        style={{
          display: "inline-block",
          padding: "4px 10px",
          border: "1px solid #b8d4ea",
          borderRadius: 12,
          background: "#eaf3fb",
          color: "#1976d2",
          fontSize: 13,
        }}
      >
        {value}
      </span>
    ) : (
      <div
        style={{
          fontSize: 14,
          color: "#243b53",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {dot && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: dot === "green" ? "#22a06b" : "#d92d20",
              display: "inline-block",
            }}
          />
        )}
        {value}
      </div>
    )}
  </div>
);

const PreCallInfoPanel = () => {
  const task = useActiveVoiceTask();
  const attrs = task?.attributes || {};
  const callerId = attrs.from || attrs.caller || "—";

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
      <div
        style={{
          background: "#0b3a66",
          color: "#fff",
          padding: "10px 14px",
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: 0.6,
        }}
      >
        PRE-CALL INFORMATION
      </div>

      <div style={{ padding: 16 }}>
        <Field label="CALLER ID" value={callerId} />
        <Field label="ACCOUNT NUMBER" value={attrs.accountNumber || "—"} />
        <Field
          label="AUTHENTICATION STATUS"
          value={attrs.authStatus || "Authenticated"}
          dot="green"
        />
        <Field
          label="SENTIMENT ANALYSIS"
          value={attrs.sentiment || "Positive"}
          dot="green"
        />
        <Field
          label="INTENTS IDENTIFIED"
          value={attrs.intent || "AccountBalance"}
          pill
        />
        <Field
          label="STATED REASON"
          value={attrs.reason || "Want to do agent Assisted payment"}
        />
        <Field
          label="IVR PATH"
          value={attrs.ivrPath || "Auth->MainMenu->AccountDetail->Balance"}
        />
      </div>

      <div
        style={{
          background: "#0b3a66",
          color: "#fff",
          padding: "10px 14px",
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: 0.6,
        }}
      >
        POST-CALL WRAP-UP
      </div>
      <div style={{ padding: 16 }}>
        <div
          style={{ fontStyle: "italic", color: "#6b7c93", marginBottom: 12 }}
        >
          Pre-populated information from an IVR handoff
        </div>
        <Field label="REAL-TIME INSIGHTS" value="" />
        <Field label="SENTIMENT ANALYSIS" value="Positive" dot="green" />
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: "#6b7c93",
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            GENERATIVE AI SESSION SUMMARIZATION
          </div>
          <div
            style={{
              border: "1px solid #e0e6ed",
              borderRadius: 4,
              padding: 12,
              minHeight: 80,
              color: "#6b7c93",
              fontStyle: "italic",
            }}
          >
            Waiting for session summary...
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          padding: 16,
          borderTop: "1px solid #e0e6ed",
        }}
      >
        <button style={{ ...btnStyle, marginBottom: 0, flex: 1 }}>Edit</button>
        <button
          style={{
            ...btnStyle,
            marginBottom: 0,
            flex: 1,
            background: "#1976d2",
            color: "#fff",
            border: "none",
          }}
        >
          Submit to SAP
        </button>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Live Transcript (right column)
// -----------------------------------------------------------------------------
const LiveTranscriptPanel = () => {
  const task = useActiveVoiceTask();
  return (
    <div
      style={{
        width: 380,
        borderLeft: "1px solid #e0e6ed",
        background: "#f7f9fc",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: "#0b3a66",
          color: "#fff",
          padding: "10px 14px",
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: 0.6,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#e74c3c",
              marginRight: 8,
            }}
          />
          Live Transcript
        </span>
        <span style={{ fontSize: 11, opacity: 0.85 }}>
          {task ? "Connected" : "Idle"}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          padding: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6b7c93",
          fontStyle: "italic",
        }}
      >
        {task ? "Connected — waiting for speech..." : "No active call"}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Three-column layout root
// -----------------------------------------------------------------------------
const ThreeColumnLayout = () => (
  <div
    style={{
      display: "flex",
      width: "100%",
      height: "100%",
      overflow: "hidden",
    }}
  >
    <CallControlsPanel />
    <PreCallInfoPanel />
    <LiveTranscriptPanel />
  </div>
);

// -----------------------------------------------------------------------------
// Plugin
// -----------------------------------------------------------------------------
export default class Ilt3ColumnLayoutPlugin extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME);
  }

  async init(flex, manager) {
    flex.AgentDesktopView.defaultProps.showPanel2 = false;

    const style = document.createElement("style");
    style.innerHTML = `.Twilio-TaskList, .Twilio-TaskCanvas { display: none !important; }`;
    document.head.appendChild(style);

    flex.AgentDesktopView.Panel1.Content.add(
      <ThreeColumnLayout key="three-column-layout" />,
      { sortOrder: -1 },
    );
  }
}
