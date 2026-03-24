
import React, { createContext, useContext, useEffect, useState } from 'react';
import { VirtualTime } from '../types';

const getRealTime = (): VirtualTime => {
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
        hours: now.getHours(),
        minutes: now.getMinutes(),
        day: days[now.getDay()]
    };
};

const VirtualTimeContext = createContext<VirtualTime>(getRealTime());

export const VirtualTimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [virtualTime, setVirtualTime] = useState<VirtualTime>(getRealTime());

    useEffect(() => {
        const timer = setInterval(() => {
            setVirtualTime(getRealTime());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <VirtualTimeContext.Provider value={virtualTime}>
            {children}
        </VirtualTimeContext.Provider>
    );
};

export const useVirtualTime = (): VirtualTime => useContext(VirtualTimeContext);
