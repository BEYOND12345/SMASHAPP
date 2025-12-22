import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app.tsx';
import { PublicRouter } from './publicrouter.tsx';
import { ErrorBoundary } from './components/errorboundary.tsx';
import './index.css';

const isPublicRoute = () => {
  const path = window.location.pathname;
  return /^\/(quote|invoice)\/[a-f0-9-]+$/i.test(path);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isPublicRoute() ? <PublicRouter /> : <App />}
    </ErrorBoundary>
  </StrictMode>
);
