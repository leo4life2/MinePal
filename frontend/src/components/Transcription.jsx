function Transcription({ transcription }) {
  return (
    <div className="transcription-box">
      <label htmlFor="transcription">Transcription:</label>
      <span>{String(transcription)}</span>
    </div>
  );
}

export default Transcription;