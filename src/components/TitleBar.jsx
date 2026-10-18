import logo from '../assets/orchestra-mark.svg';

// Barre tout en haut : logo (sans fond) et nom de l'app, centrés.
export default function TitleBar() {
  return (
    <div className="titlebar">
      <img className="titlebar-logo" src={logo} alt="" width={24} height={24} draggable={false} />
      <span className="titlebar-name">Orchestra</span>
    </div>
  );
}
