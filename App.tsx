
import React from 'react';
import { VirtualTimeProvider } from './context/VirtualTimeContext';
import { OSProvider } from './context/OSContext';
import PhoneShell from './components/PhoneShell';

const App: React.FC = () => {
  return (
    <div className="h-screen w-full bg-black overflow-hidden">
      <div
        className="fixed inset-0 w-full h-full z-0 bg-black"
        style={{ transform: 'translateZ(0)' }}
      >
        <VirtualTimeProvider>
          <OSProvider>
            <PhoneShell />
          </OSProvider>
        </VirtualTimeProvider>
      </div>
    </div>
  );
};

export default App;
