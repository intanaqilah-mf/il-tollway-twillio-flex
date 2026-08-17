exports.handler = function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader('Access-Control-Allow-Origin', '*');
  response.appendHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.appendHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.appendHeader('Content-Type', 'application/json');

  const { conferenceSid, to, mode, agentCallSid, taskSid } = event;

  console.log('[add-supervisor] received params:', JSON.stringify({ conferenceSid, to, mode, agentCallSid, taskSid }));
  console.log('[add-supervisor] TWILIO_NUMBER env:', context.TWILIO_NUMBER);

  if (!conferenceSid || !to || !mode) {
    console.error('[add-supervisor] missing required params');
    response.setStatusCode(400);
    response.setBody(JSON.stringify({ error: 'conferenceSid, to, and mode are required' }));
    return callback(null, response);
  }

  if ((mode === 'coach' || mode === 'takeover') && !agentCallSid) {
    console.error('[add-supervisor] coach/takeover mode missing agentCallSid');
    response.setStatusCode(400);
    response.setBody(JSON.stringify({ error: 'agentCallSid is required for coach and takeover modes' }));
    return callback(null, response);
  }

  const client = context.getTwilioClient();

  const participantConfig = {
    to,
    from: context.TWILIO_NUMBER,
    earlyMedia: true,
    label: 'supervisor',   // used by conference-events.js to identify supervisor across ALL modes
  };

  if (mode === 'listen') {
    participantConfig.muted = true;
  } else if (mode === 'coach') {
    participantConfig.coaching = true;
    participantConfig.callSidToCoach = agentCallSid;
  }
  // 'full' and 'takeover' both join as regular full participant

  console.log('[add-supervisor] creating participant with config:', JSON.stringify(participantConfig));
  console.log('[add-supervisor] targeting conference:', conferenceSid);

  client.conferences(conferenceSid)
    .participants
    .create(participantConfig)
    .then(async participant => {
      console.log('[add-supervisor] supervisor joined — participantCallSid:', participant.callSid);

      if (mode === 'takeover') {
        // Remove the original agent from the conference so the supervisor takes over.
        // We add the supervisor first so the conference stays alive when the agent leaves.
        console.log('[add-supervisor] takeover — removing agent callSid:', agentCallSid);
        try {
          await client.conferences(conferenceSid).participants(agentCallSid).remove();
          console.log('[add-supervisor] takeover — agent removed successfully');
        } catch (kickErr) {
          // Log but don't fail the whole request — supervisor is already in
          console.error('[add-supervisor] takeover — failed to remove agent:', kickErr.message);
        }
      }

      // Stamp monitoring status inside conversations for ALL supervisor modes.
      // This triggers a TaskUpdated event so conference-events.js can detect the supervisor.
      if (taskSid) {
        try {
          const task = await client.taskrouter.v1
            .workspaces(context.TWILIO_WORKSPACE_SID)
            .tasks(taskSid)
            .fetch();

          const attributes = JSON.parse(task.attributes || '{}');
          attributes.conversations = attributes.conversations || {};
          // Use the ACTUAL mode so conference-events.js can branch correctly:
          //   'takeover' → triggers the takeover relay-session setup + queue-gate bypass
          //   'monitored' → standard listen/coach/full supervisor notification
          attributes.conversations.monitoring_status = (mode === 'takeover') ? 'takeover' : 'monitored';
          attributes.conversations.supervisor_call_sid = participant.callSid;

          await client.taskrouter.v1
            .workspaces(context.TWILIO_WORKSPACE_SID)
            .tasks(taskSid)
            .update({ attributes: JSON.stringify(attributes) });

          console.log('[add-supervisor] ✅ task attributes updated — conversations.monitoring_status:', attributes.conversations.monitoring_status);
        } catch (attrErr) {
          // Log but don't fail — supervisor is already in the conference
          console.error('[add-supervisor] ❌ failed to update task attributes:', attrErr.message);
        }
      }

      response.setStatusCode(200);
      response.setBody(JSON.stringify({ success: true, participantCallSid: participant.callSid }));
      callback(null, response);
    })
    .catch(err => {
      console.error('[add-supervisor] Twilio API error:', err.code, err.message);
      response.setStatusCode(500);
      response.setBody(JSON.stringify({ error: err.message, code: err.code }));
      callback(null, response);
    });
};
