import { useState, useEffect } from 'react';
import { Shield, Search, Users, DollarSign, Ban, Check, X, Crown, Zap, Settings, AlertTriangle, LogOut, Edit3, Save, Filter, TrendingUp, UserX, UserCheck } from 'lucide-react';
import { Button, Card, Badge, Spinner } from '../atoms';
import { supabase } from '../../services/supabase';
import { useNotifications } from '../../hooks/useNotifications';

interface AdminControlCenterProps {
  user: any;
  onLogout: () => void;
}

interface LawyerProfile {
  id: string;
  full_name: string;
  email?: string;
  phone_number?: string;
  role: string;
  tier: string;
  commission_debt: number;
  commission_rate: number;
  is_frozen: boolean;
  avatar_url?: string;
  created_at: string;
  started_at?: string;
  expires_at?: string;
}

interface GlobalSettings {
  default_commission_percentage: number;
}

const STATUS_FILTERS = [
  { id: 'all', label: 'All', labelAr: 'الكل' },
  { id: 'active', label: 'Active', labelAr: 'نشط' },
  { id: 'frozen', label: 'Frozen', labelAr: 'مجمد' },
  { id: 'debt_over_500', label: 'Debt > 500 EGP', labelAr: 'دين > ٥٠٠ ج' },
];

