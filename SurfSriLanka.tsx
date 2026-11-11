import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Scroll-driven image-sequence hero. The page never scrolls: scrolling down plays the next
 * clip in place; scrolling up (or the side rail) "blinks" quickly to the chosen stage.
 * Assets in /public: /hero.webp, /sequences/s2|s3|s4|s5/0001.webp …
 */
const FPS = 24;
const CLIPS = [
  { dir: "s2", frames: 145 },
  { dir: "s3", frames: 145 },
  { dir: "s4", frames: 145 },
  { dir: "s5", frames: 145 },
];
const XFADE = 14; // crossfade frames into a clip (smooths photo -> clip 2)
const TEXT_AT = 0.78; // reveal next headline at 78% of the clip
const STAGES = CLIPS.length + 1;
const BLINK_MS = 200;

const pad = (n: number) => String(n).padStart(4, "0");
const ease = (p: number) => 0.7 * p + 0.3 * (0.5 - 0.5 * Math.cos(Math.PI * p));

type Frames = (HTMLImageElement | null)[];
type Panel = { eyebrow: string; title: [string, string]; body: string };

const PANELS: Panel[] = [
  {
    eyebrow: "Sri Lanka · South Coast",
    title: ["Where the island\nmeets the ", "swell."],
    body: "Warm water, palm-lined bays and peaks you can share with a few friends. Your Sri Lanka surf trip starts here.",
  },
  {
    eyebrow: "01 — Arrive",
    title: ["Barefoot\nto the ", "break."],
    body: "Stay steps from the sand in Weligama, Ahangama and Hiriketiya. Boards waxed, coconuts cold, ocean waiting.",
  },
  {
    eyebrow: "02 — Paddle out",
    title: ["Find your ", "line."],
    body: "Small-group coaching for every level, from your first pop-up to reading a reef. 28°C water, no wetsuit required.",
  },
  {
    eyebrow: "03 — Drop in",
    title: ["Ride the\nIndian ", "Ocean."],
    body: "Point breaks, reef peaks and golden-hour sessions, guided by local surfers who know every swell.",
  },
  {
    eyebrow: "04 — One more",
    title: ["Stay for\nthe ", "next one."],
    body: "Kick out, grin, paddle back. Surf, stay and coaching packages from 7 nights on Sri Lanka's south coast.",
  },
];
const RAIL = ["Intro", "Arrive", "Paddle", "Ride", "Stay"];
const STATS = [
  { v: "28°C", l: "Water temp" },
  { v: "2", l: "Coasts" },
  { v: "365", l: "Days of swell" },
];

const EASE_OUT = "ease-[cubic-bezier(.2,.7,.2,1)]";

/** Staggered reveal for a panel's children */
const Reveal = ({ on, delay, className, children }: { on: boolean; delay: number; className?: string; children: React.ReactNode }) => (
  <div
    className={cn(
      on
        ? `translate-y-0 opacity-100 blur-0 duration-[900ms] ${EASE_OUT}`
        : "translate-y-[18px] opacity-0 blur-[8px] duration-[350ms] ease-in",
      "transition-all",
      className,
    )}
    style={{ transitionDelay: on ? `${delay}ms` : "0ms" }}
  >
    {children}
  </div>
);

