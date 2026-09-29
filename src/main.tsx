import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resumePendingSubmissions } from '@/api/useMatchSubmission';
import { startMocking } from '@/mocks/start';
import App from './App';
import './index.css';

const queryClient = new QueryClient();

// The mock API must be listening before the first query; startMocking never rejects, so a
// failing worker only degrades ranking/history, never the game.
void startMocking().then(() => {
  resumePendingSubmissions(queryClient);
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
