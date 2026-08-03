/* eslint-disable camelcase */
const moment = require('moment-timezone');

function handleError(error) {
  let message = '';
  if (error.message) message += error.message;
  if (error.stack) message += ` | stack: ${error.stack}`;
  (console.error || console.log).call(console, message || error);
}

/**
 * Get a TaskRouter Task by Call SID (CA...) or Task SID directly.
 */
function getTask(context, sid) {
  const client = context.getTwilioClient();
  let fetchTask;

  if (sid && sid.startsWith('CA')) {
    console.log(`[helpers.getTask] by callSid=${sid}`);
    fetchTask = client.taskrouter
      .workspaces(context.TWILIO_WORKSPACE_SID)
      .tasks.list({ evaluateTaskAttributes: `call_sid='${sid}'`, limit: 20 });
  } else {
    console.log(`[helpers.getTask] by taskSid=${sid}`);
    fetchTask = client.taskrouter
      .workspaces(context.TWILIO_WORKSPACE_SID)
      .tasks(sid)
      .fetch()
      .then((t) => [t]);
  }

  return fetchTask
    .then((result) => {
      const task = Array.isArray(result) ? result[0] : result;
      if (!task) {
        console.log('[helpers.getTask] WARNING: no task found for sid=', sid);
        return { status: 'error', taskSid: null, data: null };
      }
      console.log(`[helpers.getTask] found taskSid=${task.sid} status=${task.assignmentStatus}`);
      return {
        status: 'success',
        taskSid: task.sid,
        taskQueueSid: task.taskQueueSid,
        taskQueueName: task.taskQueueFriendlyName,
        workflowSid: task.workflowSid,
        workspaceSid: task.workspaceSid,
        data: task,
      };
    })
    .catch((error) => {
      console.log('[helpers.getTask] ERROR:', error.message);
      return { status: 'error', taskSid: null, data: error };
    });
}

async function cancelTask(client, workspaceSid, taskSid) {
  console.log(`[helpers.cancelTask] cancelling taskSid=${taskSid}`);
  try {
    await client.taskrouter.workspaces(workspaceSid).tasks(taskSid).update({
      assignmentStatus: 'canceled',
      reason: 'Voicemail Request',
    });
    console.log(`[helpers.cancelTask] done taskSid=${taskSid}`);
  } catch (error) {
    console.log('[helpers.cancelTask] ERROR:', error.message);
    handleError(error);
  }
}

function getTime(timeZone) {
  const now = new Date();
  const timeRecvd = moment(now);
  return {
    time_recvd: timeRecvd,
    server_tz: timeZone,
    server_time_long: timeRecvd.tz(timeZone).format('MMM Do YYYY, h:mm:ss a z'),
    server_time_short: timeRecvd.tz(timeZone).format('MM-D-YYYY, h:mm:ss a z'),
  };
}

module.exports = { getTask, handleError, getTime, cancelTask };
