import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBullhorn } from "@fortawesome/free-solid-svg-icons";
import axios from 'axios';
import './Announcement.css';

function Announcement() {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const fetchAnnouncement = async () => {
      try {
        const response = await axios.get('https://minepal.net/announcement.txt');
        setAnnouncement(response.data);
      } catch (error) {
        console.error('Failed to fetch announcement:', error);
      }
    };

    fetchAnnouncement();
  }, []);

  if (!announcement) return null;

  return (
    <div className="announcement-bar">
      <FontAwesomeIcon icon={faBullhorn} className="announcement-icon" />
      <span className="announcement-text">{announcement}</span>
    </div>
  );
}

export default Announcement; 