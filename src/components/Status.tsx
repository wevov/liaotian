// src/components/Status.tsx
import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { supabase, uploadStatusMedia, Profile, Status as StatusType } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  X, 
  Plus, 
  Camera, 
  Video, 
  ImageIcon, 
  Type, 
  ChevronLeft, 
  ChevronRight, 
  Archive, 
  Home,
  Send,
  Pause,
  Play
} from 'lucide-react';

const FOLLOW_ONLY_FEED = import.meta.env.VITE_FOLLOW_ONLY_FEED === 'true';

// Helper Type for the tray
interface ProfileWithStatus extends Profile {
  statuses: StatusType[]; // We'll attach the list of statuses
}

// =======================================================================
//  1. STATUS TRAY
//  Polished version of the tray, now passes the *entire user list*
//  to the viewer event.
// =======================================================================

export const StatusTray: React.FC = () => {
  const { user, profile } = useAuth();
  const [statusUsers, setStatusUsers] = useState<ProfileWithStatus[]>([]);
  const [ownStatus, setOwnStatus] = useState<ProfileWithStatus | null>(null);

  useEffect(() => {
    if (!user || !profile) return;

    const fetchActiveStatuses = async () => {
      try {
        // 1. Get all active statuses
        let statusQuery = supabase
          .from('statuses')
          .select('*, profiles!user_id(*)') // Grab profile data with it
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: true }); // Order by creation time

        if (FOLLOW_ONLY_FEED) {
          const { data: follows } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', user.id);
          
          const followingIds = follows?.map(f => f.following_id) || [];
          statusQuery = statusQuery.in('user_id', [user.id, ...followingIds]);
        }

        const { data: statuses } = await statusQuery;
        if (!statuses) return;

        // 2. Group statuses by user
        const usersMap = new Map<string, ProfileWithStatus>();

        for (const status of statuses) {
          if (!status.profiles) continue; // Skip if profile is null

          const userId = status.user_id;
          if (!usersMap.has(userId)) {
            // First time seeing this user, add them
            usersMap.set(userId, {
              ...status.profiles,
              statuses: [status],
            });
          } else {
            // User already in map, just add the status
            usersMap.get(userId)?.statuses.push(status);
          }
        }
        
        // 3. Separate "self" from "others"
        const self = usersMap.get(user.id) || { ...profile, statuses: [] };
        usersMap.delete(user.id);
        
        const others = Array.from(usersMap.values()).sort((a, b) => {
            // Sort others by the latest status time, descending
            const aLast = new Date(a.statuses[a.statuses.length - 1].created_at).getTime();
            const bLast = new Date(b.statuses[b.statuses.length - 1].created_at).getTime();
            return bLast - aLast;
        });

        setOwnStatus(self);
        setStatusUsers(others);

      } catch (error) {
        console.error('Error fetching statuses:', error);
      }
    };

    fetchActiveStatuses();
    const interval = setInterval(fetchActiveStatuses, 60000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [user, profile]);

  const openViewer = (initialUserId: string) => {
    if (!ownStatus) return;
    
    // Create the full queue: Self first, then others
    const fullQueue = [ownStatus, ...statusUsers];
    
    // Dispatch event with the *full queue* and the *starting user*
    window.dispatchEvent(new CustomEvent('openStatusViewer', { 
      detail: { 
        initialUserId,
        users: fullQueue
      } 
    }));
  };

  const handleOwnClick = () => {
    if (ownStatus && ownStatus.statuses.length > 0) {
      openViewer(user!.id);
    } else {
      window.dispatchEvent(new CustomEvent('openStatusCreator'));
    }
  };
  
  const handleOwnPlusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('openStatusCreator'));
  };

  if (!user) return null; // Don't show tray if logged out

  return (
    <div className="flex space-x-4 p-4 overflow-x-auto scrollbar-hide bg-[rgb(var(--color-surface))] border-b border-[rgb(var(--color-border))]">
      {/* Own Circle */}
      <div 
        onClick={handleOwnClick}
        className="flex flex-col items-center space-y-1 flex-shrink-0 cursor-pointer group"
      >
        <div className="relative w-16 h-16 rounded-full">
          <img 
            src={profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.username}`}
            className="w-full h-full rounded-full object-cover p-[2px] bg-[rgb(var(--color-surface))]"
            alt="Your avatar"
          />
          {/* Gradient Ring if status exists */}
          {ownStatus && ownStatus.statuses.length > 0 && (
             <div className="absolute inset-0 rounded-full p-[2px] -z-10 bg-gradient-to-tr from-[rgb(var(--color-accent))] to-[rgb(var(--color-primary))]"/>
          )}
          {/* Plain ring if no status */}
          {(!ownStatus || ownStatus.statuses.length === 0) && (
             <div className="absolute inset-0 rounded-full border-2 border-dashed border-[rgb(var(--color-border))] -z-10"/>
          )}
          
          <div 
            onClick={handleOwnPlusClick}
            className="absolute -bottom-1 -right-1 w-6 h-6 bg-[rgb(var(--color-primary))] rounded-full flex items-center justify-center group-hover:scale-110 transition-transform cursor-pointer border-2 border-[rgb(var(--color-surface))]"
          >
            <Plus size={16} className="text-[rgb(var(--color-text-on-primary))]" />
          </div>
        </div>
        <span className="text-xs text-center text-[rgb(var(--color-text-secondary))] truncate w-16">Your Status</span>
      </div>

      {/* Others' Circles */}
      {statusUsers.map((statusUser) => (
          <div 
            key={statusUser.id} 
            onClick={() => openViewer(statusUser.id)}
            className="flex flex-col items-center space-y-1 flex-shrink-0 cursor-pointer group"
          >
            <div className="relative w-16 h-16 rounded-full">
              <img 
                src={statusUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${statusUser.username}`}
                className="w-full h-full rounded-full object-cover p-[2px] bg-[rgb(var(--color-surface))]"
                alt={statusUser.display_name}
              />
              {/* Gradient Ring */}
              <div className="absolute inset-0 rounded-full p-[2px] -z-10 bg-gradient-to-tr from-[rgb(var(--color-accent))] to-[rgb(var(--color-primary))] group-hover:scale-105 transition-transform"/>
            </div>
            <span className="text-xs text-center text-[rgb(var(--color-text-secondary))] truncate w-16">
              {statusUser.display_name || statusUser.username}
            </span>
          </div>
        ))}
    </div>
  );
};


