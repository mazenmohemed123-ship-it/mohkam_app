import { useState, useEffect } from 'react';
import { Crown, Zap, Users, Lock, Check, MapPin, Wallet, CreditCard, Shield, ArrowRight } from 'lucide-react';
import { Button, Card, Badge, Spinner } from '../atoms';
import { supabase } from '../../services/supabase';
import { useRole, type Tier } from '../../context/RoleContext';

interface SubScreenProps {
  profile: any;
  onUpdateProfile: (p: any) => void;
  push: (msg: string, type: 'success' | 'warning' | 'danger') => void;
  caseCount?: number;
}

interface TierInfo {
  id: Tier;
  name: string;
  priceLocal: number;
  priceIntl: number;
  currency: string;
  icon: typeof Crown;
  color: string;
  badge?: string;
  features: string[];
}

/* Paymob payment channels */
const PAYMOB_CHANNELS = [
  { id: 'card', label: 'بطاقة ائتمانية', desc: 'فيزا / ماستركارد / Meeza', icon: '💳', color: '#635BFF' },
  { id: 'vodafone', label: 'فودافون كاش', desc: 'محفظة فودافون كاش', icon: '📱', color: '#E60000' },
  { id: 'aman', label: 'أمان', desc: 'محفظة أمان الإلكترونية', icon: '🏦', color: '#00B4D8' },
];

const TIERS: TierInfo[] = [
  {
    id: 'free', name: 'مجاني', priceLocal: 0, priceIntl: 0, currency: 'EGP',
    icon: Zap, color: 'var(--muted)', badge: undefined,
    features: ['3 قضايا فقط', 'تسجيل صوتي أساسي', 'بوابة الموكل'],
  },
  {
    id: 'premium', name: 'احترافي', priceLocal: 500, priceIntl: 20, currency: 'EGP',
    icon: Crown, color: 'var(--navy)', badge: 'الأكثر شعبية',
    features: ['قضايا غير محدودة', 'شات real-time', 'إشعارات FCM', 'رابط دعوة', 'تحليل صوتي'],
  },
  {
    id: 'team', name: 'فريق', priceLocal: 800, priceIntl: 50, currency: 'EGP',
    icon: Users, color: 'var(--gold)', badge: 'مكاتب المحامين',
    features: ['كل ميزات الاحترافي', 'حتى 10 محامين', 'تقارير مالية', 'دعم أولوية', 'سكرتير ومحاسب'],
  },
];

function detectLocale(): 'local' | 'intl' {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.startsWith('Africa/Cairo') || tz.includes('Egypt')) return 'local';
    const lang = navigator.language || (navigator as any).userLanguage;
    if (lang?.startsWith('ar-EG')) return 'local';
    return 'intl';
  } catch {
    return 'local';
  }
}

