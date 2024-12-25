function Transcription({ transcription }: { transcription: string }) {
  return (
    <div className="transcription-box">
      <label htmlFor="transcription">Transcription:</label>
      <span>{transcription}</span>
    </div>
  );
}

export default Transcription;
