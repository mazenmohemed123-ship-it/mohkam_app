import { createContext, useContext, useState, type ReactNode } from 'react';

export type FirmRole = 'owner' | 'partner' | 'lawyer' | 'assistant' | 'secretary' | 'accountant';
export type Tier = 'free' | 'premium' | 'team';

export interface Profile {
  id: string;
  full_name: string;
  phone_number?: string;
  role: FirmRole | 'client';
  tier: Tier;
  office_address?: string;
  avatar_url?: string;
  bio?: string;
  is_emergency_enabled: boolean;
  linked_lawyer_id?: string;
  device_fingerprint?: string;
  started_at?: string;
  expires_at?: string;
  cancelled_at?: string;
  // Staff permissions (inherited from master lawyer)
  master_lawyer_id?: string;
  can_view_billing?: boolean;
  can_manage_appointments?: boolean;
  // Commission debt tracking
  commission_debt?: number;
  // Manual billing credentials
  vodafone_cash_number?: string;
  instapay_address?: string;
  bank_account_details?: {
    iban?: string;
    bank_name?: string;
    account_holder?: string;
    account_number?: string;
    country?: string;
    [key: string]: any;
  };
}

interface RoleContextType {
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
  activeRole: FirmRole;
  setActiveRole: (r: FirmRole) => void;
  tier: Tier;
  canDeleteCase: boolean;
  canUploadFiles: boolean;
  canEditJudgment: boolean;
  canViewChat: boolean;
  canViewCaseDetails: boolean;
  canManageBilling: boolean;
  canManageTeam: boolean;
  canViewBilling: boolean;
  canManageAppointments: boolean;
  isTeamLocked: boolean;
  /* Tier-based storage limits (daily) */
  dailyUploadLimitMB: number;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeRole, setActiveRole] = useState<FirmRole>('lawyer');

  const tier = profile?.tier || 'free';

  /* Core RBAC permissions */
  const canDeleteCase = activeRole === 'owner' || activeRole === 'partner';
  const canUploadFiles = activeRole !== 'secretary' && activeRole !== 'accountant';
  const canEditJudgment = activeRole === 'lawyer' || activeRole === 'partner' || activeRole === 'owner';
  /* UNIVERSAL CHAT - Unlocked for ALL tiers */
  const canViewChat = true;
  const canViewCaseDetails = activeRole !== 'accountant';
  const canManageBilling = activeRole === 'owner' || activeRole === 'partner' || activeRole === 'accountant';
  const canManageTeam = activeRole === 'owner' || activeRole === 'partner';

  /* Inherited permissions for staff sub-accounts */
  const canViewBilling = profile?.can_view_billing ?? (activeRole === 'owner' || activeRole === 'partner' || activeRole === 'accountant');
  const canManageAppointments = profile?.can_manage_appointments ?? (activeRole !== 'accountant');

  const isTeamLocked = tier === 'free';

  /* TIERED STORAGE LIMITS - Daily upload capacity */
  const dailyUploadLimitMB = tier === 'team'
    ? Infinity  // Unlimited
    : tier === 'premium'
      ? 2048     // 2 GB
      : 50;      // 50 MB for free

  return (
    <RoleContext.Provider
      value={{
        profile,
        setProfile,
        activeRole,
        setActiveRole,
        tier,
        canDeleteCase,
        canUploadFiles,
        canEditJudgment,
        canViewChat,
        canViewCaseDetails,
        canManageBilling,
        canManageTeam,
        canViewBilling,
        canManageAppointments,
        isTeamLocked,
        dailyUploadLimitMB,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
}