// =======================================================================
//  2. STATUS CREATOR
//  Renovated full-screen modal for a more immersive creation experience.
// =======================================================================
const StatusCreator: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string>('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [textOverlay, setTextOverlay] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up the object URL to prevent memory leaks
  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) {
        URL.revokeObjectURL(mediaPreviewUrl);
      }
    };
  }, [mediaPreviewUrl]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        alert("Only image and video files are allowed for statuses.");
        return;
    }
    
    setMediaType(file.type.startsWith('image/') ? 'image' : 'video');
    setMediaFile(file);
    setMediaPreviewUrl(URL.createObjectURL(file));
  };

  const handlePost = async () => {
    if (!user || !mediaFile) return;

    setIsPosting(true);

    try {
      const uploadResult = await uploadStatusMedia(mediaFile);
      if (!uploadResult) {
        throw new Error('Upload failed.');
      }

      const { error } = await supabase
        .from('statuses')
        .insert({
          user_id: user.id,
          media_url: uploadResult.url,
          media_type: mediaType,
          // Simple text overlay, centered.
          // A real app would have position, color, font.
          text_overlay: textOverlay ? { 
            text: textOverlay, 
            x: 50, 
            y: 50, 
            color: 'white',
            fontSize: 24
          } : {},
        });

      if (error) {
        throw error;
      }
      
      onClose(); // Success
    } catch (error) {
      console.error('Error posting status:', error);
      alert('Failed to post status. Please try again.');
    } finally {
      setIsPosting(false);
    }
  };

  const reset = () => {
    setMediaFile(null);
    setMediaPreviewUrl('');
    setTextOverlay('');
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-black flex items-center justify-center">
            <div className="relative w-full h-full max-w-lg max-h-screen bg-black rounded-lg overflow-hidden">
        
        {/* Header Bar */}
        <div className="absolute top-0 left-0 w-full p-4 z-20 flex justify-between items-center">
          <button 
            onClick={mediaFile ? reset : onClose} 
            className="p-2 bg-black/50 rounded-full text-white"
          >
            <X size={24} />
          </button>
          
          {mediaFile && (
             <button 
              onClick={handlePost}
              disabled={isPosting}
              className="px-4 py-2 bg-[rgb(var(--color-primary))] text-[rgb(var(--color-text-on-primary))] rounded-full font-bold text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {isPosting ? 'Posting...' : 'Post Status'}
              {!isPosting && <Send size={16} />}
            </button>
          )}
        </div>

        {/* Media Preview */}
        {mediaFile && (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center z-10">
            {mediaType === 'image' && (
              <img src={mediaPreviewUrl} className="max-w-full max-h-full object-contain" alt="Preview" />
            )}
            {mediaType === 'video' && (
              <video src={mediaPreviewUrl} className="max-w-full max-h-full" autoPlay muted loop playsInline />
            )}

            {/* Text Overlay Input */}
            <div className="absolute w-full p-4 flex items-center justify-center pointer-events-none">
              <input
                type="text"
                value={textOverlay}
                onChange={(e) => setTextOverlay(e.target.value)}
                placeholder="Add text..."
                className="w-full text-center bg-black/60 text-white text-2xl font-bold p-2 outline-none border-none pointer-events-auto"
                style={{ textShadow: '0px 0px 8px rgba(0,0,0,0.7)' }}
              />
            </div>
          </div>
        )}

        {/* Initial Uploader UI */}
        {!mediaFile && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4 z-0">
            {/* We'll skip the live camera for this rewrite, focusing on upload */}
            <h2 className="text-2xl font-bold text-white">Create a Status</h2>
            <p className="text-gray-400 text-center">Upload an image or a video to share with your followers.</p>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 px-6 py-3 bg-[rgb(var(--color-primary))] text-[rgb(var(--color-text-on-primary))] rounded-full font-bold flex items-center gap-2"
            >
              <ImageIcon size={20} /> Upload Media
            </button>
            <input 
              ref={fileInputRef} 
              type="file" 
              accept="image/*,video/*" 
              onChange={handleFileSelect} 
              className="hidden" 
            />
          </div>
        )}

        {/* Loading Overlay */}
        {isPosting && (
            <div className="absolute inset-0 z-30 bg-black/70 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
        )}
      </div>
    </div>
  );
};

