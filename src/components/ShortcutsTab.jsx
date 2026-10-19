import { SHORTCUT_GROUPS, TRANSLATED_KEYS } from '../lib/shortcuts.js';
import useT from '../hooks/useT.js';

// Paramètres › Raccourcis : la liste, en lecture seule.
export default function ShortcutsTab() {
  const t = useT();
  return (
    <div className="settings-form">
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} className="field">
          <span className="field-label">{t(group.title)}</span>
          <ul className="shortcut-list">
            {group.items.map((item) => (
              <li key={item.label} className="shortcut-row">
                <span>{t(item.label)}</span>
                <span className="shortcut-keys">
                  {item.keys.map((k) => (
                    <kbd key={k}>{TRANSLATED_KEYS.includes(k) ? t(`key.${k}`) : k}</kbd>
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
