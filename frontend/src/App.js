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
  Cpu,
  Layers,
  Sparkles
} from 'lucide-react';
import { RoomEvent, Room, Track } from 'livekit-client';
import './App.css';

// Enriched Agent Profiles with explicit Tech Stack details for the Pop-up
const agents = [
  {
    id: 'ankur',
    name: 'Ankur',
    title: 'Education Advisor',
    description: 'Specialized in learning strategies and career guidance',
    icon: GraduationCap,
    color: 'from-blue-500 to-cyan-400',
    glowColor: 'rgba(59, 130, 246, 0.5)',
    status: 'available',
    techStack: 'livekit',
    stackDetails: {
      framework: 'LiveKit Agents Framework',
      stt: 'Deepgram Nova-2 (Ultra-low latency transcription)',
      llm: 'OpenAI GPT-4o-Mini (Optimized contextual logic)',
      tts: 'Deepgram Aura-2 Orion (Natural conversational cadence)',
      vad: 'Silero VAD (Voice Activity Detection engine)'
    }
  },
  {
    id: 'insurance_advisor',
    name: 'Insurance Advisor',
    title: 'Risk & Insurance Expert',
    description: 'Specialized in ultra-concise policy advice and clear guidance',
    icon: ShieldAlert,
    color: 'from-emerald-500 to-teal-400',
    glowColor: 'rgba(16, 185, 129, 0.5)',
    status: 'available',
    techStack: 'raw-websocket',
    stackDetails: {
      framework: 'FastAPI Secure WebSockets (Asynchronous Event Loop)',
      stt: 'Native Browser Web Audio API Pipeline (PCM 16kHz Streaming)',
      llm: 'Google Gemini 3.1 Flash Live Preview (Real-time multimodal engine)',
      tts: 'Gemini Live Native Audio Output Stream (PCM 24kHz Capture)',
      vad: 'Asynchronous Queue Manager Handler'
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
  
  // 🛠️ NEW STATE: Controls the Tech Stack Information Popup Modal
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
  const isMutedRef = useRef(false);

  // Target Endpoint configuration references
  const livekitUrl = process.env.REACT_APP_LIVEKIT_URL || 'wss://voice-agent-tr1nwg9p.osingapore1b.production.livekit.cloud';
  const gcpInsuranceWsUrl = process.env.REACT_APP_GCP_INSURANCE_WS_URL || 'wss://insurance-adviser-871413748960.europe-west1.run.app/ws/chat';

  useEffect(() => {
    const storedToken = localStorage.getItem('jwtToken');
    const storedEmail = localStorage.getItem('userEmail');
    if (storedToken && storedEmail) {
      setJwtToken(storedToken);
      setUserEmail(storedEmail);
      setIsLoggedIn(true);
      loadChatHistory(storedToken);
    }
  }, []);

  useEffect(() => {
    cleanupAllConnections();
    setMessages([]);
    setConnectionStatus('disconnected');
    setIsConnected(false);

    if (selectedAgent && selectedAgent.techStack === 'livekit') {
      generateToken();
    }
  }, [selectedAgent]);

  useEffect(() => {
    return () => {
      cleanupAllConnections();
    };
  }, []);

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
        setTimeout(() => handleConnect(data.token), 500);
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
      setMicPermission(false);
      return false;
    }
  };

  const handleConnect = async (passedToken) => {
    const activeToken = passedToken || token;
    if (!selectedAgent) return;

    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      alert('Please allow microphone access to use voice features');
      return;
    }

    if (selectedAgent.techStack === 'livekit') {
      if (!activeToken) return;
      await connectToLiveKit(activeToken);
    } else if (selectedAgent.techStack === 'raw-websocket') {
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
      setConnectionStatus('error');
    }
  };

  const connectToRawWebSocketAgent = async () => {
    try {
      setConnectionStatus('connecting');
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      nextStartTimeRef.current = audioCtx.currentTime;

      const authenticatedWsUrl = `${gcpInsuranceWsUrl}?email=${encodeURIComponent(userEmail)}`;
      const ws = new WebSocket(authenticatedWsUrl);
      ws.binaryType = "arraybuffer";
      rawSocketRef.current = ws;

      ws.onopen = async () => {
        setIsConnected(true);
        setConnectionStatus('connected');
        setIsMuted(false);
        isMutedRef.current = false;
        await setupBrowserMicrophonePipeline();
      };

      ws.onmessage = async (event) => {
        if (typeof event.data === 'string') {
          const payload = JSON.parse(event.data);
          if (payload.text) {
            appendStreamingAgentText(payload.text);
          } else if (payload.type === 'interrupt') {
            nextStartTimeRef.current = audioCtx.currentTime; 
            setIsSpeaking(false);
          }
        } else {
          playRawAudioBufferChunk(event.data);
        }
      };

      ws.onerror = () => setConnectionStatus('error');
      ws.onclose = () => {
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setIsSpeaking(false);
      };
    } catch (error) {
      setConnectionStatus('error');
    }
  };

  const setupBrowserMicrophonePipeline = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1);
      
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!rawSocketRef.current || rawSocketRef.current.readyState !== WebSocket.OPEN) return;
        if (isMutedRef.current) return;

        const float32Data = e.inputBuffer.getChannelData(0);
        const int16Buffer = new Int16Array(float32Data.length);
        for (let i = 0; i < float32Data.length; i++) {
          let sample = Math.max(-1, Math.min(1, float32Data[i]));
          int16Buffer[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }
        rawSocketRef.current.send(int16Buffer.buffer);
      };
    } catch (err) {
      console.error(err);
    }
  };

  const playRawAudioBufferChunk = (arrayBuffer) => {
    const audioCtx = audioContextRef.current;
    if (!audioCtx || audioCtx.state === 'closed') return;

    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);

    const bufferSource = audioCtx.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(audioCtx.destination);

    const startTime = Math.max(nextStartTimeRef.current, audioCtx.currentTime);
    bufferSource.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;

    setIsSpeaking(true);
    bufferSource.onended = () => {
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
      await fetch(`${API_URL}/chat-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ summary: summary, messages: messages }),
      });
      loadChatHistory(jwtToken);
    } catch (error) {
      console.error(error);
    }
  };

  const toggleMute = () => {
    if (!isConnected || !selectedAgent) return;
    const nextMuteState = !isMuted;
    if (selectedAgent.techStack === 'livekit' && roomRef.current) {
      roomRef.current.localParticipant.setMicrophoneEnabled(!nextMuteState);
    }
    setIsMuted(nextMuteState);
    isMutedRef.current = nextMuteState;
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

      if (selectedAgent.techStack === 'raw-websocket' && rawSocketRef.current?.readyState === WebSocket.OPEN) {
        rawSocketRef.current.send(JSON.stringify({ text: inputMessage }));
      }
    }
  };

  const handleAgentSelect = (agent) => {
    if (agent.status === 'available') {
      setSelectedAgent(agent);
    }
  };

  // 1. 🌟 COOLING DESIGN: Enhanced, Luminous Login Screen
  if (!isLoggedIn) {
    return (
      <div className="flex h-screen bg-gradient-to-tr from-slate-950 via-indigo-950 to-slate-900 items-center justify-center relative overflow-hidden">
        {/* Soft Ambient Background Glow Rings */}
        <div className="absolute w-[500px] h-[500px] bg-cyan-500/10 blur-[100px] -top-40 -left-40 rounded-full" />
        <div className="absolute w-[500px] h-[500px] bg-blue-500/10 blur-[100px] -bottom-40 -right-40 rounded-full" />
        
        <div className="bg-slate-900/60 backdrop-blur-xl p-8 rounded-2xl border border-slate-800/80 shadow-[0_8px_32px_rgba(0,0,0,0.4)] max-w-md w-full mx-4 transition-all duration-300 hover:border-slate-700/80">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(6,182,212,0.4)]">
              <Sparkles className="w-8 h-8 text-white animate-pulse" />
            </div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-cyan-200 tracking-tight mb-2">Voice agents</h1>
            <p className="text-slate-400 text-sm">Sign in with email to unlock memory context matching</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Email Address</label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="name@company.com"
                required
                className="w-full px-4 py-3.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all"
              />
            </div>
            
            <button
              type="submit"
              disabled={isLoading || !userEmail}
              className="w-full px-4 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium rounded-xl transition-all duration-300 shadow-lg disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed transform active:scale-[0.98]"
            >
              {isLoading ? 'Establishing Gateway...' : 'Initialize Portal'}
            </button>
          </form>
          
          <p className="text-[11px] text-slate-500 text-center mt-6 leading-relaxed">
            Secured end-to-end. Your historical summaries sync seamlessly across deployment channels.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/40 font-sans text-slate-200 relative overflow-hidden">
      <audio ref={audioElementRef} autoPlay playsInline />
      
      {/* 2. 🌟 COOLING DESIGN: Frosted Sidebar Panel */}
      <div className="w-80 bg-slate-950/40 backdrop-blur-lg border-r border-slate-900 flex flex-col z-10">
        <div className="p-6 border-b border-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-wide">Voice Matrix</h1>
              <p className="text-xs text-slate-400">Select active intelligence</p>
            </div>
          </div>
        </div>

        {/* Agent Cards Grid */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {agents.map((agent) => {
            const Icon = agent.icon;
            const isSelected = selectedAgent?.id === agent.id;
            return (
              <div
                key={agent.id}
                onClick={() => handleAgentSelect(agent)}
                style={{ boxShadow: isSelected ? `0 0 20px ${agent.glowColor}` : 'none' }}
                className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer transform hover:scale-[1.01] ${
                  isSelected
                    ? `bg-gradient-to-br ${agent.color}/10 border-cyan-500`
                    : 'bg-slate-900/40 border-slate-900 hover:bg-slate-900/80 hover:border-slate-800'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className={`w-11 h-11 bg-gradient-to-tr ${agent.color} rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-semibold text-sm tracking-wide">{agent.name}</h3>
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <p className="text-xs text-cyan-400 font-medium mt-0.5">{agent.title}</p>
                    <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">{agent.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* User Workspace Profile Container */}
        <div className="p-4 border-t border-slate-900/60 bg-slate-950/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-1.5 text-slate-400">
              <User className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium tracking-wider uppercase">Active Operator</span>
            </div>
            <button onClick={handleLogout} className="text-xs text-rose-400 hover:text-rose-300 font-medium transition-colors">
              Signout
            </button>
          </div>
          <p className="text-xs text-slate-300 font-mono truncate mb-4">{userEmail}</p>
          
          {chatHistory.length > 0 && (
            <div className="mb-2">
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
        </div>
      </div>

      {/* 3. 🌟 COOLING DESIGN: Main Core Interactive Space */}
      <div className="flex-1 flex flex-col z-10 relative">
        {selectedAgent ? (
          <>
            {/* Header Area */}
            <div className="bg-slate-950/20 backdrop-blur-md border-b border-slate-900/60 p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className={`w-12 h-12 bg-gradient-to-tr ${selectedAgent.color} rounded-xl flex items-center justify-center shadow-md`}>
                  <selectedAgent.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-bold text-white tracking-wide">{selectedAgent.name}</h2>
                    
                    {/* 🛠️ NEW BUTTON: Triggers the Tech Stack Info Modal Overlay */}
                    <button 
                      onClick={() => setIsTechStackOpen(true)}
                      className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-cyan-400 transition-all"
                      title="Inspect Technical Specs"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">{selectedAgent.title}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2 bg-slate-950/40 px-3 py-1.5 border border-slate-900 rounded-lg">
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
                    <span className="text-xs font-semibold uppercase tracking-wider">Initialize Audio Link</span>
                  </button>
                ) : (
                  <button
                    onClick={handleDisconnect}
                    className="px-5 py-2.5 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 font-medium text-white rounded-xl flex items-center space-x-2 transition-all shadow-md transform active:scale-[0.98]"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Sever Link</span>
                  </button>
                )
                }
              </div>
            </div>

            {/* Transcription Log Streams */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-950/10">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center opacity-40">
                  <MessageSquare className="w-12 h-12 text-slate-500 mb-3" />
                  <p className="text-sm tracking-wide text-slate-400">Stream payload log clear. Speak to activate transcription...</p>
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
                      <p className="text-[10px] opacity-60 mt-1.5 font-mono text-right">{message.timestamp}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Audio Waveform/Visualizer and Text fallback bar footer */}
            <div className="bg-slate-950/20 backdrop-blur-md border-t border-slate-900/60 p-6">
              <div className="flex items-center space-x-4">
                <button
                  onClick={toggleMute}
                  disabled={!isConnected}
                  className={`p-3.5 rounded-xl transition-all shadow-md ${
                    !isConnected
                      ? 'bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed'
                      : isMuted
                      ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                  }`}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                {/* Fluid Soundwave Interface */}
                <div className="flex-1 flex items-center justify-center space-x-1.5 h-10 bg-slate-950/30 border border-slate-900 rounded-xl px-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div
                      key={i}
                      className={`w-1 bg-gradient-to-t from-cyan-500 to-blue-400 rounded-full transition-all duration-300 ${
                        isSpeaking ? 'animate-bounce' : 'opacity-20'
                      }`}
                      style={{ 
                        height: isSpeaking ? `${Math.floor(Math.random() * 24) + 8}px` : '4px',
                        animationDelay: `${i * 0.1}s`
                      }}
                    />
                  ))}
                </div>

                <div className="text-xs font-medium tracking-wide">
                  {isSpeaking ? (
                    <span className="text-emerald-400 flex items-center space-x-1">
                      <Volume2 className="w-4 h-4 animate-pulse" /> <span>Streaming Audio Out</span>
                    </span>
                  ) : isConnected ? (
                    <span className="text-cyan-400 flex items-center space-x-1">
                      <Activity className="w-4 h-4" /> <span>Monitoring Channel</span>
                    </span>
                  ) : (
                    <span className="text-slate-500">Channel Offline</span>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-60 px-4">
            <Cpu className="w-16 h-16 text-slate-600 mb-4 stroke-[1.5]" />
            <h2 className="text-xl font-bold text-white tracking-wide">Matrix Awaiting Instructions</h2>
            <p className="text-sm text-slate-400 mt-1 max-w-sm">Select an automated agent framework instance from the left control terminal to establish an active link.</p>
          </div>
        )}
      </div>

      {/* 4. 🛠️ NEW COMPONENT: Frosted Glass Technology Stack Info Modal popup window */}
      {isTechStackOpen && selectedAgent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-2xl max-w-md w-full overflow-hidden relative transform scale-100 transition-transform">
            
            {/* Top color gradient highlight strip */}
            <div className={`h-1.5 bg-gradient-to-r ${selectedAgent.color}`} />
            
            {/* Close action button */}
            <button 
              onClick={() => setIsTechStackOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-950/40 hover:bg-slate-950 border border-slate-800/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">System Blueprint</h3>
                  <p className="text-xs text-slate-400">{selectedAgent.name} • Specs</p>
                </div>
              </div>
              
              {/* Architecture Data Grid */}
              <div className="space-y-4 font-sans text-sm">
                <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Session Framework Core</span>
                  <span className="text-slate-200 font-medium">{selectedAgent.stackDetails.framework}</span>
                </div>
                
                <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">STT Model Pipeline</span>
                  <span className="text-slate-200 font-medium">{selectedAgent.stackDetails.stt}</span>
                </div>
                
                <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">LLM Reasoning Node</span>
                  <span className="text-slate-200 font-medium">{selectedAgent.stackDetails.llm}</span>
                </div>
                
                <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">TTS Voice Synthesis Output</span>
                  <span className="text-slate-200 font-medium">{selectedAgent.stackDetails.tts}</span>
                </div>

                <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Voice Activation Detection (VAD)</span>
                  <span className="text-slate-200 font-medium">{selectedAgent.stackDetails.vad}</span>
                </div>
              </div>
              
              <button
                onClick={() => setIsTechStackOpen(false)}
                className="mt-6 w-full py-2.5 bg-slate-950 hover:bg-slate-950/80 text-slate-300 font-medium text-xs rounded-xl border border-slate-800 transition-colors uppercase tracking-wider"
              >
                Close Specifications
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
