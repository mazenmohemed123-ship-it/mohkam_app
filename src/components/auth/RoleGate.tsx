import { useState } from 'react';
import { Scale, User } from 'lucide-react';

interface RoleGateProps {
  onSelect: (role: 'lawyer' | 'client') => void;
}

export function RoleGate({ onSelect }: RoleGateProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(160deg, #0F2557 0%, #1E3A8A 55%, #3B5FC0 100%)',
      padding: 20,
    }}>
      {/* Grid overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
        backgroundSize: '60px 60px', pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20, margin: '0 auto 16px',
            background: 'rgba(255,255,255,.1)', border: '2px solid rgba(255,255,255,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 40px rgba(200,149,42,.2)',
          }}>
            <Scale size={36} color="#C8952A" />
          </div>
          <h1 style={{
            fontSize: 42, fontWeight: 900, color: '#fff',
            fontFamily: "'Tajawal', sans-serif", marginBottom: 8,
            textShadow: '0 2px 20px rgba(0,0,0,.3)',
          }}>
            مُحكَم
          </h1>
          <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 15 }}>منصة إدارة القضايا القانونية</p>
          <div style={{ width: 60, height: 3, background: 'var(--gold)', margin: '12px auto 0', borderRadius: 2 }} />
        </div>

        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14, marginBottom: 24 }}>اختر نوع الحساب</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {([
            { r: 'lawyer' as const, Icon: Scale, title: 'محامي', sub: 'جداول القضايا · تسجيل صوتي · شات · Stripe', border: '#5B8FF9', bg: 'rgba(91,143,249,.1)' },
            { r: 'client' as const, Icon: User, title: 'موكل', sub: 'متابعة قضيتك · مساعد ذكي · زر الطوارئ', border: '#4ADE80', bg: 'rgba(74,222,128,.1)' },
          ] as const).map((item) => (
            <button
              key={item.r}
              onClick={() => onSelect(item.r)}
              onMouseEnter={() => setHovered(item.r)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: 24, borderRadius: 18,
                border: `2px solid ${hovered === item.r ? item.border : 'rgba(255,255,255,.15)'}`,
                background: hovered === item.r ? item.bg : 'rgba(255,255,255,.05)',
                cursor: 'pointer', textAlign: 'center',
                transition: 'all .25s ease',
                transform: hovered === item.r ? 'scale(1.02) translateY(-2px)' : 'scale(1)',
                boxShadow: hovered === item.r ? `0 8px 32px ${item.border}33` : 'none',
              }}
            >
              <item.Icon size={28} color={hovered === item.r ? item.border : 'rgba(255,255,255,.7)'} style={{ margin: '0 auto 8px' }} />
              <p style={{ fontWeight: 900, color: '#fff', fontSize: 18, marginBottom: 4 }}>{item.title}</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', lineHeight: 1.5 }}>{item.sub}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
