'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface ViewModeContextType {
  isStudentMode: boolean;
  toggleViewMode: () => void;
  setStudentMode: (enabled: boolean) => void;
}

const ViewModeContext = createContext<ViewModeContextType>({
  isStudentMode: true,
  toggleViewMode: () => {},
  setStudentMode: () => {},
});

export const ViewModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Default to true (clean student experience)
  const [isStudentMode, setIsStudentMode] = useState<boolean>(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('astrix_view_mode');
      if (saved !== null) {
        setIsStudentMode(saved === 'student');
      }
    } catch (e) {
      console.warn('Storage read note:', e);
    }
  }, []);

  const toggleViewMode = () => {
    const next = !isStudentMode;
    setIsStudentMode(next);
    try {
      localStorage.setItem('astrix_view_mode', next ? 'student' : 'dev');
    } catch (e) {}
  };

  const setStudentMode = (enabled: boolean) => {
    setIsStudentMode(enabled);
    try {
      localStorage.setItem('astrix_view_mode', enabled ? 'student' : 'dev');
    } catch (e) {}
  };

  return (
    <ViewModeContext.Provider value={{ isStudentMode, toggleViewMode, setStudentMode }}>
      {children}
    </ViewModeContext.Provider>
  );
};

export const useViewMode = () => useContext(ViewModeContext);
