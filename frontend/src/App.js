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
  ShieldAlert
} from 'lucide-react';
import { RoomEvent, Room, Track } from 'livekit-client';
import './App.css';

// Added techStack identifiers to branch out streaming frameworks smoothly
const agents = [
  {
    id: 'ankur',
    name: 'Ankur',
    title: 'Education Advisor',
    description: 'Specialized in learning strategies and career guidance',
    icon: GraduationCap,
    color: 'bg-blue-500',
    status: 'available',
    techStack: 'livekit'
  },
  {
    id: 'insurance_advisor',
    name: 'Insurance Advisor',
    title: 'Risk & Insurance Expert',
    description: 'Specialized in ultra-concise policy advice and clear guidance',
    icon: ShieldAlert,
    color: 'bg-emerald-600',
    status: 'available',
    techStack: 'raw-websocket'
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

      // 🛠️ CHANGED: Append email as a query param so the backend can lookup/save context history
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
          
          // 🛠️ CHANGED: Check directly for the 'text' property sent by websocket.send_json({"text": ...})
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

  if (!isLoggedIn) {
    return (
      <div className="flex h-screen bg-gradient-to-br from-slate-900 to-slate-800 items-center justify-center">
        <div className="bg-slate-800 p-8 rounded-lg shadow-xl max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mx-auto mb-4">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Voice Agents</h1>
            <p className="text-slate-400">Enter your email to start</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <button
              type="submit"
              disabled={isLoading || !userEmail}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Connecting...' : 'Start Chat'}
            </button>
          </form>
          
          <p className="text-xs text-slate-500 text-center mt-4">
            Your email will be used to save your chat history for future sessions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <audio ref={audioElementRef} autoPlay playsInline />
      
      {/* Sidebar Layout Section */}
      <div className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Voice Agents</h1>
              <p className="text-sm text-slate-400">Select an agent to start</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            {agents.map((agent) => {
              const Icon = agent.icon;
              return (
                <div
                  key={agent.id}
                  onClick={() => handleAgentSelect(agent)}
                  className={`p-4 rounded-lg border transition-all cursor-pointer ${
                    selectedAgent?.id === agent.id
                      ? 'bg-slate-700 border-blue-500 shadow-lg'
                      : agent.status === 'available'
                      ? 'bg-slate-900 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
                      : 'bg-slate-900 border-slate-800 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className={`w-12 h-12 ${agent.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-white font-medium">{agent.name}</h3>
                        <div className={`w-2 h-2 rounded-full ${
                          agent.status === 'available' ? 'bg-green-500' : 'bg-yellow-500'
                        }`} />
                      </div>
                      <p className="text-sm text-slate-400">{agent.title}</p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{agent.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400">Logged in as:</span>
            </div>
            <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300">
              Logout
            </button>
          </div>
          <p className="text-xs text-slate-300 truncate mb-3">{userEmail}</p>
          
          {chatHistory.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-slate-400 mb-2">Previous Sessions ({chatHistory.length})</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {chatHistory.slice(0, 3).map((session) => (
                  <div key={session.id} className="text-xs text-slate-300 p-2 bg-slate-900 rounded truncate">
                    {session.summary}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-400">Settings</span>
          </div>
        </div>
      </div>

      {/* Main Streaming Display Container Area */}
      <div className="flex-1 flex flex-col">
        {selectedAgent ? (
          <>
            <div className="bg-slate-800 border-b border-slate-700 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 ${selectedAgent.color} rounded-lg flex items-center justify-center`}>
                    <selectedAgent.icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{selectedAgent.name}</h2>
                    <p className="text-slate-400">{selectedAgent.title}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      connectionStatus === 'connected' ? 'bg-green-500' :
                      connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                      'bg-red-500'
                    }`} />
                    <span className="text-sm text-slate-400 capitalize">{connectionStatus}</span>
                  </div>
                  {!isConnected ? (
                    <button
                      onClick={() => handleConnect(null)}
                      disabled={isTokenLoading || connectionStatus === 'connecting'}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg flex items-center space-x-2 transition-colors"
                    >
                      <Phone className="w-4 h-4" />
                      <span>{isTokenLoading ? 'Loading...' : connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleDisconnect}
                      className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center space-x-2 transition-colors"
                    >
                      <PhoneOff className="w-4 h-4" />
                      <span>Disconnect</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">Start a conversation with {selectedAgent.name}</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-2xl px-4 py-3 rounded-lg ${
                        message.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-white'
                      }`}>
                        <p className="text-sm">{message.text}</p>
                        <p className="text-xs opacity-70 mt-1">{message.timestamp}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="bg-slate-800 border-t border-slate-700 p-6">
                <div className="flex items-center space-x-4">
                  <button
                    onClick={toggleMute}
                    disabled={!isConnected}
                    className={`p-4 rounded-full transition-colors ${
                      !isConnected
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        : isMuted
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </button>

                  <div className="flex-1 flex items-center justify-center space-x-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`w-1 bg-blue-500 rounded-full audio-bar ${isSpeaking ? '' : 'opacity-30'}`}
                        style={{ height: isSpeaking ? '20px' : '4px' }}
                      />
                    ))}
                  </div>

                  <div className="flex items-center space-x-2">
                    {isSpeaking ? (
                      <div className="flex items-center space-x-2 text-green-500">
                        <Volume2 className="w-5 h-5" />
                        <span className="text-sm">Speaking...</span>
                      </div>
                    ) : isConnected ? (
                      <div className="flex items-center space-x-2 text-blue-500">
                        <Activity className="w-5 h-5" />
                        <span className="text-sm">Listening...</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 text-slate-400">
                        <Mic className="w-5 h-5" />
                        <span className="text-sm">Connect to start</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 p-3 bg-slate-700 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Microphone:</span>
                    <span className={micPermission ? 'text-green-400' : 'text-yellow-400'}>
                      {micPermission ? 'Allowed' : 'Not requested'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-slate-400">Voice Status:</span>
                    <span className={connectionStatus === 'connected' ? 'text-green-400' : 
                                    connectionStatus === 'connecting' ? 'text-yellow-400' : 
                                    connectionStatus === 'error' ? 'text-red-400' : 'text-slate-400'}>
                      {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex space-x-2">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder={isConnected ? "Type your message or use voice..." : "Connect to start chatting..."}
                    disabled={!isConnected}
                    className={`flex-1 px-4 py-2 border rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 ${
                      isConnected ? 'bg-slate-700 border-slate-600' : 'bg-slate-800 border-slate-700 cursor-not-allowed'
                    }`}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!isConnected}
                    className={`px-6 py-2 rounded-lg transition-colors ${
                      isConnected ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-24 h-24 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-6">
                <User className="w-12 h-12 text-slate-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Select an Agent</h2>
              <p className="text-slate-400">Choose an agent from the sidebar to start your conversation</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
