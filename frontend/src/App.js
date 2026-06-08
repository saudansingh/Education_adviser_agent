/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Phone, 
  PhoneOff, 
  Volume2, 
  MessageSquare, 
  User, 
  GraduationCap,
  Users,
  Activity,
  ShieldAlert,
  Info,
  X,
  Cpu,
  Terminal,
  Radio,
  Bot,
  Zap,
  Sliders,
  Send
} from 'lucide-react';
import { RoomEvent, Room, Track } from 'livekit-client';
import './App.css';

const agents = [
  {
    id: 'ankur',
    name: 'Ankur',
    title: 'Education Advisor',
    description: 'Specialized in learning strategies and career guidance',
    icon: GraduationCap,
    color: 'bg-blue-500',
    techStack: 'livekit',
    status: 'available',
    stackLayers: [
      { layer: 'Orchestrator Framework', name: 'LiveKit Agents SDK Pipeline', icon: Radio, tint: 'text-blue-400' },
      { layer: 'Speech-To-Text (STT)', name: 'Deepgram Nova-2 Streaming Engine', icon: Mic, tint: 'text-cyan-400' },
      { layer: 'Language Processing Model', name: 'OpenAI GPT-4o-Mini Context Node', icon: Bot, tint: 'text-purple-400' },
      { layer: 'Text-To-Speech (TTS)', name: 'Deepgram Aura Voice Generation', icon: Volume2, tint: 'text-emerald-400' },
      { layer: 'Voice Activity Detection', name: 'Silero Intelligent VAD Engine', icon: Sliders, tint: 'text-amber-400' }
    ]
  },
  {
    id: 'insurance_advisor',
    name: 'Insurance Advisor',
    title: 'Risk & Insurance Expert',
    description: 'Specialized in ultra-concise policy advice and clear guidance',
    icon: ShieldAlert,
    color: 'bg-emerald-600',
    techStack: 'raw-websocket',
    status: 'available',
    stackLayers: [
      { layer: 'Asynchronous Core Gateway', name: 'FastAPI Low-Latency Async Engine', icon: Terminal, tint: 'text-emerald-400' },
      { layer: 'Microphone Stream Parser', name: 'Browser Web Audio Context (PCM 16kHz)', icon: Sliders, tint: 'text-teal-400' },
      { layer: 'Context Inference Model', name: 'Google Gemini 2.5 Flash Engine Instance', icon: Cpu, tint: 'text-indigo-400' },
      { layer: 'Native Audio Synthesis Data', name: 'Gemini Live Multimodal Streams (24kHz)', icon: Zap, tint: 'text-yellow-400' }
    ]
  },
  {
    id: 'custom_ws_agent',
    name: 'Custom WS Agent',
    title: 'Real-time Streaming Assistant',
    description: 'Connected via independent secure custom WebSocket server infrastructure',
    icon: Activity,
    color: 'bg-purple-600',
    techStack: 'raw-websocket',
    status: 'available',
    stackLayers: [
      { layer: 'Custom Network Gateway', name: 'Native WebSockets Communication Protocol', icon: Radio, tint: 'text-purple-400' },
      { layer: 'Audio Parser Link', name: 'PCM 16kHz Byte stream processing node', icon: Sliders, tint: 'text-cyan-400' },
      { layer: 'Intelligence Engine', name: 'Custom Backend Router Context Processing Node', icon: Cpu, tint: 'text-indigo-400' }
    ]
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
  
  const [activeModalAgent, setActiveModalAgent] = useState(null);
  
  const roomRef = useRef(null);
  const audioElementRef = useRef(null);
  
  const rawSocketRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const nextStartTimeRef = useRef(0);
  const isMutedRef = useRef(false);

  const livekitUrl = process.env.REACT_APP_LIVEKIT_URL || 'wss://voice-agent-tr1nwg9p.osingapore1b.production.livekit.cloud';
  const gcpInsuranceWsUrl = process.env.REACT_APP_GCP_INSURANCE_WS_URL || 'wss://your-gcp-app-url.a.run.app/insurance-agent';
  
  // 🛠️ NEW WEBSOCKET BACKEND URL LINK CONFIGURATION
  const customWsAgentUrl = process.env.REACT_APP_CUSTOM_WS_AGENT_URL || 'wss://az-serenpath-voice-agent1.thankfulstone-647cf8f2.eastus2.azurecontainerapps.io';

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

  useEffect(() => {
    cleanupAllConnections();
    setMessages([]);
    setConnectionStatus('disconnected');
    setIsConnected(false);

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
    } 
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

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      nextStartTimeRef.current = audioCtx.currentTime;

      // 🛠️ DYNAMIC CHANNEL ROUTER FOR WEBSOCKET LINK
      const targetingUrl = selectedAgent.id === 'custom_ws_agent' ? customWsAgentUrl : gcpInsuranceWsUrl;

      const authenticatedWsUrl = `${targetingUrl}?email=${encodeURIComponent(userEmail)}`;
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

      ws.onerror = (err) => {
        console.error("WebSocket channel dropped:", err);
        setConnectionStatus('error');
      };

      ws.onclose = () => {
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setIsSpeaking(false);
      };

    } catch (error) {
      console.error('Failed to construct Custom session pipeline:', error);
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

        const inputBuffer = e.inputBuffer;
        const float32Data = inputBuffer.getChannelData(0);

        const int16Buffer = new Int16Array(float32Data.length);
        for (let i = 0; i < float32Data.length; i++) {
          let sample = Math.max(-1, Math.min(1, float32Data[i]));
          int16Buffer[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }

        rawSocketRef.current.send(int16Buffer.buffer);
      };
    } catch (err) {
      console.error("Hardware Microphone connection pipeline aborted:", err);
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

      if (selectedAgent.techStack === 'raw-websocket' && rawSocketRef.current?.readyState === WebSocket.OPEN) {
        rawSocketRef.current.send(JSON.stringify({ text: inputMessage }));
      } else {
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

  if (!isLoggedIn) {
    return (
      <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 items-center justify-center relative overflow-hidden">
        <div className="absolute w-[400px] h-[400px] bg-blue-500/10 blur-[100px] -top-20 -left-20 rounded-full pointer-events-none" />
        <div className="absolute w-[400px] h-[400px] bg-emerald-500/5 blur-[100px] -bottom-20 -right-20 rounded-full pointer-events-none" />
        
        <div className="bg-slate-900/60 backdrop-blur-xl p-8 rounded-2xl border border-slate-800/80 shadow-2xl max-w-md w-full mx-4 relative z-10">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-wide mb-1">Voice Core Portal</h1>
            <p className="text-slate-400 text-sm">Enter identity token coordinates to initialize</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Secure Operator Email</label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="operator@system.com"
                required
                className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
              />
            </div>
            
            <button
              type="submit"
              disabled={isLoading || !userEmail}
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl shadow-lg transition-all disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-sm uppercase tracking-wider"
            >
              {isLoading ? 'Accessing Quantum Node...' : 'Establish Connection Link'}
            </button>
          </form>
          
          <p className="text-[11px] text-slate-500 text-center mt-5 leading-relaxed">
            Your identity sequence maintains session history across isolated operations.
          </p>
        </div>
      </div>
    );
  }

  const ActiveAgentIcon = selectedAgent ? selectedAgent.icon : null;

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-200 antialiased relative">
      <audio ref={audioElementRef} autoPlay playsInline />
      
      {/* Frosted Translucent Sidebar */}
      <div className="w-80 bg-slate-900/40 backdrop-blur-md border-r border-slate-900 flex flex-col z-10">
        <div className="p-6 border-b border-slate-900">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-md font-bold text-white tracking-wide">Matrix Directory</h1>
              <p className="text-xs text-slate-400">Select processing node</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {agents.map((agent) => {
            const Icon = agent.icon;
            const isSelected = selectedAgent?.id === agent.id;
            return (
              <div
                key={agent.id}
                onClick={() => handleAgentSelect(agent)}
                className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer relative group ${
                  isSelected
                    ? 'bg-gradient-to-r from-blue-950/40 to-slate-900/60 border-blue-500/80 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                    : agent.status === 'available'
                    ? 'bg-slate-950/40 border-slate-900 hover:bg-slate-900/40 hover:border-slate-800'
                    : 'bg-slate-950/10 border-slate-950 opacity-40 cursor-not-allowed'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className={`w-11 h-11 ${agent.color} rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-medium text-sm tracking-wide pr-6 truncate">{agent.name}</h3>
                      <div className="flex items-center space-x-2">
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveModalAgent(agent);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-800/60 text-slate-400 hover:text-blue-400 transition-all shadow-sm"
                          title={`View ${agent.name} Architecture Specifications`}
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>

                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${agent.status === 'available' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 font-medium">{agent.title}</p>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">{agent.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-900 bg-slate-950/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1.5 text-slate-500">
              <User className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold tracking-wider uppercase">Active Token Identity</span>
            </div>
            <button onClick={handleLogout} className="text-xs text-rose-400 hover:text-rose-300 transition-colors">
              Disconnect
            </button>
          </div>
          <p className="text-xs text-slate-300 truncate font-mono mb-3">{userEmail}</p>
          
          {chatHistory.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase mb-1.5">Cache Modules ({chatHistory.length})</p>
              <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                {chatHistory.slice(0, 3).map((session) => (
                  <div key={session.id} className="text-[11px] text-slate-400 p-1.5 bg-slate-950/60 border border-slate-900 rounded-lg truncate">
                    {session.summary}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Container Viewport */}
      <div className="flex-1 flex flex-col z-10 relative">
        {selectedAgent ? (
          <>
            {/* Control Strip Toolbar */}
            <div className="bg-slate-900/20 backdrop-blur-md border-b border-slate-900 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 ${selectedAgent.color} rounded-xl flex items-center justify-center shadow-md`}>
                    {ActiveAgentIcon && <ActiveAgentIcon className="w-5 h-5 text-white" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-wide">{selectedAgent.name}</h2>
                    <p className="text-xs text-slate-400">{selectedAgent.title}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2 bg-slate-950/40 px-3 py-1.5 border border-slate-900 rounded-xl">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      connectionStatus === 'connected' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]' :
                      connectionStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'
                    }`} />
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">{connectionStatus}</span>
                  </div>
                  
                  {!isConnected ? (
                    <button
                      onClick={() => handleConnect(null)}
                      disabled={isTokenLoading || connectionStatus === 'connecting'}
                      className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold uppercase tracking-wider rounded-xl flex items-center space-x-2 transition-all shadow-md transform active:scale-[0.98]"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{isTokenLoading ? 'Syncing...' : connectionStatus === 'connecting' ? 'Linking...' : 'Connect Intercom'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleDisconnect}
                      className="px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-semibold uppercase tracking-wider rounded-xl flex items-center space-x-2 transition-all shadow-md transform active:scale-[0.98]"
                    >
                      <PhoneOff className="w-3.5 h-3.5" />
                      <span>Terminate Link</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Conversation Core Thread Panel */}
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-950/10 p-6 relative">
              {connectionStatus === 'connected' ? (
                <div className="text-center space-y-6 flex flex-col items-center">
                  {/* Central Pulsing Audio Core Orb */}
                  <div className="relative flex items-center justify-center">
                    <div className={`absolute w-32 h-32 rounded-full border border-emerald-500/30 animate-ping duration-1000 ${isSpeaking ? 'opacity-100' : 'opacity-0'}`} />
                    <div className={`absolute w-28 h-28 rounded-full border border-teal-500/20 animate-pulse`} />
                    <div className={`w-24 h-24 ${selectedAgent.color} rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.2)] border border-white/10 relative z-10`}>
                      {React.createElement(selectedAgent.icon, { className: `w-10 h-10 text-white ${isSpeaking ? 'animate-bounce' : ''}` })}
                    </div>
                  </div>
                
                  <div className="space-y-1">
                    <h3 className="text-md font-bold text-white tracking-wider uppercase">Voice Stream Secure</h3>
                    <p className="text-xs text-slate-400 font-mono">
                      {isSpeaking ? `${selectedAgent.name} is speaking...` : 'Standing By'}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {/* Tech Stack Architecture Popup Modal */}
      {activeModalAgent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            
            <button 
              onClick={() => setActiveModalAgent(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-950/40 hover:bg-slate-800 p-1.5 rounded-lg border border-slate-800 transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3 mb-5">
              <div className={`w-10 h-10 ${activeModalAgent.color} rounded-xl flex items-center justify-center`}>
                {React.createElement(activeModalAgent.icon, { className: 'w-5 h-5 text-white' })}
              </div>
              <div>
                <h2 className="text-md font-bold text-white tracking-wide">{activeModalAgent.name} Spec</h2>
                <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">Engine: {activeModalAgent.techStack}</p>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Active engineering blueprint pipeline configured for processing real-time audio interaction.
            </p>

            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {activeModalAgent.stackLayers?.map((layer, index) => {
                const LayerIcon = layer.icon;
                return (
                  <div 
                    key={index} 
                    className="flex items-start space-x-3 p-3 bg-slate-950/40 border border-slate-800/40 rounded-xl"
                  >
                    <div className={`p-2 bg-slate-900 rounded-lg flex-shrink-0 border border-slate-800/50 ${layer.tint || 'text-blue-400'}`}>
                      <LayerIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-0.5">{layer.layer}</p>
                      <p className="text-xs text-slate-200 font-medium truncate font-mono">{layer.name}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
