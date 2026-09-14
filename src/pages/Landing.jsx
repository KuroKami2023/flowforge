import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { NODE_DEFINITIONS, CATEGORY_ORDER } from '../lib/nodeDefinitions.js';
import { useReveal } from '../hooks/useReveal.js';

/* ---------- inline SVG (no emoji anywhere on this page) ---------- */

function ForgeMark({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 2 L20 7 V13 C20 17.5 16.7 20.7 12 22 C7.3 20.7 4 17.5 4 13 V7 L12 2 Z" fill="#f59e0b" />
      <path d="M8.5 12.2 L11.2 14.8 L15.7 9.6" stroke="#111418" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function ArrowIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

function ChevronIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4.5 12.5 10 18 19.5 6.5" />
    </svg>
  );
}

/* ---------- scroll reveal wrapper ---------- */

function Reveal({ children, className = '', delay = 0 }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`${className} transition-all duration-500 ease-out motion-reduce:transition-none ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      {children}
    </div>
  );
}

/* Pointer driven 3D tilt. Writes CSS vars directly, no rerenders. */
function useTilt(max = 7) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(px * max).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${(-py * max).toFixed(2)}deg`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };
  return { ref, onMove, onLeave };
}

function ForgeVisual() {
  const { ref, onMove, onLeave } = useTilt(7);
  return (
    <div className="ff-tilt-scene" onMouseMove={onMove} onMouseLeave={onLeave}>
      <div ref={ref} className="ff-tilt relative">
        <div className="ff-orb" aria-hidden="true" />
        <figure className="relative overflow-hidden rounded-2xl border border-ink-700 shadow-card">
          <img
            src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=1200&auto=format&fit=crop"
            alt="Server racks executing runs in a dark room"
            width="880"
            height="620"
            loading="eager"
            className="aspect-[880/620] w-full object-cover"
          />
          <span className="ff-shine" aria-hidden="true" />
        </figure>
        <figure className="ff-float-slow relative z-10 mx-4 -mt-10 ml-auto w-3/5 overflow-hidden rounded-xl border border-ink-700 shadow-card md:mx-6">
          <img
            src="https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=800&auto=format&fit=crop"
            alt="Data streaming between nodes"
            width="560"
            height="380"
            loading="lazy"
            className="aspect-[560/380] w-full object-cover"
          />
        </figure>
        <figcaption className="mt-3 text-right text-[12.5px] leading-relaxed text-ink-400">
          The control room view, mid-run.
        </figcaption>
      </div>
    </div>
  );
}

/* ---------- honest FAQ (answers grounded in the actual implementation) ---------- */

const FAQS = [
  {
    q: 'Where do runs execute?',
    a: 'On the server. Your browser draws the canvas; pressing Run sends the workflow definition to the /api execution engine, which runs each node in order and saves every input and output to the run history. You can open any past run from the Executions pages and inspect exactly what each node produced.',
  },
  {
    q: 'What does the AI node need? Does it cost extra?',
    a: 'AI nodes call the Nemotron model (nvidia/nemotron-3-nano-omni-30b-a3b-reasoning) from the server, so the NVIDIA API key lives server-side and never reaches your browser. The key is configured by whoever hosts the app. Without it, AI nodes return an error instead of guessing. Model output is treated strictly as data: it is displayed or passed to the next node, never executed as code. Any model usage is billed on that NVIDIA account, not inside FlowForge.',
  },
  {
    q: 'How do webhooks and schedules fire?',
    a: 'A workflow can expose POST /api/webhooks/{workflowId} with an optional secret header; the request body becomes the trigger payload, and disabling the workflow disables the endpoint. Schedules are free-tier polling: a cron route checks every few minutes and runs due schedules, so intervals cannot be shorter than 5 minutes. Webhook URLs and schedule intervals are configured in the builder toolbar.',
  },
  {
    q: 'Do I need to code?',
    a: 'No. You draw nodes on the canvas, fill in their forms, and reference earlier outputs with {{variables}} such as {{trigger.name}}. Basic JSON familiarity helps for the Transform and HTTP Request nodes, but there is no code editor, no build step, and nothing to deploy.',
  },
];

