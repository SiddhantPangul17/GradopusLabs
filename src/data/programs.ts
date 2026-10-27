/**
 * ⚠️ DEVELOPMENT FIXTURES — NOT PRODUCTION DATA.
 *
 * Sample programs used to build and preview the public pages before the
 * database exists. They are not real offerings: no program is open for
 * enrollment, and prices use the configured default from brand.ts.
 *
 * Do not import this file from pages or components. Read programs through
 * `@/lib/programs`, which is the only module to change when programs move to
 * MongoDB. Delete this file once real program data is available.
 */
import { brand } from "@/config/brand";
import type { Program } from "@/types";

const defaults = {
  pricePaise: brand.commerce.defaultProgramPricePaise,
  currency: brand.commerce.currency,
  availability: "coming-soon",
  deliveryFormat: "Online and self-paced, with weekly project tasks",
} as const;

const standardInclusions = [
  "Access to all program modules and learning materials",
  "Step-by-step project tasks with published requirements",
  "Review of each submitted task against its requirements",
  "A certificate with a unique ID, if the completion criteria are met",
] as const;

const standardCompletionCriteria = [
  "Submit every required task before the published deadline.",
  "Each required task is reviewed and accepted as meeting its published requirements.",
  "Submit a final project that meets the published project requirements.",
  "All submitted work must be your own; plagiarised or copied work is not accepted.",
] as const;

