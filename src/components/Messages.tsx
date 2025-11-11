// src/components/Messages.tsx
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase, Message, Profile, uploadMedia } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Send, BadgeCheck, Search, ArrowLeft, X, Paperclip, FileText, Link, CornerUpLeft, MessageSquare } from 'lucide-react';

// --- Utility Functions ---

const IS_ONLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds

const isOnline = (lastSeen: string | null): boolean => {
  if (!lastSeen) return false;
  const lastSeenTime = new Date(lastSeen).getTime();
  const now = new Date().getTime();
  return (now - lastSeenTime) < IS_ONLINE_THRESHOLD;
};

const formatTime = (timestamp: string): string => {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (timestamp: string): string => {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// --- Helper Components ---

// Component to display user avatar with an optional online status indicator
const AvatarWithStatus = ({ profile, size = '10' }: { profile: Profile, size?: string }) => {
  const online = isOnline(profile.last_seen);
  return (
    <div className={`relative w-${size} h-${size} flex-shrink-0`}>
      <img
        src={profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.username}`}
        className={`w-full h-full rounded-full object-cover`}
        alt={`${profile.display_name}'s avatar`}
      />
      {online && (
        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[rgb(var(--color-surface))]"></div>
      )}
    </div>
  );
};

// Component to display the replied-to message snippet
const RepliedMessageSnippet = ({ message, isOwn }: { message: Message, isOwn: boolean }) => {
    // Determine desaturated background color based on theme
    const bgColor = isOwn ? 'rgba(var(--color-primary), 0.1)' : 'rgba(var(--color-border), 0.5)';
    const textColor = isOwn ? 'rgba(var(--color-text), 0.7)' : 'rgba(var(--color-text), 0.7)';

    return (
        <div 
            className="p-2 mb-1 rounded-lg text-sm italic overflow-hidden break-words"
            style={{ backgroundColor: bgColor, color: textColor }}
        >
            <p className="font-semibold truncate">
                {message.profiles?.display_name || 'User'}
            </p>
            <p className="line-clamp-2">
                {message.content || (message.media_url ? '[Media Content]' : '[Empty Message]')}
            </p>
        </div>
    );
};

// --- Main Component ---

export const Messages = () => {
  const [conversations, setConversations] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reply System State
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  
  const typingChannelRef = useRef<any>(null);
  const outgoingTypingChannelRef = useRef<any>(null);

  const { user } = useAuth();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversations = useCallback(async () => {
    if (!user?.id) return;
    // Fetch profiles the current user has exchanged messages with
    const { data, error } = await supabase.rpc('get_conversation_partners', { user_id_input: user.id });

    if (error) {
      console.error('Error fetching conversations:', error);
    } else {
      setConversations(data || []);
    }
  }, [user?.id]);

  useEffect(() => {
    loadConversations();

    // Subscribe to profile changes for last_seen updates (online status)
    const profileChannel = supabase
      .channel('public:profiles_last_seen')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const updatedProfile = payload.new as Profile;
          
          // Update conversations list for online status
          setConversations(prev => prev.map(p => 
            p.id === updatedProfile.id ? { ...p, last_seen: updatedProfile.last_seen } : p
          ));

          // Update selected user's online status
          if (selectedUser && selectedUser.id === updatedProfile.id) {
             setSelectedUser(prev => prev ? { ...prev, last_seen: updatedProfile.last_seen } : null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [user?.id, loadConversations, selectedUser]);


  const getMessages = useCallback(async (targetUserId: string) => {
    if (!user?.id || !targetUserId) return;

    // Load messages and joined reply_to_message content
    const { data: initialMessages, error } = await supabase
      .from('messages')
      .select(`
        *,
        reply_to_message:messages!messages_reply_to_id_fkey(
          id, content, media_url, profiles(display_name)
        )
      `)
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: true }) as { data: (Message & { reply_to_message: Message | null })[] | null, error: any };
    
    if (error) {
      console.error('Error fetching messages:', error);
    } else {
      setMessages(initialMessages || []);
      // If there's a selected user, update their last_seen
      await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', user.id);
      
    }
  }, [user?.id]);

  useEffect(() => {
    if (selectedUser?.id) {
      getMessages(selectedUser.id);
      const channelId = `chat:${Math.min(user.id, selectedUser.id)}_${Math.max(user.id, selectedUser.id)}`;

      // Setup Typing Indicator Channel
      if (typingChannelRef.current) {
        supabase.removeChannel(typingChannelRef.current);
      }
      typingChannelRef.current = supabase.channel(`typing-status-${channelId}`);
      
      typingChannelRef.current
        .on('broadcast', { event: 'typing' }, (payload) => {
          if (payload.payload.senderId === selectedUser.id) {
            setIsOtherTyping(true);
            if (typingTimeoutRef.current) {
              clearTimeout(typingTimeoutRef.current);
            }
            typingTimeoutRef.current = setTimeout(() => {
              setIsOtherTyping(false);
            }, 1500); // Hide typing after 1.5s
          }
        })
        .subscribe();
      
      // Setup Outgoing Typing Channel (for broadcasting 'typing' to the other user)
      if (outgoingTypingChannelRef.current) {
        supabase.removeChannel(outgoingTypingChannelRef.current);
      }
      outgoingTypingChannelRef.current = supabase.channel(`typing-status-${channelId}`);
      outgoingTypingChannelRef.current.subscribe();

      // Setup Realtime Messages Channel
      const messageChannel = supabase
        .channel(`messages-channel-${channelId}`)
        .on('postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, 
          async (payload) => {
            if (payload.new.sender_id === selectedUser.id) {
                // Manually fetch the new message with the reply_to_message join
                const { data: newMessage, error } = await supabase
                    .from('messages')
                    .select(`
                      *,
                      reply_to_message:messages!messages_reply_to_id_fkey(
                        id, content, media_url, profiles(display_name)
                      )
                    `)
                    .eq('id', payload.new.id)
                    .single();

                if (!error && newMessage) {
                    setMessages((prev) => [...prev, newMessage as Message]);
                    // Update user's last_seen whenever a message is received
                    await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', user.id);
                }
            }
            // Message sent by self is already added in handleSubmit, no need to listen for it here.
          }
        )
        .subscribe();
      
      return () => {
        supabase.removeChannel(typingChannelRef.current);
        supabase.removeChannel(outgoingTypingChannelRef.current);
        supabase.removeChannel(messageChannel);
      };
    }
  }, [selectedUser?.id, user?.id, getMessages]);


  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  // Typing Indicator Logic
  const handleTyping = () => {
    setContent(prevContent => {
      // Broadcast typing status when content changes
      if (outgoingTypingChannelRef.current?.state === 'joined') {
        outgoingTypingChannelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { senderId: user.id }
        });
      }
      return (prevContent); // Return the content for the state update
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !file && !remoteUrl.trim() || isUploading || !selectedUser) return;

    let media_url = remoteUrl.trim();
    setIsUploading(true);

    if (file) {
      try {
        const url = await uploadMedia(file, 'message_media', setUploadProgress);
        media_url = url;
      } catch (error) {
        console.error('File upload failed:', error);
        setIsUploading(false);
        return;
      }
    }

    const newMessage: Partial<Message> = {
      sender_id: user.id,
      receiver_id: selectedUser.id,
      content: content.trim(),
      media_url: media_url || null,
      reply_to_id: replyToId, // Include reply_to_id
      read: false, // Messages are unread by default
    };

    const { data, error } = await supabase
      .from('messages')
      .insert(newMessage)
      .select(`
        *,
        reply_to_message:messages!messages_reply_to_id_fkey(
          id, content, media_url, profiles(display_name)
        )
      `)
      .single();

    setIsUploading(false);
    
    if (error) {
      console.error('Error sending message:', error);
    } else {
      setMessages((prev) => [...prev, data as Message]);
      setContent('');
      setFile(null);
      setRemoteUrl('');
      setUploadProgress(0);
      cancelReply(); // Cancel reply state after sending
      // After sending, refresh conversations just in case the partner wasn't there
      loadConversations();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setRemoteUrl(''); // Clear remote URL if a local file is selected
    } else {
      setFile(null);
    }
  };

  const handleCancelMedia = () => {
    setFile(null);
    setRemoteUrl('');
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Clear file input
    }
  };

  const filteredConversations = conversations.filter(p => 
    p.display_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleReply = (message: Message) => {
    setReplyToId(message.id);
    setReplyingToMessage(message);
  };

  const cancelReply = () => {
    setReplyToId(null);
    setReplyingToMessage(null);
  };


  return (
    <div className="flex flex-1 h-full w-full max-w-7xl mx-auto shadow-xl rounded-xl overflow-hidden bg-[rgb(var(--color-surface))]">
      
      {/* Sidebar for Conversations (Chat List) */}
      <div 
        className={`flex-col border-r border-[rgb(var(--color-border))] md:flex transition-all duration-300 ${showSidebar ? 'flex w-full md:w-80' : 'hidden md:w-0'}`}
      >
        <div className="p-4 border-b border-[rgb(var(--color-border))] flex items-center gap-2">
          <MessageSquare size={24} className="text-[rgb(var(--color-primary))]" />
          <h2 className="text-xl font-bold text-[rgb(var(--color-text))]">Chats</h2>
        </div>
        
        {/* Search Input */}
        <div className="p-3 border-b border-[rgb(var(--color-border))]">
          <div className="relative">
            <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--color-text-secondary))]" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-[rgb(var(--color-border))] rounded-full focus:outline-none focus:border-[rgb(var(--color-accent))] bg-[rgb(var(--color-background))] text-[rgb(var(--color-text))]"
            />
          </div>
        </div>
        
        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <p className="p-4 text-[rgb(var(--color-text-secondary))] text-center">No chats found.</p>
          ) : (
            filteredConversations.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  setSelectedUser(p);
                  setShowSidebar(false);
                }}
                className={`flex items-center p-3 gap-3 cursor-pointer border-b border-[rgb(var(--color-border))] transition ${selectedUser?.id === p.id ? 'bg-[rgba(var(--color-primary),0.1)]' : 'hover:bg-[rgb(var(--color-surface-hover))]'}`}
              >
                <AvatarWithStatus profile={p} size="12" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[rgb(var(--color-text))] truncate">{p.display_name} {p.verified && <BadgeCheck size={16} className="text-[rgb(var(--color-primary))] inline ml-1" />}</p>
                  <p className="text-sm text-[rgb(var(--color-text-secondary))] truncate">@{p.username}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex flex-col flex-1 transition-all duration-300 ${!showSidebar || selectedUser ? 'w-full' : 'hidden md:flex'}`}>
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-[rgb(var(--color-border))] flex items-center justify-between sticky top-0 bg-[rgb(var(--color-surface))] z-10">
              <div className="flex items-center gap-3">
                <button onClick={() => setShowSidebar(true)} className="md:hidden p-2 hover:bg-[rgb(var(--color-surface-hover))] rounded-full text-[rgb(var(--color-text))]">
                  <ArrowLeft size={24} />
                </button>
                <AvatarWithStatus profile={selectedUser} size="10" />
                <div>
                  <h3 className="font-bold text-lg text-[rgb(var(--color-text))] flex items-center">
                    {selectedUser.display_name} {selectedUser.verified && <BadgeCheck size={18} className="text-[rgb(var(--color-primary))] ml-1" />}
                  </h3>
                  <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                    {isOnline(selectedUser.last_seen) ? 'Active now' : `Last seen: ${formatTime(selectedUser.last_seen || new Date().toISOString())}`}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-[rgb(var(--color-surface-hover))] rounded-full text-[rgb(var(--color-text))]">
                <X size={24} />
              </button>
            </div>

            {/* Message Area */}
            {/* Added w-full to ensure it doesn't overflow its parent on mobile */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[rgb(var(--color-background))] w-full">
              {messages.map((message, index) => {
                const isOwn = message.sender_id === user.id;
                const isFirstOfGroup = index === 0 || messages[index - 1].sender_id !== message.sender_id;
                
                // Find the replied-to message object
                const repliedMessage = message.reply_to_message;

                return (
                  <div key={message.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex items-end gap-2 max-w-full sm:max-w-md ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                      {/* Avatar (only show for the first message in a group, and not for own messages) */}
                      {(!isOwn && isFirstOfGroup) ? (
                        <AvatarWithStatus profile={selectedUser} size="10" />
                      ) : (
                        <div className="w-10 h-10 flex-shrink-0"></div> // Spacer to align messages
                      )}
                      
                      {/* Message Content */}
                      <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                        {/* Reply Button (always visible on hover/tap) */}
                        <button
                            onClick={() => handleReply(message)}
                            title={`Reply to ${isOwn ? 'your' : selectedUser.display_name}'s message`}
                            className={`p-1 text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-accent))] transition self-${isOwn ? 'end' : 'start'} opacity-0 group-hover:opacity-100 focus:opacity-100 text-xs`}
                        >
                            <CornerUpLeft size={16} />
                        </button>
                        
                        <div className={`p-3 rounded-xl max-w-full break-words relative group ${isOwn ? 'bg-[rgba(var(--color-primary),1)] text-[rgb(var(--color-text-on-primary))] rounded-br-none' : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))] rounded-tl-none'}`}>
                          
                          {/* Replied-to Message Snippet */}
                          {repliedMessage && (
                              <RepliedMessageSnippet 
                                  message={repliedMessage} 
                                  isOwn={isOwn} 
                              />
                          )}

                          {message.content && <p className="text-base">{message.content}</p>}
                          
                          {message.media_url && (
                            <div className="mt-2">
                              {message.media_url.match(/\.(jpeg|jpg|png|gif|webp|svg)$/i) ? (
                                <img src={message.media_url} alt="Media" className="rounded-lg max-h-64 object-cover w-full cursor-pointer" />
                              ) : message.media_url.match(/\.(mp4|webm|ogg)$/i) ? (
                                <video src={message.media_url} controls className="rounded-lg max-h-64 object-cover w-full" />
                              ) : (
                                <a href={message.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[rgb(var(--color-accent))] hover:underline">
                                  <FileText size={16} /> {message.media_url.includes('http') ? 'View File/Link' : message.media_url}
                                </a>
                              )}
                            </div>
                          )}
                          
                        </div>
                        {/* Message Timestamp and Date */}
                        <div className={`flex flex-col text-xs text-[rgb(var(--color-text-secondary))] mt-1 ${isOwn ? 'items-end' : 'items-start'}`}>
                            <span>{formatTime(message.created_at)}</span>
                            <span className="text-[10px]">{formatDate(message.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {isOtherTyping && (
                <div className="flex justify-start">
                    <div className="flex items-center gap-2 max-w-xs">
                        <div className="w-10 h-10 flex-shrink-0"></div> {/* Spacer for alignment */}
                        <div className="p-3 rounded-xl bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-secondary))] rounded-tl-none italic text-sm">
                            {selectedUser.display_name} is typing...
                        </div>
                    </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Form */}
            <form onSubmit={handleSubmit} className="p-3 bg-[rgb(var(--color-surface))] border-t border-[rgb(var(--color-border))] w-full">
              <input type="file" ref={fileInputRef} accept="image/*,video/*,.pdf,.doc,.docx,.txt" className="hidden" onChange={handleFileChange} />
              
              {/* Display replied message being composed */}
              {replyingToMessage && (
                  <div className="flex items-center p-2 mb-2 bg-[rgba(var(--color-primary), 0.1)] rounded-lg border-l-4 border-[rgb(var(--color-primary))] text-[rgb(var(--color-text-secondary))] text-sm">
                      <CornerUpLeft size={16} className="mr-2 text-[rgb(var(--color-primary))]" />
                      <div className="flex-1 truncate">
                          Replying to: <span className="font-semibold">{replyingToMessage.profiles?.display_name || 'User'}</span> - {replyingToMessage.content || '[Media]'}
                      </div>
                      <button type="button" onClick={cancelReply} className="p-1 hover:bg-[rgba(var(--color-primary), 0.2)] rounded-full text-[rgb(var(--color-text))]">
                          <X size={16} />
                      </button>
                  </div>
              )}

              {/* Media Preview / URL Input */}
              {(file || remoteUrl) && (
                <div className="p-2 mb-2 bg-[rgb(var(--color-background))] border border-[rgb(var(--color-border))] rounded-lg flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm font-medium text-[rgb(var(--color-text))] truncate">
                      {file ? file.name : (remoteUrl.length > 30 ? remoteUrl.substring(0, 30) + '...' : remoteUrl)}
                    </span>
                    {isUploading && (
                      <span className="text-xs text-[rgb(var(--color-accent))]">
                        ({uploadProgress.toFixed(0)}% uploaded)
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={handleCancelMedia} className="p-1 rounded-full text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-surface-hover))] transition">
                    <X size={20} />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()} 
                  className="p-2 rounded-full text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-surface-hover))] transition" 
                  title="Attach file"
                >
                  <Paperclip size={24} />
                </button>
                
                {/* Conditional Input Field: Remote URL or Text Content */}
                {(!file && !content && !remoteUrl) ? (
                  <div className="flex-1 flex items-center gap-1 min-w-0">
                    <input
                      type="url"
                      placeholder="Paste media URL (Optional)..."
                      value={remoteUrl}
                      onChange={(e) => setRemoteUrl(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-[rgb(var(--color-border))] rounded-full focus:outline-none focus:border-[rgb(var(--color-accent))] bg-[rgb(var(--color-background))] text-[rgb(var(--color-text))] min-w-0"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      handleTyping();
                    }}
                    className="flex-1 px-4 py-2.5 border border-[rgb(var(--color-border))] rounded-full focus:outline-none focus:border-[rgb(var(--color-accent))] text-base bg-[rgb(var(--color-background))] text-[rgb(var(--color-text))] min-w-0"
                  />
                )}

                <button
                  type="submit"
                  disabled={isUploading || (!content.trim() && !file && !remoteUrl.trim())}
                  className={`p-2 rounded-full transition ${isUploading || (!content.trim() && !file && !remoteUrl.trim()) ? 'bg-[rgb(var(--color-border))] text-[rgb(var(--color-text-secondary))]' : 'bg-[rgba(var(--color-accent),1)] text-[rgb(var(--color-text-on-primary))] hover:bg-[rgba(var(--color-primary),1)]'}`}
                >
                  <Send size={24} />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[rgb(var(--color-text-secondary))] flex-col">
            <span className="text-xl font-semibold mb-2">Welcome to Messages</span>
            <span className="text-center px-8">
              {showSidebar ? 'Select a chat on the left to start messaging.' : 'Tap the arrow to open the chat list.'}
            </span>
            <button onClick={() => setShowSidebar(true)} className="md:hidden mt-4 bg-[rgba(var(--color-accent),1)] text-[rgb(var(--color-text-on-primary))] px-4 py-2 rounded-full hover:bg-[rgba(var(--color-primary),1)] transition">
              <ArrowLeft className="mr-2 inline" /> Back to Chats
            </button>
          </div>
        )}
      </div>

      {showSidebar && !selectedUser && (
        <div onClick={() => setShowSidebar(false)} className="fixed inset-0 bg-black/50 z-20 md:hidden"></div>
      )}
    </div>
  );
};
