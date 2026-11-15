import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { initPwa } from './lib/pwa.ts';
import './styles/fonts.css';
import './styles/global.css';
import './styles/components.css';
import './styles/pages.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

initPwa();

// View transitions are cosmetic. Browsers abort them, e.g. when the on-screen
// keyboard resizes the viewport – that is not an error worth reporting.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as { name?: string; message?: string } | undefined;
  if (reason?.name === 'InvalidStateError' || reason?.name === 'AbortError') {
    if (/transition/i.test(reason.message ?? '')) event.preventDefault();
  }
});