// =======================================================================
//  3. STATUS VIEWER (AND SUB-COMPONENTS)
//  Completely rewritten to support a global queue, pre-fetching,
//  and automatic user-to-user transitions.
// =======================================================================

/**
 * Single progress bar, controls its own animation
 */
const StoryProgressBar: React.FC<{
  duration: number;
  isActive: boolean;
  isPaused: boolean;
  onFinished: () => void;
}> = ({ duration, isActive, isPaused, onFinished }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isActive) {
      // If not active, be either 0% (pending) or 100% (finished)
      setProgress(isActive ? 0 : 100);
      return;
    }
    
    // Reset progress when it becomes the active story
    setProgress(0);
    
    // Start the timer
    const startTime = Date.now();
    let frameId: number;

    const animate = () => {
      if (isPaused) {
        // Don't advance time if paused
        frameId = requestAnimationFrame(animate);
        return;
      }

      const elapsedTime = Date.now() - startTime;
      const newProgress = (elapsedTime / duration) * 100;

      if (newProgress >= 100) {
        setProgress(100);
        onFinished();
      } else {
        setProgress(newProgress);
        frameId = requestAnimationFrame(animate);
      }
    };
    
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isActive, isPaused, duration, onFinished]);

  return (
    <div className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
      <div 
        className="h-full bg-white transition-all duration-75 ease-linear"
        style={{ width: `${progress}%` }} 
      />
    </div>
  );
};

