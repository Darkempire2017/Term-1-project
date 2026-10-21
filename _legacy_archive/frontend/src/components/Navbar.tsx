import React from 'react';
import { Umbrella, Radio, LogOut, User as UserIcon, Shield } from 'lucide-react';
import { User } from '../types';

interface NavbarProps {
  user: User | null;
  activeTab: 'dashboard' | 'admin' | 'login' | 'register';
  setActiveTab: (tab: 'dashboard' | 'admin' | 'login' | 'register') => void;
  onLogout: () => void;
  mqttConnected: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeTab,
  setActiveTab,
  onLogout,
  mqttConnected,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center space-x-3 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform">
            <Umbrella className="w-6 h-6" />
          </div>
          <div>
            <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-700 to-blue-600">
              Smart Umbrella
            </span>
            <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
              Campus Box
            </span>
          </div>
        </div>

        {/* Live MQTT & Station Badge */}
        <div className="hidden md:flex items-center space-x-2 text-xs font-medium px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200">
          <Radio className={`w-3.5 h-3.5 ${mqttConnected ? 'text-emerald-500 animate-pulse' : 'text-amber-500'}`} />
          <span className="text-slate-600">HiveMQ Broker:</span>
          <span className={mqttConnected ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
            {mqttConnected ? 'Online' : 'Connecting...'}
          </span>
        </div>

        {/* Navigation Items */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Borrow Station
          </button>

          <button
            onClick={() => setActiveTab('admin')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center space-x-1.5 transition-colors ${
              activeTab === 'admin'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>ESP32 Admin</span>
          </button>

          {user ? (
            <div className="flex items-center pl-2 sm:pl-4 space-x-2 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold text-slate-800">{user.name}</p>
                <p className="text-[11px] text-slate-500 font-mono">#{user.indexNumber}</p>
              </div>
              <button
                onClick={onLogout}
                title="Sign out"
                className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2 pl-2">
              <button
                onClick={() => setActiveTab('login')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'login'
                    ? 'bg-sky-100 text-sky-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Log In
              </button>
              <button
                onClick={() => setActiveTab('register')}
                className="px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 transition shadow-sm"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
