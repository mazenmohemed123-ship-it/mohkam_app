import { useState, useEffect } from 'react';
import { RoleGate } from './components/auth/RoleGate';
import { AuthPage } from './components/auth/AuthPage';
import { ClientZeroAuth } from './components/auth/ClientZeroAuth';
import { LawyerPortal } from './components/portals/LawyerPortal';
import { ClientPortal } from './components/portals/ClientPortal';
import { AdminControlCenter } from './components/admin/AdminControlCenter';
import { RoleProvider } from './context/RoleContext';
import { CaseProvider } from './context/CaseContext';
import { supabase } from './services/supabase';
import { Spinner } from './components/atoms';
import type { Profile } from './context/RoleContext';
import './styles/theme.css';

type AppScreen = 'role_gate' | 'auth_lawyer' | 'auth_client';
type UserRole = 'lawyer' | 'client';

const SESSION_KEY = 'mohkam_client_session';
const ADMIN_ROUTE = '/admin-control-center';

interface ClientSession {
  userId: string;
  phoneNumber: string;
  linkedLawyerId: string;
  clientName: string;
  createdAt: string;
}

function AppContent() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<AppScreen>('role_gate');
  const [, setSelectedRole] = useState<UserRole>('lawyer');

  const params = new URLSearchParams(window.location.search);
  const urlLawyerId = params.get('join_lawyer');
  const inviteToken = params.get('client_invite_token');

  // Check for existing session
  useEffect(() => {
    // Check for admin control center route
    if (window.location.pathname === ADMIN_ROUTE) {
      // Let auth state determine if they can access
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUser(session.user);
        }
        setLoading(false);
      });
      return;
    }

    // If we have invite URL params, go straight to client auth
    if (urlLawyerId && inviteToken) {
      setScreen('auth_client');
      setLoading(false);
      return;
    }

    // Check for stored client session (auto-hydrate on refresh)
    const storedSession = localStorage.getItem(SESSION_KEY);
    if (storedSession) {
      try {
        const clientSession: ClientSession = JSON.parse(storedSession);
        // Validate session is not too old (30 days max)
        const sessionAge = Date.now() - new Date(clientSession.createdAt).getTime();
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
        if (sessionAge < maxAge) {
          // Reactivate the Supabase anonymous session
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user && session.user.id === clientSession.userId) {
              // Session still valid - use it
              const clientProfile: Profile = {
                id: clientSession.userId,
                full_name: clientSession.clientName,
                phone_number: clientSession.phoneNumber,
                role: 'client',
                tier: 'free',
                is_emergency_enabled: true,
                linked_lawyer_id: clientSession.linkedLawyerId,
              };
              setUser({ id: clientSession.userId });
              setProfile(clientProfile);
              setLoading(false);
              return;
            }
            // Session expired or invalid - try to refresh
            supabase.auth.signInAnonymously().then(({ data: authData }) => {
              if (authData.user) {
                const clientProfile: Profile = {
                  id: clientSession.userId,
                  full_name: clientSession.clientName,
                  phone_number: clientSession.phoneNumber,
                  role: 'client',
                  tier: 'free',
                  is_emergency_enabled: true,
                  linked_lawyer_id: clientSession.linkedLawyerId,
                };
                setUser({ id: authData.user.id });
                setProfile(clientProfile);
              } else {
                // Failed to restore - clear session
                localStorage.removeItem(SESSION_KEY);
                setScreen('auth_client');
              }
              setLoading(false);
            });
          });
          return;
        }
        // Session too old - clear it
        localStorage.removeItem(SESSION_KEY);
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }

    // Check for device fingerprint auto-login (fallback)
    const deviceFp = localStorage.getItem('mohkam_device_fp');
    if (deviceFp && document.cookie.includes('mohkam_client=1')) {
      setScreen('auth_client');
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setProfile(data as Profile);
            }
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user);
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        setProfile(prof as Profile);
      } else {
        setUser(null);
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [urlLawyerId, inviteToken]);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    document.cookie = 'mohkam_client=; path=/; max-age=0';
    localStorage.removeItem(SESSION_KEY);
    setScreen('role_gate');
  };

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    if (role === 'client') {
      setScreen('auth_client');
    } else {
      setScreen('auth_lawyer');
    }
  };

  const handleAuth = (u: any, p: Profile) => {
    setUser(u);
    setProfile(p);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: 16 }}>
        <Spinner size={36} color="var(--navy)" />
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>جاري التحميل...</p>
      </div>
    );
  }

  // Admin Control Center route
  if (window.location.pathname === ADMIN_ROUTE) {
    return <AdminControlCenter user={user} onLogout={logout} />;
  }

  // Authenticated: show portal
  if (user && profile) {
    if (profile.role === 'client') {
      return <ClientPortal user={user} profile={profile} onLogout={logout} urlLawyerId={urlLawyerId || profile.linked_lawyer_id} />;
    }
    return <LawyerPortal user={user} profile={profile} onLogout={logout} />;
  }

  // Unauthenticated: show auth screens
  if (screen === 'auth_client') {
    if (urlLawyerId) {
      return <ClientZeroAuth lawyerId={urlLawyerId} inviteToken={inviteToken || undefined} onAuth={handleAuth} onBack={() => setScreen('role_gate')} />;
    }
    // Client without invite link - show basic auth
    return <ClientZeroAuth lawyerId="" onAuth={handleAuth} onBack={() => setScreen('role_gate')} />;
  }

  if (screen === 'auth_lawyer') {
    return <AuthPage onAuth={handleAuth} onBack={() => setScreen('role_gate')} />;
  }

  return <RoleGate onSelect={handleRoleSelect} />;
}

export default function App() {
  return (
    <CaseProvider>
      <RoleProvider>
        <AppContent />
      </RoleProvider>
    </CaseProvider>
  );
}
