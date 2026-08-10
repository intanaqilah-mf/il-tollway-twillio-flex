module.exports = {
    server_A_URL: 'https://istha-ivr-relay-server-auth-dev-199285348292.us-central1.run.app',
    lb_URL :'https://gapi.getipass.com/ivr/relay-auth/dev',
    aud_URL: 'https://www.googleapis.com/oauth2/v4/token',   
    startStream_URL : 'https://csrservice-5808-dev.twil.io/startStream?',
    callbackStatus_URL : 'https://csrservice-5808-dev.twil.io/checkCallbackStatus?',
    stream_URL : 'wss://gapi.getipass.com/ivr/relay-server/',
    streamCallbackStatus_URL : 'https://csrservice-5808-dev.twil.io/checkCallCompleted?',
    //Relay Server
    // agentAssist_Stream_URL : 'wss://gapi.getipass.com/ivr/relay-server-open/dev/agent-assist/streaming',
    // call_Events_URL :'https://gapi.getipass.com/ivr/relay-server-open/dev/call-events'
    //Agent Assist
    agentAssist_Stream_URL : 'wss://gapi.getipass.com/ai/agent-assist/connector/dev/streaming',
    call_Events_URL : 'https://gapi.getipass.com/ai/agent-assist/connector/dev/call-events'
    
};