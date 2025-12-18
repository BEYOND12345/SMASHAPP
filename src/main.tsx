import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app.tsx';
import { ErrorBoundary } from './components/errorboundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
