import { useState, useEffect } from 'react';
import { Radio } from "react-feather";
import './Announcement.css';
import { useErrorReport } from '../contexts/ErrorReportContext/ErrorReportContext';
import { getAnnouncements } from '../utils/api';

function Announcement() {
  const [announcement, setAnnouncement] = useState('');
  const { declareError } = useErrorReport();

  useEffect(() => {
    const fetchAnnouncement = async () => {
      try {
        setAnnouncement(await getAnnouncements());
      } catch (error) {
        declareError("Announcement", error);
      }
    };

    fetchAnnouncement();
  }, [declareError]);

  if (!announcement) return null;

  return (
    <div className="announcement-bar">
      <Radio className="announcement-icon" size={20} />
      <span className="announcement-text">{announcement}</span>
    </div>
  );
}

export default Announcement; 
