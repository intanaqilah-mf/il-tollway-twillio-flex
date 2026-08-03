import * as Flex from '@twilio/flex-ui';
import { buildUrl } from '../../helpers/urlHelper';
import { post } from '../../helpers/http';

const url = buildUrl('/inqueue-utils');

export const callButtonAccessibility = async (task, type, state) => {
  const { taskSid, attributes } = task;
  console.log(`[inqueueUtils] callButtonAccessibility taskSid=${taskSid} type=${type} state=${state}`);
  const data = {
    mode: 'UiPlugin',
    type,
    Token: Flex.Manager.getInstance().user.token,
    taskSid,
    attributes,
    state,
  };
  return post(url, data, { noJson: true, verbose: true, title: 'cbUiPlugin' });
};

export const startTransfer = async (task) => {
  const { taskSid, attributes, workflowSid, queueName } = task;
  console.log(`[inqueueUtils] startTransfer (requeue) taskSid=${taskSid} workflowSid=${workflowSid}`);
  const data = {
    mode: 'requeueTasks',
    type: 'callback',
    Token: Flex.Manager.getInstance().user.token,
    taskSid,
    attributes,
    workflowSid,
    queueName,
    state: false,
  };
  return post(url, data, { verbose: true, title: 'requeueTasks' });
};
