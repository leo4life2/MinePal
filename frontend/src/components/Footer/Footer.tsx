import { AccountModal } from '../Modal';
import GuidesLink from '../GuidesLink';
import './Footer.css';

function Footer() {
  return (
    <div className="footer">
      <AccountModal />
      <GuidesLink />
    </div>
  );
}

export default Footer; 