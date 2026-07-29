/**
 * Demo Mode Context — provides mock data when the app runs without
 * a Clerk/Supabase backend. Wraps the entire app and intercepts
 * data-fetching calls at the screen level.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Session } from '@/types';
import {
  DEMO_USER,
  DEMO_SESSIONS,
  DEMO_QUEST,
  getDemoMode,
  setDemoMode,
} from './demoData';
import { breadcrumb } from '@/lib/crashDebug';

interface DemoUser {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  imageUrl: string;
  email: string;
  xp: number;
  level: number;
  nations: number;
  sites: number;
  streak: number;
  longestStreak: number;
}

interface DemoQuestTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  xp_reward: number;
}

interface DemoQuest {
  id: string;
  title: string;
  description: string;
  xp_reward: number;
  tasks: DemoQuestTask[];
  timeLeft: number;
}

interface DemoModeContextType {
  isDemoMode: boolean;
  isLoading: boolean;
  user: DemoUser;
  sessions: Session[];
  quest: DemoQuest;
  enterDemoMode: () => Promise<void>;
  exitDemoMode: () => Promise<void>;
  /** Simulate scanning a monument — adds a session and returns it */
  simulateScan: (landmarkIndex: number) => Session;
  /** Mark a quest task as completed */
  completeQuestTask: (taskId: string) => void;
}

const DemoModeContext = createContext<DemoModeContextType | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>(DEMO_SESSIONS);
  const [quest, setQuest] = useState<DemoQuest>(DEMO_QUEST);
  breadcrumb('D01', 'DemoProvider render');

  // Check demo flag on mount
  useEffect(() => {
    breadcrumb('D10', 'DemoProvider useEffect — getDemoMode()');
    getDemoMode().then((v) => {
      setIsDemoMode(v);
      setIsLoading(false);
    });
  }, []);

  const enterDemoMode = useCallback(async () => {
    await setDemoMode(true);
    setIsDemoMode(true);
    setSessions(DEMO_SESSIONS);
    setQuest(DEMO_QUEST);
  }, []);

  const exitDemoMode = useCallback(async () => {
    await setDemoMode(false);
    setIsDemoMode(false);
  }, []);

  const simulateScan = useCallback(
    (landmarkIndex: number) => {
      const lm = WORLD_LANDMARKS[landmarkIndex % WORLD_LANDMARKS.length];
      const newSession: Session = {
        id: `demo-scan-${Date.now()}`,
        user_id: 'demo-user-001',
        monument_name: lm.name,
        location_city: lm.city,
        location_country: lm.country,
        coordinates: { lat: lm.coordinates.lat, lng: lm.coordinates.lng },
        photo_url: lm.image,
        history_text: `${lm.name} — a landmark of global significance.`,
        details: { xp_reward: 150, unesco: true },
        qa_thread: [],
        created_at: new Date().toISOString(),
      };
      setSessions((prev) => [newSession, ...prev]);
      return newSession;
    },
    []
  );

  const completeQuestTask = useCallback((taskId: string) => {
    setQuest((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === taskId ? { ...t, completed: true } : t
      ),
    }));
  }, []);

  return (
    <DemoModeContext.Provider
      value={{
        isDemoMode,
        isLoading,
        user: DEMO_USER,
        sessions,
        quest,
        enterDemoMode,
        exitDemoMode,
        simulateScan,
        completeQuestTask,
      }}
    >
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode(): DemoModeContextType {
  const ctx = useContext(DemoModeContext);
  if (!ctx) {
    // Outside DemoProvider — return safe defaults (non-demo mode)
    return {
      isDemoMode: false,
      isLoading: false,
      user: DEMO_USER,
      sessions: [],
      quest: DEMO_QUEST,
      enterDemoMode: async () => {},
      exitDemoMode: async () => {},
      simulateScan: () => DEMO_SESSIONS[0],
      completeQuestTask: () => {},
    };
  }
  return ctx;
}

// Re-export WORLD_LANDMARKS for components that need it in demo context
import { WORLD_LANDMARKS } from '@/constants/landmarks';
