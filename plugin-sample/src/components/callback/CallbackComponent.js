import React from 'react';
import * as Flex from '@twilio/flex-ui';
import moment from 'moment';
import 'moment-timezone';
import { Button } from '@twilio-paste/core/button';
import { CallIcon } from '@twilio-paste/icons/cjs/CallIcon';

import styles from './CallbackStyles';
import * as inqueueUtils from '../common/inqueueUtils';

export default class CallbackComponent extends React.Component {
  static displayName = 'CallbackComponent';

  cbCallButtonAccessibility = async (state) =>
    inqueueUtils.callButtonAccessibility(this.props.task, 'callback', state);

  startCall = async () => {
    const manager = Flex.Manager.getInstance();
    const activityName = manager.workerClient.activity.name;
    if (activityName === 'Offline') {
      // eslint-disable-next-line no-alert
      alert('Change activity state from "Offline" to place a callback call');
      return;
    }

    const { queueSid, attributes } = this.props.task;
    // 'callback' is the attribute key written by the inqueue-callback serverless function
    const { callback, phone_number, from } = attributes;
    const callbackNumber = callback || phone_number;
    console.log('[CallbackComponent] startCall callbackNumber=', callbackNumber);

    const taskAttributes = {
      type: 'outbound',
      name: `Callback: ${callbackNumber}`,
      phone: callbackNumber,
      callbackTaskSid: this.props.task.taskSid,
    };

    try {
      await Flex.Actions.invokeAction('StartOutboundCall', {
        destination: callbackNumber,
        queueSid,
        callerId: from,
        taskAttributes,
      });
    } catch (e) {
      console.error('[CallbackComponent] StartOutboundCall error:', e.message);
    }

    // Update task attribute after call is placed — avoids "Action is pending"
    // race condition where Flex is busy processing a TaskRouter attribute event
    this.cbCallButtonAccessibility(true).catch((e) =>
      console.error('[CallbackComponent] cbCallButtonAccessibility error:', e)
    );
  };

  startTransfer = async () => {
    console.log('[CallbackComponent] startTransfer (requeue) taskSid=', this.props.task.taskSid);
    await this.cbCallButtonAccessibility(false);
    return inqueueUtils.startTransfer(this.props.task);
  };

  render() {
    const { attributes } = this.props.task;

    const callbackNumber = attributes.callback || attributes.phone_number;
    const count = attributes.placeCallRetry || 1;
    const isCallButtonDisabled =
      attributes.ui_plugin && attributes.ui_plugin.cbCallButtonAccessibility;

    let localTimeShort = '';
    try {
      const timeReceived = moment(attributes.callTime.time_recvd);
      const localTz = moment.tz.guess();
      localTimeShort = timeReceived.tz(localTz).format('MM-D-YYYY, h:mm:ss a z');
    } catch (_) {}

    return (
      <span className="Twilio">
        <h1>Contact CallBack Request</h1>
        <p>A contact has requested an immediate callback.</p>
        <h4 style={styles.itemBold}>Callback Details</h4>
        <ul>
          <li>
            <div style={styles.itemWrapper}>
              <span style={styles.item}>Contact Phone:</span>
              <span style={styles.itemDetail}>{callbackNumber}</span>
            </div>
          </li>
          <li>
            <div style={styles.itemWrapper}>
              <span style={styles.item}>Callback Attempt:</span>
              <span style={styles.itemDetail}>{count}</span>
            </div>
          </li>
          {localTimeShort && (
            <li>
              <div style={styles.itemWrapper}>
                <span style={styles.item}>Received:</span>
                <span style={styles.itemDetail}>{localTimeShort}</span>
              </div>
            </li>
          )}
          <li>&nbsp;</li>
        </ul>
        <div style={styles.buttonWrapper}>
          <Button
            variant="primary"
            size="large"
            onClick={() => this.startCall()}
            disabled={isCallButtonDisabled}
            fullWidth
          >
            <CallIcon decorative />
            &nbsp; Call {callbackNumber}
          </Button>
        </div>
        <p style={styles.textCenter}>Not answering? Requeue to try later.</p>
        <div style={styles.buttonWrapper}>
          <Button
            variant="secondary"
            onClick={() => this.startTransfer()}
            disabled={count >= 3}
            fullWidth
          >
            Requeue Callback ( {count} of 3 )
          </Button>
        </div>
        <p>&nbsp;</p>
      </span>
    );
  }
}
