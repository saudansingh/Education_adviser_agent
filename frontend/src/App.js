import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Phone, 
  PhoneOff, 
  Volume2, 
  MessageSquare, 
  Settings, 
  User, 
  GraduationCap,
  Users,
  Activity,
  ShieldAlert,
  Info,
  X,
  Layers,
  Sparkles,
  Send
} from 'lucide-react';
import { RoomEvent, Room, Track } from 'livekit-client';
import './App.css';

// Enriched with dynamic color specifications and blueprint data profiles for the pop-up modal
const agents = [
  {
    id: 'ankur',
    name: 'Ankur',
    title: 'Education Advisor',
    description: 'Specialized in learning strategies and career guidance',
    icon: GraduationCap,
    color: 'from-cyan-500 to-blue-500',
    glowColor: 'rgba(6, 182, 212, 0.25)',
    status: 'available',
    techStack: 'livekit',
    stackDetails: {
      framework: 'LiveKit Agents SDK Pipeline',
      stt: 'Deepgram Nova-2 Engine',
      llm: 'OpenAI GPT-4o-Mini Context Node',
      tts: 'Deepgram Aura Voice Generation',
      vad: 'Silero Intelligent VAD Core'
    }
  },
  {
    id: 'insurance_advisor',
    name: 'Insurance Advisor',
    title: 'Risk & Insurance Expert',
    description: 'Specialized in ultra-concise policy advice and clear guidance',
    icon: ShieldAlert,
    color: 'from-emerald-500 to-teal-500',
    glowColor: 'rgba(16, 185, 129, 0.25)',
    status: 'available',
    techStack: 'raw-websocket',
    stackDetails: {
      framework: 'FastAPI Ultra-Low Latency Asynchronous Core',
      stt: 'Native Browser Web Audio Stream Capture (PCM 16kHz)',
      llm: 'Google Gemini 2.5 Flash Multimodal Instance',
      tts: 'Gemini Live Native Synthesis Data Nodes',
      vad: 'Stream Processing Queue Handler'
    }
  }
];

