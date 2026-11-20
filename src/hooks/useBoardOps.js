import { useCallback, useMemo } from 'react';
import { addEdge, useReactFlow } from '@xyflow/react';
import { useSettings } from '../context/SettingsContext.jsx';
import { DEFAULT_LINK } from '../lib/links.js';
import { edgeId, linkRule, numberedName } from '../lib/boardOps.js';
import useT from './useT.js';

export const NODE_SIZE = { width: 640, height: 400 };
export const NOTE_SIZE = { width: 270, height: 180 }; // plus large que haut : les lignes écrites par un agent restent lisibles
export const VISUAL_TEST_SIZE = { width: 500, height: 480 };
// Taille et poignée de déplacement des cases posées par un outil de la barre (post-it, texte, test visuel).
const ANNOTATIONS = { note: { size: NOTE_SIZE }, text: {}, visualTest: { size: VISUAL_TEST_SIZE, dragHandle: '.visual-test-header' } };

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
  // id : donné par Node pour une case du chef d'orchestre (il doit la connaître avant son lancement).
  const addTerminal = useCallback(
    ({ id = crypto.randomUUID(), agentId, cwd, center, data = {} }) => {
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

  // Post-it, texte ou test visuel posé en « point » (coordonnées de la map) ; autoEdit = saisie ouverte,
  // select = seul choisi.
  const addAnnotation = useCallback(
    ({ type, point, text = '', label, autoEdit = true, select = true }) => {
      const id = crypto.randomUUID();
      const { size, dragHandle } = ANNOTATIONS[type];
      const note = type === 'note';
      // Étape d'exemple d'un test visuel : vérifier qu'un titre s'affiche marche sur presque toutes les pages.
      const data = type === 'visualTest'
        ? { steps: [{ id: crypto.randomUUID(), action: 'visible', target: 'role:heading', value: '' }] }
        : { text, ...(autoEdit && { autoEdit: true }) };
      setNodes((nds) =>
        nds
          .map((n) => (select && n.selected ? { ...n, selected: false } : n))
          .concat({
            id,
            type,
            position: size ? { x: point.x - size.width / 2, y: point.y - size.height / 2 } : { x: point.x, y: point.y - 14 },
            style: size ? { ...size } : undefined,
            ...(dragHandle && { dragHandle }),
            selected: select,
            data: { ...data, ...(note && { label: label || numberedName(t('note.defaultName'), nds) }) },
          }),
      );
      return id;
    },
    [setNodes, t],
  );

  // Lien entre deux cases selon linkRule (Navigateur, Test visuel, Note, Terminal ou type par défaut). Un post-it
  // relié reçoit un nom. data : réglages du lien (chef d'orchestre) ; data.mode remplace le type par défaut.
  const hasHooks = useCallback((agentId) => Boolean(agentById(agentId).hooks), [agentById]);
  const addLink = useCallback(
    (fromId, toId, data = {}) => {
      const nodes = getNodes();
      const rule = linkRule(nodes.find((n) => n.id === fromId), nodes.find((n) => n.id === toId), data.mode ?? linkMode, hasHooks);
      if (!rule) return null;
      if (rule.mode === 'note' && !nodes.find((n) => n.id === rule.target).data.label) {
        setNodes((nds) => nds.map((n) => (n.id === rule.target ? { ...n, data: { ...n.data, label: numberedName(t('note.defaultName'), nds) } } : n)));
      }
      const id = edgeId(rule.source, rule.target);
      setEdges((eds) => addEdge({ id, source: rule.source, target: rule.target, type: 'floating', data: { ...DEFAULT_LINK, ...data, mode: rule.mode, ...rule.extra } }, eds));
      return id;
    },
    [getNodes, setNodes, setEdges, linkMode, hasHooks, t],
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

  // Cases et liens retirés ; les agents des cases terminal sont arrêtés, les tests visuels en cours annulés.
  // deleteElements retire aussi les liens attachés.
  const removeElements = useCallback(
    ({ nodeIds = [], edgeIds = [] }) => {
      const chosen = new Set(nodeIds);
      for (const node of getNodes()) {
        if (!chosen.has(node.id)) continue;
        if (node.type === 'terminal') window.pty.kill(node.id);
        if (node.type === 'visualTest') window.visualTests.cancel(node.id);
      }
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
