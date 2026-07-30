/**
 * Twilio Function: add-supervisor-to-conference
 *
 * Adds a supervisor to an in-progress Flex conference in one of three modes:
 *   full    — regular participant, can speak to everyone
 *   listen  — muted participant, hears everything but cannot speak
 *   coach   — coaching mode, only the agent (callSidToCoach) can hear the supervisor
 *
 * Receives application/x-www-form-urlencoded POST (no JSON / no Authorization header
 * so no CORS preflight is required — the browser sends it as a simple request).
 *
 * Required env vars (set in Twilio Console → Functions → your service → Environment Variables):
 *   TWILIO_NUMBER   — E.164 Twilio number used as caller ID, e.g. +16505551234
 *
 * Expected POST fields:
 *   conferenceSid  — task.conference.sid
 *   to             — supervisor's contact_uri, e.g. "client:sindhuja.ravindran"
 *   mode           — "full" | "listen" | "coach"
 *   agentCallSid   — required for coach: task.conference.participants.worker.callSid
 */
exports.handler = function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader('Access-Control-Allow-Origin', '*');
  response.appendHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.appendHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.appendHeader('Content-Type', 'application/json');

  const { conferenceSid, to, mode, agentCallSid } = event;

  console.log('[add-supervisor] received params:', JSON.stringify({ conferenceSid, to, mode, agentCallSid }));
  console.log('[add-supervisor] TWILIO_NUMBER env:', context.TWILIO_NUMBER);

  if (!conferenceSid || !to || !mode) {
    console.error('[add-supervisor] missing required params');
    response.setStatusCode(400);
    response.setBody(JSON.stringify({ error: 'conferenceSid, to, and mode are required' }));
    return callback(null, response);
  }

  if (mode === 'coach' && !agentCallSid) {
    console.error('[add-supervisor] coaching mode missing agentCallSid');
    response.setStatusCode(400);
    response.setBody(JSON.stringify({ error: 'agentCallSid is required for coaching mode' }));
    return callback(null, response);
  }

  const client = context.getTwilioClient();

  const participantConfig = {
    to,
    from: context.TWILIO_NUMBER,
    earlyMedia: true,
  };

  if (mode === 'listen') {
    participantConfig.muted = true;
  } else if (mode === 'coach') {
    participantConfig.coaching = true;
    participantConfig.callSidToCoach = agentCallSid;
  }

  console.log('[add-supervisor] creating participant with config:', JSON.stringify(participantConfig));
  console.log('[add-supervisor] targeting conference:', conferenceSid);

  client.conferences(conferenceSid)
    .participants
    .create(participantConfig)
    .then(participant => {
      console.log('[add-supervisor] success — participantCallSid:', participant.callSid);
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
