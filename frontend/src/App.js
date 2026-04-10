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
  Activity
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
    status: 'available'
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
  
  const roomRef = useRef(null);
  const audioElementRef = useRef(null);

  // LiveKit server URL
  const livekitUrl = process.env.REACT_APP_LIVEKIT_URL || 'wss://voice-agent-u5bk8av6.livekit.cloud';

  useEffect(() => {
    if (selectedAgent) {
      generateToken();
    }
  }, [selectedAgent]);

  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, []);

  const generateToken = async () => {
    try {
      // Use environment variable for API URL
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      
      const response = await fetch(`${API_URL}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          room_name: 'ankur-room',
          identity: 'web-user-' + Math.random().toString(36).substr(2, 9)
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setToken(data.token);
        console.log('Generated token from API');
      } else {
        console.error('Failed to generate token from API');
        // Fallback to hardcoded token for development
        setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzU4MjE4NjksImlkZW50aXR5Ijoid2ViLXVzZXIiLCJpc3MiOiJBUElKdlZTWXZpN1AyQnEiLCJuYW1lIjoid2ViLXVzZXIiLCJuYmYiOjE3NzU3MzU0NjksInN1YiI6IndlYi11c2VyIiwidmlkZW8iOnsicm9vbSI6InRlc3Qtcm9vbSIsInJvb21Kb2luIjp0cnVlfX0.W7jP833o1Mtr35CJ0GQaQA-uM_0cjmjrdJriwX6M5Cw');
      }
    } catch (error) {
      console.error('Error generating token:', error);
      // Fallback token
      setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyIiwiaWF0IjoxNzE0NjQwMDAwLCJuYmYiOjE3MTQ2NDM2MDAsImV4cCI6MTcxNDY0MzYwMH0.mock_signature');
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

  const handleConnect = async () => {
    if (!token) {
      console.error('No token available');
      return;
    }

    try {
      // Request microphone permission first
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        alert('Please allow microphone access to use voice features');
        return;
      }

      setConnectionStatus('connecting');
      
      // Create and connect to LiveKit room
      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Set up event listeners
      newRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('Track subscribed:', track.kind);
        if (track.kind === Track.Kind.Audio) {
          const audioElement = audioElementRef.current;
          if (audioElement) {
            track.attach(audioElement);
            setAudioTrack(track);
            setIsSpeaking(true);
            console.log('Agent audio track attached');
          }
        }
      });

      newRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
        console.log('Track unsubscribed');
        if (track === audioTrack) {
          track.detach();
          setAudioTrack(null);
          setIsSpeaking(false);
        }
      });

      newRoom.on(RoomEvent.Disconnected, () => {
        console.log('Room disconnected');
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setAudioTrack(null);
        setIsSpeaking(false);
      });

      newRoom.on(RoomEvent.Connected, () => {
        console.log('Room connected, enabling audio');
        // Enable microphone after connecting
        newRoom.localParticipant.setMicrophoneEnabled(true);
      });

      // Connect to the room
      await newRoom.connect(livekitUrl, token);
      
      roomRef.current = newRoom;
      setIsConnected(true);
      setConnectionStatus('connected');
      setIsMuted(false); // Start with microphone enabled
      
      console.log('Connected to LiveKit room successfully');
    } catch (error) {
      console.error('Failed to connect to LiveKit room:', error);
      setConnectionStatus('error');
      alert('Failed to connect to voice agent. Please make sure your agent is running in dev mode.');
    }
  };

  const handleDisconnect = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
    }
    setIsConnected(false);
    setConnectionStatus('disconnected');
    setSelectedAgent(null);
    setMessages([]);
    setAudioTrack(null);
    setIsSpeaking(false);
  };

  const toggleMute = () => {
    if (roomRef.current) {
      if (isMuted) {
        // Unmute by enabling the microphone track
        roomRef.current.localParticipant.setMicrophoneEnabled(true);
      } else {
        // Mute by disabling the microphone track
        roomRef.current.localParticipant.setMicrophoneEnabled(false);
      }
      setIsMuted(!isMuted);
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
      setMessages([...messages, newMessage]);
      setInputMessage('');

      // Simulate agent response
      setTimeout(() => {
        const agentResponse = {
          id: Date.now() + 1,
          text: `Hello! I'm ${selectedAgent?.name}, ${selectedAgent?.title}. ${selectedAgent?.description}. How can I help you today?`,
          sender: 'agent',
          timestamp: new Date().toLocaleTimeString()
        };
        setMessages(prev => [...prev, agentResponse]);
        setIsSpeaking(true);
        setTimeout(() => setIsSpeaking(false), 3000);
      }, 1000);
    }
  };

  const handleAgentSelect = (agent) => {
    if (agent.status === 'available') {
      setSelectedAgent(agent);
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Hidden audio element for agent voice */}
      <audio ref={audioElementRef} autoPlay playsInline />
      
      {/* Sidebar */}
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
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-400">Settings</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {selectedAgent ? (
          <>
            {/* Header */}
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
                      onClick={handleConnect}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center space-x-2 transition-colors"
                    >
                      <Phone className="w-4 h-4" />
                      <span>Connect</span>
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

            {/* Chat Area */}
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
                        message.sender === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-white'
                      }`}>
                        <p className="text-sm">{message.text}</p>
                        <p className="text-xs opacity-70 mt-1">{message.timestamp}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Voice Controls */}
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

                  {/* Audio Visualization */}
                  <div className="flex-1 flex items-center justify-center space-x-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`w-1 bg-blue-500 rounded-full audio-bar ${
                          isSpeaking ? '' : 'opacity-30'
                        }`}
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

                {/* Status Information */}
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

                {/* Text Input */}
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
                      isConnected 
                        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed'
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
