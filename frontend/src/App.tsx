import { useState } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'login' | 'dashboard'>('home');
  const [sessionUser, setSessionUser] = useState<{ name: string; role: string } | null>(null);

  return (
    <>
      {currentView === 'home' && (
        <Home onGoToLogin={() => setCurrentView('login')} />
      )}

      {currentView === 'login' && (
        <Login 
          onLoginSuccess={(userData) => {
            setSessionUser(userData);
            setCurrentView('dashboard');
          }} 
          onBackToHome={() => setCurrentView('home')} 
        />
      )}

      {currentView === 'dashboard' && (
        <Dashboard user={sessionUser} onLogout={() => {
          setSessionUser(null);
          setCurrentView('home');
        }} />
      )}
    </>
  );
}