import { useState } from 'react';
import { ArrowRight, Mail, Phone, Lock, User } from 'lucide-react';
import { Button, Field, Card, Spinner, GoogleIcon } from '../atoms';
import { supabase } from '../../services/supabase';
import { isValidGlobalPhone } from '../../services/phoneValidation';
import type { Profile } from '../../context/RoleContext';

interface AuthPageProps {
  onAuth: (user: any, profile: Profile) => void;
  onBack: () => void;
}

export function AuthPage({ onAuth, onBack }: AuthPageProps) {
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const signUp = async () => {
    setLoading(true);
    setError('');
    if (!name || !email || !phone || !pass) {
      setError('يرجى تعبئة جميع الحقول');
      setLoading(false);
      return;
    }
    const phoneValidation = isValidGlobalPhone(phone);
    if (!phoneValidation.valid) {
      setError(phoneValidation.error || 'رقم الهاتف غير صالح');
      setLoading(false);
      return;
    }
    const { data, error: authErr } = await supabase.auth.signUp({ email, password: pass });
    if (authErr) { setError(authErr.message); setLoading(false); return; }
    if (data.user) {
      const profile: Profile = {
        id: data.user.id, full_name: name, phone_number: phone,
        role: 'lawyer', tier: 'free', is_emergency_enabled: true,
      };
      await supabase.from('profiles').insert([{ id: data.user.id, full_name: name, phone_number: phone, role: 'lawyer', tier: 'free', is_emergency_enabled: true }]);
      onAuth(data.user, profile);
    }
    setLoading(false);
  };

  const signIn = async () => {
    setLoading(true);
    setError('');
    if (!email || !pass) { setError('يرجى إدخال البريد وكلمة المرور'); setLoading(false); return; }
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (authErr) { setError(authErr.message); setLoading(false); return; }
    if (data.user) {
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
      onAuth(data.user, prof as Profile);
    }
    setLoading(false);
  };

  const signInGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) { setError(error.message); setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(160deg, #0F2557, #1E3A8A)', padding: 20,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)',
        backgroundSize: '60px 60px', pointerEvents: 'none',
      }} />

      <Card style={{ maxWidth: 440, width: '100%', padding: 32, position: 'relative', zIndex: 1 }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: 'var(--navy)', fontWeight: 700,
          cursor: 'pointer', marginBottom: 20, fontSize: 13, fontFamily: "'Cairo',sans-serif",
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <ArrowRight size={16} /> رجوع
        </button>

        <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--navy)', marginBottom: 4 }}>
          {mode === 'signup' ? 'إنشاء حساب محامي' : 'تسجيل الدخول'}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
          {mode === 'signup' ? 'أنشئ حسابك لبدء إدارة قضاياك' : 'أدخل بياناتك للمتابعة'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {mode === 'signup' && (
            <div style={{ position: 'relative' }}>
              <User size={16} color="var(--muted)" style={{ position: 'absolute', right: 12, top: 36 }} />
              <Field label="الاسم الكامل" value={name} onChange={setName} placeholder="أحمد محمد علي" />
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <Mail size={16} color="var(--muted)" style={{ position: 'absolute', right: 12, top: 36 }} />
            <Field label="البريد الإلكتروني" value={email} onChange={setEmail} type="email" placeholder="your@email.com" />
          </div>
          {mode === 'signup' && (
            <div style={{ position: 'relative' }}>
              <Phone size={16} color="var(--muted)" style={{ position: 'absolute', right: 12, top: 36 }} />
              <Field label="رقم الهاتف" value={phone} onChange={setPhone} type="tel" placeholder="+20 123 456 7890" />
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <Lock size={16} color="var(--muted)" style={{ position: 'absolute', right: 12, top: 36 }} />
            <Field label="كلمة المرور" value={pass} onChange={setPass} type="password" placeholder="••••••••" />
          </div>

          {error && (
            <p style={{ fontSize: 12, color: 'var(--danger)', background: '#FDECEF', padding: '9px 13px', borderRadius: 9 }}>
              ❌ {error}
            </p>
          )}

          <Button fullWidth onClick={mode === 'signup' ? signUp : signIn} disabled={loading} style={{ marginTop: 4 }}>
            {loading ? <><Spinner /> جاري...</> : mode === 'signup' ? 'إنشاء الحساب' : 'دخول'}
          </Button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>أو</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <Button variant="google" fullWidth onClick={signInGoogle} disabled={loading}>
            <GoogleIcon size={18} />
            متابعة باستخدام Google
          </Button>
        </div>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            {mode === 'signup' ? 'لديك حساب؟' : 'ليس لديك حساب؟'}{' '}
            <button
              onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--navy)', fontWeight: 700, cursor: 'pointer', fontSize: 12, fontFamily: "'Cairo',sans-serif" }}
            >
              {mode === 'signup' ? 'سجّل دخول' : 'إنشاء حساب'}
            </button>
          </p>
        </div>
      </Card>
    </div>
  );
}
