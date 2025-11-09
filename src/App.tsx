// src/App.tsx
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { Feed } from './components/Feed';
import { Messages } from './components/Messages';
import { Profile } from './components/Profile';
import { Search } from './components/Search';
import { Settings } from './components/Settings';
import { Home, MessageSquare, User, LogOut, Search as SearchIcon } from 'lucide-react';
import { supabase } from './lib/supabase';

const Main = () => {
  const [view, setView] = useState<'feed' | 'messages' | 'profile' | 'settings'>('feed');
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>();
  const [showSearch, setShowSearch] = useState(false);
  const { user, profile, loading, signOut } = useAuth();

  // Set theme from profile
  useEffect(() => {
    if (profile?.theme) {
      document.body.className = `theme-${profile.theme}`;
    }
  }, [profile?.theme]);

  // === URL PROFILE LOOKUP — WORKS EVEN WHEN NOT LOGGED IN ===
  useEffect(() => {
    const checkUrlForProfile = async () => {
      // Get the raw search string: ?cpbk → "cpbk"
      const search = window.location.search; // "?cpbk"
      const username = search.startsWith('?') ? search.slice(1) : search;

      if (!username || username.length < 1) {
        setView('feed');
        setSelectedProfileId(undefined);
        return;
      }

      try {
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username.toLowerCase())
          .single();

        if (data) {
          setSelectedProfileId(data.id);
          setView('profile');
          // Optional: clean URL after loading
          // window.history.replaceState({}, '', window.location.pathname);
        } else {
          setView('feed');
          setSelectedProfileId(undefined);
        }
      } catch (err) {
        setView('feed');
        setSelectedProfileId(undefined);
      }
    };

    checkUrlForProfile();
    window.addEventListener('popstate', checkUrlForProfile);
    return () => window.removeEventListener('popstate', checkUrlForProfile);
  }, []);

  // Keep internal navigation working
  useEffect(() => {
    const handler = (e: any) => {
      const profileId = e.detail;
      supabase
        .from('profiles')
        .select('username')
        .eq('id', profileId)
        .single()
        .then(({ data }) => {
          if (data) {
            window.history.replaceState({}, '', `/?${data.username}`);
            setSelectedProfileId(profileId);
            setView('profile');
          }
        });
    };
    window.addEventListener('navigateToProfile', handler);
    return () => window.removeEventListener('navigateToProfile', handler);
  }, []);

  if (loading) return <div className="min-h-screen bg-[rgb(var(--color-background))] flex items-center justify-center text-2xl font-bold text-[rgb(var(--color-text))]" style={{background: `linear-gradient(to bottom right, [rgba(var(--color-surface),0.05)], [rgba(var(--color-primary),0.05)])`}}>Loading...</div>;

  // === NOT LOGGED IN? SHOW AUTH OR PUBLIC PROFILE ===
  if (!user || !profile) {
    // Allow public profile viewing
    if (view === 'profile' && selectedProfileId) {
      return (
        <div className="min-h-screen bg-[rgb(var(--color-background))]">
          <div className="bg-[rgb(var(--color-surface))] border-b border-[rgb(var(--color-border))] sticky top-0 z-50 shadow-sm">
            <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
              <h1 className="text-2xl font-black bg-gradient-to-r from-[rgba(var(--color-primary),1)] via-[rgba(var(--color-accent),1)] to-[rgba(var(--color-primary),1)] bg-clip-text text-transparent">
                聊天
              </h1>
              <a href="/" className="text-[rgb(var(--color-primary))] hover:text-[rgba(var(--color-primary),0.8)] font-bold">← Back to Home</a>
            </div>
          </div>
          <Profile userId={selectedProfileId} />
        </div>
      );
    }

    return <Auth />;
  }

  const handleMessageUser = (profile: ProfileType) => {
  setView('messages');
  setSelectedProfileId(undefined);
  // Let Messages.tsx handle the actual selection via event
  window.dispatchEvent(new CustomEvent('openDirectMessage', { detail: profile }));
};

const handleSettings = () => {
  setView('settings');
  setSelectedProfileId(undefined);
};

  return (
    <div className="min-h-screen bg-[rgb(var(--color-background))]">
      <nav className="bg-[rgb(var(--color-surface))] border-b border-[rgb(var(--color-border))] sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
          <h1 className="text-2xl font-black bg-gradient-to-r from-[rgba(var(--color-primary),1)] via-[rgba(var(--color-accent),1)] to-[rgba(var(--color-primary),1)] bg-clip-text text-transparent">
            聊天
          </h1>
          <div className="flex items-center gap-2">
<button
    onClick={() => setShowSearch(true)}
    className="p-3 rounded-full hover:bg-[rgb(var(--color-surface-hover))] transition"
  >
    <SearchIcon size={24} className="text-[rgb(var(--color-text-secondary))]" />
  </button>            
<button
              onClick={() => {
                setView('feed');
                setSelectedProfileId(undefined);
                window.history.replaceState({}, '', '/');
              }}
              className={`p-3 rounded-full transition ${view === 'feed' ? 'bg-[rgba(var(--color-primary),0.1)] text-[rgb(var(--color-primary))]' : 'hover:bg-[rgb(var(--color-surface-hover))]'}`}
            >
              <Home size={24} />
            </button>
            <button
              onClick={() => { setView('messages'); setSelectedProfileId(undefined); }}
              className={`p-3 rounded-full transition ${view === 'messages' ? 'bg-[rgba(var(--color-primary),0.1)] text-[rgb(var(--color-primary))]' : 'hover:bg-[rgb(var(--color-surface-hover))]'}`}
            >
              <MessageSquare size={24} />
            </button>
            <button
  onClick={() => {
    if (!profile?.username) return;
    
    window.history.replaceState({}, '', `/?${profile.username}`);
    setSelectedProfileId(undefined);
    setView('profile');
  }}
  className={`p-3 rounded-full transition ${view === 'profile' && !selectedProfileId ? 'bg-[rgba(var(--color-primary),0.1)] text-[rgb(var(--color-primary))]' : 'hover:bg-[rgb(var(--color-surface-hover))]'}`}
>
  <User size={24} />
</button>
            <button onClick={signOut} className="p-3 rounded-full hover:bg-[rgba(239,68,68,0.1)] text-red-600 transition">
              <LogOut size={24} />
            </button>
          </div>
        </div>
      </nav>

      <main className="pb-20">
        {view === 'feed' && <Feed />}
        {view === 'messages' && <Messages />}
        {view === 'profile' && <Profile userId={selectedProfileId} onMessage={handleMessageUser} onSettings={!selectedProfileId || selectedProfileId === user.id ? handleSettings : undefined} />}
        {view === 'settings' && <Settings />}
        {showSearch && <Search onClose={() => setShowSearch(false)} />}
      </main>

      <footer className="text-center text-[rgb(var(--color-text-secondary))] text-xs py-4 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
        © Mux 2025
      </footer>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <Main />
    </AuthProvider>
  );
}

export default App;
