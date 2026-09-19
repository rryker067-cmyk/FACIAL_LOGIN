import { useEffect, useState } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

type SessionUser = { name: string; role: string };

function getStoredSession(): SessionUser | null {
  try {
    const storedSession = localStorage.getItem('veris_session');
    const storedToken = localStorage.getItem('veris_access_token');

    if (!storedSession || !storedToken) return null;

    const session = JSON.parse(storedSession) as Partial<SessionUser>;
    return session.name && session.role ? { name: session.name, role: session.role } : null;
  } catch {
    localStorage.removeItem('veris_session');
    localStorage.removeItem('veris_access_token');
    return null;
  }
}

export default function App() {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(getStoredSession);
  const [currentView, setCurrentView] = useState<'home' | 'login' | 'dashboard'>(
    () => (getStoredSession() ? 'dashboard' : 'home'),
  );

  useEffect(() => {
    document.title = currentView === 'dashboard'
      ? 'Dashboard | VerisID'
      : currentView === 'login'
        ? 'Acceso seguro | VerisID'
        : 'VerisID | Identidad digital segura';
  }, [currentView]);

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
          localStorage.removeItem('veris_session');
          localStorage.removeItem('veris_access_token');
          setCurrentView('home');
        }} />
      )}
    </>
  );
}