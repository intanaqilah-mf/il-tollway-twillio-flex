import React from "react"
import { FlexPlugin } from "@twilio/flex-plugin"

import CustomTaskList from "./components/CustomTaskList/CustomTaskList"

const PLUGIN_NAME = "SamplePlugin"

export default class SamplePlugin extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME)
  }

  /**
   * This code is run when your plugin is being started
   * Use this to modify any UI components or attach to the actions framework
   *
   * @param flex { typeof import('@twilio/flex-ui') }
   */
  async init(flex, manager) {
    flex.CRMContainer.defaultProps.uriCallback = (task) => {
      return task
        ? `https://www.bing.com/search?q=${task.attributes.name}`
        : "https://www.bing.com"
    }
  }
}