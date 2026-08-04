/*
    Synopsis:  This function provides supporting UTILITY functions for handling of Flex In-Queue Callback/Voicemail capabilities to include:
        1. Re-queuing of callback and voicemail tasks;
        2. Deletion of voicemail call recording media and transcripts
        
    These UTILITY methods directly support FLEX plugin functionality initiated by the Flex agent (worker)
    
    name: util_InQueueFlexUtils
    path: /inqueue-utils
    private: UNCHECKED
    
    Function Methods (mode)
     - deleteRecordResources    => logic for deletion of recording media and transcript text (recordingSid, transcriptionSid)
     - requeueTasks             => logic for re-queuing of callback/voicemail task (create new task from existing task attributes)
    Customization:
     - None
    Install/Config: See documentation
*/
const JWEValidator = require('twilio-flex-token-validator').functionValidator;
exports.handler = JWEValidator(async function (context, event, callback) {
  let res = {};

  // setup twilio client
  const client = context.getTwilioClient();

  let resp = new Twilio.Response();
  let headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  resp.setHeaders(headers);

  // get method
  let mode = event.mode;

  //    global function to update callback Task attributes
  //    controlling the UI call button view
  async function PluginTaskUpdate(type, taskSid, _staleAttr, state) {
    console.log(`[PluginTaskUpdate] type=${type} taskSid=${taskSid} state=${state}`);

    // Always fetch fresh attributes to avoid race conditions where a concurrent
    // update (e.g. incrementCallAttempt) already changed placeCallRetry and the
    // stale frontend snapshot would overwrite it.
    let freshAttr;
    try {
      const freshTask = await client.taskrouter
        .workspaces(context.TWILIO_WORKSPACE_SID)
        .tasks(taskSid)
        .fetch();
      freshAttr = JSON.parse(freshTask.attributes || '{}');
    } catch (fetchErr) {
      console.log(`[PluginTaskUpdate] fetch error for taskSid=${taskSid}`, fetchErr.message);
      return { status: 'error', type: 'cbUpdateAttr', data: fetchErr };
    }

    freshAttr.ui_plugin = freshAttr.ui_plugin || {};
    if (type == 'callback') {
      freshAttr.ui_plugin.cbCallButtonAccessibility = state;
    }
    if (type == 'voicemail') {
      freshAttr.ui_plugin.vmCallButtonAccessibility = state;
      freshAttr.ui_plugin.vmRecordButtonAccessibility = !state;
    }

    let result;
    await client.taskrouter
      .workspaces(context.TWILIO_WORKSPACE_SID)
      .tasks(taskSid)
      .update({
        attributes: JSON.stringify(freshAttr),
      })
      .then((task) => {
        console.log(`[PluginTaskUpdate] taskSid=${taskSid} attributes updated`);
        result = { status: 'success', type: 'cbUpdateAttr', data: task };
      })
      .catch((error) => {
        console.log(`[PluginTaskUpdate] ERROR updating taskSid=${taskSid}`, error.message);
        result = { status: 'error', type: 'cbUpdateAttr', data: error };
      });
    return result;
  }

  console.log(`[inqueue-utils] mode=${mode} taskSid=${event.taskSid}`);
  switch (mode) {
    case 'deleteRecordResources':
      //  method to delete existing recording/transcription resources
      //  1. get existing task attributes
      //  2. update existing task attributes to indicate resource deletion
      //  3. delete transcription resouce; delete recording resource

      async function getTask(taskSid) {
        return await client.taskrouter
          .workspaces(context.TWILIO_WORKSPACE_SID)
          .tasks(taskSid)
          .fetch()
          .then(async (task) => {
            res = {
              status: 'success',
              type: 'getTask',
              attr: JSON.parse(task.attributes),
              data: task,
            };
            return res;
          })
          .catch(async (error) => {
            res = { status: 'error', type: 'getTask', data: error };
            return res;
          });
      }

      async function updateTask(taskSid, attr) {
        if (!attr.hasOwnProperty('markDeleted')) {
          attr = Object.assign(attr, { markDeleted: true });
        }

        //    update task attributes
        return await client.taskrouter
          .workspaces(context.TWILIO_WORKSPACE_SID)
          .tasks(taskSid)
          .update({
            attributes: JSON.stringify(attr),
          })
          .then(async (res) => {
            res = { status: 'success', type: 'updateAttr', data: res };
            return res;
          })
          .catch(async (error) => {
            res = { status: 'error', type: 'updateAttr', data: error };
            return res;
          });
      }

      //  delete the transcription resource
      async function deleteTranscription(transSid) {
        return await client
          .transcriptions(transSid)
          .remove()
          .then(() => {
            return { delTransStatus: 'success', msg: '' };
          })
          .catch((error) => {
            return { delTransStatus: 'success', msg: error };
          });
      }

      //  delete the call recording resource
      async function deleteRecord(recSid) {
        console.log(`[deleteRecord] removing recordingSid=${recSid}`);
        return await client
          .recordings(recSid)
          .remove()
          .then(() => {
            console.log(`[deleteRecord] recordingSid=${recSid} removed`);
            return { delRecStatus: 'success', msg: '' };
          })
          .catch((error) => {
            console.log(`[deleteRecord] ERROR removing recordingSid=${recSid}`);
            return { delRecStatus: 'error', msg: error };
          });
      }

      //  main logic
      async function deleteMain() {
        res = await getTask(event.taskSid);
        res = await updateTask(event.taskSid, res.attr);
        let del = await deleteTranscription(event.transcriptionSid);
        let cal = await deleteRecord(event.recordingSid);

        callback(null, resp.setBody(res));
      }
      deleteMain();
      break;

    case 'requeueTasks':
      //  handler to create new task
      async function newTask(workflowSid, attr) {
        try {
          return await client.taskrouter
            .workspaces(context.TWILIO_WORKSPACE_SID)
            .tasks.create({
              taskChannel: attr.taskType,
              workflowSid: workflowSid,
              attributes: JSON.stringify(attr),
            });
        } catch (error) {
          console.log('newTask error');
          handleError(error);
        }
      }

      //  handler to update the existing task
      async function completeTask(taskSid) {
        try {
          return await client.taskrouter
            .workspaces(context.TWILIO_WORKSPACE_SID)
            .tasks(taskSid)
            .update({
              assignmentStatus: 'completed',
              reason: 'task transferred',
            });
        } catch (error) {
          console.log('completeTask error');
          handleError(error);
        }
      }

      //  main logic for requeue execution
      async function requeueMain() {
        // attributes may arrive as a JSON string (URL-encoded POST) or parsed object (JSON POST)
        let newAttributes = typeof event.attributes === 'string'
          ? JSON.parse(event.attributes)
          : event.attributes;
        console.log(`[requeueTasks] taskSid=${event.taskSid} type=${event.type} workflowSid=${event.workflowSid} placeCallRetry=${newAttributes && newAttributes.placeCallRetry}`);
        //  increment the callCountRetry counter
        if (newAttributes.hasOwnProperty('placeCallRetry')) {
          newAttributes = Object.assign(newAttributes, {
            placeCallRetry: parseInt(newAttributes.placeCallRetry) + 1,
          });
        }

        // setup new task's attributes such that its linked to the
        // original task in Twilio WFO
        if (!newAttributes.hasOwnProperty('conversations')) {
          newAttributes = Object.assign(newAttributes, {
            conversations: { conversation_id: event.taskSid },
          });
        }
        //  create new task
        await PluginTaskUpdate(
          event.type,
          event.taskSid,
          newAttributes,
          event.state
        );
        await newTask(event.workflowSid, newAttributes);
        //  update existing task
        let temp_2 = await completeTask(event.taskSid);

        callback(null, resp.setBody(temp_2));
      }
      requeueMain();
      break;

    case 'UiPlugin': {
      const uiAttrs = typeof event.attributes === 'string'
        ? JSON.parse(event.attributes)
        : event.attributes;
      let tsk = await PluginTaskUpdate(
        event.type,
        event.taskSid,
        uiAttrs,
        event.state
      );
      callback(null, resp.setBody(tsk));

      break;
    }

    case 'incrementCallAttempt': {
      // Fetch fresh attributes to avoid stale-data races
      let freshTask;
      try {
        freshTask = await client.taskrouter
          .workspaces(context.TWILIO_WORKSPACE_SID)
          .tasks(event.taskSid)
          .fetch();
      } catch (err) {
        console.log('[incrementCallAttempt] fetch error', err.message);
        callback(null, resp.setBody({ status: 'error', message: err.message }));
        break;
      }

      const cbAttrs = JSON.parse(freshTask.attributes || '{}');
      cbAttrs.placeCallRetry = parseInt(cbAttrs.placeCallRetry || 1, 10) + 1;

      let updateResult;
      await client.taskrouter
        .workspaces(context.TWILIO_WORKSPACE_SID)
        .tasks(event.taskSid)
        .update({ attributes: JSON.stringify(cbAttrs) })
        .then(() => {
          console.log(`[incrementCallAttempt] taskSid=${event.taskSid} placeCallRetry=${cbAttrs.placeCallRetry}`);
          updateResult = { status: 'success', placeCallRetry: cbAttrs.placeCallRetry };
        })
        .catch((err) => {
          console.log('[incrementCallAttempt] update error', err.message);
          updateResult = { status: 'error', message: err.message };
        });

      callback(null, resp.setBody(updateResult));
      break;
    }
  }

  function handleError(error) {
    let message = '';
    if (error.message) {
      message += error.message;
    }
    if (error.stack) {
      message += ' | stack: ' + error.stack;
    }
    (console.error || console.log).call(console, message || error);
  }
});