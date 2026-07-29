import React, { createContext, useContext, useState, useEffect } from 'react';
import { DynamicQuest } from './ai';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-expo';
import { breadcrumb } from '@/lib/crashDebug';

export type MultiplayerPlayer = {
  id: string;
  name: string;
  location: { lat: number; lng: number } | null;
  score: number;
  avatar: string | null;
  completedTasks: string[];
  team: 'A' | 'B' | 'Solo' | null;
};

interface QuestContextType {
  activeQuest: DynamicQuest | null;
  setActiveQuest: React.Dispatch<React.SetStateAction<DynamicQuest | null>>;
  questTimeLeft: number;
  setQuestTimeLeft: React.Dispatch<React.SetStateAction<number>>;
  
  roomPin: string | null;
  players: Record<string, MultiplayerPlayer>;
  createRoom: () => string;
  joinRoom: (pin: string) => void;
  leaveRoom: () => void;
  broadcastLocation: (lat: number, lng: number) => void;
  broadcastTaskCompletion: (taskId: string) => void;
  broadcastQuest: (quest: DynamicQuest) => void;
  joinTeam: (team: 'A' | 'B' | 'Solo') => void;
}

const QuestContext = createContext<QuestContextType | null>(null);

export function QuestProvider({ children }: { children: React.ReactNode }) {
  const [activeQuest, setActiveQuest] = useState<DynamicQuest | null>(null);
  const [questTimeLeft, setQuestTimeLeft] = useState<number>(0);
  breadcrumb('Q01', 'QuestProvider render');
  
  const [roomPin, setRoomPin] = useState<string | null>(null);
  const [players, setPlayers] = useState<Record<string, MultiplayerPlayer>>({});
  const [channel, setChannel] = useState<any>(null);

  const { user } = useUser();
  const userId = user?.id;

  useEffect(() => {
    if (!roomPin || !userId) return;

    const newChannel = supabase.channel(`quest-${roomPin}`, {
      config: { presence: { key: userId } },
    });

    newChannel
      .on('presence', { event: 'sync' }, () => {
        const state = newChannel.presenceState();
        const newPlayers: Record<string, MultiplayerPlayer> = {};
        for (const [key, presenceInfo] of Object.entries(state)) {
           const info = presenceInfo[0] as unknown as MultiplayerPlayer;
           if (info) newPlayers[key] = info;
        }
        setPlayers(newPlayers);
      })
      .on('broadcast', { event: 'quest_update' }, ({ payload }) => {
        if (payload.quest) {
          setActiveQuest(payload.quest);
          setQuestTimeLeft(payload.quest.duration_minutes * 60);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await newChannel.track({
              id: userId,
              name: user?.firstName || 'Explorer',
              location: null,
              score: 0,
              avatar: user?.imageUrl || null,
              completedTasks: [],
              team: 'Solo'
            });
        }
      });

    setChannel(newChannel);

    return () => {
      newChannel.unsubscribe();
      setChannel(null);
    };
  }, [roomPin, userId]);

  const createRoom = () => {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    setRoomPin(pin);
    return pin;
  };

  const joinRoom = (pin: string) => {
    setRoomPin(pin);
  };

  const leaveRoom = () => {
    setRoomPin(null);
    setActiveQuest(null);
    setQuestTimeLeft(0);
    setPlayers({});
    if (channel) {
      channel.unsubscribe();
      setChannel(null);
    }
  };

  const broadcastLocation = async (lat: number, lng: number) => {
    if (!channel || !userId) return;
    const me = players[userId];
    if (me) {
      await channel.track({ ...me, location: { lat, lng } });
    }
  };

  const broadcastTaskCompletion = async (taskId: string) => {
    if (!channel || !userId) return;
    const me = players[userId];
    if (me) {
      const newTasks = [...(me.completedTasks || []), taskId];
      await channel.track({ ...me, completedTasks: newTasks });
    }
  };

  const broadcastQuest = async (quest: DynamicQuest) => {
    if (!channel) return;
    await channel.send({
      type: 'broadcast',
      event: 'quest_update',
      payload: { quest },
    });
  };

  const joinTeam = async (team: 'A' | 'B' | 'Solo') => {
    if (!channel || !userId) return;
    const me = players[userId];
    if (me) {
      await channel.track({ ...me, team });
    }
  };

  return (
    <QuestContext.Provider value={{ 
      activeQuest, setActiveQuest, questTimeLeft, setQuestTimeLeft,
      roomPin, players, createRoom, joinRoom, leaveRoom, 
      broadcastLocation, broadcastTaskCompletion, broadcastQuest,
      joinTeam
    }}>
      {children}
    </QuestContext.Provider>
  );
}

export function useQuest() {
  const ctx = useContext(QuestContext);
  if (!ctx) throw new Error('useQuest must be used within QuestProvider');
  return ctx;
}
