const JWEValidator = require('twilio-flex-token-validator').functionValidator;

exports.handler = JWEValidator(async function (context, event, callback) {
    function handleError(error) {
        let message = '';
        if (error.message) {
            message += error.message;
        }
        if (error.stack) {
            message += ` | stack: ${error.stack}`;
        }
        (console.error || console.log).call(console, message || error);
    }

    const client = context.getTwilioClient();
    try {
        // Create a custom Twilio Response
        const response = new Twilio.Response();
        // Set the CORS headers to allow Flex to make an error-free HTTP request
        // to this Function
        response.appendHeader('Access-Control-Allow-Origin', '*');
        response.appendHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET');
        response.appendHeader('Access-Control-Allow-Headers', 'Content-Type');

        // get method
        const { mode } = event;
        console.log("mode is:" + mode);
        async function PluginTaskUpdate(type, taskSid, attr, state) {
            if (type === 'callback') {
                attr.ui_plugin.cbCallButtonAccessibility = event.state;
            }
        }
        // switch (mode) {
        //     case 'requeueTasks':
        console.log("inside the requeue method");
        //  handler to create new task
        function newTask(workflowSid, attr) {
            console.log("inside the new task: " + JSON.stringify(attr));
            const task = client.taskrouter
                .workspaces(context.TWILIO_WORKSPACE_SID)
                .tasks.create({
                    // taskChannel: attr.type,   
                    taskChannel: 'voice',
                    priority: 50,
                    workflowSid,
                    attributes: JSON.stringify(attr),
                })
                .catch((error) => {
                    console.log('newTask error');
                    handleError(error);
                    return Promise.reject(error);
                });
            console.log("task ID inside the newTask Method" + task.sid);
            return task;
        }

        //  handler to update the existing task
        function completeTask(taskSid) {
            return client.taskrouter
                .workspaces(context.TWILIO_WORKSPACE_SID)
                .tasks(taskSid)
                .update({
                    assignmentStatus: 'completed',
                    reason: 'task transferred',
                })
                .catch((error) => {
                    console.log('completeTask error');
                    handleError(error);
                    return Promise.reject(error);
                });
        }

        //  main logic for requeue execution
        let newAttributes = event.attributes;
        console.log(JSON.stringify(newAttributes));
        //  increment the callCountRetry counter
        if (newAttributes.hasOwnProperty('placeCallRetry')) {
            newAttributes = Object.assign(newAttributes, {
                placeCallRetry: parseInt(event.attributes.placeCallRetry, 10) + 1,
            });
        }

        /*
         * setup new task's attributes such that its linked to the
         * original task in Twilio WFO
         */
        // if (!newAttributes.hasOwnProperty('conversations')) {
        //     // eslint-disable-next-line camelcase
        //     newAttributes = { ...newAttributes, conversations: { conversation_id: event.taskSid } };
        // }
        //  create new task
        //console.log("Task SID is:"+ event.taskSid);
        await PluginTaskUpdate(event.type, event.taskSid, event.attributes, event.state);
        await newTask(event.workflowSid, newAttributes);
        //  update existing task
        //const completedTask = await completeTask(event.taskSid);

        return callback(null, response.setBody(completedTask));
        //     break;
        // default:
        //     return callback(500, 'Mode not specified');
        //     break;
    }

    // }
    catch (err) {
        response.appendHeader('Access-Control-Allow-Origin', '*');
        response.appendHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET');
        response.appendHeader('Access-Control-Allow-Headers', 'Content-Type');
        response.appendHeader('Content-Type', 'plain/text');
        response.setBody(err.message);
        response.setStatusCode(500);

        return callback(null, response);
    }
});