import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TimerPage } from "@/pages/TimerPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { ClientsPage } from "@/pages/ClientsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { LoginPage } from "@/pages/LoginPage";
import { SignupPage } from "@/pages/SignupPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/signup", element: <SignupPage /> },
  {
    path: "/",
    element: (
      <AuthGuard>
        <AppShell />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <TimerPage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "clients", element: <ClientsPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export default function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
