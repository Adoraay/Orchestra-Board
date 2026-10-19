import { SHORTCUT_GROUPS } from '../lib/shortcuts.js';

// Paramètres › Raccourcis : la liste, en lecture seule.
export default function ShortcutsTab() {
  return (
    <div className="settings-form">
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} className="field">
          <span className="field-label">{group.title}</span>
          <ul className="shortcut-list">
            {group.items.map((item) => (
              <li key={item.label} className="shortcut-row">
                <span>{item.label}</span>
                <span className="shortcut-keys">
                  {item.keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
