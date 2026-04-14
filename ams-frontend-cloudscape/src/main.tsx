import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "@cloudscape-design/global-styles/index.css";
import { router } from "./app/router";
import { AppProviders } from "./providers/AppProviders";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>
);