export function AdminControlCenter({ user, onLogout }: AdminControlCenterProps) {
  const [lawyers, setLawyers] = useState<LawyerProfile[]>([]);
  const [filtered, setFiltered] = useState<LawyerProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [globalCommission, setGlobalCommission] = useState(5);
  const [savingCommission, setSavingCommission] = useState(false);
  const [stats, setStats] = useState({ totalRevenue: 0, activeFree: 0, activePremium: 0, activeTeam: 0, totalDebt: 0 });
  const [editingCommission, setEditingCommission] = useState<string | null>(null);
  const [customCommission, setCustomCommission] = useState<number>(0);
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  const { list: notifList, push } = useNotifications();

  /* Access control: Mazen only */
  const isAuthorized = user?.email === 'mazen@mazen.engineer';

  useEffect(() => {
    if (!isAuthorized) return;
    loadLawyers();
    loadGlobalSettings();
  }, [isAuthorized]);

  useEffect(() => {
    filterLawyers();
  }, [searchQuery, statusFilter, lawyers]);

  const loadLawyers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone_number, role, tier, commission_debt, commission_rate, is_frozen, avatar_url, created_at, started_at, expires_at')
      .in('role', ['owner', 'partner', 'lawyer', 'assistant', 'secretary', 'accountant'])
      .order('created_at', { ascending: false });

    if (!error && data) {
      const lawyersWithEmail = await Promise.all(
        data.map(async (p) => {
          // Get email from auth metadata if available
          const { data: authData } = await supabase.auth.admin.getUserById(p.id);
          return {
            ...p,
            email: authData?.user?.email || '',
            commission_rate: p.commission_rate || globalCommission,
            is_frozen: p.is_frozen || false,
            commission_debt: p.commission_debt || 0,
          } as LawyerProfile;
        })
      );
      setLawyers(lawyersWithEmail);
      calculateStats(lawyersWithEmail);
    }
    setLoading(false);
  };

  const loadGlobalSettings = async () => {
    // In production, this would load from a global_settings table
    // For now, use default
    setGlobalCommission(5);
  };

  const calculateStats = (lawyerList: LawyerProfile[]) => {
    const totalDebt = lawyerList.reduce((sum, l) => sum + (l.commission_debt || 0), 0);
    const activeFree = lawyerList.filter(l => l.tier === 'free' && !l.is_frozen).length;
    const activePremium = lawyerList.filter(l => l.tier === 'premium' && !l.is_frozen).length;
    const activeTeam = lawyerList.filter(l => l.tier === 'team' && !l.is_frozen).length;
    // Calculate revenue (simplified - sum of commissions owed)
    const totalRevenue = lawyerList.reduce((sum, l) => {
      const rate = (l.commission_rate || 5) / 100;
      // Estimate from debt as proxy
      return sum + (l.commission_debt || 0);
    }, 0);
    setStats({ totalRevenue, activeFree, activePremium, activeTeam, totalDebt });
  };

  const filterLawyers = () => {
    let result = [...lawyers];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(l =>
        l.full_name?.toLowerCase().includes(query) ||
        l.email?.toLowerCase().includes(query) ||
        l.phone_number?.includes(query)
      );
    }

    // Status filter
    if (statusFilter === 'active') {
      result = result.filter(l => !l.is_frozen);
    } else if (statusFilter === 'frozen') {
      result = result.filter(l => l.is_frozen);
    } else if (statusFilter === 'debt_over_500') {
      result = result.filter(l => (l.commission_debt || 0) > 500);
    }

    setFiltered(result);
  };

  const saveGlobalCommission = async () => {
    setSavingCommission(true);
    // In production, save to global_settings table
    await new Promise(resolve => setTimeout(resolve, 500));
    push(`✓ Commission rate set to ${globalCommission}%`, 'success');
    setSavingCommission(false);
  };

  const toggleFreeze = async (lawyerId: string, currentState: boolean) => {
    setProcessingAction(lawyerId);
    const { error } = await supabase
      .from('profiles')
      .update({ is_frozen: !currentState })
      .eq('id', lawyerId);

    if (!error) {
      setLawyers(prev => prev.map(l => l.id === lawyerId ? { ...l, is_frozen: !currentState } : l));
      push(!currentState ? '✓ Account frozen' : '✓ Account unfrozen', 'success');
    } else {
      push('Error updating account', 'danger');
    }
    setProcessingAction(null);
  };

  const updateTier = async (lawyerId: string, newTier: string) => {
    setProcessingAction(lawyerId);
    const { error } = await supabase
      .from('profiles')
      .update({ tier: newTier })
      .eq('id', lawyerId);

    if (!error) {
      setLawyers(prev => prev.map(l => l.id === lawyerId ? { ...l, tier: newTier as any } : l));
      push(`✓ Tier updated to ${newTier}`, 'success');
    } else {
      push('Error updating tier', 'danger');
    }
    setProcessingAction(null);
  };

  const saveCustomCommission = async (lawyerId: string) => {
    setProcessingAction(lawyerId);
    const { error } = await supabase
      .from('profiles')
      .update({ commission_rate: customCommission })
      .eq('id', lawyerId);

    if (!error) {
      setLawyers(prev => prev.map(l => l.id === lawyerId ? { ...l, commission_rate: customCommission } : l));
      push(`✓ Custom commission rate set to ${customCommission}%`, 'success');
    } else {
      push('Error saving commission rate', 'danger');
    }
    setEditingCommission(null);
    setProcessingAction(null);
  };

  // Unauthorized view
  if (!isAuthorized) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e, #16213e)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Card style={{ maxWidth: 400, padding: 40, textAlign: 'center', background: '#fff' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#FDECEF', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={40} color="#C41E3A" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#C41E3A', marginBottom: 12 }}>Access Denied</h2>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>This control center is restricted to authorized administrators only.</p>
          <Button variant="danger" onClick={onLogout} style={{ width: '100%' }}>
            <LogOut size={14} style={{ marginRight: 8 }} /> Exit
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Notification UI */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
        {/* Simplified notification display */}
        {notifList.length > 0 && (
          <div style={{ padding: '8px 16px', background: '#fff', borderBottom: '1px solid var(--border)' }}>
            {notifList.map(n => (
              <div key={n.id} style={{ fontSize: 12, color: n.type === 'success' ? 'var(--success)' : n.type === 'danger' ? 'var(--danger)' : 'var(--warning)' }}>
                {n.msg}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Header */}
      <header style={{ background: 'linear-gradient(135deg, #0a192f, #1a365d)', color: '#fff', padding: '0 20px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 20px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={20} color="var(--gold)" />
          </div>
          <div>
            <p style={{ fontWeight: 900, fontSize: 16 }}>Super Admin Control Center</p>
            <p style={{ fontSize: 10, opacity: 0.6 }}>Restricted Access</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Badge color="gold">{user?.email}</Badge>
          <Button variant="ghost" onClick={onLogout} style={{ color: '#fff', border: '1px solid rgba(255,255,255,.2)' }}>
            <LogOut size={14} /> Exit
          </Button>
        </div>
      </header>

      <main style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
        {/* Stats Dashboard */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <Card style={{ padding: 20, background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <DollarSign size={20} color="var(--gold)" />
              <span style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>Total Platform Revenue</span>
            </div>
            <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--gold)', fontFamily: "'JetBrains Mono', monospace" }}>{stats.totalRevenue.toLocaleString()} ج</p>
          </Card>
          <Card style={{ padding: 20, background: '#E6F7EF' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Zap size={20} color="var(--muted)" />
              <span style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>Free Tier</span>
            </div>
            <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--muted)' }}>{stats.activeFree}</p>
          </Card>
          <Card style={{ padding: 20, background: '#F5F8FF' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Crown size={20} color="var(--navy)" />
              <span style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>Pro Tier</span>
            </div>
            <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--navy)' }}>{stats.activePremium}</p>
          </Card>
          <Card style={{ padding: 20, background: '#FDF4E7' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Users size={20} color="var(--gold)" />
              <span style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>Team Tier</span>
            </div>
            <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--gold)' }}>{stats.activeTeam}</p>
          </Card>
          <Card style={{ padding: 20, background: '#FDECEF' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <AlertTriangle size={20} color="var(--danger)" />
              <span style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>Total Debt Owed</span>
            </div>
            <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--danger)', fontFamily: "'JetBrains Mono', monospace" }}>{stats.totalDebt.toLocaleString()} ج</p>
          </Card>
        </div>

        {/* Global Configuration Panel */}
        <Card style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Settings size={20} color="var(--navy)" />
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)' }}>Global Configuration</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Default Commission %</label>
              <input
                type="number"
                value={globalCommission}
                onChange={(e) => setGlobalCommission(Number(e.target.value))}
                min={0}
                max={100}
                step={0.5}
                style={{ width: 80, padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}
              />
            </div>
            <Button variant="gold" disabled={savingCommission} onClick={saveGlobalCommission}>
              {savingCommission ? <><Spinner size={14} /> Saving...</> : <><Save size={14} /> Save</>}
            </Button>
          </div>
        </Card>

        {/* Search & Filter Card */}
        <Card style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Search size={20} color="var(--navy)" />
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)' }}>Live Search & Filter</h3>
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <Search size={18} color="var(--muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, or phone..."
              style={{ width: '100%', padding: '12px 14px 12px 42px', border: '2px solid var(--border)', borderRadius: 12, fontSize: 14, transition: 'border .2s' }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--navy)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
            />
          </div>

          {/* Status Filter Chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                style={{
                  padding: '8px 16px', borderRadius: 99,
                  border: statusFilter === f.id ? '2px solid var(--navy)' : '1px solid var(--border)',
                  background: statusFilter === f.id ? 'var(--navy)' : '#fff',
                  cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  color: statusFilter === f.id ? '#fff' : 'var(--text)',
                  transition: 'all .15s',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Lawyers Data Grid */}
        <Card style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Users size={20} color="var(--navy)" />
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)' }}>Lawyers Management</h3>
            </div>
            <Badge color="default">{filtered.length} results</Badge>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spinner size={24} />
              <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading lawyers...</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map((lawyer) => {
                const isDebtOverdue = (lawyer.commission_debt || 0) > 500;
                return (
                  <div
                    key={lawyer.id}
                    style={{
                      padding: '16px 20px',
                      background: lawyer.is_frozen ? '#F5F5F5' : '#FAFBFE',
                      borderRadius: 12,
                      border: isDebtOverdue ? '2px solid var(--danger)' : '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      opacity: lawyer.is_frozen ? 0.7 : 1,
                    }}
                  >
                    {/* Avatar */}
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {lawyer.avatar_url ? <img src={lawyer.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 18 }}>👨‍⚖️</span>}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lawyer.full_name || 'Unknown'}
                        </p>
                        {lawyer.is_frozen && <Badge color="red">Frozen</Badge>}
                        {isDebtOverdue && <Badge color="orange">Debt: {(lawyer.commission_debt || 0).toLocaleString()} ج</Badge>}
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                        {lawyer.email || lawyer.phone_number || 'No contact'}
                      </p>
                    </div>

                    {/* Tier */}
                    <div style={{ textAlign: 'center' }}>
                      <select
                        value={lawyer.tier}
                        onChange={(e) => updateTier(lawyer.id, e.target.value)}
                        disabled={processingAction === lawyer.id}
                        style={{
                          padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                          fontSize: 11, fontWeight: 700, background: '#fff',
                          cursor: processingAction === lawyer.id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <option value="free">Free</option>
                        <option value="premium">Pro</option>
                        <option value="team">Team</option>
                      </select>
                    </div>

                    {/* Commission Rate */}
                    <div style={{ minWidth: 80 }}>
                      {editingCommission === lawyer.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            value={customCommission}
                            onChange={(e) => setCustomCommission(Number(e.target.value))}
                            min={0}
                            max={100}
                            style={{ width: 50, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }}
                          />
                          <Button size="sm" variant="gold" onClick={() => saveCustomCommission(lawyer.id)}><Check size={10} /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingCommission(null)}><X size={10} /></Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingCommission(lawyer.id); setCustomCommission(lawyer.commission_rate || globalCommission); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}
                        >
                          {lawyer.commission_rate || globalCommission}%
                          <Edit3 size={10} />
                        </button>
                      )}
                    </div>

                    {/* Debt Display */}
                    <div style={{ textAlign: 'center', minWidth: 80 }}>
                      <p style={{ fontSize: 12, fontWeight: 900, color: isDebtOverdue ? 'var(--danger)' : 'var(--text)', fontFamily: "'JetBrains Mono', monospace" }}>
                        {(lawyer.commission_debt || 0).toLocaleString()} ج
                      </p>
                    </div>

                    {/* Freeze/Unfreeze Button */}
                    <Button
                      size="sm"
                      variant={lawyer.is_frozen ? 'primary' : 'secondary'}
                      onClick={() => toggleFreeze(lawyer.id, lawyer.is_frozen)}
                      disabled={processingAction === lawyer.id}
                    >
                      {lawyer.is_frozen ? <UserCheck size={14} /> : <UserX size={14} />}
                      {lawyer.is_frozen ? ' Unfreeze' : ' Freeze'}
                    </Button>
                  </div>
                );
              })}

              {filtered.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                  <Search size={32} style={{ marginBottom: 12 }} />
                  <p>No lawyers found matching your criteria</p>
                </div>
              )}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
