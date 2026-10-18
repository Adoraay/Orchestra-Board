import logo from '../../design/orchestra-logo.svg';

// Barre tout en haut : logo et nom de l'app.
export default function TitleBar() {
  return (
    <div className="titlebar">
      <img className="titlebar-logo" src={logo} alt="" width={24} height={24} draggable={false} />
      <span className="titlebar-name">Orchestra</span>
    </div>
  );
}
