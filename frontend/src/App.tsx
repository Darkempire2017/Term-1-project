import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { Register } from './pages/Register';
import { VerifyEmail } from './pages/VerifyEmail';
import { Login } from './pages/Login';
import { AdminStation } from './pages/AdminStation';
import { api } from './services/api';
import { User } from './types';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'admin' | 'login' | 'register' | 'verify'>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string>('');
  const [mqttConnected, setMqttConnected] = useState<boolean>(true);

  // Restore authenticated session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = api.getToken();
      if (token) {
        try {
          const res = await api.getMe();
          if (res.success && res.user) {
            setUser({
              id: res.user.id,
              indexNumber: res.user.index_number || res.user.indexNumber,
              name: res.user.name,
              email: res.user.email,
              role: res.user.role,
            });
          }
        } catch (err) {
          api.removeToken();
        }
      }
    };
    checkAuth();
  }, []);

  const handleLogout = () => {
    api.removeToken();
    setUser(null);
    setActiveTab('dashboard');
  };

  const handleRegistrationSuccess = (email: string) => {
    setPendingVerificationEmail(email);
    setActiveTab('verify');
  };

  const handleLoginSuccess = (loggedInUser: User, token: string) => {
    setUser(loggedInUser);
    setActiveTab('dashboard');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      <Navbar
        user={user}
        activeTab={activeTab === 'verify' ? 'register' : activeTab}
        setActiveTab={(tab) => setActiveTab(tab)}
        onLogout={handleLogout}
        mqttConnected={mqttConnected}
      />

      <main className="flex-1 pb-16">
        {activeTab === 'dashboard' && (
          <Dashboard
            user={user}
            onRequireLogin={() => setActiveTab('login')}
          />
        )}

        {activeTab === 'admin' && <AdminStation />}

        {activeTab === 'login' && (
          <Login
            onSuccess={handleLoginSuccess}
            onGoToRegister={() => setActiveTab('register')}
            onRequiresVerification={(email) => {
              setPendingVerificationEmail(email);
              setActiveTab('verify');
            }}
          />
        )}

        {activeTab === 'register' && (
          <Register
            onSuccess={handleRegistrationSuccess}
            onGoToLogin={() => setActiveTab('login')}
          />
        )}

        {activeTab === 'verify' && (
          <VerifyEmail
            email={pendingVerificationEmail}
            onVerified={(verifiedUser) => {
              setUser(verifiedUser);
              setActiveTab('dashboard');
            }}
            onBack={() => setActiveTab('register')}
          />
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© {new Date().getFullYear()} Smart Umbrella Station Project. University Campus IoT System.</p>
          <div className="flex space-x-4 text-slate-400">
            <span>ESP32 + RC522</span>
            <span>&bull;</span>
            <span>HiveMQ MQTT</span>
            <span>&bull;</span>
            <span>Supabase PostgreSQL</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
