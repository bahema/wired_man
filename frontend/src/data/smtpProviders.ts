export type SmtpProviderPreset = {
  id: 'gmail' | 'outlook' | 'zoho' | 'webmail' | 'custom';
  label: string;
  host: string;
  port: number;
  secure: boolean;
  note: string;
};

export const SMTP_PROVIDER_PRESETS: SmtpProviderPreset[] = [
  {
    id: 'gmail',
    label: 'Gmail SMTP',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    note: 'Use an App Password; 2FA required.'
  },
  {
    id: 'outlook',
    label: 'Outlook / Office 365',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    note: 'Use STARTTLS on port 587.'
  },
  {
    id: 'zoho',
    label: 'Zoho Mail',
    host: 'smtp.zoho.com',
    port: 465,
    secure: true,
    note: 'Use an App Password for SMTP.'
  },
  {
    id: 'webmail',
    label: 'cPanel / Webmail',
    host: 'mail.yourdomain.com',
    port: 465,
    secure: true,
    note: 'Use your domain SMTP host.'
  },
  {
    id: 'custom',
    label: 'Custom SMTP',
    host: '',
    port: 587,
    secure: false,
    note: 'Fill in host, port, and security.'
  }
];
