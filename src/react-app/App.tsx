import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { TimerPage } from "@/pages/TimerPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { ClientsPage } from "@/pages/ClientsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { SettingsPage } from "@/pages/SettingsPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <TimerPage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "clients", element: <ClientsPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
