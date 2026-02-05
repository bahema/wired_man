export type CampaignStatus = 'Scheduled' | 'Draft' | 'Sent' | 'Paused';

export type Campaign = {
  name: string;
  status: CampaignStatus;
  time: string;
  audience: string;
};

export const CAMPAIGNS: Campaign[] = [
  { name: 'Automation Weekly Digest', status: 'Scheduled', time: 'Tue 9:00 AM', audience: 'Africa' },
  { name: 'Forex Strategy Drop', status: 'Draft', time: 'Not scheduled', audience: 'Global' },
  { name: 'Affiliate Toolkit Promo', status: 'Sent', time: 'Yesterday', audience: 'Europe' }
];
