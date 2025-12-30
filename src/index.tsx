import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { MsalAuthProvider } from './context/DynamicMsalAuthContext';
import { DomainProvider } from './context/DomainContext';
import ConfigLoader from './components/ConfigLoader/ConfigLoader';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <ConfigLoader>
      <MsalAuthProvider>
        <AuthProvider>
          <DomainProvider>
            <App />
          </DomainProvider>
        </AuthProvider>
      </MsalAuthProvider>
    </ConfigLoader>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();