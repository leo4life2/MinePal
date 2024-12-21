import { useState, useEffect } from 'react';
import { Radio } from "react-feather";
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
      <Radio className="announcement-icon" size={20} />
      <span className="announcement-text">{announcement}</span>
    </div>
  );
}

export default Announcement; 