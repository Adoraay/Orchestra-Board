import { ViewportPortal } from '@xyflow/react';
import GroupFrame from './GroupFrame.jsx';

export default function GroupsLayer({ groups, nodes, onMove, onRename, onUngroup, onSelect, enabled }) {
  return <ViewportPortal>{groups.map((group) => <GroupFrame key={group.id} group={group} nodes={nodes.filter((node) => group.members.includes(node.id))} onMove={onMove} onRename={onRename} onUngroup={onUngroup} onSelect={onSelect} enabled={enabled} />)}</ViewportPortal>;
}
