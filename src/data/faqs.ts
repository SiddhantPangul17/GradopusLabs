import { brand } from "@/config/brand";
import type { FaqEntry, FaqGroup } from "@/types";

/*
 * Site-wide FAQ content. Answers marked `draft: true` depend on policies that
 * have not been finalised and are shown with a "Draft" label. Review every
 * answer before launch.
 */

export const faqGroups: readonly FaqGroup[] = [
  {
    id: "about",
    title: `About ${brand.name}`,
    items: [
      {
        id: "what-is",
        question: `What is ${brand.name}?`,
        answer: [
          `${brand.name} is an online training platform where students learn practical technology skills by completing structured project tasks, at an affordable price.`,
          "The platform is new, and some features (such as file uploads and email notifications) are still being built. Pages say clearly when something is not available yet.",
        ],
        link: { label: `About ${brand.name}`, href: "/about" },
      },
      {
        id: "who-can-join",
        question: "Who can join a program?",
        answer: [
          "Programs are designed mainly for college students and early-career learners, but anyone who meets a program's listed prerequisites can join once enrollment opens.",
          "Each program page lists who it is for and what you need to know before starting.",
        ],
        link: { label: "Browse programs", href: "/programs" },
      },
      {
        id: "accreditation",
        question: `Are ${brand.name} certificates accredited?`,
        answer: [
          `No. A ${brand.name} certificate shows that you completed a specific ${brand.name} program by meeting its published criteria. It is not a government qualification, a university degree or an accredited credential.`,
        ],
        link: { label: "Read the certificate policy", href: "/certificate-policy" },
      },
    ],
  },
  {
    id: "learning",
    title: "Learning and tasks",
    items: [
      {
        id: "project-based",
        question: "How does project-based learning work?",
        answer: [
          "Instead of only watching lessons, you learn by doing. Each program is split into modules, and each module includes practical tasks that build towards a final project.",
          "Every task states what you need to build and the requirements your submission must meet.",
        ],
      },
      {
        id: "evaluation",
        question: "How are tasks evaluated?",
        answer: [
          "Each submission is reviewed against the acceptance criteria published for that task. The reviewer records one of three outcomes: accepted, changes requested or rejected, with written feedback whenever changes are requested or work is rejected.",
          "Submitting a link does not by itself complete a task: project work counts towards completion only once a reviewer accepts it.",
        ],
        link: { label: "Read the assessment policy", href: "/assessment-policy" },
      },
      {
        id: "delivery",
        question: "Are programs live or self-paced?",
        answer: [
          "Each program page states its delivery format, expected weekly effort and duration. Check the program you are interested in for details.",
        ],
        link: { label: "Browse programs", href: "/programs" },
      },
    ],
  },
  {
    id: "certificates",
    title: "Certificates",
    items: [
      {
        id: "when-issued",
        question: "When is a certificate issued?",
        answer: [
          "A certificate is issued only when you meet all of a program's published completion requirements, such as submitting every required task and having it accepted. Enrolling or paying for a program does not by itself earn a certificate.",
          "There is no fee for a certificate.",
        ],
        link: { label: "Read the certificate policy", href: "/certificate-policy" },
      },
      {
        id: "verify",
        question: "How can a certificate be verified?",
        answer: [
          `Each certificate carries a unique certificate ID and a QR code. Anyone, such as an employer, can enter the ID on the ${brand.name} verification page or scan the QR code to check the certificate's recorded status: valid, revoked or replaced.`,
        ],
        link: { label: "Go to the verification page", href: "/verify" },
      },
      {
        id: "criteria-not-met",
        question: "What happens if I do not meet the completion requirements?",
        answer: [
          "If the completion requirements are not met, a certificate is not issued for that program.",
          "If a reviewer requests changes or rejects a submission, you can revise it and submit again, up to 10 attempts per task unless the task sets a lower limit.",
        ],
        link: { label: "Read the assessment policy", href: "/assessment-policy" },
      },
    ],
  },
  {
    id: "payments",
    title: "Payments and refunds",
    items: [
      {
        id: "cost",
        question: "How much does a program cost?",
        answer: [
          "The enrollment fee for each program is shown on its program page and again on the checkout page before you pay. It is the only charge: there is no application, assessment or certificate fee. You are enrolled only after the payment provider confirms your payment.",
        ],
      },
      {
        id: "refunds",
        question: "What is the refund policy?",
        answer: [
          "Enrollment fees are not refundable, except where you were charged twice, money was debited for a payment that failed, the program was unavailable when your payment was confirmed, or we cancel or significantly change a program you paid for.",
          "Nothing in our policies limits any right to a refund that you have under law.",
        ],
        link: { label: "Read the payment and refund policy", href: "/refund-policy" },
      },
    ],
  },
];

const allFaqs: readonly FaqEntry[] = faqGroups.flatMap((group) => group.items);

/** Questions shown in the homepage FAQ preview. */
export const featuredFaqs: readonly FaqEntry[] = ["what-is", "project-based", "when-issued", "verify"]
  .map((id) => allFaqs.find((faq) => faq.id === id))
  .filter((faq): faq is FaqEntry => faq !== undefined);
