'use client';
import { useEffect, createContext, useContext, useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface HazardEvent { id: string; category: string; severity: string; resource_status: string; verification: string; title: string; lat_pub: number; lng_pub: number; municipio: string; parroquia: string; description: string; source_url?: string | null; image_url?: string | null; created_at: string; site_vs30?: number | null; site_class?: string | null; }
export interface ChatEvent { id: string; body: string; full_name: string; created_at: string; }
export interface CheckinEvent { id: string; estado: string; msg: string; full_name: string; created_at: string; }
export interface NotifEvent { id: string; cedula_norm: string; status: string; created_at: string; }

interface SseData {
  hazards: HazardEvent[];
  chats: ChatEvent[];
  checkins: CheckinEvent[];
  presence: number;
  notifications: NotifEvent[];
}

const SseCtx = createContext<SseData>({ hazards: [], chats: [], checkins: [], presence: 1, notifications: [] });
export const useSse = () => useContext(SseCtx);

export function SseProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SseData>({ hazards: [], chats: [], checkins: [], presence: 1, notifications: [] });
  const [toast, setToast] = useState<NotifEvent | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;
    let everOpened = false; // did we ever get a working connection?
    let stopped = false;    // component unmounted — stop reconnecting

    const connect = () => {
      if (stopped) return;
      try {
        es = new EventSource('/api/stream');
      } catch { return; /* EventSource unsupported */ }

      es.onopen = () => { everOpened = true; retries = 0; };

      es.addEventListener('hazard', e => {
        const rows: HazardEvent[] = JSON.parse(e.data);
        // Cap the array: on a long-lived page (an emergency dashboard people
        // leave open for hours) this would otherwise grow without bound and
        // leak memory. Map markers persist independently of this list.
        setData(d => ({ ...d, hazards: [...d.hazards, ...rows].slice(-1000) }));
      });
      es.addEventListener('chat', e => {
        const rows: ChatEvent[] = JSON.parse(e.data);
        setData(d => ({ ...d, chats: [...d.chats.slice(-200), ...rows] }));
      });
      es.addEventListener('checkin', e => {
        const rows: CheckinEvent[] = JSON.parse(e.data);
        setData(d => ({ ...d, checkins: [...d.checkins.slice(-50), ...rows] }));
      });
      es.addEventListener('presence', e => {
        setData(d => ({ ...d, presence: Math.max(1, JSON.parse(e.data).count) }));
      });
      es.addEventListener('match', e => {
        const row: NotifEvent = JSON.parse(e.data);
        setData(d => ({ ...d, notifications: [row, ...d.notifications] }));
        setToast(row);
        setTimeout(() => setToast(null), 8000);
      });

      es.onerror = () => {
        es?.close();
        es = null;
        // Only reconnect if we'd previously connected successfully. On flaky
        // Venezuelan networks a transient drop must NOT kill live updates for
        // the rest of the session (the old code closed permanently on the
        // first blip). But if we never connected — e.g. an anonymous visitor
        // gets 401 from /api/stream — don't hammer the server in a retry loop.
        if (stopped || !everOpened) return;
        const delay = Math.min(30000, 1000 * 2 ** retries++); // 1s,2s,4s…30s
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, []);

  return (
    <SseCtx.Provider value={data}>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div key={toast.id}
            initial={{ x: 120, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 120, opacity: 0 }}
            className="fixed top-4 right-4 z-[9999] max-w-xs rounded-2xl shadow-2xl p-4"
            style={{ background: '#0D9488', color: '#fff' }}>
            <div className="font-semibold text-sm">🔔 Coincidencia encontrada</div>
            <div className="text-xs mt-1 opacity-90">
              Cédula <strong>{toast.cedula_norm}</strong> fue reportada como <strong>{toast.status}</strong>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SseCtx.Provider>
  );
}
