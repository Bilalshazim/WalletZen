import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider } from './context/SettingsContext';
import { FinanceProvider } from './context/FinanceContext';
import { LockProvider } from './context/LockContext';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <AuthProvider>
          <LockProvider>
            <FinanceProvider>
              {/* Framer animations run in JS, so the CSS reduced-motion rule alone doesn't cover them. */}
              <MotionConfig reducedMotion="user">
                <App />
              </MotionConfig>
            </FinanceProvider>
          </LockProvider>
        </AuthProvider>
      </SettingsProvider>
    </ThemeProvider>
  </StrictMode>,
);
