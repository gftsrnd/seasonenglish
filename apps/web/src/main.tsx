import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrototypeApp } from "./prototype/PrototypeApp.js";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/800.css";
import "./prototype/prototype.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(<StrictMode><PrototypeApp /></StrictMode>);
