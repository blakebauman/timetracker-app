import { Suspense } from "react";
import type { ReactNode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageFallback } from "@/components/layout/PageFallback";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { TimerPage } from "@/pages/TimerPage";

// Timer is the landing route and stays eager. Every other route is split into
// its own chunk (Reports pulls in recharts, the largest of them) and loaded on
// demand behind a Suspense fallback. lazyWithReload recovers from stale-chunk
// import failures after a deploy by reloading once to fetch the fresh assets.
const CalendarPage = lazyWithReload(() =>
  import("@/pages/CalendarPage").then((m) => ({ default: m.CalendarPage }))
);
const ProjectsPage = lazyWithReload(() =>
  import("@/pages/ProjectsPage").then((m) => ({ default: m.ProjectsPage }))
);
const ClientsPage = lazyWithReload(() =>
  import("@/pages/ClientsPage").then((m) => ({ default: m.ClientsPage }))
);
const ClientDetailPage = lazyWithReload(() =>
  import("@/pages/ClientDetailPage").then((m) => ({ default: m.ClientDetailPage }))
);
const ReportsPage = lazyWithReload(() =>
  import("@/pages/ReportsPage").then((m) => ({ default: m.ReportsPage }))
);
const SettingsPage = lazyWithReload(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const AdminPage = lazyWithReload(() =>
  import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage }))
);
const LoginPage = lazyWithReload(() =>
  import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage }))
);
const SignupPage = lazyWithReload(() =>
  import("@/pages/SignupPage").then((m) => ({ default: m.SignupPage }))
);
const AcceptInvitePage = lazyWithReload(() =>
  import("@/pages/AcceptInvitePage").then((m) => ({ default: m.AcceptInvitePage }))
);
const NotFoundPage = lazyWithReload(() =>
  import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage }))
);

const withSuspense = (node: ReactNode) => (
  <Suspense fallback={<PageFallback />}>{node}</Suspense>
);

const router = createBrowserRouter([
  { path: "/login", element: withSuspense(<LoginPage />) },
  { path: "/signup", element: withSuspense(<SignupPage />) },
  { path: "/accept-invite", element: withSuspense(<AcceptInvitePage />) },
  {
    path: "/",
    element: (
      <AuthGuard>
        <AppShell />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <TimerPage /> },
      { path: "calendar", element: <CalendarPage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "clients", element: <ClientsPage /> },
      { path: "clients/:id", element: <ClientDetailPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "admin", element: <AdminPage /> },
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
