import React from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import '@xterm/xterm/css/xterm.css';
import './theme.css';
import './styles.css';
import App from './App.jsx';
import SplashScreen from './components/SplashScreen.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { WorkspaceProvider } from './context/WorkspaceContext.jsx';

// L'écran de démarrage passe par-dessus pendant que l'app se charge derrière (design/README.md).
createRoot(document.getElementById('root')).render(
  <>
    <SettingsProvider>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </SettingsProvider>
    <div className="splash-backdrop" />
    <SplashScreen />
  </>,
);
