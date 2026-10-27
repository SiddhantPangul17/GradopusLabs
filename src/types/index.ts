import type { PROGRAM_AVAILABILITY, PROGRAM_LEVELS } from "@/lib/constants";

export type NavItem = {
  label: string;
  href: string;
};

export type NavGroup = {
  title: string;
  items: readonly NavItem[];
};

/** A question and answer. Answers are plain paragraphs so they can be stored in a database later. */
export type FaqEntry = {
  id: string;
  question: string;
  answer: readonly string[];
  /** Optional follow-up link shown after the answer. */
  link?: NavItem;
  /** True when the answer depends on a policy that has not been finalised yet. */
  draft?: boolean;
};

export type FaqGroup = {
  id: string;
  title: string;
  items: readonly FaqEntry[];
};

export type ProgramLevel = (typeof PROGRAM_LEVELS)[number];

/** Whether students can currently enroll. Nothing is "open" until enrollment is implemented. */
export type ProgramAvailability = (typeof PROGRAM_AVAILABILITY)[number];

export type ProgramModule = {
  title: string;
  topics: readonly string[];
};

export type ProgramTask = {
  title: string;
  description: string;
};

/**
 * A training program. Plain, serialisable data so the same shape can be
 * loaded from MongoDB later without changing the pages that render it.
 */
export type Program = {
  slug: string;
  title: string;
  category: string;
  /** One or two sentences for cards and meta descriptions. */
  summary: string;
  overview: readonly string[];
  level: ProgramLevel;
  durationWeeks: number;
  weeklyEffort: string;
  deliveryFormat: string;
  /** Price in the smallest currency unit (paise for INR). */
  pricePaise: number;
  currency: string;
  availability: ProgramAvailability;
  featured: boolean;
  audience: readonly string[];
  prerequisites: readonly string[];
  outcomes: readonly string[];
  modules: readonly ProgramModule[];
  tasks: readonly ProgramTask[];
  finalProject: string;
  inclusions: readonly string[];
  completionCriteria: readonly string[];
  faqs: readonly FaqEntry[];
};
