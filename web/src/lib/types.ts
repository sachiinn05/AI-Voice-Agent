export type PreferredLanguage = "en-US" | "en-IN" | "hi-IN-hinglish";

export type Agent = {
  id: string;
  name: string;
  tagline: string;
  flag: string;
  language: PreferredLanguage;
  voice: { provider: string };
};

export type Lead = {
  company_name: string;
  contact_name: string;
  contact_number: string;
  contact_role?: string;
  company_domain?: string;
  company_description?: string;
  industry: string;
  need_for_bot?: string;
  preferred_language: PreferredLanguage;
  lead_source?: string;
  priority_tier?: string;
  gender?: string;
  email?: string;
};

export type BookingInfo = {
  via: "cal.com" | "logged";
  start?: string;
  uid?: string;
  emailedTo?: string;
  note?: string;
};

export type MeetingDetails = { date?: string; time?: string; booking?: BookingInfo } | null | undefined;

export type CallResult = {
  call_id: string;
  disposition: string;
  lead_score: number | string;
  call_summary?: string;
  full_transcript?: string;
  meeting_details?: MeetingDetails;
  lead?: { contact_name?: string; company_name?: string };
  timestamp?: string;
};

export type ReplyVia = "script" | "groq" | "steer" | "faq";

export type ReplyResponse = {
  agent: string;
  via: ReplyVia;
  faqId?: string | null;
  ended: boolean;
  result?: CallResult | null;
};

export type StartResponse = {
  callId: string;
  agent: string;
  via: ReplyVia;
};

export type DashboardStats = {
  calls: number;
  booked: number;
  leads: number;
  questions: number;
  unanswered: number;
  ragChunks: number;
};

export type DashboardData = {
  company: { id: string; name: string; founder: string };
  stats: DashboardStats;
  recentCalls: CallResult[];
  bookings: unknown[];
  unansweredQuestions: unknown[];
};

export type Booking = {
  callId: string;
  at: string;
  contactName: string;
  companyName: string;
  meeting: MeetingDetails;
  disposition: string;
};

export type QuestionRow = {
  question: string;
  faqId: string | null;
  at: string;
  callId: string;
  contactName: string;
};

export type ScriptView = {
  path: string;
  script: Record<string, unknown>;
  rag: { source: string; chunks: number; model: string; createdAt: string } | null;
};
