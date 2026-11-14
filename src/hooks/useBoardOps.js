import { useCallback, useMemo } from 'react';
import { addEdge, useReactFlow } from '@xyflow/react';
import { useSettings } from '../context/SettingsContext.jsx';
import { DEFAULT_LINK } from '../lib/links.js';
import { edgeId, linkRule, numberedName } from '../lib/boardOps.js';
import useT from './useT.js';

export const NODE_SIZE = { width: 640, height: 400 };
export const NOTE_SIZE = { width: 270, height: 180 }; // plus large que haut : les lignes écrites par un agent restent lisibles

// Opérations d'un tableau (cases, liens, rôles), utilisées par l'interface et par le chef d'orchestre :
// une seule logique, la map se met à jour de la même façon d'où que vienne la demande.
// Chaque création renvoie l'id de l'élément créé (null si impossible).
export default function useBoardOps({ setNodes, setEdges }) {
  const { getNodes, deleteElements } = useReactFlow();
  const { settings, agentById } = useSettings();
  const t = useT();
  const linkMode = settings.general.linkMode;
  const models = settings.models;

  // Nouvelle case terminal centrée sur « center » (coordonnées de la map) ; data complète celle par défaut.
  const addTerminal = useCallback(
    ({ agentId, cwd, center, data = {} }) => {
      const id = crypto.randomUUID();
      setNodes((nds) =>
        nds.concat({
          id,
          type: 'terminal',
          position: { x: center.x - NODE_SIZE.width / 2, y: center.y - NODE_SIZE.height / 2 },
          dragHandle: '.drag-handle',
          style: { ...NODE_SIZE },
          data: { agentId, cwd, label: numberedName(agentById(agentId).name, nds), ...(models[agentId] && { model: models[agentId] }), ...data },
        }),
      );
      return id;
    },
    [setNodes, agentById, models],
  );

  // Post-it ou texte posé en « point » (coordonnées de la map), seul choisi ; autoEdit = saisie ouverte.
  const addAnnotation = useCallback(
    ({ type, point, text = '', autoEdit = true }) => {
      const id = crypto.randomUUID();
      const note = type === 'note';
      setNodes((nds) =>
        nds
          .map((n) => (n.selected ? { ...n, selected: false } : n))
          .concat({
            id,
            type,
            position: note ? { x: point.x - NOTE_SIZE.width / 2, y: point.y - NOTE_SIZE.height / 2 } : { x: point.x, y: point.y - 14 },
            style: note ? { ...NOTE_SIZE } : undefined,
            selected: true,
            data: { text, ...(autoEdit && { autoEdit: true }), ...(note && { label: numberedName(t('note.defaultName'), nds) }) },
          }),
      );
      return id;
    },
    [setNodes, t],
  );

  // Lien entre deux cases selon linkRule (Note, Terminal ou type par défaut). Un post-it relié reçoit un nom.
  const addLink = useCallback(
    (fromId, toId) => {
      const nodes = getNodes();
      const rule = linkRule(nodes.find((n) => n.id === fromId), nodes.find((n) => n.id === toId), linkMode);
      if (!rule) return null;
      if (rule.mode === 'note' && !nodes.find((n) => n.id === rule.target).data.label) {
        setNodes((nds) => nds.map((n) => (n.id === rule.target ? { ...n, data: { ...n.data, label: numberedName(t('note.defaultName'), nds) } } : n)));
      }
      const id = edgeId(rule.source, rule.target);
      setEdges((eds) => addEdge({ id, source: rule.source, target: rule.target, type: 'floating', data: { ...DEFAULT_LINK, mode: rule.mode } }, eds));
      return id;
    },
    [getNodes, setNodes, setEdges, linkMode, t],
  );

  const updateLink = useCallback(
    (id, patch) => setEdges((eds) => eds.map((e) => (e.id === id ? { ...e, data: { ...DEFAULT_LINK, ...e.data, ...patch } } : e))),
    [setEdges],
  );
  const swapLink = useCallback(
    (id) => setEdges((eds) => eds.map((e) => (e.id === id ? { ...e, source: e.target, target: e.source } : e))),
    [setEdges],
  );
  const removeLink = useCallback((id) => setEdges((eds) => eds.filter((e) => e.id !== id)), [setEdges]);

  // Cases et liens retirés ; les agents des cases terminal sont arrêtés. deleteElements retire aussi les liens attachés.
  const removeElements = useCallback(
    ({ nodeIds = [], edgeIds = [] }) => {
      const chosen = new Set(nodeIds);
      for (const node of getNodes()) if (chosen.has(node.id) && node.type === 'terminal') window.pty.kill(node.id);
      deleteElements({ nodes: nodeIds.map((id) => ({ id })), edges: edgeIds.map((id) => ({ id })) });
    },
    [getNodes, deleteElements],
  );

  // Rôle enregistré côté Node (pour le prochain SessionStart) puis gardé dans la case. Renvoie l'état du rôle.
  const setRole = useCallback(
    async (id, role) => {
      const result = await window.roles.set(id, role);
      if (result.error) throw new Error(result.error);
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, role: role || undefined } } : n)));
      return result.value;
    },
    [setNodes],
  );

  return useMemo(
    () => ({ addTerminal, addAnnotation, addLink, updateLink, swapLink, removeLink, removeElements, setRole }),
    [addTerminal, addAnnotation, addLink, updateLink, swapLink, removeLink, removeElements, setRole],
  );
}