export function SubScreen({ profile, onUpdateProfile, push, caseCount = 0 }: SubScreenProps) {
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [locale, setLocale] = useState<'local' | 'intl'>('local');
  const { isTeamLocked, tier } = useRole();

  /* Paymob checkout modal state */
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedTier, setSelectedTier] = useState<TierInfo | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    setLocale(detectLocale());
  }, []);

  const isOutsideEgypt = locale === 'intl';

  /* Open Paymob checkout modal instead of immediate upgrade */
  const openCheckout = (tierInfo: TierInfo) => {
    if (tierInfo.id === 'free') return; // Free tier doesn't need payment
    setSelectedTier(tierInfo);
    setSelectedChannel('');
    setPaymentSuccess(false);
    setShowCheckout(true);
  };

  const closeCheckout = () => {
    if (processing) return; // Prevent closing during processing
    setShowCheckout(false);
    setSelectedTier(null);
    setSelectedChannel('');
  };

  /* Process payment through Paymob - simulate gateway connection */
  const processPayment = async () => {
    if (!selectedTier || !selectedChannel) return;

    setProcessing(true);

    // Simulate connection to Paymob gateway
    // In production: Call Supabase Edge Function to create Paymob order, get payment key, redirect to checkout
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Simulate successful webhook response
    // In production: Webhook from Paymob would update the database
    const { error } = await supabase.from('profiles').update({
      tier: selectedTier.id,
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).eq('id', profile.id);

    setProcessing(false);

    if (!error) {
      setPaymentSuccess(true);
      const updated = {
        ...profile,
        tier: selectedTier.id,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };
      onUpdateProfile(updated);
      push(`✓ تمت الترقية إلى ${selectedTier.name} بنجاح!`, 'success');

      // Auto-close after showing success
      setTimeout(() => {
        setShowCheckout(false);
        setSelectedTier(null);
      }, 2000);
    } else {
      push('خطأ في تحديث الباقة: ' + error.message, 'danger');
    }
  };

  const formatPrice = (t: TierInfo) => {
    if (isOutsideEgypt) return `$${t.priceIntl}`;
    return `${t.priceLocal.toLocaleString('ar-EG')} ج`;
  };

  const getPrice = (t: TierInfo) => {
    return isOutsideEgypt ? t.priceIntl : t.priceLocal;
  };

  const isFreeTierLocked = tier === 'free' && caseCount >= 3;

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 18 }}>الباقات والاشتراكات</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            باقتك الحالية: <strong>{profile?.tier === 'free' ? 'مجاني' : profile?.tier === 'premium' ? 'احترافي' : 'فريق'}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#F5F8FF', borderRadius: 8 }}>
          <MapPin size={12} color={isOutsideEgypt ? 'var(--gold)' : 'var(--success)'} />
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
            {isOutsideEgypt ? 'دولي (USD)' : 'مصر (EGP)'}
          </span>
        </div>
      </div>

      {isFreeTierLocked && (
        <div style={{ background: '#FDECEF', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Lock size={16} color="var(--danger)" />
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--danger)' }}>تم الوصول للحد الأقصى</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>باقة المجاني تسمح بـ 3 قضايا فقط. قم بالترقية لإضافة المزيد.</p>
          </div>
        </div>
      )}

      {/* Tier Cards - Responsive Grid - All 3 visible on mobile/desktop */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TIERS.map((t) => {
          const isCur = (profile?.tier || 'free') === t.id;
          const isLocked = t.id === 'team' && isTeamLocked;
          const Icon = t.icon;

          return (
            <Card
              key={t.id}
              style={{
                padding: 24, position: 'relative', overflow: 'hidden',
                border: isCur ? `2px solid ${t.color}` : '1px solid var(--border)',
                boxShadow: isCur ? `0 4px 20px ${t.color}22` : 'var(--shadow)',
                transition: 'all .3s',
              }}
              className={isLocked ? 'lock-overlay' : ''}
            >
              {/* Badge */}
              {t.badge && (
                <div style={{
                  position: 'absolute', top: -1, left: 0, right: 0, height: 3,
                  background: t.color, borderRadius: '14px 14px 0 0',
                }} />
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: t.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={20} color={t.color} />
                </div>
                <div>
                  <p style={{ fontWeight: 900, fontSize: 17, color: 'var(--text)' }}>{t.name}</p>
                  {t.badge && <Badge color={t.id === 'team' ? 'gold' : 'navy'}>{t.badge}</Badge>}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 16 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: t.color, fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatPrice(t)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>/شهر</span>
              </div>

              <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {t.features.map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: t.color + '20', color: t.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Check size={10} />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                variant={isCur ? 'secondary' : t.id === 'team' ? 'gold' : 'primary'}
                disabled={isCur || upgrading === t.id || isLocked}
                onClick={() => !isLocked && openCheckout(t)}
                fullWidth
                style={{ background: isCur ? undefined : t.color }}
              >
                {upgrading === t.id ? <><Spinner /> جاري الترقية...</> : isCur ? '✓ خطتك الحالية' : 'ترقية الآن'}
              </Button>

              {/* Monetization Lock overlay */}
              {isLocked && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(4px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 'var(--radius)', zIndex: 10,
                }}>
                  <Badge color="gold" >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Lock size={10} /> الميزة مقفلة - برجاء الترقية لباقة الفريق (800 ج)
                    </div>
                  </Badge>
                </div>
              )}

              {/* Subscription metadata */}
              {isCur && isOutsideEgypt && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: '#F5F8FF', borderRadius: 8, fontSize: 10, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                  started_at: {profile?.started_at || '—'} | expires_at: {profile?.expires_at || '—'} | cancelled_at: {profile?.cancelled_at || 'null'}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ==================== PAYMOB CHECKOUT MODAL ==================== */}
      {showCheckout && selectedTier && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10,20,60,.8)', backdropFilter: 'blur(8px)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <Card className="slide-up" style={{ width: '100%', maxWidth: 480, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, var(--navy), var(--navy-light))',
              padding: '20px 24px', color: '#fff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <selectedTier.icon size={24} color={selectedTier.color} />
                  </div>
                  <div>
                    <p style={{ fontSize: 18, fontWeight: 900 }}>ترقية إلى {selectedTier.name}</p>
                    <p style={{ fontSize: 12, opacity: 0.7 }}>دفع آمن عبر Paymob</p>
                  </div>
                </div>
                {!processing && (
                  <button
                    onClick={closeCheckout}
                    style={{
                      background: 'rgba(255,255,255,.15)', border: 'none',
                      color: '#fff', width: 32, height: 32, borderRadius: 8,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <ArrowRight size={18} />
                  </button>
                )}
              </div>
            </div>

            {paymentSuccess ? (
              /* Success State */
              <div className="fade-up" style={{ padding: 40, textAlign: 'center' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%', background: '#E6F7EF',
                  margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check size={36} color="var(--success)" />
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 900, color: 'var(--success)', marginBottom: 8 }}>
                  تم الدفع بنجاح!
                </h3>
                <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                  تم تفعيل باقة {selectedTier.name} لحسابك
                </p>
              </div>
            ) : (
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Amount Display - High Visibility */}
                <div style={{
                  background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
                  borderRadius: 16, padding: 20, textAlign: 'center',
                  border: '2px solid var(--gold)',
                }}>
                  <p style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>المبلغ المطلوب</p>
                  <p style={{
                    fontSize: 42, fontWeight: 900, color: 'var(--gold)',
                    fontFamily: "'JetBrains Mono', monospace",
                    textShadow: '0 2px 8px rgba(200,149,42,.2)',
                  }}>
                    {formatPrice(selectedTier)}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    {isOutsideEgypt ? 'USD' : 'جنيه مصري'} / شهرياً
                  </p>
                </div>

                {/* Payment Channels */}
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>
                    اختر طريقة الدفع
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {PAYMOB_CHANNELS.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => !processing && setSelectedChannel(ch.id)}
                        disabled={processing}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14,
                          padding: '14px 16px', borderRadius: 14,
                          border: selectedChannel === ch.id ? `2px solid ${ch.color}` : '1.5px solid var(--border)',
                          background: selectedChannel === ch.id ? `${ch.color}08` : '#fff',
                          cursor: processing ? 'not-allowed' : 'pointer',
                          transition: 'all .2s', textAlign: 'right',
                          opacity: processing ? 0.6 : 1,
                        }}
                      >
                        <span style={{ fontSize: 28, flexShrink: 0 }}>{ch.icon}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{ch.label}</p>
                          <p style={{ fontSize: 12, color: 'var(--muted)' }}>{ch.desc}</p>
                        </div>
                        {selectedChannel === ch.id && (
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%', background: ch.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <Check size={14} color="#fff" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Security Notice */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', background: '#F5F8FF', borderRadius: 10,
                }}>
                  <Shield size={16} color="var(--navy)" />
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)' }}>دفع آمن ومشفر</p>
                    <p style={{ fontSize: 10, color: 'var(--muted)' }}>جميع المعاملات محمية بـ SSL/TLS</p>
                  </div>
                </div>

                {/* Pay Button */}
                <Button
                  variant="gold"
                  fullWidth
                  disabled={!selectedChannel || processing}
                  onClick={processPayment}
                  style={{
                    padding: '16px 24px', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  }}
                >
                  {processing ? (
                    <>
                      <Spinner size={20} />
                      <span>جاري الاتصال ببوابة سداد Paymob الآمنة...</span>
                    </>
                  ) : (
                    <>
                      <Wallet size={18} />
                      <span>ادفع {formatPrice(selectedTier)}</span>
                    </>
                  )}
                </Button>

                {/* Terms */}
                <p style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6 }}>
                  بالضغط على "ادفع" فإنك توافق على شروط الاستخدام وسياسة الخصوصية.
                  سيتم تفعيل الباقة فوراً بعد نجاح الدفع.
                </p>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
