const ACTION_CB_CALL_BTN_ACCESSIBILITY = 'CB_CALL_BTN_ACCESSIBILITY';

const initialState = {
  cbCallButtonAccessibility: false,
};

export class Actions {
  static cbToggleCallButtonDisable = (value) => ({
    type: ACTION_CB_CALL_BTN_ACCESSIBILITY,
    value,
  });
}

export function reduce(state = initialState, action) {
  switch (action.type) {
    case ACTION_CB_CALL_BTN_ACCESSIBILITY:
      return { ...state, cbCallButtonAccessibility: action.value };
    default:
      return state;
  }
}
