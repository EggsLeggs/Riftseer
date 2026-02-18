import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./global.css";
import "./icons.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
