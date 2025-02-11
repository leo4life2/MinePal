import { useState, useEffect } from 'react';
import { Radio } from "react-feather";
import './Announcement.css';
import { useErrorReport } from '../contexts/ErrorReportContext/ErrorReportContext';
import { getAnnouncements } from '../utils/api';

function parseMarkdownLinks(text: string) {
  const parts = [];
  let lastIndex = 0;
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add the link
    parts.push(
      <a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer">
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

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
      <span className="announcement-text">{parseMarkdownLinks(announcement)}</span>
    </div>
  );
}

export default Announcement; 