const SurfSriLanka = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLImageElement | null>(null);
  const framesRef = useRef<Frames[]>(CLIPS.map((c) => Array(c.frames).fill(null)));
  const shownRef = useRef<[HTMLImageElement | null, HTMLImageElement | null, number]>([null, null, 0]);
  const stageRef = useRef(0);
  const playingRef = useRef(false);
  const tokenRef = useRef(0);
  const rafRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const [textStage, setTextStage] = useState(0); // -1 = hidden
  const [railStage, setRailStage] = useState(0);
  const [blinking, setBlinking] = useState(false);
  const [progress, setProgress] = useState(0);

  // ---------- canvas ----------
  const cover = (ctx: CanvasRenderingContext2D, cv: HTMLCanvasElement, im: HTMLImageElement | null, a: number) => {
    if (!im || !im.naturalWidth) return;
    const s = Math.max(cv.width / im.naturalWidth, cv.height / im.naturalHeight);
    const w = im.naturalWidth * s;
    const h = im.naturalHeight * s;
    ctx.globalAlpha = a;
    ctx.drawImage(im, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
    ctx.globalAlpha = 1;
  };
  const render = useCallback((base: HTMLImageElement | null, over: HTMLImageElement | null = null, a = 0) => {
    shownRef.current = [base, over, a];
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    cover(ctx, cv, base, 1);
    if (over && a > 0) cover(ctx, cv, over, a);
  }, []);
  const lastShown = () => {
    const [b, o, a] = shownRef.current;
    return o && a >= 0.5 ? o : b;
  };

  // ---------- preload ----------
  useEffect(() => {
    const hero = new Image();
    hero.src = "/hero.webp";
    hero.onload = () => {
      if (stageRef.current === 0 && !playingRef.current) render(hero);
    };
    heroRef.current = hero;
    shownRef.current = [hero, null, 0];

    const queue: [number, number, string][] = [];
    CLIPS.forEach((c, si) => {
      for (let i = 0; i < c.frames; i++) queue.push([si, i, `/sequences/${c.dir}/${pad(i + 1)}.webp`]);
    });
    let qi = 0;
    let loaded = 0;
    let cancelled = false;
    const pump = () => {
      if (cancelled || qi >= queue.length) return;
      const [si, i, src] = queue[qi++];
      const im = new Image();
      im.decoding = "async";
      const done = () => {
        if (im.naturalWidth) framesRef.current[si][i] = im;
        loaded++;
        setProgress(loaded / queue.length);
        pump();
      };
      im.onload = done;
      im.onerror = done;
      im.src = src;
    };
    for (let k = 0; k < 8; k++) pump();
    return () => {
      cancelled = true;
    };
  }, [render]);

  useEffect(() => {
    const resize = () => {
      const cv = canvasRef.current;
      if (!cv) return;
      const d = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = window.innerWidth * d;
      cv.height = window.innerHeight * d;
      render(...shownRef.current);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [render]);

  // ---------- playback ----------
  const stop = useCallback(() => {
    tokenRef.current++;
    cancelAnimationFrame(rafRef.current);
    playingRef.current = false;
  }, []);

  const playClip = useCallback(
    (arr: Frames, from: HTMLImageElement | null, onText: () => void, onEnd: () => void) => {
      const my = ++tokenRef.current;
      const n = arr.length;
      const dur = (n / FPS) * 1000;
      let t = 0;
      let last = performance.now();
      let textDone = false;
      playingRef.current = true;
      const tick = (now: number) => {
        if (my !== tokenRef.current) return;
        const dt = Math.min(now - last, 64);
        last = now;
        const p = Math.min(1, t / dur);
        const f = Math.round(ease(p) * (n - 1));
        const im = arr[f];
        if (im) {
          t += dt;
          if (from && f < XFADE) render(from, im, ease(f / XFADE));
          else render(im);
          if (!textDone && p >= TEXT_AT) {
            textDone = true;
            onText();
          }
          if (p >= 1) {
            playingRef.current = false;
            onEnd();
            return;
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [render],
  );

  const stageImage = (i: number) => (i === 0 ? heroRef.current : framesRef.current[i - 1][CLIPS[i - 1].frames - 1]);

  const forward = useCallback(() => {
    const cur = stageRef.current;
    if (playingRef.current || cur >= STAGES - 1) return;
    const next = cur + 1;
    stop();
    setTextStage(-1);
    setRailStage(next);
    playClip(
      framesRef.current[cur],
      lastShown(),
      () => setTextStage(next),
      () => {
        stageRef.current = next;
      },
    );
  }, [playClip, stop]);

  const blink = useCallback(
    (target: number) => {
      stop();
      timersRef.current.forEach(clearTimeout);
      setTextStage(-1);
      setRailStage(target);
      setBlinking(true);
      timersRef.current = [
        window.setTimeout(() => {
          stageRef.current = target;
          render(stageImage(target));
          setBlinking(false);
          timersRef.current.push(window.setTimeout(() => setTextStage(target), 120));
        }, BLINK_MS),
      ];
    },
    [render, stop],
  );

  const back = useCallback(() => {
    if (playingRef.current) return blink(stageRef.current); // mid-clip: snap back
    if (stageRef.current > 0) blink(stageRef.current - 1);
  }, [blink]);

  const onRail = (target: number) => {
    const cur = stageRef.current;
    if (target === cur && !playingRef.current) return;
    if (target === cur + 1 && !playingRef.current) forward();
    else blink(target);
  };

  // ---------- input ----------
  useEffect(() => {
    let wheelLock = 0;
    let ty: number | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (Math.abs(e.deltaY) < 8 || now < wheelLock) return;
      wheelLock = now + 500;
      if (e.deltaY > 0) forward();
      else back();
    };
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        forward();
      }
      if (["ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        back();
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      ty = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (ty === null) return;
      const dy = ty - e.changedTouches[0].clientY;
      ty = null;
      if (Math.abs(dy) > 40) {
        if (dy > 0) forward();
        else back();
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      document.body.style.overflow = prevOverflow;
    };
  }, [forward, back]);

  useEffect(
    () => () => {
      tokenRef.current++;
      cancelAnimationFrame(rafRef.current);
      timersRef.current.forEach(clearTimeout);
    },
    [],
  );

  return (
    <main
      className="fixed inset-0 h-[100dvh] w-[100dvw] touch-none overflow-hidden overscroll-none bg-[hsl(var(--surf-bg))] font-sans text-[hsl(var(--surf-fg))]"
      style={
        {
          "--surf-bg": "200 40% 6%",
          "--surf-fg": "40 33% 97%",
          "--surf-accent": "172 72% 52%",
          "--surf-sun": "28 95% 62%",
          "--surf-muted": "40 15% 80%",
        } as React.CSSProperties
      }
    >
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute inset-0 block h-full w-full transition-[transform,filter]",
          blinking ? "scale-[1.035] blur-[6px] brightness-[.7] duration-200 ease-in" : `scale-100 blur-0 brightness-100 duration-[900ms] ${EASE_OUT}`,
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-[2] bg-[hsl(var(--surf-bg))] transition-opacity",
          blinking ? "opacity-[.92] duration-200 ease-in" : `opacity-0 duration-[450ms] ${EASE_OUT}`,
        )}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,hsl(var(--surf-bg)/.85)_0%,hsl(var(--surf-bg)/.35)_35%,transparent_60%),linear-gradient(to_bottom,hsl(var(--surf-bg)/.55)_0%,transparent_22%)]" />

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-[clamp(16px,4vw,56px)] py-[clamp(16px,3vw,36px)]">
        <div className="font-['Instrument_Serif',serif] text-[clamp(22px,2vw,30px)]">
          Serendib <i className="text-[hsl(var(--surf-accent))]">Surf</i>
        </div>
        <nav className="flex items-center gap-7 text-sm">
          {["Camps", "Spots", "Coaching"].map((l) => (
            <a key={l} href="#" className="hidden text-[hsl(var(--surf-fg)/.8)] hover:text-[hsl(var(--surf-fg))] md:inline">
              {l}
            </a>
          ))}
          <Button className="rounded-full bg-[hsl(var(--surf-fg))] px-5 font-semibold text-[hsl(var(--surf-bg))] hover:bg-[hsl(var(--surf-fg)/.9)]">
            Book now
          </Button>
        </nav>
      </header>

      <section className="absolute inset-x-[clamp(16px,4vw,56px)] bottom-[clamp(56px,9vh,110px)] z-10 max-w-[680px]">
        {PANELS.map((p, i) => {
          const on = textStage === i;
          return (
            <div
              key={i}
              className={cn(
                "absolute bottom-0 left-0 w-full",
                on ? "visible pointer-events-auto" : "pointer-events-none invisible transition-[visibility] delay-[400ms]",
              )}
            >
              <Reveal on={on} delay={0} className="mb-[18px] text-xs font-semibold uppercase tracking-[.22em] text-[hsl(var(--surf-accent))]">
                {p.eyebrow}
              </Reveal>
              <Reveal on={on} delay={80}>
                <h2 className="whitespace-pre-line font-['Instrument_Serif',serif] text-[clamp(44px,7.2vw,112px)] font-normal leading-[.95] tracking-[-.01em]">
                  {p.title[0]}
                  <em className="text-[hsl(var(--surf-sun))]">{p.title[1]}</em>
                </h2>
              </Reveal>
              <Reveal on={on} delay={180}>
                <p className="mt-5 max-w-[460px] text-[clamp(15px,1.2vw,18px)] leading-relaxed text-[hsl(var(--surf-muted))]">{p.body}</p>
              </Reveal>
              {i === STAGES - 1 && (
                <>
                  <Reveal on={on} delay={280} className="mt-7 flex flex-wrap gap-3">
                    <Button className="rounded-full bg-[hsl(var(--surf-fg))] px-6 font-semibold text-[hsl(var(--surf-bg))] hover:bg-[hsl(var(--surf-fg)/.9)]">
                      Book your surf trip <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full border-[hsl(var(--surf-fg)/.4)] bg-[hsl(var(--surf-fg)/.06)] px-6 font-semibold text-[hsl(var(--surf-fg))] backdrop-blur hover:bg-[hsl(var(--surf-fg)/.12)] hover:text-[hsl(var(--surf-fg))]"
                    >
                      Explore camps
                    </Button>
                  </Reveal>
                  <Reveal on={on} delay={380} className="mt-8 flex gap-[clamp(20px,4vw,48px)]">
                    {STATS.map((s) => (
                      <div key={s.l}>
                        <b className="block font-['Instrument_Serif',serif] text-[clamp(28px,3vw,42px)] font-normal">{s.v}</b>
                        <span className="text-xs uppercase tracking-[.14em] text-[hsl(var(--surf-muted))]">{s.l}</span>
                      </div>
                    ))}
                  </Reveal>
                </>
              )}
            </div>
          );
        })}
      </section>

      <div className="absolute right-[clamp(16px,3vw,40px)] top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-3.5 md:flex">
        {RAIL.map((label, i) => (
          <button
            key={label}
            onClick={() => onRail(i)}
            className={cn(
              "flex items-center justify-end gap-2.5 text-[11px] uppercase tracking-[.14em] transition-colors duration-400",
              railStage === i ? "text-[hsl(var(--surf-fg))]" : "text-[hsl(var(--surf-fg)/.5)] hover:text-[hsl(var(--surf-fg)/.85)]",
            )}
          >
            {label}
            <span
              className={cn(
                `h-0.5 rounded-full transition-all duration-500 ${EASE_OUT}`,
                railStage === i ? "w-9 bg-[hsl(var(--surf-accent))]" : "w-[18px] bg-current",
              )}
            />
          </button>
        ))}
      </div>

      <div
        className={cn(
          "absolute bottom-[22px] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2.5 text-[11px] uppercase tracking-[.24em] text-[hsl(var(--surf-fg)/.7)] transition-opacity duration-500",
          railStage === STAGES - 1 ? "opacity-0" : "opacity-100",
        )}
      >
        Scroll
        <span className="h-7 w-px animate-pulse bg-gradient-to-b from-[hsl(var(--surf-fg))] to-transparent" />
      </div>

      <div
        className="absolute bottom-0 left-0 z-20 h-0.5 bg-[hsl(var(--surf-accent))] transition-all duration-500"
        style={{ width: `${progress * 100}%`, opacity: progress >= 1 ? 0 : 1 }}
      />
    </main>
  );
};

export default SurfSriLanka;
