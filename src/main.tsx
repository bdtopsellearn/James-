import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installDialogs } from './lib/dialog';
import { installDhakaTimezone } from './lib/timezone';

installDhakaTimezone();

// Apply the saved Liquid Glass preference before first paint (avoids a flash).
try {
  const glassPref = localStorage.getItem('pn_glass');
  document.documentElement.setAttribute('data-glass', glassPref === 'off' ? 'off' : 'on');
} catch {
  /* ignore — localStorage may be unavailable */
}

// every alert('...') in the app becomes a themed in-site modal
installDialogs();

createRoot(document.getElementById('root')!).render(<App />);