function App() {
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [token, setToken] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [audioTrack, setAudioTrack] = useState(null);
  const [micPermission, setMicPermission] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [jwtToken, setJwtToken] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTokenLoading, setIsTokenLoading] = useState(false);
  
  // 🛠️ UI Enhancement State: Tech Stack Modal Open/Close Tracker
  const [isTechStackOpen, setIsTechStackOpen] = useState(false);
  
  // Framework Instances Refs
  const roomRef = useRef(null);
  const audioElementRef = useRef(null);
  
  // Custom Web Audio API Context / WebSocket Tracker references for Agent 2
  const rawSocketRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const nextStartTimeRef = useRef(0);
  const isMutedRef = useRef(false); // Helps background processor lookups stay synchronized

  // Target Endpoint configuration references
  const livekitUrl = process.env.REACT_APP_LIVEKIT_URL || 'wss://voice-agent-tr1nwg9p.osingapore1b.production.livekit.cloud';
  const gcpInsuranceWsUrl = process.env.REACT_APP_GCP_INSURANCE_WS_URL || 'wss://your-gcp-app-url.a.run.app/insurance-agent';

  useEffect(() => {
    const storedToken = localStorage.getItem('jwtToken');
    const storedEmail = localStorage.getItem('userEmail');
    if (storedToken && storedEmail) {
      setJwtToken(storedToken);
      setUserEmail(storedEmail);
      setIsLoggedIn(true);
      loadChatHistory(storedToken);
    } else {
      localStorage.removeItem('jwtToken');
      localStorage.removeItem('userEmail');
      setIsLoggedIn(false);
    }
  }, []);

  // Monitor switching between sidebar rows to clear active sessions safely
  useEffect(() => {
    cleanupAllConnections();
    setMessages([]);
    setConnectionStatus('disconnected');
    setIsConnected(false);

    // Only fire LiveKit token generation routines if it uses LiveKit
    if (selectedAgent && selectedAgent.techStack === 'livekit') {
      generateToken();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent]);

  useEffect(() => {
    return () => {
      cleanupAllConnections();
    };
  }, []);

  // Shared Cleanup utility to terminate resources gracefully
  const cleanupAllConnections = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    if (rawSocketRef.current) {
      rawSocketRef.current.close();
      rawSocketRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      audioContextRef.current = null;
    }
    nextStartTimeRef.current = 0;
    setAudioTrack(null);
    setIsSpeaking(false);
  };

  const loadChatHistory = async (token) => {
    try {
      const API_URL = process.env.REACT_APP_API_URL || 'https://ankur-280807492599.asia-south2.run.app';
      const response = await fetch(`${API_URL}/chat-history`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setChatHistory(data.sessions || []);
      } else if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('jwtToken');
        localStorage.removeItem('userEmail');
        setJwtToken('');
        setUserEmail('');
        setIsLoggedIn(false);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const API_URL = process.env.REACT_APP_API_URL || 'https://ankur-280807492599.asia-south2.run.app';
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setJwtToken(data.token);
        localStorage.setItem('jwtToken', data.token);
        localStorage.setItem('userEmail', data.email);
        setIsLoggedIn(true);
        loadChatHistory(data.token);
      } else {
        alert('Login failed. Please try again.');
      }
    } catch (error) {
      console.error('Error logging in:', error);
      alert('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userEmail');
    setJwtToken('');
    setUserEmail('');
    setIsLoggedIn(false);
    setChatHistory([]);
    setSelectedAgent(null);
  };

  const generateToken = async () => {
    if (!jwtToken) return;
    setIsTokenLoading(true);
    try {
      const API_URL = process.env.REACT_APP_API_URL || 'https://ankur-280807492599.asia-south2.run.app';
      const response = await fetch(`${API_URL}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ identity: `user-${userEmail}` }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setToken(data.token);
        // Delay connection to guarantee the token propagates cleanly
        setTimeout(() => handleConnect(data.token), 500);
      } else if (response.status === 401 || response.status === 403 || response.status === 405) {
        localStorage.removeItem('jwtToken');
        localStorage.removeItem('userEmail');
        setJwtToken('');
        setUserEmail('');
        setIsLoggedIn(false);
        alert('Session expired. Please login again.');
      }
    } catch (error) {
      console.error('Error generating token:', error);
    } finally {
      setIsTokenLoading(false);
    }
  };

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicPermission(true);
      return true;
    } catch (error) {
      console.error('Microphone permission denied:', error);
      setMicPermission(false);
      return false;
    }
  };

  // Main Orchestrator for initiating audio tracking setups
  const handleConnect = async (passedToken) => {
    const activeToken = passedToken || token;
    if (!selectedAgent) return;

    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      alert('Please allow microphone access to use voice features');
      return;
    }

    // BRANCH 1: Route connection to LiveKit Engine if requested
    if (selectedAgent.techStack === 'livekit') {
      if (!activeToken) return;
      await connectToLiveKit(activeToken);
    } 
    // BRANCH 2: Bypasses LiveKit, routes directly to Custom GCP Engine
    else if (selectedAgent.techStack === 'raw-websocket') {
      await connectToRawWebSocketAgent();
    }
  };

  const connectToLiveKit = async (targetToken) => {
    try {
      setConnectionStatus('connecting');
      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
      });

      newRoom.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const audioElement = audioElementRef.current;
          if (audioElement) {
            track.attach(audioElement);
            setAudioTrack(track);
            setIsSpeaking(true);
          }
        }
      });

      newRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track === audioTrack) {
          track.detach();
          setAudioTrack(null);
          setIsSpeaking(false);
        }
      });

      newRoom.on(RoomEvent.Disconnected, () => {
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setAudioTrack(null);
        setIsSpeaking(false);
      });

      newRoom.on(RoomEvent.Connected, () => {
        newRoom.localParticipant.setMicrophoneEnabled(true);
        const recentChatHistory = chatHistory.slice(0, 3).map(session => session.summary).join('\n');
        const metadata = JSON.stringify({ email: userEmail, chatHistory: recentChatHistory });
        newRoom.localParticipant.setMetadata(metadata);
      });

      await newRoom.connect(livekitUrl, targetToken);
      roomRef.current = newRoom;
      setIsConnected(true);
      setConnectionStatus('connected');
      setIsMuted(false);
      isMutedRef.current = false;
    } catch (error) {
      console.error('Failed LiveKit session creation:', error);
      setConnectionStatus('error');
    }
  };

  const connectToRawWebSocketAgent = async () => {
    try {
      setConnectionStatus('connecting');

      // 1. Spinning up Native browser Audio pipeline targeted directly to 16kHz
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      nextStartTimeRef.current = audioCtx.currentTime;

      // Append email as a query param so the backend can lookup/save context history
      const authenticatedWsUrl = `${gcpInsuranceWsUrl}?email=${encodeURIComponent(userEmail)}`;
      
      // 2. Spinning up the customized secure gateway WebSocket
      const ws = new WebSocket(authenticatedWsUrl);
      ws.binaryType = "arraybuffer";
      rawSocketRef.current = ws;

      ws.onopen = async () => {
        setIsConnected(true);
        setConnectionStatus('connected');
        setIsMuted(false);
        isMutedRef.current = false;
        
        // Connect system hardware microphone nodes
        await setupBrowserMicrophonePipeline();
      };

      ws.onmessage = async (event) => {
        if (typeof event.data === 'string') {
          const payload = JSON.parse(event.data);
          
          // Check directly for the 'text' property sent by websocket.send_json({"text": ...})
          if (payload.text) {
            appendStreamingAgentText(payload.text);
          } else if (payload.type === 'interrupt') {
            // Drop playback timeline syncing constraints
            nextStartTimeRef.current = audioCtx.currentTime; 
            setIsSpeaking(false);
          }
        } else {
          // Process Binary Stream Audio Data packets coming back from GCP (24kHz format)
          playRawAudioBufferChunk(event.data);
        }
      };

      ws.onerror = (err) => {
        console.error("GCP WebSocket channel dropped:", err);
        setConnectionStatus('error');
      };

      ws.onclose = () => {
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setIsSpeaking(false);
      };

    } catch (error) {
      console.error('Failed to construct Custom GCP session pipeline:', error);
      setConnectionStatus('error');
    }
  };

  const setupBrowserMicrophonePipeline = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      // Constructing processing node configuration targeting a chunk sizes of 2048 blocks
      const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1);
      
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!rawSocketRef.current || rawSocketRef.current.readyState !== WebSocket.OPEN) return;
        if (isMutedRef.current) return; // Disallow audio pipelines streaming if explicitly muted

        const inputBuffer = e.inputBuffer;
        const float32Data = inputBuffer.getChannelData(0);

        // Map native browser floats down to standard signed 16-bit array format frames
        const int16Buffer = new Int16Array(float32Data.length);
        for (let i = 0; i < float32Data.length; i++) {
          let sample = Math.max(-1, Math.min(1, float32Data[i]));
          int16Buffer[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }

        // Send raw mic buffers directly to GCP instance
        rawSocketRef.current.send(int16Buffer.buffer);
      };
    } catch (err) {
      console.error("Hardware Microphone connection pipeline aborted:", err);
    }
  };

  const playRawAudioBufferChunk = (arrayBuffer) => {
    const audioCtx = audioContextRef.current;
    if (!audioCtx || audioCtx.state === 'closed') return;

    // Map 16-bit binary streams back out to structural floating frames
    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    // Create an audio node buffer matched to Gemini's 24000Hz output rate
    const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);

    const bufferSource = audioCtx.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(audioCtx.destination);

    // Schedule chunks sequentially without gaps
    const startTime = Math.max(nextStartTimeRef.current, audioCtx.currentTime);
    bufferSource.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;

    setIsSpeaking(true);
    bufferSource.onended = () => {
      // Toggle speaking visualizer off when playback stream catches up
      if (audioCtx.currentTime >= nextStartTimeRef.current - 0.05) {
        setIsSpeaking(false);
      }
    };
  };

  const appendStreamingAgentText = (textSegment) => {
    setMessages(prev => {
      if (prev.length > 0 && prev[prev.length - 1].sender === 'agent') {
        const updated = [...prev];
        updated[updated.length - 1].text += textSegment;
        return updated;
      } else {
        return [...prev, {
          id: Date.now(),
          text: textSegment,
          sender: 'agent',
          timestamp: new Date().toLocaleTimeString()
        }];
      }
    });
  };

  const handleDisconnect = async () => {
    if (messages.length > 0) {
      const summary = messages.map(m => `${m.sender}: ${m.text}`).join('\n');
      await saveChatSummary(summary);
    }
    cleanupAllConnections();
    setIsConnected(false);
    setConnectionStatus('disconnected');
    setSelectedAgent(null);
    setMessages([]);
  };

  const saveChatSummary = async (summary) => {
    if (!jwtToken) return;
    try {
      const API_URL = process.env.REACT_APP_API_URL || 'https://ankur-280807492599.asia-south2.run.app';
      const response = await fetch(`${API_URL}/chat-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ summary: summary, messages: messages }),
      });
      if (response.ok) {
        loadChatHistory(jwtToken);
      }
    } catch (error) {
      console.error('Error saving chat summary:', error);
    }
  };

  const toggleMute = () => {
    if (!isConnected || !selectedAgent) return;

    if (selectedAgent.techStack === 'livekit' && roomRef.current) {
      const nextMuteState = !isMuted;
      roomRef.current.localParticipant.setMicrophoneEnabled(!nextMuteState);
      setIsMuted(nextMuteState);
      isMutedRef.current = nextMuteState;
    } else if (selectedAgent.techStack === 'raw-websocket') {
      // Mute the local state reference that blocks streaming microphone cycles
      const nextMuteState = !isMuted;
      setIsMuted(nextMuteState);
      isMutedRef.current = nextMuteState;
    }
  };

  const handleSendMessage = () => {
    if (inputMessage.trim()) {
      const newMessage = {
        id: Date.now(),
        text: inputMessage,
        sender: 'user',
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, newMessage]);
      setInputMessage('');

      // Send via text fallback wrapper channel if WebSocket is connected
      if (selectedAgent.techStack === 'raw-websocket' && rawSocketRef.current?.readyState === WebSocket.OPEN) {
        rawSocketRef.current.send(JSON.stringify({ text: inputMessage }));
      } else {
        // Fallback simulation interface for local UI mock validation
        setTimeout(() => {
          const agentResponse = {
            id: Date.now() + 1,
            text: `Hello! I'm ${selectedAgent?.name}. How can I assist you with your queries?`,
            sender: 'agent',
            timestamp: new Date().toLocaleTimeString()
          };
          setMessages(prev => [...prev, agentResponse]);
          setIsSpeaking(true);
          setTimeout(() => setIsSpeaking(false), 3000);
        }, 1000);
      }
    }
  };

  const handleAgentSelect = (agent) => {
    if (agent.status === 'available') {
      setSelectedAgent(agent);
    }
  };

  // 1. COOLING STYLE DESIGN: Frost/Deep Oceanic Gradient Login Gateway
  if (!isLoggedIn) {
    return (
      <div className="flex h-screen bg-gradient-to-tr from-slate-950 via-indigo-950 to-slate-900 items-center justify-center relative overflow-hidden">
        {/* Soft Decorative Ambient Lighting Backdrops */}
        <div className="absolute w-[500px] h-[500px] bg-cyan-500/10 blur-[120px] -top-32 -left-32 rounded-full pointer-events-none" />
        <div className="absolute w-[500px] h-[500px] bg-indigo-500/10 blur-[120px] -bottom-32 -right-32 rounded-full pointer-events-none" />
        
        <div className="bg-slate-900/60 backdrop-blur-xl p-8 rounded-2xl border border-slate-800/60 shadow-[0_12px_40px_rgba(0,0,0,0.5)] max-w-md w-full mx-4 transition-all duration-300 hover:border-slate-700/60 z-10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-cyan-200 tracking-tight mb-2">Voice Agents</h1>
            <p className="text-slate-400 text-sm">Enter your email to initialize memory matrix</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Email Address</label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-4 py-3.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all"
              />
            </div>
            
            <button
              type="submit"
              disabled={isLoading || !userEmail}
              className="w-full px-4 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium rounded-xl transition-all duration-300 shadow-lg disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed transform active:scale-[0.99]"
            >
              {isLoading ? 'Establishing Gateway...' : 'Initialize Chat Portal'}
            </button>
          </form>
          
          <p className="text-[11px] text-slate-500 text-center mt-6 leading-relaxed">
            Your email will be used to save your chat history for future sessions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/40 text-slate-200 font-sans relative overflow-hidden">
      <audio ref={audioElementRef} autoPlay playsInline />
      
      {/* 2. COOLING STYLE DESIGN: Frosted Translucent Sidebar */}
      <div className="w-80 bg-slate-950/40 backdrop-blur-xl border-r border-slate-900/80 flex flex-col z-10">
        <div className="p-6 border-b border-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-wide">Voice Agents</h1>
              <p className="text-xs text-slate-400">Select an active intelligence</p>
            </div>
          </div>
        </div>

        {/* Dynamic Navigation Row Maps */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {agents.map((agent) => {
            const Icon = agent.icon;
            const isSelected = selectedAgent?.id === agent.id;
            return (
              <div
                key={agent.id}
                onClick={() => handleAgentSelect(agent)}
                style={{ boxShadow: isSelected ? `0 0 15px ${agent.glowColor}` : 'none' }}
                className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer transform hover:scale-[1.01] ${
                  isSelected
                    ? `bg-gradient-to-br ${agent.color}/10 border-cyan-500`
                    : agent.status === 'available'
                    ? 'bg-slate-900/40 border-slate-900/80 hover:bg-slate-900/80 hover:border-slate-800'
                    : 'bg-slate-900/20 border-slate-950 opacity-40 cursor-not-allowed'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className={`w-11 h-11 bg-gradient-to-tr ${agent.color} rounded-xl flex items-center justify-center flex-shrink-0 shadow-md`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-semibold text-sm tracking-wide">{agent.name}</h3>
                      <div className={`w-1.5 h-1.5 rounded-full ${agent.status === 'available' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                    </div>
                    <p className="text-xs text-cyan-400/90 font-medium mt-0.5">{agent.title}</p>
                    <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">{agent.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer Component Info Panels */}
        <div className="p-4 border-t border-slate-900/60 bg-slate-950/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-1.5 text-slate-400">
              <User className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium tracking-wider uppercase">Operator Session</span>
            </div>
            <button onClick={handleLogout} className="text-xs text-rose-400 hover:text-rose-300 transition-colors font-medium">
              Logout
            </button>
          </div>
          <p className="text-xs text-slate-300 truncate font-mono mb-4">{userEmail}</p>
          
          {chatHistory.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Memory Logs ({chatHistory.length})</p>
              <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                {chatHistory.slice(0, 3).map((session) => (
                  <div key={session.id} className="text-[11px] text-slate-300 p-2 bg-slate-950/50 border border-slate-900/60 rounded-lg truncate hover:text-white transition-colors">
                    {session.summary}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex items-center space-x-2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer pt-1">
            <Settings className="w-4 h-4" />
            <span className="text-xs font-medium">System Settings</span>
          </div>
        </div>
      </div>

      {/* 3. COOLING STYLE DESIGN: Main Processing Control Display */}
      <div className="flex-1 flex flex-col z-10 relative">
        {selectedAgent ? (
          <>
            {/* Header Toolbar */}
            <div className="bg-slate-950/20 backdrop-blur-md border-b border-slate-900/60 p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className={`w-12 h-12 bg-gradient-to-tr ${selectedAgent.color} rounded-xl flex items-center justify-center shadow-md`}>
                  <selectedAgent.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-bold text-white tracking-wide">{selectedAgent.name}</h2>
                    
                    {/* 🛠️ SPEC POPUP OVERLAY ACTION BUTTON */}
                    <button 
                      onClick={() => setIsTechStackOpen(true)}
                      className="p-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800/80 text-slate-400 hover:text-cyan-400 transition-all shadow-sm"
                      title="Inspect Technical Specs"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">{selectedAgent.title}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2 bg-slate-950/40 px-3 py-1.5 border border-slate-900 rounded-xl">
                  <div className={`w-2 h-2 rounded-full ${
                    connectionStatus === 'connected' ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.4)]' :
                    connectionStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'
                  }`} />
                  <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">{connectionStatus}</span>
                </div>
                
                {!isConnected ? (
                  <button
                    onClick={() => handleConnect(null)}
                    disabled={isTokenLoading || connectionStatus === 'connecting'}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 font-medium text-white rounded-xl flex items-center space-x-2 transition-all shadow-md transform active:scale-[0.98]"
                  >
                    <Phone className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      {isTokenLoading ? 'Syncing...' : connectionStatus === 'connecting' ? 'Connecting...' : 'Connect Link'}
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={handleDisconnect}
                    className="px-5 py-2.5 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 font-medium text-white rounded-xl flex items-center space-x-2 transition-all shadow-md transform active:scale-[0.98]"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Disconnect</span>
                  </button>
                )}
              </div>
            </div>

            {/* Conversation Log Thread Panel */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-950/10">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center opacity-40">
                  <MessageSquare className="w-12 h-12 text-slate-500 mb-3" />
                  <p className="text-sm tracking-wide text-slate-400">Start a conversation with {selectedAgent.name}</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-xl px-4 py-3 rounded-2xl shadow-sm border border-slate-900/20 ${
                      message.sender === 'user' 
                        ? 'bg-gradient-to-br from-cyan-600 to-blue-600 text-white rounded-br-none' 
                        : 'bg-slate-900/60 backdrop-blur-md text-slate-100 rounded-bl-none'
                    }`}>
                      <p className="text-sm leading-relaxed">{message.text}</p>
                      <p className="text-[10px] opacity-65 mt-1.5 font-mono text-right">{message.timestamp}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Control Dashboard Footer Panels */}
            <div className="bg-slate-950/20 backdrop-blur-md border-t border-slate-900/60 p-6">
              <div className="flex items-center space-x-4">
                <button
                  onClick={toggleMute}
                  disabled={!isConnected}
                  className={`p-3.5 rounded-xl transition-all shadow-md ${
                    !isConnected
                      ? 'bg-slate-900/50 border border-slate-800/80 text-slate-600 cursor-not-allowed'
                      : isMuted
                      ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                  }`}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                {/* Animated Soundwave Indicators */}
                <div className="flex-1 flex items-center justify-center space-x-1.5 h-12 bg-slate-950/30 border border-slate-900/60 rounded-xl px-4">
                  {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <div
                      key={i}
                      className={`w-1 bg-gradient-to-t from-cyan-400 to-blue-500 rounded-full transition-all duration-300 ${
                        isSpeaking ? 'animate-bounce' : 'opacity-20'
                      }`}
                      style={{ 
                        height: isSpeaking ? `${Math.floor(Math.random() * 24) + 8}px` : '4px',
                        animationDelay: `${i * 0.15}s`
                      }}
                    />
                  ))}
                </div>

                <div className="flex items-center space-x-2 font-medium min-w-[120px] justify-end">
                  {isSpeaking ? (
                    <div className="flex items-center space-x-1.5 text-emerald-400">
                      <Volume2 className="w-4 h-4 animate-pulse" />
                      <span className="text-xs">Speaking...</span>
                    </div>
                  ) : isConnected ? (
                    <div className="flex items-center space-x-1.5 text-cyan-400">
                      <Activity className="w-4 h-4" />
                      <span className="text-xs">Listening...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1.5 text-slate-500">
                      <Mic className="w-4 h-4" />
                      <span className="text-xs">Offline</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Hardware Monitoring Pipelines */}
              <div className="mt-4 grid grid-cols-2 gap-4 p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Hardware Microphone:</span>
                  <span className={`font-semibold ${micPermission ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {micPermission ? 'Pipeline Active' : 'Uninitialized'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs border-l border-slate-900 pl-4">
                  <span className="text-slate-500 font-medium">Stream Channel State:</span>
                  <span className={`font-semibold capitalize ${
                    connectionStatus === 'connected' ? 'text-emerald-400' : 
                    connectionStatus === 'connecting' ? 'text-amber-400' : 
                    connectionStatus === 'error' ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {connectionStatus}
                  </span>
                </div>
              </div>

              {/* 🛠️ SAFELY REMAPPED AND COMPLETED FALLBACK INPUT BAR INTERFACE */}
              <div className="mt-4 flex space-x-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={`Type a fallback message to ${selectedAgent?.name || 'agent'}...`}
                  className="flex-1 px-4 py-3 bg-slate-950/60 border border-slate-900 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all text-sm"
                />
                <button
                  onClick={handleSendMessage}
                  className="p-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl transition-all shadow-md flex items-center justify-center transform active:scale-[0.97]"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-50 px-4">
            <Layers className="w-16 h-16 text-slate-600 mb-4 stroke-[1.2]" />
            <h2 className="text-xl font-bold text-white tracking-wide">Awaiting Framework Instructions</h2>
            <p className="text-sm text-slate-400 mt-1 max-w-sm leading-relaxed">Select an automated agent instance from the left control matrix terminal to establish an active streaming voice link.</p>
          </div>
        )}
      </div>

      {/* 4. 🛠️ TECH STACK BLUEPRINT OVERLAY SPEC MODAL */}
      {isTechStackOpen && selectedAgent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center处理 z-50 p-4 transition-all duration-200">
          <div className="bg-slate-900 border border-slate-800 shadow-[0_24px_60px_rgba(0,0,0,0.6)] rounded-2xl max-w-md w-full overflow-hidden relative transform transition-all">
            
            {/* Top decorative gradient highlight border */}
            <div className={`h-1 bg-gradient-to-r ${selectedAgent.color}`} />
            
            {/* Close modal interface trigger */}
            <button 
              onClick={() => setIsTechStackOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-950/40 hover:bg-slate-950 border border-slate-800/40 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">System Architecture</h3>
                  <p className="text-xs text-slate-400">{selectedAgent.name} • Execution Details</p>
                </div>
              </div>
              
              {/* Architecture Blueprint Data List Rows */}
              <div className="space-y-3.5 text-sm">
                <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Session Orchestrator Core</span>
                  <span className="text-slate-200 font-medium">{selectedAgent.stackDetails.framework}</span>
                </div>
                
                <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Speech-To-Text Pipeline</span>
                  <span className="text-slate-200 font-medium">{selectedAgent.stackDetails.stt}</span>
                </div>
                
                <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Context Inference Node (LLM)</span>
                  <span className="text-slate-200 font-medium">{selectedAgent.stackDetails.llm}</span>
                </div>
                
                <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Text-To-Speech Generation</span>
                  <span className="text-slate-200 font-medium">{selectedAgent.stackDetails.tts}</span>
                </div>

                <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Voice Activity Detection Engine</span>
                  <span className="text-slate-200 font-medium">{selectedAgent.stackDetails.vad}</span>
                </div>
              </div>
              
              <button
                onClick={() => setIsTechStackOpen(false)}
                className="mt-6 w-full py-2.5 bg-slate-950 hover:bg-slate-950/70 text-slate-400 hover:text-slate-200 font-semibold text-xs rounded-xl border border-slate-800 transition-colors uppercase tracking-wider"
              >
                Close System Specifications
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
