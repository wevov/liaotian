import React, { useState, useEffect, useCallback } from 'react';
import { supabase, uploadMedia } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  MessageSquare, 
  Plus, 
  ArrowLeft, 
  Search, 
  TrendingUp, 
  Clock, 
  Image as ImageIcon, 
  MoreHorizontal, 
  ArrowBigUp, 
  MessageCircle,
  Share2,
  Menu,
  X
} from 'lucide-react';

// --- Types ---
interface Forum {
  id: string;
  name: string;
  description: string;
  tag: string;
  icon_url?: string;
}

interface ForumPost {
  id: string;
  forum_id: string;
  title: string;
  content: string;
  media_url: string;
  created_at: string;
  user_id: string;
  comment_count: number;
  like_count: number;
  profiles: { 
    username: string; 
    display_name: string; 
    avatar_url: string; 
    verified: boolean; 
  };
}

interface ForumComment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string;
  };
}

// --- Components ---

export const Forums: React.FC = () => {
  const { user } = useAuth();
  
  // State
  const [forums, setForums] = useState<Forum[]>([]);
  const [activeForum, setActiveForum] = useState<Forum | null>(null); // Null = "All" or "Home"
  const [viewState, setViewState] = useState<'feed' | 'detail'>('feed');
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  
  // Mobile Sidebar Toggle
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  
  // Modals
  const [showCreateForum, setShowCreateForum] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);

  // Initial Fetch
  const fetchForums = async () => {
    const { data } = await supabase.from('forums').select('*').order('name');
    setForums(data || []);
  };

  useEffect(() => { fetchForums(); }, []);

  // Navigation Handlers
  const handleForumSelect = (forum: Forum | null) => {
    setActiveForum(forum);
    setViewState('feed');
    setSelectedPost(null);
    setShowMobileSidebar(false);
  };

  const handlePostClick = (post: ForumPost) => {
    setSelectedPost(post);
    setViewState('detail');
  };

  const handleBack = () => {
    if (viewState === 'detail') {
      setViewState('feed');
      setSelectedPost(null);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] max-w-7xl mx-auto">
      
      {/* --- LEFT SIDEBAR (Desktop) --- */}
      <aside className="hidden md:flex w-64 flex-col border-r border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4 sticky top-16 h-full overflow-y-auto">
        <SidebarContent 
          forums={forums} 
          activeForum={activeForum} 
          onSelect={handleForumSelect} 
          onCreateForum={() => setShowCreateForum(true)} 
        />
      </aside>

      {/* --- MOBILE SIDEBAR DRAWER --- */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileSidebar(false)} />
          <div className="relative w-64 bg-[rgb(var(--color-surface))] h-full p-4 shadow-xl">
            <SidebarContent 
              forums={forums} 
              activeForum={activeForum} 
              onSelect={handleForumSelect} 
              onCreateForum={() => setShowCreateForum(true)} 
            />
          </div>
        </div>
      )}

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 flex flex-col min-w-0 bg-[rgb(var(--color-background))]">
        
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] sticky top-0 z-10">
           {viewState === 'detail' ? (
             <button onClick={handleBack} className="flex items-center gap-2 text-[rgb(var(--color-text))] font-bold">
               <ArrowLeft size={20} /> Back
             </button>
           ) : (
             <div className="flex items-center gap-3">
               <button onClick={() => setShowMobileSidebar(true)}>
                 <Menu size={24} className="text-[rgb(var(--color-text))]" />
               </button>
               <h1 className="font-bold text-lg text-[rgb(var(--color-text))] truncate">
                 {activeForum ? `f/${activeForum.name}` : 'Forums'}
               </h1>
             </div>
           )}
        </div>

        {/* Content Switcher */}
        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {viewState === 'feed' ? (
             <ForumFeed 
                activeForum={activeForum} 
                onPostClick={handlePostClick} 
                onCreatePost={() => setShowCreatePost(true)}
             />
          ) : selectedPost ? (
             <PostDetail post={selectedPost} onBack={handleBack} />
          ) : null}
        </div>
      </main>

      {/* --- RIGHT SIDEBAR (Desktop - Community Info) --- */}
      <aside className="hidden lg:block w-80 p-6 sticky top-16 h-full border-l border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
         {activeForum ? (
           <div className="space-y-4">
             <div className="p-4 bg-[rgb(var(--color-primary))] text-white rounded-t-xl h-12"></div>
             <div className="px-4">
                <h2 className="font-bold text-xl text-[rgb(var(--color-text))]">f/{activeForum.name}</h2>
                <p className="text-sm text-[rgb(var(--color-text-secondary))] mt-2">{activeForum.description}</p>
                
                <div className="mt-6 pt-6 border-t border-[rgb(var(--color-border))]">
                   <div className="flex items-center gap-2 text-[rgb(var(--color-text-secondary))] mb-2">
                      <Clock size={16} /> <span className="text-sm">Created recently</span>
                   </div>
                   <div className="bg-[rgba(var(--color-primary),0.1)] text-[rgb(var(--color-primary))] text-xs font-bold px-3 py-1 rounded-full inline-block">
                     {activeForum.tag}
                   </div>
                </div>

                <button 
                  onClick={() => setShowCreatePost(true)}
                  className="w-full mt-6 bg-[rgb(var(--color-primary))] hover:brightness-110 text-white font-bold py-2 rounded-full transition"
                >
                  Create Post
                </button>
             </div>
           </div>
         ) : (
           <div className="space-y-4">
             <div className="p-4 bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] rounded-xl text-white">
                <h2 className="font-bold text-lg mb-2">Home</h2>
                <p className="text-sm opacity-90">Your personal Gazebo frontpage. Come here to check in with your favorite communities.</p>
             </div>
             <button 
                onClick={() => setShowCreatePost(true)}
                className="w-full bg-[rgb(var(--color-text))] text-[rgb(var(--color-background))] font-bold py-2 rounded-full hover:opacity-90 transition"
              >
                Create Post
             </button>
             <button 
                onClick={() => setShowCreateForum(true)}
                className="w-full border border-[rgb(var(--color-text))] text-[rgb(var(--color-text))] font-bold py-2 rounded-full hover:bg-[rgb(var(--color-surface-hover))] transition"
              >
                Create Community
             </button>
           </div>
         )}
      </aside>

      {/* Modals */}
      {showCreateForum && <CreateForumModal onClose={() => setShowCreateForum(false)} onSuccess={fetchForums} />}
      {showCreatePost && <CreatePostModal activeForum={activeForum} forums={forums} onClose={() => setShowCreatePost(false)} onSuccess={() => { setViewState('feed'); /* trigger refresh logic if needed */ }} />}

    </div>
  );
};

