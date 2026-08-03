import { combineReducers } from 'redux';
import { reduce as InQueueMessagingReducer } from './ActionInQueueMessagingState';

export const namespace = 'in-queue-redux';

export default combineReducers({
  InQueueMessaging: InQueueMessagingReducer,
});
