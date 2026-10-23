// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

import { createApp } from "vue";
import App from "./App.vue";

if (typeof document !== "undefined") {
  const root = document.getElementById("app");
  if (root) {
    createApp(App).mount(root);
  }
}
