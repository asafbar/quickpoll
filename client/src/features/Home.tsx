import { Icon } from "../components/Icon";

const steps = [
  { icon: "question", title: "Write the question", description: "Set one clear question and add up to six answers." },
  { icon: "link", title: "Share one link", description: "Send a join link or read out the short code. No accounts needed." },
  { icon: "bars", title: "See what people think", description: "Follow the totals from your organizer dashboard." },
] as const;

const example = [
  { text: "Design workshop", percentage: 58 },
  { text: "Product deep dive", percentage: 29 },
  { text: "Open Q&A", percentage: 13 },
];

export function Home() {
  return (
    <>
      <section className="shell grid items-center gap-10 pt-12 pb-10 sm:pt-16 lg:grid-cols-[1fr_0.95fr] lg:gap-14 lg:pt-20 lg:pb-16">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent-bright/25 bg-accent-soft px-3 py-1.5">
            <Icon name="bars" className="size-4 text-accent-bright" />
            <span className="eyebrow tracking-widest">Polling made simple</span>
          </div>
          <h1 className="text-[clamp(2.65rem,7vw,4.65rem)] leading-[1.03] font-extrabold tracking-[-0.065em]">
            Ask a question.<br />
            <span className="text-accent-bright">Get a clear answer.</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted sm:text-lg">
            Create a poll in seconds, invite your group with a short code, and see how everyone voted in one place.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a className="btn btn-primary px-5" href="/create"><Icon name="plus" /> Create Poll <Icon name="arrow" className="size-4" /></a>
            <a className="btn btn-secondary px-5" href="/join"><Icon name="join" /> Join Poll</a>
          </div>
        </div>

        <figure className="relative isolate overflow-hidden rounded-[2rem] border border-line bg-inset px-5 py-6 shadow-panel sm:px-8 sm:py-8">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_85%_0%,#3d2a72_0%,transparent_68%)]" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-15 [background-image:radial-gradient(#c5b4ff_1px,transparent_1px)] [background-size:18px_18px]" />
          <figcaption className="mb-4 flex items-center gap-2 text-xs font-bold tracking-widest text-ink uppercase">
            <span className="size-2 rounded-full bg-accent-bright" /> Illustrative preview
          </figcaption>
          <div className="rounded-2xl border border-line bg-panel p-4 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-bright"><Icon name="bars" /></span>
              <div>
                <p className="eyebrow tracking-wider">Team poll</p>
                <p className="font-bold leading-tight sm:text-lg">What should we do next?</p>
              </div>
            </div>
            <div className="grid gap-3">
              {example.map(({ text, percentage }, index) => (
                <div key={text} className="rounded-xl bg-inset px-3 py-2.5">
                  <div className="mb-1.5 flex justify-between gap-3 text-xs font-bold sm:text-sm"><span>{text}</span><span>{percentage}%</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div className={"h-full rounded-full " + (index === 0 ? "bg-linear-to-r from-accent to-accent-bright" : "bg-violet-400")} style={{ width: percentage + "%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </figure>
      </section>

      <section className="shell pt-3 pb-12 sm:pb-16" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="mb-4 text-xl font-extrabold tracking-tight sm:text-2xl">How it works</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map(({ icon, title, description }, index) => (
            <li key={title} className="panel flex gap-3 p-4 sm:flex-col sm:p-5 lg:flex-row">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-bright"><Icon name={icon} /></span>
              <div>
                <p className="text-xs font-bold text-accent-bright">Step {index + 1}</p>
                <h3 className="mt-0.5 font-extrabold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
