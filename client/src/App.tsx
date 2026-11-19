import { useEffect } from 'react';
import { createBrowserRouter, Link, Navigate, Outlet, RouterProvider } from 'react-router';
import { Backdrop, TabBar, Toaster } from './components/Layout.tsx';
import { UpdateHint, useAutoUpdate } from './components/UpdateHint.tsx';
import { EmptyState } from './components/ui.tsx';
import { setHapticsEnabled } from './lib/device.ts';
import { hasAccess, needsTerms, refreshSession } from './lib/session.ts';
import { startSyncEngine, syncNow } from './lib/sync.ts';
import { AccountPage } from './pages/AccountPage.tsx';
import { LoginPage, RegisterPage, SubscribePage, TermsPage, WelcomePage } from './pages/AuthPages.tsx';
import { DiscoverPage } from './pages/DiscoverPage.tsx';
import { GamePlayPage, GameSetupPage } from './pages/GamePages.tsx';
import { LearnHubPage, LearnPlayPage, StackLearnPage } from './pages/LearnPages.tsx';
import { GroupEditPage, GroupsPage } from './pages/GroupsPage.tsx';
import { NewStackPage, StackEditPage } from './pages/StackPages.tsx';
import { SharePage } from './pages/SharePage.tsx';
import { LegalPage } from './legal/LegalPages.tsx';
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
  useAutoUpdate();

  return (
    <>
      <Backdrop />
      <Outlet />
      <Toaster before={<UpdateHint />} />
    </>
  );
}

/** Signed in with access to the app – a paid account without a running subscription gets «Abo». */
function RequireAuth() {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/willkommen" replace />;
  if (needsTerms(user)) return <Navigate to="/bedingungen" replace />;
  return hasAccess(user) ? <Outlet /> : <Navigate to="/abo" replace />;
}

/** Signed in and agreed to the terms, with or without subscription (the subscription page itself). */
function RequireUser() {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/willkommen" replace />;
  return needsTerms(user) ? <Navigate to="/bedingungen" replace /> : <Outlet />;
}

/** Signed in, nothing else (agreeing to the terms). */
function RequireSignedIn() {
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
      <Backdrop />
      <div className="page__content">
        <EmptyState
          mascot="oops"
          emoji="🧯"
          level={1}
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
          mascot="wow"
          emoji="🛸"
          level={1}
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
        element: <RequireSignedIn />,
        children: [{ path: '/bedingungen', element: <TermsPage /> }],
      },
      {
        element: <RequireUser />,
        children: [{ path: '/abo', element: <SubscribePage /> }],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <TabsLayout />,
            children: [
              { path: '/', element: <HomePage /> },
              { path: '/lernen', element: <LearnHubPage /> },
              { path: '/entdecken', element: <DiscoverPage /> },
              { path: '/gruppen', element: <GroupsPage /> },
              { path: '/konto', element: <AccountPage /> },
            ],
          },
          { path: '/gruppen/:groupId', element: <GroupEditPage /> },
          // The stack list moved into the «Lernen» tab.
          { path: '/stapel', element: <Navigate to="/lernen" replace /> },
          { path: '/stapel/neu', element: <NewStackPage /> },
          { path: '/stapel/:stackId', element: <StackEditPage /> },
          { path: '/spiel/:gameId', element: <GameSetupPage /> },
          { path: '/spiel/:gameId/los', element: <GamePlayPage /> },
          { path: '/lernen/:stackId', element: <StackLearnPage /> },
          { path: '/lernen/:stackId/:mode', element: <LearnPlayPage /> },
        ],
      },
      // Shared learning stacks: for signed-in visitors and as an invitation for new ones.
      { path: '/s/:shareId', element: <SharePage /> },
      // Legal texts: public, with or without an account.
      { path: '/impressum', element: <LegalPage doc="impressum" /> },
      { path: '/agb', element: <LegalPage doc="agb" /> },
      { path: '/datenschutz', element: <LegalPage doc="datenschutz" /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
