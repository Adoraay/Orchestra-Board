import { useEffect, useRef, useState } from 'react';
import doneSound from '../assets/sounds/done.wav';
import { useSettings } from '../context/SettingsContext.jsx';

const SOUND_GAP = 600; // ms : plusieurs agents qui finissent ensemble = un seul son

// Fins de tâche de toutes les cases, tableaux fermés compris (PLAN.md §3.6) :
// son, onglets à point vert, et clic sur une notification Windows qui ouvre la bonne case.
export default function useAgentNotifications({ boards, content, activeId, setActiveId }) {
  const { settings } = useSettings();
  const [unseen, setUnseen] = useState(() => new Set()); // cases qui ont fini et pas encore été vues
  const [focusRequest, setFocusRequest] = useState(null); // { id, at } : case à centrer
  const soundOn = useRef(settings.general.notifySound);
  soundOn.current = settings.general.notifySound;
  const lastSound = useRef(0);
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    const audio = new Audio(doneSound);
    audio.volume = 0.6;

    const offStatus = window.agentEvents.onStatus((id, info) => {
      const isUnseen = Boolean(info?.unseen);
      setUnseen((prev) => {
        if (prev.has(id) === isUnseen) return prev;
        const next = new Set(prev);
        if (isUnseen) next.add(id);
        else next.delete(id);
        return next;
      });
      // unseen n'arrive à true qu'au moment où l'agent vient de finir.
      if (isUnseen && soundOn.current && Date.now() - lastSound.current > SOUND_GAP) {
        lastSound.current = Date.now();
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    });

    const offFocus = window.agentEvents.onFocusRequest((id) => {
      const board = Object.entries(contentRef.current).find(([, c]) => c.nodes.some((n) => n.id === id));
      if (!board) return;
      setActiveId(board[0]);
      setFocusRequest({ id, at: Date.now() });
    });

    return () => {
      offStatus();
      offFocus();
    };
  }, [setActiveId]);

  // Onglets à signaler : tableaux fermés qui contiennent une case qui a fini.
  const boardsWithNews = new Set(
    boards
      .filter((b) => b.id !== activeId && content[b.id]?.nodes.some((n) => unseen.has(n.id)))
      .map((b) => b.id),
  );

  return { boardsWithNews, focusRequest };
}
