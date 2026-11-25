import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

// /app carga la zona autenticada de forma diferida, así la demo no depende de Supabase.
if (window.location.pathname.startsWith('/app')) {
  void import('./app/AppRoot').then(({ default: AppRoot }) => {
    root.render(
      <StrictMode>
        <AppRoot />
      </StrictMode>,
    );
  });
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
