import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { App } from './ui/App';
import { getState, getTransport } from './store/store';

document.documentElement.dataset.theme = getState().theme;
createRoot(document.getElementById('root')!).render(<App />);

// handy for debugging and automated tests
(window as unknown as { fiveohfive: unknown }).fiveohfive = { getState, getTransport };
