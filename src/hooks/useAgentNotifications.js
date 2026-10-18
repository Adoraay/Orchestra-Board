import { useCallback, useEffect, useRef, useState } from 'react';
import doneSound from '../assets/sounds/done.wav';
import { useSettings } from '../context/SettingsContext.jsx';

const SOUND_GAP = 600; // ms : plusieurs agents qui finissent ensemble = un seul son

// Fins de tâche de toutes les cases, tableaux fermés compris (PLAN.md §3.6) :
// son, onglets à point vert, agents lancés (barre du bas), et case à centrer (notification Windows ou barre).
export default function useAgentNotifications({ boards, content, activeId, setActiveId }) {
  const { settings } = useSettings();
  const [running, setRunning] = useState({}); // id de la case -> { status, name, ... } tant que l'agent tourne
  const [focusRequest, setFocusRequest] = useState(null); // { id, at } : case à centrer
  const soundOn = useRef(settings.general.notifySound);
  soundOn.current = settings.general.notifySound;
  const lastSound = useRef(0);
  const contentRef = useRef(content);
  contentRef.current = content;

  // Ouvre le tableau de la case puis demande à la map de la centrer.
  const focusAgent = useCallback(
    (id) => {
      const board = Object.entries(contentRef.current).find(([, c]) => c.nodes.some((n) => n.id === id));
      if (!board) return;
      setActiveId(board[0]);
      setFocusRequest({ id, at: Date.now() });
    },
    [setActiveId],
  );
  const clearFocus = useCallback(() => setFocusRequest(null), []);

  useEffect(() => {
    const audio = new Audio(doneSound);
    audio.volume = 0.6;

    const offStatus = window.agentEvents.onStatus((id, info) => {
      setRunning((prev) => {
        if (!info) {
          if (!prev[id]) return prev;
          const { [id]: _gone, ...rest } = prev;
          return rest;
        }
        return { ...prev, [id]: info };
      });
      // unseen n'arrive à true qu'au moment où l'agent vient de finir.
      if (info?.unseen && soundOn.current && Date.now() - lastSound.current > SOUND_GAP) {
        lastSound.current = Date.now();
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    });
    const offFocus = window.agentEvents.onFocusRequest(focusAgent);

    return () => {
      offStatus();
      offFocus();
    };
  }, [focusAgent]);

  // Onglets à signaler : tableaux fermés qui contiennent une case qui a fini.
  const boardsWithNews = new Set(
    boards
      .filter((b) => b.id !== activeId && content[b.id]?.nodes.some((n) => running[n.id]?.unseen))
      .map((b) => b.id),
  );

  return { boardsWithNews, running, focusRequest, focusAgent, clearFocus };
}
