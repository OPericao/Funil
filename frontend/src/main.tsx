import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "primeicons/primeicons.css";
import "primereact/resources/primereact.min.css";
import "quill/dist/quill.core.css";
import "quill/dist/quill.snow.css";
import App from "./App";
import { I18nProvider } from "./i18n/I18nProvider";
import "./styles/tailwind.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <App />
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>
);