/**
 * The Main Story Viewer Component
 */
const StatusViewer: React.FC<{
  allStatusUsers: ProfileWithStatus[];
  initialUserId: string;
  onClose: () => void;
}> = ({ allStatusUsers, initialUserId, onClose }) => {
  const { user } = useAuth();
  
  // State for the *entire* queue
  const [currentUserIndex, setCurrentUserIndex] = useState(() => 
    Math.max(0, allStatusUsers.findIndex(u => u.id === initialUserId))
  );
  
  // State for the *current user's* stories
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentUser = allStatusUsers[currentUserIndex];
  const currentStory = currentUser?.statuses?.[currentStoryIndex];
  
  // --- Navigation Logic ---

  const goToNextUser = useCallback(() => {
    if (currentUserIndex < allStatusUsers.length - 1) {
      setCurrentUserIndex(prev => prev + 1);
      setCurrentStoryIndex(0);
      setIsLoading(true); // Will be set to false once media loads
    } else {
      onClose(); // Last user, close viewer
    }
  }, [currentUserIndex, allStatusUsers.length, onClose]);

  const goToNextStory = useCallback(() => {
    if (currentUser && currentStoryIndex < currentUser.statuses.length - 1) {
      setCurrentStoryIndex(prev => prev + 1);
    } else {
      goToNextUser(); // Go to next user if no more stories
    }
  }, [currentStoryIndex, currentUser, goToNextUser]);

  const goToPrevUser = () => {
    if (currentUserIndex > 0) {
      setCurrentUserIndex(prev => prev - 1);
      setCurrentStoryIndex(0);
      setIsLoading(true);
    }
  };

  const goToPrevStory = () => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(prev => prev - 1);
    } else {
      goToPrevUser(); // Go to prev user if on first story
    }
  };
  
  // --- Media Loading and Controls ---
  
  useEffect(() => {
    // This effect handles loading the media for the current story
    if (!currentStory) return;
    
    setIsLoading(true);
    const mediaUrl = currentStory.media_url;
    
    if (currentStory.media_type === 'image') {
      const img = new Image();
      img.src = mediaUrl;
      img.onload = () => setIsLoading(false);
      img.onerror = () => {
        console.error("Failed to load story image");
        goToNextStory(); // Skip broken story
      };
    } else if (currentStory.media_type === 'video') {
      // Video loading is handled by the <video> element's `onCanPlay` event
      if (videoRef.current) {
        videoRef.current.src = mediaUrl;
        videoRef.current.load();
      }
    }
  }, [currentStory, goToNextStory]);
  
  // Handle video playback
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
        if (isPaused) {
            video.pause();
        } else {
            video.play().catch(e => console.warn("Video play interrupted"));
        }
    }
  }, [isPaused, currentStory]);

  // --- Input Handlers ---

  const handlePointerDown = () => setIsPaused(true);
  const handlePointerUp = () => setIsPaused(false);

  const handleClickNavigation = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickThreshold = rect.width * 0.3; // 30% of width
    
    if (clickX < clickThreshold) {
      goToPrevStory();
    } else {
      goToNextStory();
    }
  };

  if (!currentUser || !currentStory) {
    // This can happen briefly during transitions
    return (
        <div className="fixed inset-0 z-[1000] bg-black flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
    );
  }

  const storyDuration = currentStory.media_type === 'image' ? 5000 : 0; // 5s for images, 0 for videos
  const overlay = currentStory.text_overlay as any;

  return (
    <div 
      className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center select-none"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp} // Also pause if mouse leaves
    >
            {/* Click-through wrapper for navigation */}
      <div 
        className="absolute inset-0 z-20"
        onClick={handleClickNavigation}
      />
      
      {/* Top Bar: Progress & User Info */}
      <div className="absolute top-0 left-0 w-full p-3 z-30">
        {/* Progress Bars */}
        <div className="flex space-x-1 mb-2">
          {currentUser.statuses.map((story, idx) => (
            <StoryProgressBar
              key={story.id}
              duration={story.media_type === 'image' ? 5000 : 0} // Videos are handled by `onEnded`
              isActive={idx === currentStoryIndex}
              isPaused={isPaused || isLoading}
              onFinished={() => {
                if(story.media_type === 'image') goToNextStory();
              }}
            />
          ))}
        </div>
        
        {/* User Info */}
        <div className="flex items-center gap-3">
          <img 
            src={currentUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.username}`}
            className="w-10 h-10 rounded-full"
            alt={currentUser.display_name}
          />
          <div className="flex flex-col">
            <span className="text-white font-bold text-sm">{currentUser.display_name}</span>
            <span className="text-white/70 text-xs">@{currentUser.username}</span>
          </div>
        </div>
      </div>
      
      <button onClick={onClose} className="absolute top-4 right-4 z-40 text-white p-2 bg-black/30 rounded-full">
        <X size={24} />
      </button>

      {/* Media Content */}
      <div className="relative flex-1 w-full max-w-lg max-h-screen flex items-center justify-center overflow-hidden">
        {/* Loading Spinner */}
        {isLoading && (
           <div className="absolute z-10">
             <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
           </div>
        )}
        
        {/* Image */}
        <img 
          src={currentStory.media_type === 'image' ? currentStory.media_url : ''} 
          className={`max-w-full max-h-full object-contain transition-opacity ${currentStory.media_type === 'image' ? 'opacity-100' : 'opacity-0'}`} 
          alt="Status" 
        />
        
        {/* Video */}
        <video
          ref={videoRef}
          className={`max-w-full max-h-full object-contain transition-opacity ${currentStory.media_type === 'video' ? 'opacity-100' : 'opacity-0'}`}
          playsInline
          onEnded={goToNextStory}
          onCanPlay={() => setIsLoading(false)} // Video is ready
          onError={() => goToNextStory()} // Skip broken video
          muted // Autoplay usually requires mute
        />

        {/* Text Overlay */}
        {overlay.text && (
          <div 
            className="absolute text-white p-2 bg-black/60 rounded"
            style={{ 
                left: `${overlay.x || 50}%`, 
                top: `${overlay.y || 50}%`,
                transform: `translate(-${overlay.x || 50}%, -${overlay.y || 50}%)`,
                fontSize: `${overlay.fontSize || 24}px`,
                color: overlay.color || 'white',
                textShadow: '0px 0px 8px rgba(0,0,0,0.7)'
            }}
          >
            {overlay.text}
          </div>
        )}
      </div>

      {/* Reply Bar */}
      <div className="absolute bottom-0 left-0 w-full p-4 z-30">
        <div className="flex items-center gap-2">
            <input 
              type="text" 
              placeholder={`Reply to ${currentUser.display_name}...`} 
              className="flex-1 p-3 rounded-full bg-white/20 border border-white/30 text-white placeholder-white/70 outline-none text-sm"
              onClick={e => e.stopPropagation()} // Stop click from navigating
              onPointerDown={e => e.stopPropagation()} // Stop press from pausing
            />
             <button className="p-3 rounded-full text-white bg-white/20">
                <Send size={20} />
            </button>
        </div>
      </div>
    </div>
  );
};

// =======================================================================
//  4. STATUS ARCHIVE
//  (No changes, this component is fine)
// =======================================================================
export const StatusArchive: React.FC = () => {
  const { user } = useAuth();
  const [allStatuses, setAllStatuses] = useState<StatusType[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<StatusType | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      try {
        const { data } = await supabase
          .from('statuses')
          .select('*, profiles!user_id(*)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        setAllStatuses(data || []);
      } catch (error) {
        console.error('Error fetching archive:', error);
      }
    };
    fetchAll();
  }, [user]);

  const openArchiveViewer = (status: StatusType) => setSelectedStatus(status);

  if (allStatuses.length === 0) {
    return (
      <div className="p-8 text-center text-[rgb(var(--color-text-secondary))]">
        <Archive size={48} className="mx-auto mb-4 opacity-50" />
        <p>No statuses in your archive yet.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Status Archive</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {allStatuses.map((status) => (
          <div key={status.id} className="relative group cursor-pointer" onClick={() => openArchiveViewer(status)}>
            {status.media_type === 'image' ? (
              <img src={status.media_url} className="w-full aspect-square object-cover rounded" alt="Archive" />
            ) : (
              <video src={status.media_url} className="w-full aspect-square object-cover rounded" muted />
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-end p-2 rounded transition-opacity">
              <span className="text-white text-sm truncate">{new Date(status.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Simple Viewer Modal */}
      {selectedStatus && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setSelectedStatus(null)}>
          <div className="relative w-full max-w-md" onClick={e => e.stopPropagation()}>
            {selectedStatus.media_type === 'image' ? (
              <img src={selectedStatus.media_url} className="w-full rounded" alt="Full" />
            ) : (
              <video src={selectedStatus.media_url} className="w-full rounded" controls autoPlay muted playsInline />
            )}
            <button onClick={() => setSelectedStatus(null)} className="absolute -top-10 right-0 text-white p-2"><X size={24} /></button>
          </div>
        </div>
      )}
    </div>
  );
};

// =======================================================================
//  5. STATUS SIDEBAR
//  (No changes, this component is fine)
// =======================================================================
interface StatusSidebarProps {
  show: boolean;
  onClose: () => void;
  setView: (view: any) => void;
  view: string;
}

export const StatusSidebar: React.FC<StatusSidebarProps> = ({ show, onClose, setView, view }) => {
  const menuItems = [
    { icon: <Home size={20} />, label: 'Home', view: 'feed', onClick: () => { setView('feed'); onClose(); } },
    { icon: <Archive size={20} />, label: 'Status Archive', view: 'archive', onClick: () => { setView('archive'); onClose(); } },
  ];

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/50 z-[98] transition-opacity ${show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={onClose} 
      />
      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-full w-64 bg-[rgb(var(--color-surface))] border-r border-[rgb(var(--color-border))] z-[99] ${show ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 shadow-lg flex-shrink-0`}>
        <nav className="p-4 space-y-2 h-full flex flex-col">
          {menuItems.map((item, idx) => (
            <button
              key={idx}
              onClick={item.onClick}
              className={`w-full flex items-center space-x-3 p-3 rounded-lg transition ${
                view === item.view
                  ? 'bg-[rgba(var(--color-primary),0.1)] text-[rgb(var(--color-primary))] font-bold'
                  : 'text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-surface-hover))]'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  );
};

// =======================================================================
//  6. GLOBAL MODAL CONTAINER
//  Upgraded to handle the new queue-based viewer data.
// =======================================================================
export const Status: React.FC = () => {
  const [showCreator, setShowCreator] = useState(false);
  
  // State now holds the *entire queue* and the *start ID*
  const [viewerData, setViewerData] = useState<{
    users: ProfileWithStatus[];
    initialUserId: string;
  } | null>(null);

  useEffect(() => {
    const handleOpenCreator = () => setShowCreator(true);
    
    const handleOpenViewer = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.users && detail.initialUserId) {
        setViewerData({
          users: detail.users,
          initialUserId: detail.initialUserId
        });
      }
    };

    window.addEventListener('openStatusCreator', handleOpenCreator);
    window.addEventListener('openStatusViewer', handleOpenViewer);

    return () => {
      window.removeEventListener('openStatusCreator', handleOpenCreator);
      window.removeEventListener('openStatusViewer', handleOpenViewer);
    };
  }, []);

  return (
    <Fragment>
      {showCreator && <StatusCreator onClose={() => setShowCreator(false)} />}
      
      {viewerData && (
        <StatusViewer
          allStatusUsers={viewerData.users}
          initialUserId={viewerData.initialUserId}
          onClose={() => setViewerData(null)}
        />
      )}
    </Fragment>
  );
};