function FaqAccordion() {
  const [open, setOpen] = useState(0);
  return (
    <div className="divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white shadow-card">
      {FAQS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              aria-controls={`faq-panel-${i}`}
              className="btn-press flex w-full items-center gap-3 px-5 py-4 text-left"
            >
              <span className="flex-1 text-[15px] font-semibold text-ink-950">{item.q}</span>
              <ChevronIcon
                className={`h-5 w-5 shrink-0 text-forge-600 transition-transform duration-200 motion-reduce:transition-none ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            <div
              id={`faq-panel-${i}`}
              className={`grid transition-all duration-200 ease-out motion-reduce:transition-none ${
                isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-relaxed text-ink-600">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- page ---------- */

const TOP_ANCHORS = [
  { href: '#nodes', label: 'Nodes' },
  { href: '#how', label: 'How it runs' },
  { href: '#faq', label: 'FAQ' },
];

const HOW_STEPS = [
  {
    n: '01',
    title: 'Draw the canvas',
    body: 'Drag trigger, logic, transform, HTTP, AI, and output nodes onto the canvas and connect them. Every node is configured with a plain form, no code editor.',
  },
  {
    n: '02',
    title: 'Configure and connect',
    body: 'Fill in each field and reference earlier outputs with {{variables}}. Branch with Condition and Switch, reshape with Transform, Filter, and Loop.',
  },
  {
    n: '03',
    title: 'Trigger and inspect',
    body: 'Run by hand, by webhook POST, or on a schedule. Every execution stores per-node inputs and outputs, so you can open any run and see exactly what happened.',
  },
];

export default function Landing() {
  const { user } = useAuth();
  const primaryCta = user
    ? { to: '/dashboard', label: 'Open control room' }
    : { to: '/signup', label: 'Get started' };

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    nodes: Object.entries(NODE_DEFINITIONS).filter(([, def]) => def.category === category),
  })).filter((g) => g.nodes.length > 0);
  const totalNodes = Object.keys(NODE_DEFINITIONS).length;

  return (
    <div>
      <div className="border-b border-ink-100 bg-paper">
        <div className="flex h-16 items-center gap-3 px-4 md:px-6">
          <span className="flex items-center gap-2 font-bold tracking-tight text-ink-950">
            <ForgeMark className="h-6 w-6" />
            <span className="hidden min-[400px]:inline">FlowForge</span>
          </span>
          <nav className="ml-2 hidden items-center gap-1 sm:flex" aria-label="Landing sections">
            {TOP_ANCHORS.map((a) => (
              <a
                key={a.href}
                href={a.href}
                className="btn-press rounded-md px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-950"
              >
                {a.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <Link
                to="/dashboard"
                className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-ink-800"
              >
                Open control room <ArrowIcon className="h-4 w-4 text-forge-400" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-press px-2 py-1.5 text-sm font-medium text-ink-600 hover:text-ink-950">
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="btn-press rounded-lg bg-forge-500 px-3.5 py-1.5 text-sm font-semibold text-ink-950 hover:bg-forge-400"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div className="ff-hero-mesh" aria-hidden="true" />
        <div className="relative grid items-center gap-10 px-4 py-12 md:px-6 md:py-16 lg:grid-cols-2 lg:gap-12">
          <Reveal>
            <h1 className="max-w-xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
              Draw the workflow. Let the <span className="text-forge-400">forge</span> run it.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-300">
              Triggers, logic, transforms, and Nemotron AI nodes on a canvas. Runs execute server side with per-node history.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to={primaryCta.to}
                className="btn-press inline-flex items-center gap-2 rounded-lg bg-forge-500 px-5 py-2.5 text-sm font-semibold text-ink-950 hover:bg-forge-400"
              >
                {primaryCta.label} <ArrowIcon className="h-4 w-4" />
              </Link>
              <a
                href="#how"
                className="btn-press inline-flex items-center gap-2 rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-semibold text-ink-100 hover:bg-ink-800"
              >
                See how it runs
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-2 text-xs font-medium text-ink-200">
              {['Manual, webhook and schedule triggers', 'Nemotron AI nodes', 'Per-node run history'].map((chip) => (
                <li
                  key={chip}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-900 px-3 py-1"
                >
                  <CheckIcon className="h-3.5 w-3.5 text-forge-400" /> {chip}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <ForgeVisual />
          </Reveal>
        </div>
      </section>

      <section className="border-b border-ink-100 bg-paper px-4 py-8 md:px-6" aria-label="At a glance">
        <Reveal>
          <dl className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              ['Free to try', 'Draw and run today, no card.'],
              ['Private by default', 'Workflows live in your account.'],
              ['Auditable runs', 'Every node output is stored.'],
            ].map(([term, def]) => (
              <div key={term} className="flex items-baseline gap-3">
                <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-forge-500" aria-hidden="true" />
                <div>
                  <dt className="text-[15px] font-bold text-ink-950">{term}</dt>
                  <dd className="text-[13px] text-ink-500">{def}</dd>
                </div>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      <section id="nodes" className="scroll-mt-24 px-4 py-12 md:px-6 md:py-16">
        <Reveal>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h2 className="max-w-xl text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
              Every node below ships in the builder today
            </h2>
            <span className="tnum rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-semibold text-ink-600 shadow-card">
              {totalNodes} nodes, rendered from the live palette
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">
            This list is generated from the same definitions that power the palette, so it cannot drift out of date.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <figure className="mt-6 overflow-hidden rounded-2xl border border-ink-100 shadow-card">
            <img
              src="https://images.unsplash.com/photo-1518186285589-2f7649de83e0?q=80&w=1600&auto=format&fit=crop"
              alt="An automated arm at work"
              width="1200"
              height="380"
              loading="lazy"
              className="aspect-[1200/380] w-full object-cover"
            />
          </figure>
          <figcaption className="mt-2 text-[12.5px] leading-relaxed text-ink-400">
            The palette, live. What you see here is what the builder offers.
          </figcaption>
        </Reveal>
        <div className="mt-8 space-y-8">
          {groups.map((group, gi) => (
            <Reveal key={group.category} delay={Math.min(gi, 3) * 60}>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-ink-400">
                {group.category}
              </h3>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.nodes.map(([type, def]) => (
                  <li
                    key={type}
                    className="card-lift rounded-xl border border-ink-100 bg-white p-4 shadow-card"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: def.color }}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold text-ink-950">{def.label}</span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{def.description}</p>
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="how" className="scroll-mt-24 border-y border-ink-100 bg-white px-4 py-12 md:px-6 md:py-16">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <Reveal>
            <h2 className="max-w-xl text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
              From blank canvas to auditable run
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-500">
              Three moves. No code editor, no build step, nothing to deploy.
            </p>
          </Reveal>
          <ol className="divide-y divide-ink-100 border-y border-ink-100">
            {HOW_STEPS.map((step, i) => (
              <Reveal key={step.n} delay={i * 80}>
                <li className="flex gap-5 py-6">
                  <span className="tnum text-sm font-bold tracking-widest text-forge-600" aria-hidden="true">{step.n}</span>
                  <div>
                    <h3 className="font-bold tracking-tight text-ink-950">{step.title}</h3>
                    <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink-600">{step.body}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 px-4 py-12 md:px-6 md:py-16">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
              Frequently asked questions
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              No fine print, no invented numbers. Just how the platform works.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <div className="mt-6">
              <FaqAccordion />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="px-4 pb-4 md:px-6">
        <Reveal>
          <div className="overflow-hidden rounded-2xl bg-ink-950 px-6 py-12 text-center text-white md:py-14">
            <ForgeMark className="mx-auto h-10 w-10" />
            <h2 className="mx-auto mt-4 max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">
              Open the control room and forge your first run
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-300">
              Free to try. Draw a workflow, press Run, and inspect each output.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                to={primaryCta.to}
                className="btn-press inline-flex items-center gap-2 rounded-lg bg-forge-500 px-5 py-2.5 text-sm font-semibold text-ink-950 hover:bg-forge-400"
              >
                {primaryCta.label} <ArrowIcon className="h-4 w-4" />
              </Link>
              {!user && (
                <Link
                  to="/login"
                  className="btn-press rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-semibold text-ink-100 hover:bg-ink-800"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </Reveal>
        <footer className="flex flex-col items-center justify-between gap-3 px-2 py-8 text-xs text-ink-400 sm:flex-row">
          <span className="flex items-center gap-2">
            <ForgeMark className="h-4 w-4" />
            FlowForge, visual workflow automation, Nemotron inside
          </span>
          <nav className="flex items-center gap-4" aria-label="Footer">
            <a href="#nodes" className="hover:text-ink-700">Nodes</a>
            <a href="#how" className="hover:text-ink-700">How it runs</a>
            <a href="#faq" className="hover:text-ink-700">FAQ</a>
            <Link to="/login" className="hover:text-ink-700">Sign in</Link>
          </nav>
        </footer>
      </section>
    </div>
  );
}
