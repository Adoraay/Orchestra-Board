import { useState } from 'react';
import { CheckCircle2, ImagePlus, XCircle } from 'lucide-react';
import { useSettings } from '../context/SettingsContext.jsx';
import { decorateAgent } from '../agents.js';
import AgentLogo from './AgentLogo.jsx';

const DEFAULT_COLOR = '#8b93a7'; // couleur de secours d'un agent (exception autorisée)

const newAgentId = () => 'custom-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);

// Formulaire « Ajouter un agent » : nom, commande (avec test), logo, couleur de secours.
export default function AgentForm({ onSave, onCancel }) {
  const { addCustomLogo } = useSettings();
  const [id] = useState(newAgentId);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [logo, setLogo] = useState(null); // { file, dataUrl }
  const [logoError, setLogoError] = useState(null);
  const [test, setTest] = useState(null); // { ok, message } | 'pending'

  const valid = name.trim() && command.trim() && !/[\r\n]/.test(command);
  const preview = decorateAgent({ id, name: name || '?', color, logo: logo?.file }, logo ? { [logo.file]: logo.dataUrl } : {});

  const pickLogo = async () => {
    const result = await window.agents.pickLogo(id);
    if (!result) return;
    if (result.error) return setLogoError(result.error);
    setLogoError(null);
    setLogo(result);
  };

  const runTest = async () => {
    setTest('pending');
    setTest(await window.agents.testCommand(command));
  };

  const cancel = () => {
    if (logo) window.agents.deleteLogo(logo.file); // logo copié pour rien
    onCancel();
  };

  const save = () => {
    if (logo) addCustomLogo(logo.file, logo.dataUrl);
    onSave({ id, name: name.trim(), command: command.trim(), color, logo: logo?.file ?? null, builtin: false, hidden: false });
  };

  return (
    <form className="settings-form" onSubmit={(e) => { e.preventDefault(); if (valid) save(); }}>
      <h2 className="form-title">Ajouter un agent</h2>

      <label className="field">
        <span className="field-label">Nom</span>
        <input className="text-input" value={name} maxLength={40} autoFocus placeholder="Aider" onChange={(e) => setName(e.target.value)} />
      </label>

      <div className="field">
        <span className="field-label">Commande à lancer</span>
        <div className="field-row">
          <input
            className="text-input mono"
            value={command}
            maxLength={200}
            placeholder="aider"
            onChange={(e) => {
              setCommand(e.target.value);
              setTest(null);
            }}
          />
          <button type="button" className="text-button" disabled={!command.trim() || test === 'pending'} onClick={runTest}>
            Tester
          </button>
        </div>
        {test && test !== 'pending' && (
          <span className={`test-result ${test.ok ? 'ok' : 'error'}`}>
            {test.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {test.message}
          </span>
        )}
      </div>

      <div className="field">
        <span className="field-label">Logo et couleur de secours</span>
        <div className="field-row">
          <span className="logo-preview"><AgentLogo agent={preview} size={26} /></span>
          <button type="button" className="text-button" onClick={pickLogo}>
            <ImagePlus size={15} />
            {logo ? 'Changer le logo' : 'Choisir un logo'}
          </button>
          <input type="color" value={color} title="Couleur affichée sans logo" onChange={(e) => setColor(e.target.value)} />
        </div>
        {logoError && <span className="test-result error"><XCircle size={14} />{logoError}</span>}
      </div>

      <div className="form-actions">
        <button type="button" className="text-button" onClick={cancel}>Annuler</button>
        <button type="submit" className="text-button primary" disabled={!valid}>Ajouter</button>
      </div>
    </form>
  );
}