// --- SUB-COMPONENTS ---

const SidebarContent: React.FC<{ 
  forums: Forum[], 
  activeForum: Forum | null, 
  onSelect: (f: Forum | null) => void,
  onCreateForum: () => void 
}> = ({ forums, activeForum, onSelect, onCreateForum }) => (
  <div className="space-y-6">
    <div className="space-y-1">
      <button 
        onClick={() => onSelect(null)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${!activeForum ? 'bg-[rgb(var(--color-surface-hover))] text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-surface-hover))]'}`}
      >
        <TrendingUp size={20} /> Home
      </button>
    </div>

    <div>
      <div className="flex items-center justify-between px-3 mb-2">
        <span className="text-xs font-bold text-[rgb(var(--color-text-secondary))] uppercase tracking-wider">Communities</span>
        <button onClick={onCreateForum} className="text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-primary))]"><Plus size={16} /></button>
      </div>
      <div className="space-y-0.5">
        {forums.map(f => (
          <button 
            key={f.id}
            onClick={() => onSelect(f)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition truncate ${activeForum?.id === f.id ? 'bg-[rgb(var(--color-surface-hover))] text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-surface-hover))]'}`}
          >
             <div className="w-5 h-5 rounded-full bg-[rgb(var(--color-border))] flex-shrink-0" />
             <span className="truncate">f/{f.name}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

const ForumFeed: React.FC<{ 
  activeForum: Forum | null, 
  onPostClick: (p: ForumPost) => void,
  onCreatePost: () => void
}> = ({ activeForum, onPostClick, onCreatePost }) => {
    const [posts, setPosts] = useState<ForumPost[]>([]);
    const { user } = useAuth();
    
    // Simple way to track local likes for UI responsiveness
    const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());

    const fetchPosts = useCallback(async () => {
        let query = supabase
            .from('forum_posts')
            .select('*, profiles(*)')
            .order('created_at', { ascending: false });
        
        if (activeForum) {
            query = query.eq('forum_id', activeForum.id);
        }

        const { data } = await query;
        setPosts(data as ForumPost[] || []);
        
        // Fetch likes for these posts
        if (data && user) {
             const ids = data.map((p: any) => p.id);
             const { data: likes } = await supabase
                .from('likes')
                .select('entity_id')
                .eq('user_id', user.id)
                .eq('entity_type', 'forum_post')
                .in('entity_id', ids);
             if (likes) {
                 setLikedPostIds(new Set(likes.map((l: any) => l.entity_id)));
             }
        }
    }, [activeForum, user]);

    useEffect(() => { fetchPosts(); }, [fetchPosts]);

    // Optimistic Like Handler
    const handleLike = async (e: React.MouseEvent, post: ForumPost) => {
        e.stopPropagation();
        if (!user) return;

        const isLiked = likedPostIds.has(post.id);
        
        // Optimistic UI Update
        setLikedPostIds(prev => {
            const next = new Set(prev);
            isLiked ? next.delete(post.id) : next.add(post.id);
            return next;
        });

        setPosts(prev => prev.map(p => 
            p.id === post.id 
            ? { ...p, like_count: p.like_count + (isLiked ? -1 : 1) } 
            : p
        ));

        // DB Update
        if (isLiked) {
             await supabase.from('likes').delete().match({ user_id: user.id, entity_id: post.id, entity_type: 'forum_post' });
             // Optionally decrement DB count via RPC if strict consistency needed
        } else {
             await supabase.from('likes').insert({ user_id: user.id, entity_id: post.id, entity_type: 'forum_post' });
        }
    };

    return (
        <div className="p-0 md:p-6 space-y-4">
            {/* Mobile "Create Post" entry */}
            <div className="md:hidden p-4 bg-[rgb(var(--color-surface))] border-b border-[rgb(var(--color-border))] flex items-center gap-2">
                 <div className="w-8 h-8 rounded-full bg-[rgb(var(--color-surface-hover))]" />
                 <input 
                    readOnly 
                    onClick={onCreatePost}
                    placeholder="Create a post..." 
                    className="flex-1 bg-[rgb(var(--color-background))] border border-[rgb(var(--color-border))] rounded-full px-4 py-2 text-sm"
                 />
                 <ImageIcon className="text-[rgb(var(--color-text-secondary))]" />
            </div>

            {posts.map(post => {
                const isLiked = likedPostIds.has(post.id);
                return (
                    <div 
                        key={post.id} 
                        onClick={() => onPostClick(post)}
                        className="bg-[rgb(var(--color-surface))] hover:bg-[rgb(var(--color-surface-hover))] border-y md:border border-[rgb(var(--color-border))] md:rounded-xl cursor-pointer transition flex overflow-hidden"
                    >
                        {/* Vote Sidebar (Desktop) */}
                        <div className="hidden md:flex flex-col items-center gap-1 p-3 bg-[rgba(var(--color-surface),0.5)] w-12 flex-shrink-0 border-r border-transparent">
                            <button 
                                onClick={(e) => handleLike(e, post)} 
                                className={`p-1 rounded hover:bg-[rgba(var(--color-border),0.5)] ${isLiked ? 'text-[rgb(var(--color-primary))]' : 'text-[rgb(var(--color-text-secondary))]'}`}
                            >
                                <ArrowBigUp size={24} fill={isLiked ? "currentColor" : "none"} />
                            </button>
                            <span className={`text-xs font-bold ${isLiked ? 'text-[rgb(var(--color-primary))]' : 'text-[rgb(var(--color-text))]'}`}>
                                {post.like_count || 0}
                            </span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 p-3 pb-1 md:p-4">
                            {/* Meta Header */}
                            <div className="flex items-center gap-2 text-xs text-[rgb(var(--color-text-secondary))] mb-2">
                                {!activeForum && <span className="font-bold text-[rgb(var(--color-text))]">f/ForumName</span>}
                                <span className="hidden md:inline">Posted by u/{post.profiles.username}</span>
                                <span className="md:hidden">u/{post.profiles.username}</span>
                                <span>•</span>
                                <span>{new Date(post.created_at).toLocaleDateString()}</span>
                            </div>

                            <h3 className="font-bold text-lg text-[rgb(var(--color-text))] mb-2 leading-snug">{post.title}</h3>
                            
                            {/* Media Preview */}
                            {post.media_url && (
                                <div className="mb-3 rounded-lg overflow-hidden border border-[rgb(var(--color-border))] bg-black/5 max-h-[400px] flex items-center justify-center">
                                    <img src={post.media_url} className="max-w-full max-h-[400px] object-contain" loading="lazy" />
                                </div>
                            )}

                            {!post.media_url && (
                                <p className="text-sm text-[rgb(var(--color-text))] line-clamp-3 mb-3">{post.content}</p>
                            )}

                            {/* Action Footer */}
                            <div className="flex items-center gap-1 text-[rgb(var(--color-text-secondary))] text-xs font-bold">
                                {/* Mobile Vote */}
                                <button 
                                    onClick={(e) => handleLike(e, post)} 
                                    className={`md:hidden flex items-center gap-1 px-2 py-2 rounded-full hover:bg-[rgb(var(--color-surface-hover))] ${isLiked ? 'text-[rgb(var(--color-primary))]' : ''}`}
                                >
                                    <ArrowBigUp size={20} fill={isLiked ? "currentColor" : "none"} />
                                    <span>{post.like_count || 0}</span>
                                </button>

                                <button className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-[rgb(var(--color-surface-hover))]">
                                    <MessageCircle size={18} />
                                    <span>{post.comment_count || 0} Comments</span>
                                </button>
                                <button className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-[rgb(var(--color-surface-hover))]">
                                    <Share2 size={18} />
                                    <span className="hidden sm:inline">Share</span>
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const PostDetail: React.FC<{ post: ForumPost, onBack: () => void }> = ({ post, onBack }) => {
    const { user } = useAuth();
    const [comments, setComments] = useState<ForumComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchComments = async () => {
        const { data } = await supabase
            .from('forum_comments')
            .select('*, profiles(*)')
            .eq('post_id', post.id)
            .order('created_at', { ascending: true });
        setComments(data as ForumComment[] || []);
    };

    useEffect(() => { fetchComments(); }, [post.id]);

    const handleSubmit = async () => {
        if (!user || !newComment.trim()) return;
        setIsSubmitting(true);
        
        await supabase.from('forum_comments').insert({
            post_id: post.id,
            user_id: user.id,
            content: newComment
        });
        
        // Trigger RPC for count consistency
        await supabase.rpc('increment_forum_comment_count', { post_id: post.id });

        setNewComment('');
        fetchComments();
        setIsSubmitting(false);
    };

    return (
        <div className="bg-[rgb(var(--color-background))] min-h-full">
            {/* Post Content */}
            <div className="bg-[rgb(var(--color-surface))] border-b border-[rgb(var(--color-border))] md:m-4 md:rounded-xl md:border">
                {/* Vote Strip (Desktop) */}
                <div className="flex">
                    <div className="hidden md:flex flex-col items-center gap-2 p-4 w-14 border-r border-[rgb(var(--color-border))]">
                        <ArrowBigUp size={28} className="text-[rgb(var(--color-text-secondary))]" />
                        <span className="font-bold text-[rgb(var(--color-text))]">{post.like_count}</span>
                    </div>

                    <div className="flex-1 p-4">
                        <div className="flex items-center gap-2 text-xs text-[rgb(var(--color-text-secondary))] mb-2">
                             <img src={post.profiles.avatar_url || `https://ui-avatars.com/api/?name=${post.profiles.username}`} className="w-5 h-5 rounded-full" />
                             <span className="font-bold text-[rgb(var(--color-text))]">u/{post.profiles.username}</span>
                             <span>•</span>
                             <span>{new Date(post.created_at).toLocaleString()}</span>
                        </div>
                        
                        <h1 className="text-xl md:text-2xl font-bold text-[rgb(var(--color-text))] mb-4">{post.title}</h1>
                        
                        <div className="text-[rgb(var(--color-text))] whitespace-pre-wrap mb-4 text-sm md:text-base leading-relaxed">
                            {post.content}
                        </div>

                        {post.media_url && (
                             <img src={post.media_url} className="w-full rounded-lg mb-4" />
                        )}

                        <div className="flex items-center gap-4 text-[rgb(var(--color-text-secondary))] text-sm font-bold border-t border-[rgb(var(--color-border))] pt-3">
                             <div className="flex items-center gap-2">
                                <MessageCircle size={20} /> {post.comment_count} Comments
                             </div>
                             <div className="flex items-center gap-2">
                                <Share2 size={20} /> Share
                             </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Comment Input */}
            <div className="bg-[rgb(var(--color-surface))] p-4 md:mx-4 md:rounded-xl border border-[rgb(var(--color-border))] mb-4">
                <span className="text-sm text-[rgb(var(--color-text))] mb-2 block">Comment as <span className="text-[rgb(var(--color-primary))]">{user?.email}</span></span>
                <textarea 
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="w-full bg-[rgb(var(--color-background))] border border-[rgb(var(--color-border))] rounded-lg p-3 text-[rgb(var(--color-text))] focus:outline-none focus:border-[rgb(var(--color-primary))] min-h-[100px]"
                    placeholder="What are your thoughts?"
                />
                <div className="flex justify-end mt-2">
                    <button 
                        disabled={!newComment.trim() || isSubmitting}
                        onClick={handleSubmit}
                        className="bg-[rgb(var(--color-primary))] text-white font-bold py-1.5 px-4 rounded-full disabled:opacity-50"
                    >
                        Comment
                    </button>
                </div>
            </div>

            {/* Comments List */}
            <div className="md:mx-4 pb-20">
                {comments.map(c => (
                    <div key={c.id} className="bg-[rgb(var(--color-surface))] md:rounded-xl border-b md:border border-[rgb(var(--color-border))] md:mb-2 p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <img src={c.profiles.avatar_url || `https://ui-avatars.com/api/?name=${c.profiles.username}`} className="w-6 h-6 rounded-full" />
                            <span className="text-xs font-bold text-[rgb(var(--color-text))]">{c.profiles.display_name}</span>
                            <span className="text-xs text-[rgb(var(--color-text-secondary))]">{new Date(c.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-[rgb(var(--color-text))] pl-8">{c.content}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- MODALS ---

const CreateForumModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
    const { user } = useAuth();
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [tag, setTag] = useState('General');

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        
        await supabase.from('forums').insert({
            name,
            description: desc,
            tag,
            owner_id: user.id
        });
        
        onSuccess();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[100]">
            <form onSubmit={handleCreate} className="bg-[rgb(var(--color-surface))] w-full max-w-md rounded-xl p-6 space-y-4 border border-[rgb(var(--color-border))]">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-[rgb(var(--color-text))]">Create Community</h2>
                    <button type="button" onClick={onClose}><X className="text-[rgb(var(--color-text))]" /></button>
                </div>
                
                <div>
                    <label className="block text-xs font-bold text-[rgb(var(--color-text-secondary))] mb-1">Name</label>
                    <div className="relative">
                        <span className="absolute left-3 top-2 text-[rgb(var(--color-text-secondary))]">f/</span>
                        <input 
                            required 
                            className="w-full pl-7 pr-3 py-2 bg-[rgb(var(--color-background))] border border-[rgb(var(--color-border))] rounded-lg text-[rgb(var(--color-text))]" 
                            value={name} 
                            onChange={e => setName(e.target.value.replace(/\s+/g, ''))} // No spaces in f/name
                            maxLength={20}
                        />
                    </div>
                    <p className="text-xs text-[rgb(var(--color-text-secondary))] mt-1">Community names cannot be changed.</p>
                </div>

                <div>
                    <label className="block text-xs font-bold text-[rgb(var(--color-text-secondary))] mb-1">Description</label>
                    <textarea 
                        required 
                        className="w-full p-3 bg-[rgb(var(--color-background))] border border-[rgb(var(--color-border))] rounded-lg text-[rgb(var(--color-text))]" 
                        rows={3}
                        value={desc}
                        onChange={e => setDesc(e.target.value)}
                    />
                </div>

                <div>
                     <label className="block text-xs font-bold text-[rgb(var(--color-text-secondary))] mb-1">Tag</label>
                     <select 
                        value={tag} 
                        onChange={e => setTag(e.target.value)} 
                        className="w-full p-2 bg-[rgb(var(--color-background))] border border-[rgb(var(--color-border))] rounded-lg text-[rgb(var(--color-text))]"
                     >
                         {['General', 'Gaming', 'Hobbies', 'Tech', 'Music'].map(t => <option key={t} value={t}>{t}</option>)}
                     </select>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-full border border-[rgb(var(--color-border))] text-[rgb(var(--color-text))] font-bold">Cancel</button>
                    <button type="submit" className="px-4 py-2 rounded-full bg-[rgb(var(--color-primary))] text-white font-bold">Create Community</button>
                </div>
            </form>
        </div>
    );
};

const CreatePostModal: React.FC<{ activeForum: Forum | null, forums: Forum[], onClose: () => void; onSuccess: () => void }> = ({ activeForum, forums, onClose, onSuccess }) => {
    const { user } = useAuth();
    const [selectedForumId, setSelectedForumId] = useState(activeForum?.id || (forums[0]?.id || ''));
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !selectedForumId) return;
        setIsSubmitting(true);

        await supabase.from('forum_posts').insert({
            forum_id: selectedForumId,
            user_id: user.id,
            title,
            content
        });

        onSuccess();
        onClose();
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[100]">
            <form onSubmit={handleSubmit} className="bg-[rgb(var(--color-surface))] w-full max-w-2xl rounded-xl p-6 space-y-4 border border-[rgb(var(--color-border))] flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center border-b border-[rgb(var(--color-border))] pb-4">
                    <h2 className="text-xl font-bold text-[rgb(var(--color-text))]">Create a post</h2>
                    <button type="button" onClick={onClose}><X className="text-[rgb(var(--color-text))]" /></button>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-4">
                    <div>
                         <select 
                            value={selectedForumId} 
                            onChange={e => setSelectedForumId(e.target.value)}
                            className="w-1/2 p-2 bg-[rgb(var(--color-background))] border border-[rgb(var(--color-border))] rounded text-[rgb(var(--color-text))]"
                         >
                            <option value="" disabled>Choose a community</option>
                            {forums.map(f => <option key={f.id} value={f.id}>f/{f.name}</option>)}
                         </select>
                    </div>

                    <div className="space-y-2">
                        <input 
                            required 
                            placeholder="Title" 
                            className="w-full p-3 bg-[rgb(var(--color-background))] border border-[rgb(var(--color-border))] rounded-lg text-[rgb(var(--color-text))] font-bold"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            maxLength={300}
                        />
                        <textarea 
                            required 
                            placeholder="Body text" 
                            className="w-full p-3 bg-[rgb(var(--color-background))] border border-[rgb(var(--color-border))] rounded-lg text-[rgb(var(--color-text))] min-h-[200px]"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-[rgb(var(--color-border))]">
                     <button type="submit" disabled={isSubmitting} className="px-6 py-2 rounded-full bg-[rgb(var(--color-primary))] text-white font-bold disabled:opacity-50">Post</button>
                </div>
            </form>
        </div>
    );
};
