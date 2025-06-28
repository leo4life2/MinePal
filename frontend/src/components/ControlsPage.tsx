import Settings from './Settings/Settings';
import Actions from './Actions/Actions';
import ErrorDisplay from './ErrorDisplay';
import Profiles from './Profiles';
import Footer from './Footer/Footer';
import settingNotes from '../utils/settingsNotes';
import Announcement from './Announcement';

const ControlsPage = () => {
  return (
    <>
      <Announcement />
      <label htmlFor="profiles" className="input-label">
        Choose Your Pals
        {settingNotes.pal_message && <span className="setting-note"> ({settingNotes.pal_message})</span>}
      </label>
      <Profiles />
      <Settings />
      <Actions />
      <ErrorDisplay />
      <Footer />
    </>
  );
};

export default ControlsPage; 