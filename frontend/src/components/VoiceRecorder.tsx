import React, { useState } from 'react';

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onRecordingComplete }) => {
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });
      onRecordingComplete(audioBlob);
      stream.getTracks().forEach((track) => track.stop());
    };

    setMediaRecorder(recorder);
    recorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setRecording(false);
    }
  };

  return (
    <button onClick={recording ? stopRecording : startRecording}>
      {recording ? 'Stop Recording' : 'Record Voice'}
    </button>
  );
};

export default VoiceRecorder;