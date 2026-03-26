import React from "react";
import ReactDOM from "react-dom/client";
import { CharacterStudioApp } from "./react/studio_app.jsx";
import "./styles/studio.css";

ReactDOM.createRoot(document.getElementById("app")).render(
  <React.StrictMode>
    <CharacterStudioApp />
  </React.StrictMode>,
);
