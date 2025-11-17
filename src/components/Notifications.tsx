// src/components/Notifications.tsx
import { useEffect, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Heart, MessageCircle, UserPlus, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// 1. Define the TypeScript type for a Notification, based on the proposed schema
interface Notification {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: 'like' | 'comment' | 'follow';
  entity_id: string; // The ID of the post, comment, etc.
  is_read: boolean;
  created_at: string;
  // Join data from actor's profile
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string;
  } | null;
}

export const Notifications = ({ onClose }: { onClose: () => void }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          profiles (username, display_name, avatar_url)
        `)
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50); // Limit to recent notifications

      if (error) {
        console.error('Error fetching notifications:', error);
      } else {
        setNotifications(data as Notification[]);
      }
      setLoading(false);
    };

    fetchNotifications();

    // The App.tsx handles real-time updates and initial read count.
    // We only need to fetch once when the modal opens.

  }, [user]);

  // Function to determine where to navigate when a notification is clicked
  const handleNotificationClick = (notification: Notification) => {
    // Logic to mark as read is done in App.tsx when the Bell icon is clicked.
    // This function handles the navigation.

    if (!notification.profiles) return;
    
    // Navigate to the relevant entity
    switch (notification.type) {
      case 'like':
      case 'comment':
        // For likes/comments on a post, navigate to the post owner's profile
        // A full implementation would navigate directly to the post detail view.
        // Given the current structure, we navigate to the post owner's profile page.
        // We can add a custom event to focus on the post if needed, but for now, profile is fine.
        navigate(`/?${notification.profiles.username}`);
        break;
      case 'follow':
        // Navigate to the profile of the user who followed you
        navigate(`/?${notification.profiles.username}`);
        break;
      default:
        // Fallback to feed
        navigate('/');
        break;
    }

    onClose(); // Close the modal after navigation
  };

  const getNotificationText = (notification: Notification) => {
    const actorName = notification.profiles?.display_name || 'A user';
    
    switch (notification.type) {
      case 'like':
        return `${actorName} liked your post.`;
      case 'comment':
        return `${actorName} commented on your post.`;
      case 'follow':
        return `${actorName} followed you.`;
      default:
        return 'You have a new activity.';
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'like':
        return <Heart size={18} className="text-red-500 fill-red-500" />;
      case 'comment':
        return <MessageCircle size={18} className="text-blue-500" />;
      case 'follow':
        return <UserPlus size={18} className="text-green-500" />;
      default:
        return <Zap size={18} className="text-[rgb(var(--color-primary))]" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" />

      {/* Modal Container */}
      <div 
        className="relative mx-auto bg-[rgb(var(--color-background))] min-h-screen sm:min-h-0 sm:max-w-xl sm:mt-16 sm:rounded-xl shadow-2xl transition-all duration-300"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        {/* Header */}
        <div className="sticky top-0 bg-[rgb(var(--color-surface))] border-b border-[rgb(var(--color-border))] flex items-center justify-between p-4 rounded-t-xl z-10">
          <h2 className="text-xl font-bold text-[rgb(var(--color-text))]">Notifications</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[rgb(var(--color-surface-hover))] transition text-[rgb(var(--color-text-secondary))]"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex flex-col">
          {loading && (
            <div className="p-12 text-center text-[rgb(var(--color-text-secondary))]">
              Loading notifications...
            </div>
          )}

          {!loading && notifications.length === 0 && (
            <div className="p-12 text-center text-[rgb(var(--color-text-secondary))]">
              <Zap size={48} className="mx-auto mb-4 opacity-50" />
              <p>You're all caught up! No new notifications.</p>
            </div>
          )}

          {!loading && notifications.length > 0 && (
            <div className="divide-y divide-[rgb(var(--color-border))]">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`flex items-start gap-4 p-4 cursor-pointer hover:bg-[rgb(var(--color-surface-hover))] transition ${
                    !notif.is_read ? 'bg-[rgba(var(--color-primary),0.05)]' : ''
                  }`}
                >
                  {/* Icon Column */}
                  <div className="w-6 h-6 flex items-center justify-center pt-1">
                    {getNotificationIcon(notif.type)}
                  </div>
                  
                  {/* Avatar and Text Column */}
                  <div className="flex-1 min-w-0 flex items-start gap-3">
                    <img
                      src={notif.profiles?.avatar_url || '/default-avatar.png'}
                      alt={notif.profiles?.username || 'user'}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div className="flex-1">
                      <p className="text-[rgb(var(--color-text))] break-words">
                        <span className="font-bold">
                          {notif.profiles?.display_name || 'User'}
                        </span>
                        {' '}
                        {getNotificationText(notif)}
                      </p>
                      <span className="text-xs text-[rgb(var(--color-text-secondary))]">
                        {new Date(notif.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
