import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { BrowserRouter } from 'react-router-dom';
import { seedDemoDataIfNeeded } from './demo/demoSeed';
import { LocationProvider } from './context/LocationContext';

seedDemoDataIfNeeded();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LocationProvider>
        <App />
      </LocationProvider>
    </BrowserRouter>
  </StrictMode>
);
