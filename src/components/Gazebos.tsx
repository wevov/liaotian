// src/components/Gazebos.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, Profile, Gazebo, GazeboChannel, GazeboMessage, uploadMedia } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Plus, Hash, Volume2, Mic, MicOff, PhoneOff, Send, Paperclip, 
  Users, Settings, X, Image as ImageIcon, Menu, Trash2, MoreVertical,
  Play, Pause, FileText, Link as LinkIcon, Video
} from 'lucide-react';
import Peer from 'peerjs';

// --- AudioPlayer (Ported from Messages.tsx for consistency) ---
const AudioPlayer = ({ src, isOutgoing }: { src: string, isOutgoing: boolean }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const primaryColor = isOutgoing ? 'rgb(var(--color-text-on-primary))' : 'rgb(var(--color-accent))';
  const trackColor = isOutgoing ? 'rgba(var(--color-text-on-primary), 0.3)' : 'rgb(var(--color-border))';

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const setAudioData = () => setDuration(audio.duration);
    const setAudioTime = () => setCurrentTime(audio.currentTime);
    const togglePlay = () => setIsPlaying(!audio.paused);
    const onEnd = () => { setIsPlaying(false); audio.currentTime = 0; };

    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('play', togglePlay);
    audio.addEventListener('pause', togglePlay);
    audio.addEventListener('ended', onEnd);

    return () => {
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('play', togglePlay);
      audio.removeEventListener('pause', togglePlay);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  return (
    <div className="flex items-center space-x-2 w-full max-w-[200px] mb-1">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button 
        onClick={() => isPlaying ? audioRef.current?.pause() : audioRef.current?.play()}
        className={`flex-shrink-0 p-1.5 rounded-full transition-colors`}
        style={{ backgroundColor: isOutgoing ? 'rgba(255,255,255,0.2)' : 'rgba(var(--color-surface-hover))' }}
      >
        {isPlaying ? <Pause size={14} fill={primaryColor} color={primaryColor} /> : <Play size={14} fill={primaryColor} color={primaryColor} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1 rounded-full w-full relative" style={{ background: trackColor }}>
           <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: `${(currentTime / (duration || 1)) * 100}%`, background: primaryColor }} />
        </div>
      </div>
    </div>
  );
};

type VoicePeer = {
  peerId: string;
  stream: MediaStream;
  user?: Profile;
};

