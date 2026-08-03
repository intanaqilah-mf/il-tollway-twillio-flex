/*
    path: /inqueue-voicemail
    Function Methods (mode):
     - pre-process    => redirect call, cancel original IVR task
     - main           => record voicemail with transcription
     - success        => confirm recording, hang up
     - submitVoicemail => create voicemail task (called via transcribeCallback)
*/

const helpersPath = Runtime.getFunctions().helpers.path;
const { getTask, cancelTask, getTime, handleError } = require(helpersPath);
const optionsPath = Runtime.getFunctions().options.path;
const options = require(optionsPath);

async function createVoicemailTask(event, client, taskInfo, ringback) {
  const time = getTime(options.TimeZone);
  const taskAttributes = {
    taskType: 'voicemail',
    ringback,
    to: event.Caller,
    direction: 'inbound',
    name: `Voicemail: ${event.Caller}`,
    from: event.Called,
    recordingUrl: event.RecordingUrl,
    recordingSid: event.RecordingSid,
    transcriptionSid: event.TranscriptionSid,
    transcriptionText:
      event.TranscriptionStatus === 'completed'
        ? event.TranscriptionText
        : 'Transcription failed',
    callTime: time,
    queueTargetName: taskInfo.taskQueueName,
    queueTargetSid: taskInfo.taskQueueSid,
    workflowTargetSid: taskInfo.workflowSid,
    ui_plugin: { vmCallButtonAccessibility: false, vmRecordButtonAccessibility: true },
    placeCallRetry: 1,
  };

  console.log(`[inqueue-voicemail] creating voicemail task for caller=${event.Caller}`);
  try {
    await client.taskrouter.workspaces(taskInfo.workspaceSid).tasks.create({
      attributes: JSON.stringify(taskAttributes),
      type: 'voicemail',
      taskChannel: 'voicemail',
      priority: options.VoiceMailTaskPriority,
      workflowSid: taskInfo.workflowSid,
    });
    console.log('[inqueue-voicemail] voicemail task created');
  } catch (error) {
    console.log('[inqueue-voicemail] createVoicemailTask ERROR');
    handleError(error);
  }
}

exports.handler = async function (context, event, callback) {
  const client = context.getTwilioClient();
  const twiml = new Twilio.twiml.VoiceResponse();
  const domain = `https://${context.DOMAIN_NAME}`;
  const { CallSid, mode } = event;
  let { taskSid } = event;

  console.log(`[inqueue-voicemail] mode=${mode} CallSid=${CallSid} taskSid=${taskSid}`);

  const { sayOptions, VoiceMailAlertTone } = options;

  switch (mode) {
    case 'pre-process': {
      if (!taskSid) {
        const taskInfo = await getTask(context, CallSid);
        taskSid = taskInfo.taskSid;
      }
      const redirectUrl = `${domain}/inqueue-voicemail?mode=main${taskSid ? `&taskSid=${taskSid}` : ''}`;
      try {
        await client.calls(CallSid).update({ method: 'POST', url: redirectUrl });
      } catch (error) {
        console.log('[inqueue-voicemail] updateCall ERROR');
        handleError(error);
      }
      await cancelTask(client, context.TWILIO_WORKSPACE_SID, taskSid);
      return callback(null, '');
    }

    case 'main':
      twiml.say(sayOptions, 'Please leave a message at the tone. Press the star key when finished.');
      twiml.record({
        action: `${domain}/inqueue-voicemail?mode=success&CallSid=${CallSid}`,
        transcribeCallback: `${domain}/inqueue-voicemail?mode=submitVoicemail&CallSid=${CallSid}`,
        method: 'GET',
        playBeep: 'true',
        transcribe: true,
        timeout: 10,
        finishOnKey: '*',
      });
      twiml.say(sayOptions, 'I did not capture your recording.');
      return callback(null, twiml);

    case 'success':
      twiml.say(sayOptions, 'Your voicemail has been successfully received. Goodbye.');
      twiml.hangup();
      return callback(null, twiml);

    case 'submitVoicemail': {
      const taskInfo = await getTask(context, taskSid || CallSid);
      const ringBackUrl = VoiceMailAlertTone.startsWith('https://')
        ? VoiceMailAlertTone
        : domain + VoiceMailAlertTone;
      await createVoicemailTask(event, client, taskInfo, ringBackUrl);
      return callback(null, '');
    }

    default:
      console.log('[inqueue-voicemail] unknown mode:', mode);
      return callback(500, 'Mode not specified');
  }
};
