import { useState } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'login' | 'dashboard'>('home');

  return (
    <>
      {currentView === 'home' && (
        <Home onGoToLogin={() => setCurrentView('login')} />
      )}

      {currentView === 'login' && (
        <Login 
          onLoginSuccess={() => setCurrentView('dashboard')} 
          onBackToHome={() => setCurrentView('home')} 
        />
      )}

      {currentView === 'dashboard' && (
        <Dashboard onLogout={() => setCurrentView('home')} />
      )}
    </>
  );
}