export const programFixtures: readonly Program[] = [
  {
    ...defaults,
    slug: "web-development-fundamentals",
    title: "Web Development Fundamentals",
    category: "Web development",
    summary: "Learn HTML, CSS and JavaScript by building and publishing a responsive multi-page website.",
    overview: [
      "This program introduces the core building blocks of the web. You will structure content with HTML, style it with CSS and add interactivity with JavaScript.",
      "Each week ends with a practical task, and the program finishes with a personal portfolio website that you build from scratch.",
    ],
    level: "beginner",
    durationWeeks: 4,
    weeklyEffort: "4–6 hours per week",
    featured: true,
    audience: [
      "Students who are new to web development",
      "Learners who want a practical first project for their portfolio",
    ],
    prerequisites: ["Basic computer skills", "A computer with a modern web browser and an internet connection"],
    outcomes: [
      "Structure web pages with semantic HTML",
      "Build responsive layouts with CSS Flexbox and Grid",
      "Add interactivity with JavaScript and the DOM",
      "Publish a static website online",
    ],
    modules: [
      { title: "HTML foundations", topics: ["Document structure", "Semantic elements", "Links, images and forms"] },
      { title: "Styling with CSS", topics: ["Selectors and the box model", "Flexbox and Grid", "Responsive design"] },
      { title: "JavaScript basics", topics: ["Variables, functions and events", "Working with the DOM", "Form validation"] },
      { title: "Publishing your site", topics: ["Project structure", "Accessibility checks", "Deploying a static site"] },
    ],
    tasks: [
      { title: "Personal profile page", description: "Build a single semantic HTML page about yourself." },
      { title: "Responsive layout", description: "Turn a provided design into a layout that works on mobile and desktop." },
      { title: "Interactive form", description: "Add client-side validation and feedback to a contact form." },
    ],
    finalProject: "A responsive, multi-page portfolio website, published online, that meets the published accessibility and layout requirements.",
    inclusions: standardInclusions,
    completionCriteria: standardCompletionCriteria,
    faqs: [
      {
        id: "wdf-no-experience",
        question: "Do I need any programming experience?",
        answer: ["No. This program starts from the basics and assumes no prior coding experience."],
      },
    ],
  },
  {
    ...defaults,
    slug: "python-programming-projects",
    title: "Python Programming with Projects",
    category: "Programming",
    summary: "Build a solid foundation in Python by writing small, useful programs and a command-line project.",
    overview: [
      "Python is a beginner-friendly language used for automation, data work and web development. This program teaches the fundamentals through short, practical exercises.",
      "You will finish by building a command-line application that reads, processes and saves data.",
    ],
    level: "beginner",
    durationWeeks: 4,
    weeklyEffort: "4–6 hours per week",
    featured: true,
    audience: ["Students starting their programming journey", "Learners who want to automate everyday tasks"],
    prerequisites: ["Basic computer skills", "A computer on which you can install Python"],
    outcomes: [
      "Write Python programs using variables, conditions and loops",
      "Organise code into functions and modules",
      "Read and write files, including CSV data",
      "Handle errors and test your code",
    ],
    modules: [
      { title: "Getting started", topics: ["Installing Python", "Variables and data types", "Input and output"] },
      { title: "Control flow", topics: ["Conditions", "Loops", "Lists and dictionaries"] },
      { title: "Functions and files", topics: ["Writing functions", "Modules", "Working with files and CSV"] },
      { title: "Building a project", topics: ["Error handling", "Simple testing", "Packaging a command-line tool"] },
    ],
    tasks: [
      { title: "Unit converter", description: "Write a program that converts between common units." },
      { title: "Quiz game", description: "Build a quiz that keeps score using lists and dictionaries." },
      { title: "CSV report", description: "Read a CSV file and print a summary report." },
    ],
    finalProject: "A command-line expense tracker that stores entries in a file and produces monthly summaries.",
    inclusions: standardInclusions,
    completionCriteria: standardCompletionCriteria,
    faqs: [],
  },
  {
    ...defaults,
    slug: "data-analysis-with-python",
    title: "Data Analysis with Python",
    category: "Data",
    summary: "Clean, analyse and visualise real-world datasets with pandas and Matplotlib, then present your findings.",
    overview: [
      "This program teaches a practical data analysis workflow: loading data, cleaning it, exploring patterns and communicating results with charts.",
      "You will complete an end-to-end analysis of a public dataset and present your findings in a notebook report.",
    ],
    level: "intermediate",
    durationWeeks: 6,
    weeklyEffort: "5–7 hours per week",
    featured: true,
    audience: ["Students comfortable with basic Python", "Learners interested in data-driven roles"],
    prerequisites: ["Basic Python (variables, loops, functions)", "A computer on which you can install Python and Jupyter"],
    outcomes: [
      "Load and inspect datasets with pandas",
      "Clean and transform messy data",
      "Summarise data with grouping and aggregation",
      "Create clear charts and explain what they show",
    ],
    modules: [
      { title: "Working with notebooks", topics: ["Jupyter basics", "Loading CSV and Excel data"] },
      { title: "Data cleaning", topics: ["Missing values", "Data types", "Filtering and sorting"] },
      { title: "Analysis", topics: ["Grouping and aggregation", "Joining datasets", "Descriptive statistics"] },
      { title: "Visualisation", topics: ["Matplotlib basics", "Choosing the right chart", "Labelling and clarity"] },
      { title: "Reporting", topics: ["Structuring an analysis", "Writing up findings"] },
    ],
    tasks: [
      { title: "Data inspection", description: "Load a dataset and document its structure and quality issues." },
      { title: "Cleaning pipeline", description: "Write repeatable steps that clean a messy dataset." },
      { title: "Chart set", description: "Produce three charts that each answer a specific question." },
    ],
    finalProject: "An end-to-end analysis of a public dataset, delivered as a notebook report with clear charts and conclusions.",
    inclusions: standardInclusions,
    completionCriteria: standardCompletionCriteria,
    faqs: [],
  },
  {
    ...defaults,
    slug: "react-front-end-development",
    title: "React Front-End Development",
    category: "Web development",
    summary: "Build interactive user interfaces with React components, state and data fetching.",
    overview: [
      "React is a widely used library for building user interfaces. This program covers components, state, effects and fetching data from an API.",
      "You will build a small single-page application that loads and displays data from a public API.",
    ],
    level: "intermediate",
    durationWeeks: 6,
    weeklyEffort: "5–7 hours per week",
    featured: false,
    audience: ["Students who already know HTML, CSS and basic JavaScript"],
    prerequisites: ["HTML, CSS and JavaScript fundamentals", "Comfort using a code editor and the command line"],
    outcomes: [
      "Build reusable React components",
      "Manage state and handle user input",
      "Fetch and display data from an API",
      "Structure a small React application",
    ],
    modules: [
      { title: "React fundamentals", topics: ["Components and JSX", "Props", "Rendering lists"] },
      { title: "State and events", topics: ["useState", "Forms and controlled inputs"] },
      { title: "Effects and data", topics: ["useEffect", "Fetching data", "Loading and error states"] },
      { title: "Application structure", topics: ["Routing basics", "Organising components", "Building for production"] },
    ],
    tasks: [
      { title: "Component library", description: "Build a set of reusable UI components." },
      { title: "Interactive form", description: "Create a multi-field form with validation and feedback." },
      { title: "API explorer", description: "Fetch data from a public API and handle loading and errors." },
    ],
    finalProject: "A single-page application that searches and displays data from a public API, with loading and error states.",
    inclusions: standardInclusions,
    completionCriteria: standardCompletionCriteria,
    faqs: [],
  },
];
