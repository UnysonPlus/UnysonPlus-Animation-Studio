import { NAMED_EASES } from '@unysonplus/scene-player/eases';

/**
 * The motion rules the AI follows, sent with every request (they ship with the Studio, so the AI Dev
 * Kit never holds a stale copy). The numbers come from professional motion design measured frame by
 * frame, and the same rules drive Check scene, so what the AI is told and what the Studio checks agree.
 */
export const MOTION_RULES = `TIMING
- A single move takes about 0.3-0.5 s. Opacity alone is a helper (0.15-0.3 s), not the move: things should arrive by moving, scaling or unmasking, with the fade underneath.
- Exits are new motion, faster than the entrance and accelerating out ("accelExit"), never the entrance played backwards. If you leave "ease" out on an exit, the Studio already uses accelExit.
- Things land by slowing down (softLand, snapSettle, glide, whip) and leave by speeding up (accelExit, gentleIn, crashOut).
- Nothing grows from nothing: a pop or zoom starts at about 0.5 or larger, or arrives from slightly bigger (1.1-1.4) and settles down.
- At most one visible spring or overshoot (popOver, crashIn, bounceHard, back.*) per scene, on the thing that matters most.

STAGGER AND RHYTHM
- Keep the text presets' rhythm "natural" (uneven gaps); even gaps read as mechanical.
- Stagger letters 0.02-0.04 s and words 0.07-0.15 s; a whole staggered line should land in about 0.4-0.9 s.
- Leave a little more time (1.5-2 times the gap) before the word or element that pays the message off.
- Not everything enters the same way: give the headline the strongest entrance, and supporting text and shapes quieter ones that start slightly after it.

READING AND HOLDS
- Once a text layer has fully landed it stays readable (no exit started) for at least 0.3 s per word, and never less than 0.8 s.
- A held frame should not sit completely still for more than about 1.5 s: a slow "float" (height 2-4, one cycle) keeps it alive.
- In a looping scene, the end is a calm resolved frame or a clean exit of everything, so the loop restarts without a jump.

TYPE
- Hierarchy by size, not by many weights: one family, the headline 2-4 times the size of the supporting text.
- Text must be at least about 12 px on screen at every breakpoint: a font size (in stage units) of at least 1.2 on desktop and 3.3 on a 360 px phone stage.
- Type letter by letter (text-typewriter) only for small text such as a search box or a prompt, never a headline.

AVOID
- Two moving clips overlapping in time on the same layer (they fight over the same property).
- Endless motion everywhere: pulse, shake and float are accents, not wallpaper.
- Numbers, statistics or claims the request did not give.

NAMED EASES (use these names in a clip's "ease"; the seconds are typical lengths)
${NAMED_EASES.map((e) => `- ${e.id} (${e.seconds} s, ${e.role === 'enter' ? 'entrances' : e.role === 'exit' ? 'exits' : 'either'}): ${e.use}`).join('\n')}`;