export const Gazebos = () => {
  const { user } = useAuth();
  
  // --- UI State ---
  const [gazebos, setGazebos] = useState<Gazebo[]>([]);
  const [activeGazebo, setActiveGazebo] = useState<Gazebo | null>(null);
  const [channels, setChannels] = useState<GazeboChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<GazeboChannel | null>(null);
  const [messages, setMessages] = useState<GazeboMessage[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGuildSettings, setShowGuildSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [membersSidebarOpen, setMembersSidebarOpen] = useState(false);

  // --- Message Input State ---
  const [inputText, setInputText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [mediaInputMode, setMediaInputMode] = useState<'file' | 'url' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // --- Voice Recording State ---
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // --- Voice Chat State ---
  const [myPeer, setMyPeer] = useState<Peer | null>(null);
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [voicePeers, setVoicePeers] = useState<VoicePeer[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<string | null>(null);
  const peersRef = useRef<{ [key: string]: Peer.MediaConnection }>({});

  // Scroll ref
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- 1. FETCH GAZEBOS ---
  useEffect(() => {
    if (!user) return;
    const fetchGazebos = async () => {
      const { data: memberData } = await supabase
        .from('gazebo_members')
        .select('gazebo_id')
        .eq('user_id', user.id);
      
      if (memberData && memberData.length > 0) {
        const ids = memberData.map(m => m.gazebo_id);
        const { data: gData } = await supabase
          .from('gazebos')
          .select('*')
          .in('id', ids)
          .order('created_at', { ascending: true });
        setGazebos(gData || []);
      }
    };
    fetchGazebos();
  }, [user]);

  // --- 2. SELECT GAZEBO & FETCH CHANNELS ---
  useEffect(() => {
    if (!activeGazebo) {
      setChannels([]);
      setActiveChannel(null);
      return;
    }

    setMobileMenuOpen(false); // Close mobile menu on selection

    const fetchDetails = async () => {
      // Fetch Channels
      const { data: cData } = await supabase
        .from('gazebo_channels')
        .select('*')
        .eq('gazebo_id', activeGazebo.id)
        .order('created_at', { ascending: true });
      
      setChannels(cData || []);
      
      // Default selection logic
      const defaultText = cData?.find(c => c.type === 'text');
      if (defaultText && (!activeChannel || activeChannel.gazebo_id !== activeGazebo.id)) {
        setActiveChannel(defaultText);
      }

      // Fetch Members
      const { data: mData } = await supabase
        .from('gazebo_members')
        .select('user_id, profiles(*)')
        .eq('gazebo_id', activeGazebo.id);
      
      if (mData) {
        const mapped = mData.map((m: any) => m.profiles).filter(Boolean);
        setMembers(mapped);
      }
    };

    fetchDetails();
  }, [activeGazebo]);

  // --- 3. TEXT CHAT LOGIC ---
  useEffect(() => {
    if (!activeChannel || activeChannel.type !== 'text') return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('gazebo_messages')
        .select(`*, sender:profiles(*)`)
        .eq('channel_id', activeChannel.id)
        .order('created_at', { ascending: false })
        .limit(50);
      
      // Reverse so oldest is first (top), newest is last (bottom)
      if (data) setMessages(data.reverse());
      setTimeout(() => messagesEndRef.current?.scrollIntoView(), 100);
    };

    fetchMessages();

    const channel = supabase
      .channel(`gazebo_chat:${activeChannel.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'gazebo_messages',
        filter: `channel_id=eq.${activeChannel.id}`
      }, async (payload) => {
         const { data: senderData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', payload.new.user_id)
            .single();
         const newMsg = { ...payload.new, sender: senderData } as GazeboMessage;
         setMessages(prev => [...prev, newMsg]);
         setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeChannel]);


  // --- INPUT & UPLOAD HANDLERS ---

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !file && !remoteUrl.trim()) || !activeChannel || !user) return;

    setIsUploading(true);
    setUploadProgress(0);

    let mediaUrl = '';
    let mediaType = 'text';

    // 1. Handle File Upload
    if (file) {
        if (file.type.startsWith('audio/')) mediaType = 'audio';
        const res = await uploadMedia(file, 'messages', (p) => setUploadProgress(p));
        if (res) {
            mediaUrl = res.url;
            mediaType = mediaType === 'audio' ? 'audio' : res.type;
        }
    } 
    // 2. Handle URL
    else if (remoteUrl.trim()) {
        mediaUrl = remoteUrl.trim();
        if (mediaUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i)) mediaType = 'image';
        else if (mediaUrl.match(/\.(mp4|webm|mov|avi)$/i)) mediaType = 'video';
        else if (mediaUrl.match(/\.(mp3|wav|ogg|m4a)$/i)) mediaType = 'audio';
        else mediaType = 'document';
    }

    await supabase.from('gazebo_messages').insert({
      channel_id: activeChannel.id,
      user_id: user.id,
      content: inputText,
      media_url: mediaUrl,
      media_type: mediaType
    });

    setInputText('');
    setFile(null);
    setRemoteUrl('');
    setIsUploading(false);
    setMediaInputMode(null);
  };

  // Voice Recording
  const toggleRecording = () => {
    if (isRecording) {
        mediaRecorderRef.current?.stop();
    } else {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];
            recorder.ondataavailable = e => audioChunksRef.current.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const audioFile = new File([blob], "voice_msg.webm", { type: 'audio/webm' });
                setFile(audioFile);
                setIsRecording(false);
                stream.getTracks().forEach(t => t.stop());
            };
            recorder.start();
            setIsRecording(true);
            setFile(null); setRemoteUrl('');
        }).catch(err => alert("Microphone access denied"));
    }
  };

  const getPreview = () => {
    if (file) {
        const url = URL.createObjectURL(file);
        if (file.type.startsWith('image')) return <img src={url} className="h-16 rounded" />;
        if (file.type.startsWith('audio')) return <div className="text-xs"><AudioPlayer src={url} isOutgoing={true} /></div>;
        return <div className="text-xs flex gap-1 items-center"><FileText size={12}/> {file.name}</div>;
    }
    if (remoteUrl) return <div className="text-xs flex gap-1 items-center"><LinkIcon size={12}/> {remoteUrl}</div>;
    return null;
  };


  // --- 4. VOICE MESH NETWORK ---
  useEffect(() => {
    if(!user) return;
    const peer = new Peer(user.id);
    setMyPeer(peer);
    peer.on('call', (call) => {
       navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then((stream) => {
          call.answer(stream);
          call.on('stream', (remoteStream) => {
             setVoicePeers(prev => {
                if (prev.find(p => p.peerId === call.peer)) return prev;
                return [...prev, { peerId: call.peer, stream: remoteStream }];
             });
          });
       });
    });
    return () => { peer.destroy(); }
  }, [user]);

  const joinVoiceChannel = async (channelId: string) => {
    if (!myPeer || !user) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setMyStream(stream);
        setActiveVoiceChannelId(channelId);
        setIsMuted(false);

        const channel = supabase.channel(`voice_signaling:${channelId}`, { config: { presence: { key: user.id } } });
        channel.on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            Object.keys(state).forEach(userId => {
                if (userId !== user.id && !peersRef.current[userId]) {
                    const call = myPeer.call(userId, stream);
                    peersRef.current[userId] = call;
                    call.on('stream', (remoteStream) => {
                        setVoicePeers(prev => prev.find(p => p.peerId === userId) ? prev : [...prev, { peerId: userId, stream: remoteStream }]);
                    });
                    call.on('close', () => {
                        setVoicePeers(prev => prev.filter(p => p.peerId !== userId));
                        delete peersRef.current[userId];
                    });
                }
            });
        }).subscribe(async (status) => {
             if(status === 'SUBSCRIBED') await channel.track({ online_at: new Date().toISOString() });
        });
    } catch (err) { console.error(err); }
  };

  const leaveVoiceChannel = () => {
      myStream?.getTracks().forEach(t => t.stop());
      setMyStream(null);
      setVoicePeers([]);
      setActiveVoiceChannelId(null);
      Object.values(peersRef.current).forEach(call => call.close());
      peersRef.current = {};
      supabase.removeAllChannels(); 
  };


  // --- 5. SETTINGS & ACTIONS ---
  const createGazebo = async (name: string, type: 'group' | 'guild') => {
     if(!user) return;
     const { data: gData } = await supabase.from('gazebos').insert({
         name, type, owner_id: user.id,
         icon_url: `https://ui-avatars.com/api/?name=${name}&background=random`
     }).select().single();
     if(!gData) return;

     await supabase.from('gazebo_members').insert({ gazebo_id: gData.id, user_id: user.id, role: 'owner' });
     await supabase.from('gazebo_channels').insert([
         { gazebo_id: gData.id, name: 'general', type: 'text' },
         ...(type === 'guild' ? [{ gazebo_id: gData.id, name: 'General Voice', type: 'voice' }] : [])
     ]);

     setGazebos(prev => [...prev, gData]);
     setShowCreateModal(false);
  };

  const handleCreateChannel = async (name: string, type: 'text'|'voice') => {
      if (!activeGazebo) return;
      const { data } = await supabase.from('gazebo_channels').insert({
          gazebo_id: activeGazebo.id, name, type
      }).select().single();
      if (data) setChannels(prev => [...prev, data]);
  };

  const handleDeleteChannel = async (id: string) => {
      await supabase.from('gazebo_channels').delete().eq('id', id);
      setChannels(prev => prev.filter(c => c.id !== id));
      if (activeChannel?.id === id) setActiveChannel(null);
  };


  // --- RENDER HELPERS ---
  const isOwner = activeGazebo?.owner_id === user?.id;

  return (
    <div className="flex h-full w-full bg-[rgb(var(--color-background))] overflow-hidden relative text-[rgb(var(--color-text))]">
      
      {/* --- 1. SERVER RAIL (Leftmost) --- */}
      <div className="w-[72px] flex flex-col items-center py-3 gap-2 bg-[rgb(var(--color-surface))] border-r border-[rgb(var(--color-border))] z-30 flex-shrink-0">
         {gazebos.map(g => (
            <button
               key={g.id}
               onClick={() => setActiveGazebo(g)}
               className={`relative group w-12 h-12 rounded-[24px] hover:rounded-[16px] transition-all duration-200 overflow-hidden ${activeGazebo?.id === g.id ? 'rounded-[16px] ring-2 ring-[rgb(var(--color-primary))]' : ''}`}
            >
                <img src={g.icon_url} alt={g.name} className="w-full h-full object-cover" />
            </button>
         ))}
         <div className="w-8 h-[2px] bg-[rgb(var(--color-border))] rounded-full my-1" />
         <button 
            onClick={() => setShowCreateModal(true)}
            className="w-12 h-12 rounded-[24px] bg-[rgb(var(--color-surface-hover))] text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary))] hover:text-white transition-all flex items-center justify-center"
         >
            <Plus size={24} />
         </button>
      </div>


      {/* --- 2. CHANNEL RAIL (Contextual - Hidden for Groups) --- */}
      {activeGazebo && activeGazebo.type === 'guild' && (
        <div className={`absolute md:relative w-64 bg-[rgb(var(--color-surface))] flex flex-col border-r border-[rgb(var(--color-border))] z-20 h-full transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-[72px]' : '-translate-x-full md:translate-x-0'} left-0 md:left-auto`}>
            <div className="h-12 border-b border-[rgb(var(--color-border))] flex items-center justify-between px-4 font-bold truncate shadow-sm">
                <span className="truncate">{activeGazebo.name}</span>
                {isOwner && <button onClick={() => setShowGuildSettings(true)}><Settings size={16}/></button>}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                <div className="flex items-center justify-between px-2 pt-2 mb-1">
                    <span className="text-xs font-semibold text-[rgb(var(--color-text-secondary))] uppercase">Text Channels</span>
                    {isOwner && <button onClick={() => handleCreateChannel(`channel-${channels.length}`, 'text')} className="text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))]"><Plus size={14}/></button>}
                </div>
                {channels.filter(c => c.type === 'text').map(c => (
                    <div key={c.id} className="group flex items-center pr-2 rounded-md hover:bg-[rgb(var(--color-surface-hover))]">
                        <button
                            onClick={() => { setActiveChannel(c); setMobileMenuOpen(false); }}
                            className={`flex-1 flex items-center px-2 py-1.5 text-sm transition ${activeChannel?.id === c.id ? 'bg-[rgba(var(--color-primary),0.1)] text-[rgb(var(--color-text))] rounded-md' : 'text-[rgb(var(--color-text-secondary))]'}`}
                        >
                            <Hash size={16} className="mr-2 opacity-70" /> {c.name}
                        </button>
                        {isOwner && activeChannel?.id !== c.id && (
                            <button onClick={() => handleDeleteChannel(c.id)} className="hidden group-hover:block text-red-500 p-1"><X size={12}/></button>
                        )}
                    </div>
                ))}

                <div className="flex items-center justify-between px-2 pt-4 mb-1">
                    <span className="text-xs font-semibold text-[rgb(var(--color-text-secondary))] uppercase">Voice Channels</span>
                    {isOwner && <button onClick={() => handleCreateChannel(`Voice-${channels.length}`, 'voice')} className="text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))]"><Plus size={14}/></button>}
                </div>
                {channels.filter(c => c.type === 'voice').map(c => (
                    <div key={c.id}>
                        <button
                            onClick={() => { 
                                if(activeVoiceChannelId === c.id) return;
                                if(activeVoiceChannelId) leaveVoiceChannel();
                                joinVoiceChannel(c.id);
                                setActiveChannel(c); 
                            }}
                            className={`w-full flex items-center px-2 py-1.5 rounded-md text-sm transition ${activeVoiceChannelId === c.id ? 'bg-[rgba(var(--color-accent),0.1)] text-[rgb(var(--color-accent))]' : 'text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-surface-hover))] hover:text-[rgb(var(--color-text))]'}`}
                        >
                            <Volume2 size={16} className="mr-2 opacity-70" /> {c.name}
                        </button>
                        {activeVoiceChannelId === c.id && (
                            <div className="pl-8 py-1 space-y-1">
                                <div className="flex items-center gap-2 text-xs text-[rgb(var(--color-text))]">
                                    <img src={user?.user_metadata?.avatar_url} className="w-5 h-5 rounded-full" alt="Me" />
                                    <span>You</span>
                                </div>
                                {voicePeers.map(p => (
                                     <div key={p.peerId} className="flex items-center gap-2 text-xs text-[rgb(var(--color-text))]">
                                        <div className="w-5 h-5 rounded-full bg-green-200 flex items-center justify-center text-[10px]">?</div>
                                        <span className="opacity-70">User</span>
                                        <audio autoPlay ref={el => { if(el) el.srcObject = p.stream }} />
                                     </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            {activeVoiceChannelId && (
                <div className="p-2 bg-[rgb(var(--color-surface-hover))] border-t border-[rgb(var(--color-border))]">
                    <div className="text-xs text-green-600 font-bold mb-2 flex items-center gap-1"><Volume2 size={12} /> Voice Connected</div>
                    <div className="flex items-center justify-between">
                        <button onClick={() => setIsMuted(!isMuted)} className="p-2 rounded-md hover:bg-[rgb(var(--color-surface))]">
                            {isMuted ? <MicOff size={18} className="text-red-500"/> : <Mic size={18} />}
                        </button>
                        <button onClick={leaveVoiceChannel} className="p-2 rounded-md hover:bg-[rgb(var(--color-surface))]"><PhoneOff size={18} /></button>
                    </div>
                </div>
            )}
        </div>
      )}


      {/* --- 3. MAIN CHAT AREA --- */}
      <div className="flex-1 flex flex-col bg-[rgb(var(--color-background))] min-w-0 relative">
         {!activeGazebo ? (
             <div className="flex-1 flex items-center justify-center text-[rgb(var(--color-text-secondary))] flex-col">
                 <Users size={64} className="mb-4 opacity-20" />
                 <p>Select a server to start.</p>
             </div>
         ) : !activeChannel ? (
             <div className="flex-1 flex items-center justify-center text-[rgb(var(--color-text-secondary))]"><p>Loading...</p></div>
         ) : activeChannel.type === 'voice' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[rgb(var(--color-text))]">
                <h2 className="text-2xl font-bold mb-2">{activeChannel.name}</h2>
                <div className="flex flex-wrap gap-4 justify-center p-8">
                    <div className={`w-32 h-32 rounded-full border-4 ${activeVoiceChannelId === activeChannel.id ? 'border-green-500' : 'border-gray-500'} flex items-center justify-center relative shadow-lg`}>
                        <img src={user?.user_metadata?.avatar_url} className="w-full h-full rounded-full object-cover opacity-50" />
                        <span className="absolute font-bold">You</span>
                    </div>
                    {activeVoiceChannelId === activeChannel.id && voicePeers.map(p => (
                        <div key={p.peerId} className="w-32 h-32 rounded-full bg-gray-700 border-4 border-green-500 flex items-center justify-center"><span className="font-bold">User</span></div>
                    ))}
                </div>
            </div>
         ) : (
             <>
                {/* HEADER */}
                <div className="h-12 border-b border-[rgb(var(--color-border))] flex items-center px-4 bg-[rgb(var(--color-surface))] shadow-sm z-10 justify-between">
                    <div className="flex items-center">
                        {/* Mobile Hamburger for Guilds */}
                        {activeGazebo.type === 'guild' && (
                            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden mr-3 text-[rgb(var(--color-text-secondary))]">
                                <Menu size={24} />
                            </button>
                        )}
                        
                        {activeGazebo.type === 'group' ? (
                            <span className="font-bold text-[rgb(var(--color-text))]">{activeGazebo.name}</span>
                        ) : (
                            <>
                                <Hash size={20} className="text-[rgb(var(--color-text-secondary))] mr-2" />
                                <span className="font-bold text-[rgb(var(--color-text))]">{activeChannel.name}</span>
                            </>
                        )}
                    </div>
                    {activeGazebo.type === 'guild' && (
                        <button onClick={() => setMembersSidebarOpen(!membersSidebarOpen)} className="lg:hidden text-[rgb(var(--color-text-secondary))]">
                            <Users size={24} />
                        </button>
                    )}
                </div>

                {/* MESSAGES LIST */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
                    {messages.map(msg => {
                        const isMe = msg.user_id === user?.id;
                        return (
                            <div key={msg.id} className={`flex gap-3 group ${isMe ? 'flex-row-reverse' : ''}`}>
                                <img src={msg.sender?.avatar_url || `https://ui-avatars.com/api/?name=${msg.sender?.username}`} className="w-10 h-10 rounded-full object-cover mt-1" />
                                <div className={`max-w-[80%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                    <div className="flex items-baseline gap-2 mb-1">
                                        <span className="font-bold text-sm">{msg.sender?.display_name || 'Unknown'}</span>
                                        <span className="text-[10px] text-[rgb(var(--color-text-secondary))]">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                    </div>
                                    
                                    <div className={`px-3 py-2 rounded-xl shadow-sm ${isMe ? 'bg-[rgb(var(--color-accent))] text-[rgb(var(--color-text-on-primary))] rounded-tr-none' : 'bg-[rgb(var(--color-surface))] border border-[rgb(var(--color-border))] rounded-tl-none'}`}>
                                        {msg.media_url && (
                                            <div className="mb-2">
                                                {msg.media_type === 'image' && <img src={msg.media_url} className="max-h-60 rounded-lg" />}
                                                {msg.media_type === 'video' && <video src={msg.media_url} controls className="max-h-60 rounded-lg" />}
                                                {msg.media_type === 'audio' && <AudioPlayer src={msg.media_url} isOutgoing={isMe} />}
                                                {msg.media_type === 'document' && (
                                                    <a href={msg.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline"><FileText size={14}/> File</a>
                                                )}
                                            </div>
                                        )}
                                        <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* INPUT AREA (Replicating Messages.tsx) */}
                <div className="p-4 bg-[rgb(var(--color-surface))] border-t border-[rgb(var(--color-border))]">
                    {/* Preview */}
                    {(file || remoteUrl) && (
                        <div className="flex items-center gap-2 mb-2 p-2 bg-[rgb(var(--color-surface-hover))] rounded-lg w-fit">
                            {getPreview()}
                            <button onClick={() => { setFile(null); setRemoteUrl(''); setMediaInputMode(null); }}><X size={14}/></button>
                        </div>
                    )}
                    
                    {/* URL Input Mode */}
                    {mediaInputMode === 'url' && !file && !remoteUrl && (
                        <div className="flex items-center gap-2 mb-2">
                             <input type="url" placeholder="Paste URL..." className="flex-1 px-3 py-1 text-sm border rounded bg-[rgb(var(--color-background))]" onChange={e => setRemoteUrl(e.target.value)} />
                             <button onClick={() => setMediaInputMode(null)}><X size={16}/></button>
                        </div>
                    )}

                    {/* Main Toolbar */}
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2 relative">
                        <div className="relative">
                            <button type="button" onClick={() => setShowMediaMenu(!showMediaMenu)} className="p-2 rounded-full text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-surface-hover))]">
                                <Plus size={20} />
                            </button>
                            {showMediaMenu && (
                                <div className="absolute bottom-full left-0 mb-2 w-40 bg-[rgb(var(--color-surface))] border border-[rgb(var(--color-border))] rounded-lg shadow-xl z-30 overflow-hidden">
                                    <button type="button" onClick={() => { fileInputRef.current?.click(); setShowMediaMenu(false); setMediaInputMode('file'); }} className="w-full text-left p-3 hover:bg-[rgb(var(--color-surface-hover))] flex items-center gap-2 text-sm"><Paperclip size={16}/> Upload File</button>
                                    <button type="button" onClick={() => { setMediaInputMode('url'); setShowMediaMenu(false); }} className="w-full text-left p-3 hover:bg-[rgb(var(--color-surface-hover))] flex items-center gap-2 text-sm"><LinkIcon size={16}/> From URL</button>
                                </div>
                            )}
                        </div>

                        <input ref={fileInputRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />

                        <button type="button" onClick={toggleRecording} className={`p-2 rounded-full transition ${isRecording ? 'text-red-500 animate-pulse' : 'text-[rgb(var(--color-text-secondary))]'}`}>
                            <Mic size={20} />
                        </button>

                        <input 
                            type="text" 
                            className="flex-1 px-4 py-2 bg-[rgb(var(--color-surface-hover))] rounded-full focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
                            placeholder={isRecording ? "Recording..." : `Message ${activeGazebo.type === 'group' ? '' : '#' + activeChannel.name}`}
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            disabled={isRecording}
                        />
                        <button type="submit" disabled={!inputText && !file && !remoteUrl} className="text-[rgb(var(--color-primary))] disabled:opacity-50 p-2"><Send size={20} /></button>
                    </form>
                    {isUploading && <div className="h-1 bg-[rgb(var(--color-primary))] mt-2 transition-all" style={{ width: `${uploadProgress}%` }} />}
                </div>
             </>
         )}
      </div>
      
      {/* --- 4. MEMBERS RAIL (Hidden on mobile unless toggled) --- */}
      {activeGazebo && activeGazebo.type === 'guild' && (
         <div className={`absolute lg:relative w-60 bg-[rgb(var(--color-surface))] border-l border-[rgb(var(--color-border))] h-full z-20 transition-transform duration-300 right-0 ${membersSidebarOpen ? 'translate-x-0 shadow-xl' : 'translate-x-full lg:translate-x-0'}`}>
             <div className="p-3">
                 <h3 className="text-xs font-semibold text-[rgb(var(--color-text-secondary))] uppercase mb-3">Members — {members.length}</h3>
                 {members.map(m => (
                     <div key={m.id} className="flex items-center gap-2 mb-3 opacity-90 hover:opacity-100 cursor-pointer">
                         <div className="relative">
                            <img src={m.avatar_url || `https://ui-avatars.com/api/?name=${m.username}`} className="w-8 h-8 rounded-full bg-gray-200 object-cover" />
                            <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[rgb(var(--color-surface))] ${new Date().getTime() - new Date(m.last_seen || 0).getTime() < 5 * 60 * 1000 ? 'bg-green-500' : 'bg-gray-400'}`} />
                         </div>
                         <span className="text-sm font-medium text-[rgb(var(--color-text))] truncate">{m.display_name}</span>
                     </div>
                 ))}
             </div>
         </div>
      )}

      {/* --- MODALS --- */}

      {/* Create Gazebo Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
            <div className="bg-[rgb(var(--color-surface))] p-6 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">Create a Gazebo</h2>
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => createGazebo('My Group', 'group')} className="p-4 border border-[rgb(var(--color-border))] rounded hover:bg-[rgb(var(--color-surface-hover))] text-center">
                        <Users className="mx-auto mb-2 text-[rgb(var(--color-primary))]" />
                        <div className="font-bold">Group Chat</div>
                    </button>
                    <button onClick={() => createGazebo('My Server', 'guild')} className="p-4 border border-[rgb(var(--color-border))] rounded hover:bg-[rgb(var(--color-surface-hover))] text-center">
                        <Settings className="mx-auto mb-2 text-[rgb(var(--color-accent))]" />
                        <div className="font-bold">Guild</div>
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Guild Settings Modal */}
      {showGuildSettings && activeGazebo && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowGuildSettings(false)}>
              <div className="bg-[rgb(var(--color-surface))] p-6 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-bold">Settings: {activeGazebo.name}</h2>
                      <button onClick={() => setShowGuildSettings(false)}><X size={20}/></button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="text-sm font-bold text-[rgb(var(--color-text-secondary))]">Create Channel</label>
                          <div className="flex gap-2 mt-1">
                              <input id="new-channel" type="text" placeholder="channel-name" className="flex-1 border rounded px-2 py-1 bg-transparent" />
                              <button onClick={() => {
                                  const el = document.getElementById('new-channel') as HTMLInputElement;
                                  if(el.value) { handleCreateChannel(el.value, 'text'); el.value=''; }
                              }} className="bg-[rgb(var(--color-primary))] text-white px-3 rounded">Add</button>
                          </div>
                      </div>
                      <div>
                           <label className="text-sm font-bold text-[rgb(var(--color-text-secondary))]">Manage Channels</label>
                           <div className="max-h-40 overflow-y-auto border rounded mt-1">
                               {channels.map(c => (
                                   <div key={c.id} className="flex justify-between items-center p-2 hover:bg-[rgb(var(--color-surface-hover))]">
                                       <span className="text-sm">#{c.name}</span>
                                       <button onClick={() => handleDeleteChannel(c.id)} className="text-red-500"><Trash2 size={14}/></button>
                                   </div>
                               ))}
                           </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
