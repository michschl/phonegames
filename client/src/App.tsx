import { useEffect } from 'react';
import { createBrowserRouter, Link, Navigate, Outlet, RouterProvider } from 'react-router';
import { Aurora, TabBar, Toaster } from './components/Layout.tsx';
import { EmptyState } from './components/ui.tsx';
import { setHapticsEnabled } from './lib/device.ts';
import { refreshSession } from './lib/session.ts';
import { startSyncEngine, syncNow } from './lib/sync.ts';
import { AccountPage } from './pages/AccountPage.tsx';
import { LoginPage, RegisterPage, WelcomePage } from './pages/AuthPages.tsx';
import { DiscoverPage } from './pages/DiscoverPage.tsx';
import { GamePlayPage, GameSetupPage } from './pages/GamePages.tsx';
import { GroupEditPage, GroupsPage } from './pages/GroupsPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { useAuth } from './store/auth.ts';
import { useSettings } from './store/settings.ts';

function Root() {
  const haptics = useSettings((s) => s.haptics);

  useEffect(() => {
    startSyncEngine();
    void refreshSession().then(() => syncNow());
  }, []);

  useEffect(() => setHapticsEnabled(haptics), [haptics]);

  return (
    <>
      <Aurora />
      <Outlet />
      <Toaster />
    </>
  );
}

function RequireAuth() {
  const user = useAuth((s) => s.user);
  return user ? <Outlet /> : <Navigate to="/willkommen" replace />;
}

function PublicOnly() {
  const user = useAuth((s) => s.user);
  return user ? <Navigate to="/" replace /> : <Outlet />;
}

function TabsLayout() {
  return (
    <div className="tabs-layout">
      <Outlet />
      <TabBar />
    </div>
  );
}

/** Shown instead of a white screen if something goes wrong while rendering. */
function ErrorPage() {
  return (
    <main className="page">
      <Aurora />
      <div className="page__content">
        <EmptyState
          emoji="🧯"
          title="Ups, da ist etwas explodiert"
          text="Keine Sorge, deine Daten sind gespeichert. Lade die App neu, um weiterzumachen."
          action={
            <button type="button" className="btn btn--primary btn--lg" onClick={() => window.location.assign('/')}>
              <span>Neu laden</span>
            </button>
          }
        />
      </div>
    </main>
  );
}

function NotFound() {
  return (
    <main className="page">
      <div className="page__content">
        <EmptyState
          emoji="🛸"
          title="Hier ist nichts"
          text="Diese Seite gibt es nicht."
          action={
            <Link to="/" className="btn btn--primary">
              <span>Zur Startseite</span>
            </Link>
          }
        />
      </div>
    </main>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <PublicOnly />,
        children: [
          { path: '/willkommen', element: <WelcomePage /> },
          { path: '/anmelden', element: <LoginPage /> },
          { path: '/registrieren', element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <TabsLayout />,
            children: [
              { path: '/', element: <HomePage /> },
              { path: '/entdecken', element: <DiscoverPage /> },
              { path: '/gruppen', element: <GroupsPage /> },
              { path: '/konto', element: <AccountPage /> },
            ],
          },
          { path: '/gruppen/:groupId', element: <GroupEditPage /> },
          { path: '/spiel/:gameId', element: <GameSetupPage /> },
          { path: '/spiel/:gameId/los', element: <GamePlayPage /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
