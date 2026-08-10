import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Shield,
  FileText,
  Play,
  Send,
  TrendingUp,
  Users,
} from 'lucide-react';

export interface AdminTabDef {
  id: string;
  label: string;
  icon: LucideIcon;
}

/** Flat tab order (mobile picker). */
export const ADMIN_TABS: AdminTabDef[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'classrooms', label: 'Classrooms', icon: Shield },
  { id: 'templates', label: 'In-class labs', icon: FileText },
  { id: 'template-executions', label: 'Executions', icon: Play },
  { id: 'template-submissions', label: 'Submissions', icon: Send },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  { id: 'users', label: 'Users', icon: Users },
];

const byId = Object.fromEntries(ADMIN_TABS.map((t) => [t.id, t]));

/** Grouped nav for the sidebar rail designs (workbench/aero). */
export const ADMIN_NAV_GROUPS: { label: string; tabs: AdminTabDef[] }[] = [
  { label: 'Insights', tabs: [byId['overview'], byId['analytics']] },
  { label: 'Classroom', tabs: [byId['classrooms']] },
  {
    label: 'Templates',
    tabs: [byId['templates'], byId['template-executions'], byId['template-submissions']],
  },
  { label: 'People', tabs: [byId['users']] },
];
