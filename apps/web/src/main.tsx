import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { createAppRouter, providerFuture } from './app/router';
// Self-hosted fonts (no request to a font CDN): display, text and mono. All three have Cyrillic.
import '@fontsource-variable/unbounded';
import '@fontsource-variable/onest';
import '@fontsource-variable/jetbrains-mono';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={createAppRouter()} future={providerFuture} />
  </StrictMode>,
);
