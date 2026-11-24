import { useEffect, useRef, useState } from "react";
import "./App.css";

const BARS = Array.from({ length: 40 }, (_, i) => {
  const wave = Math.sin(i * 0.55) + Math.sin(i * 1.87) * 0.7;
  return {
    height: Math.round(14 + Math.abs(wave) * 17),
    delay: `${(((i * 37) % 100) / 100) * 0.9}s`,
  };
});

const FEATURES = [
  {
    id: "01",
    title: "Natural Conversations",
    body: "Urdu, English and mixed-language support with human-sounding turn taking.",
  },
  {
    id: "02",
    title: "Smart Order Taking",
    body: "Menu-aware ordering, upsells and a clear spoken confirmation before checkout.",
  },
  {
    id: "03",
    title: "Order Management",
    body: "Every call writes a structured order straight into your database.",
  },
];

function MicIcon({ off }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      <path d="M8.5 21h7" />
      {off && <path d="M4 20 20 4" strokeWidth="1.9" />}
    </svg>
  );
}

function SpeakerIcon({ off }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4Z" />
      <path d="M15.8 9a4.2 4.2 0 0 1 0 6" />
      <path d="M18.3 6.5a7.6 7.6 0 0 1 0 11" />
      {off && <path d="M4 20 20 4" strokeWidth="1.9" />}
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.6 3.2c.5-.1 1 .2 1.2.6l1.6 3.4c.2.4.1.9-.2 1.2L7.8 9.8a12.6 12.6 0 0 0 6.4 6.4l1.4-1.4c.3-.3.8-.4 1.2-.2l3.4 1.6c.4.2.7.7.6 1.2l-.4 1.8c-.1.5-.6.9-1.1.9C11.3 20.1 3.9 12.7 3.8 4.7c0-.5.4-1 .9-1.1l1.9-.4Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export default function App() {
  const [callActive, setCallActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversation, setConversation] = useState([]);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const synthRef = useRef(window.speechSynthesis);

  // Voice detection
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Call states
  const callActiveRef = useRef(false);
  const processingRef = useRef(false);
  const speakingRef = useRef(false);
  const micEnabledRef = useRef(true);

  // Voice timing
  const voiceStartRef = useRef(null);
  const silenceStartRef = useRef(null);

  useEffect(() => {
    if (!callActive) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [callActive]);




async function toggleCall() {
  if (callActiveRef.current) {
    // End call immediately
    callActiveRef.current = false;
    processingRef.current = false;
    speakingRef.current = false;
    micEnabledRef.current = false;

    stopVoiceDetection();
    synthRef.current.cancel();

    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());

    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];

    setCallActive(false);
    setElapsed(0);
    setMicOn(false);
    setTranscript("");
    setAiResponse("");
    setConversation([]);
    setIsProcessing(false);

  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      callActiveRef.current = true;
      micEnabledRef.current = true;

      setCallActive(true);
      setElapsed(0);
      setMicOn(true);
      setConversation([]);
      setTranscript("");
      setAiResponse("Listening...");

      startVoiceDetection(stream);

    } catch (error) {
      console.error("Microphone error:", error);
      callActiveRef.current = false;
      setCallActive(false);
      setAiResponse("Please allow microphone access to start the call.");
    }
  }
}


function toggleMic() {
  const next = !micEnabledRef.current;

  micEnabledRef.current = next;
  setMicOn(next);

  if (!next) {
    // Stop any recording in progress.
    if (recorderRef.current?.state === "recording") {
      stopRecording();
    }
  } else {
    setAiResponse("Listening...");
  }
}



async function transcribeAudio(audioBlob) {
  if (!callActiveRef.current) return;

  processingRef.current = true;
  setIsProcessing(true);
  setAiResponse("Transcribing your voice...");

  try {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");

    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error);

    if (!callActiveRef.current) return;

    if (data.text?.trim()) {
      setTranscript(data.text);
      await sendMessage(data.text);
    } else {
      setAiResponse("I couldn't hear that clearly. Please try again.");
    }
  } catch (error) {
    console.error("Transcription error:", error);
    if (callActiveRef.current) {
      setAiResponse("Transcription failed. Please try again.");
    }
  } finally {
    processingRef.current = false;
    setIsProcessing(false);
  }
}



async function sendMessage(message) {
  try {
    const history = conversation;

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error);
    if (!callActiveRef.current) return;

    const reply = data.reply;

    setConversation([
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: reply },
    ]);

    setAiResponse(reply);

    // Allow voice detection to listen during AI speech.
    processingRef.current = false;
    setIsProcessing(false);

    if (!reply || !speakerOn) return;

    const synth = synthRef.current;
    synth.cancel();

    const speak = () => {
      if (!callActiveRef.current) return;

      const voices = synth.getVoices();

      const voice =
        voices.find(v => v.lang.toLowerCase() === "ur-pk") ||
        voices.find(v => v.lang.toLowerCase().startsWith("ur")) ||
        voices.find(v => v.lang.toLowerCase().startsWith("hi")) ||
        voices.find(v => v.lang.toLowerCase().startsWith("en"));

      const utterance = new SpeechSynthesisUtterance(reply);

      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }

      utterance.rate = 0.95;
      utterance.volume = 1;

      speakingRef.current = true;

      utterance.onend = () => {
        speakingRef.current = false;

        if (callActiveRef.current) {
          setAiResponse("Listening...");
        }
      };

      utterance.onerror = (event) => {
        speakingRef.current = false;
        console.error("Voice error:", event.error);
      };

      synth.speak(utterance);
    };

    if (synth.getVoices().length === 0) {
      synth.onvoiceschanged = speak;
    } else {
      speak();
    }
  } catch (error) {
    speakingRef.current = false;
    processingRef.current = false;
    console.error("Chat error:", error);
    throw error;
  }
}



