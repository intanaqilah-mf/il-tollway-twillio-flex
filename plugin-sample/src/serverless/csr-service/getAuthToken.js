'use strict';

const axios = require('axios');
const jwt = require('jsonwebtoken');

// ── Environment Configuration ─────────────────────────────────────────────────
// Set these to control which environment the relay servers use for this call.
//   TWILIO_ENV options: 'dev' | 'qa' | 'training' | 'prod'
//   DFCX_ENV options:   'dev' | 'qa' | 'training' | 'prod'
//   (DFCX_ENV can differ from TWILIO_ENV if needed; leave equal for most cases)
// VOICE_NAME: Google Cloud TTS neural voice sent to Server B for consistent TTS output.
// Applied to outputAudioConfig.synthesizeSpeechConfig in all DFCX stream turns.
//const VOICE_NAME = 'en-US-Neural2-J';
// ─────────────────────────────────────────────────────────────────────────────

const TWILIO_ENV = 'training';
const DFCX_ENV = 'training';
const relayConfigPath = Runtime.getFunctions().relayServerConst.path;
const { server_A_URL, lb_URL, aud_URL, callbackStatus_URL} = require(relayConfigPath);
exports.handler = async function (context, event, callback) {
  console.log("getAuthentication - Starting the Function");
  const twiml = new Twilio.twiml.VoiceResponse();  
  const response = new Twilio.Response();
  // Add CORS headers
  response.appendHeader('Access-Control-Allow-Origin', '*'); // For development; use your domain in production
  response.appendHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.appendHeader('Access-Control-Allow-Headers', 'Content-Type');
  try {
    const parentCallSID = event.CallSid;
    const callType = event.callType;
    const currentAgentCallSID = event.currentAgentCallSID;
    console.log("parentCallSID",parentCallSID);
    console.log("callType",callType);
    console.log("currentAgentCallSID",currentAgentCallSID);
    let tokenCallSID;
    if(callType === "new" || callType === "transfer" || callType === "callEvent")
    {
      console.log("Call comes from the Conference events method");   
      tokenCallSID = currentAgentCallSID;
    }
    else{
      tokenCallSID = event.CallSid;
      console.log("Call comes from the studio flow");
    }
    console.log("Token is genarating for ", tokenCallSID);
    const asset = Runtime.getAssets()['/service_account.json'];
    if (!asset) throw new Error('service_account.json not found');
    const serviceAccountKey = JSON.parse(asset.open());

    const now = Math.floor(Date.now() / 1000);
    const serverAUrl = server_A_URL;
    const lbURL = lb_URL;

    const googleJwt = jwt.sign(
      {
        iss: serviceAccountKey.client_email,
        sub: serviceAccountKey.client_email,
        scope: serverAUrl,
        aud: aud_URL,
        exp: now + 60 * 45,
        iat: now
      },
      serviceAccountKey.private_key,
      {
        algorithm: 'RS256',
        header: {
          kid: serviceAccountKey.private_key_id,
          typ: 'JWT',
          alg: 'RS256'
        }
      }
    );

    const tokenResponse = await axios.post(
      aud_URL,
      {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: googleJwt
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const idToken = tokenResponse.data.id_token;
    console.log('Google ID token obtained successfully');

    const twilioEnv = TWILIO_ENV;
    const dfcxEnv = DFCX_ENV;

    const callStartResponse = await axios.post(
      `${lbURL}/call-start`,
      {
          CallSid: tokenCallSID,
//        CallSid: event.CallSid,
        TWILIO_ENV: twilioEnv,
        DFCX_ENV: dfcxEnv
      },
      {
        headers: { Authorization: `Bearer ${idToken}` }
      }
    );
    const streamToken = callStartResponse.data;
  console.log('Stream token received from Server A', streamToken);

    // Return for Studio or Serverless
    const result = { streamToken };
    if (typeof callback === 'function') {
      return callback(null, result);
    }
    return result;

  } catch (error) {
    console.error('getAuthentication error:', error.message);

    // For Studio, return TwiML redirect
    const nextAction = "failure";
    const errorParams = [
      `nextAction=${encodeURIComponent(nextAction)}`,
      `taskSid=${encodeURIComponent(event.taskSid || '')}`,
      `CallSid=${encodeURIComponent(event.CallSid || '')}`
    ].join('&');
    const checkCallbackStatusUrl = `${callbackStatus_URL}${errorParams}`;
    twiml.redirect(checkCallbackStatusUrl);

    if (typeof callback === 'function') {
      return callback(null, twiml);
    }
    // For Serverless, return TwiML
    return twiml;
  }
};