function startRecording() {
  if (!streamRef.current || !callActiveRef.current) return;
  if (!micEnabledRef.current || processingRef.current) return;
  if (recorderRef.current?.state === "recording") return;

  const recorder = new MediaRecorder(streamRef.current);
  chunksRef.current = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunksRef.current.push(event.data);
    }
  };

  recorder.onstop = () => {
    const audio = new Blob(chunksRef.current, {
      type: recorder.mimeType,
    });

    if (
      audio.size > 0 &&
      callActiveRef.current &&
      micEnabledRef.current
    ) {
      transcribeAudio(audio);
    }
  };

  recorderRef.current = recorder;
  recorder.start();
}

function stopRecording() {
  if (recorderRef.current?.state === "recording") {
    recorderRef.current.stop();
  }
}



  const time = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(
    elapsed % 60
  ).padStart(2, "0")}`;

  return (
    <main className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#top">
            <span className="brand-mark">R</span>
            <span className="brand-text">
              <strong>Restaurant AI</strong>
              <small>Voice assistant</small>
            </span>
          </a>
          <div className="status">
            <span className="status-dot" />
            AI system online
          </div>
        </div>
      </header>

      <section className="shell" id="top">
        <div className="pitch">
          <span className="eyebrow">Voice interaction prototype</span>
          <h1>
            Your restaurant&rsquo;s <em>AI receptionist.</em>
          </h1>
          <p className="lede">
            An intelligent assistant that answers the phone, understands your
            customers and takes orders naturally — in Urdu, English, or both.
          </p>

          <ul className="features">
            {FEATURES.map((f) => (
              <li key={f.id}>
                <span className="num">{f.id}</span>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="pitch-foot">
            <span className="chip">Urdu</span>
            <span className="chip">English</span>
            <span className="chip">Mixed</span>
          </div>
        </div>

        <aside className="call-panel">
          <div className="panel-head">
            <span>Call simulator</span>
            <span className={`pill ${callActive ? "is-live" : ""}`}>
              <span className="pill-dot" />
              {callActive ? "Call active" : "Ready"}
            </span>
          </div>

          <div className="avatar-wrap">
            <div className={`avatar ${callActive ? "is-live" : ""}`}>
              <span>AI</span>
            </div>
          </div>

          <h2>Restaurant Assistant</h2>
          <p className="panel-sub">
            {callActive
              ? "Listening to your customer…"
              : "Ready to assist your customers"}
          </p>

          <div className="timer">
            <span className={`timer-value ${callActive ? "is-live" : ""}`}>
              {time}
            </span>
            <span className="timer-label">
              {callActive ? "Session time" : "No active session"}
            </span>
          </div>
          <div className="transcript-box">
            {transcript && <p className="user-text">{transcript}</p>}

            {aiResponse && <p className="ai-text">{aiResponse}</p>}

            {!transcript && !aiResponse && (
              <p className="placeholder-text">
                {callActive ? "Speak to the microphone..." : "Call to start speaking"}
              </p>
            )}
          </div>

          <div className={`waveform ${callActive ? "is-live" : ""}`} aria-hidden="true">
            {BARS.map((bar, i) => (
              <span
                key={i}
                style={{ "--h": `${bar.height}px`, "--d": bar.delay }}
              />
            ))}
          </div>

          <div className="controls">
            <button
              type="button"
              className={`ctrl ${!micOn ? "is-off" : ""}`}
              onClick={toggleMic}
              disabled={!callActive}
              aria-pressed={!micOn}
              aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
            >
              <MicIcon off={!micOn} />
              <small>{micOn ? "Mute" : "Unmute"}</small>
            </button>

            <button
              type="button"
              className={`call-btn ${callActive ? "is-end" : ""}`}
              onClick={toggleCall}
              aria-label={callActive ? "End call" : "Start demo call"}
            >
              {callActive ? <CloseIcon /> : <PhoneIcon />}
            </button>

            <button
              type="button"
              className={`ctrl ${!speakerOn ? "is-off" : ""}`}
              onClick={() => setSpeakerOn((v) => !v)}
              disabled={!callActive}
              aria-pressed={!speakerOn}
              aria-label={speakerOn ? "Mute speaker" : "Unmute speaker"}
            >
              <SpeakerIcon off={!speakerOn} />
              <small>{speakerOn ? "Mute" : "Unmute"}</small>
            </button>
          </div>

          <p className="hint">
            {callActive
              ? "End the session with the red button."
              : "Press the call button to start a demo session."}
          </p>
        </aside>
      </section>

      <footer>AI Restaurant Ordering System · FYP Prototype</footer>
    </main>
  );
}