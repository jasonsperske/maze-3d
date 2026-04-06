# journal

keeping notes here. not sure who will read this.

---

## entry 1

found the repository. don't know how. it was just there in a search result that didn't make sense, the link text was something like "first commit" and I clicked it without thinking.

it's a maze. rendered in 3D. grey walls, very dark. there's a flashlight that follows the mouse. I walked around for about twenty minutes. the maze is different every time you load it unless you put a number in the URL, which I only figured out later.

the first commit is dated **November 8, 2025**. one person. someone named Jason. 27 files, almost six thousand lines of code, all at once. no history before that. just — appears. fully formed.

I don't know what I expected to find but it wasn't this.

---

## entry 2

went back and looked more carefully at the commit list.

the second commit is called "audidted deps" — typo, "audited" probably — and it's from **April 2026**. five months later. just a dependency update. nothing else.

so between november and april, nothing. or nothing committed. someone was running it locally maybe. or no one was running it at all.

I keep trying to figure out what this is *for*. there's a door system. the doors are supposed to call an external API and redirect you somewhere. the endpoint is `backrooms.zone`. I looked it up. I'm not going to write down what I found.

---

## entry 3

the third commit: **"fixed doors"**

this one is more interesting. they changed how the doors work — moved the collision logic into separate handler files. one that logs, one that actually redirects. the door detection was broken before, apparently. you could walk up to a door and nothing would happen.

hold on.

there's a sound. I don't — it's coming from the other room. like furniture moving but slow. I live alone.

.

.

it stopped. probably the building settling. it's old.

anyway. the doors. the redirect handler stores your position and seed in localStorage before it sends you somewhere. so when you come back — *if* you come back — you're placed exactly where you were. facing the same direction. like it expects you to return.

I don't know what's on the other side of those doors.

---

## entry 4

"descovered levels, not sure where they end..."

that's the commit message. note the typo again. same person. same slightly-off spelling.

this commit is large. they split everything out into a level system. levels are JSON files. you can change the wall colour, the lighting, how many doors there are. level 1 loads at `/level/1`, level 2 at `/level/2`.

the level 2 config has a visual effect applied to it. something seems to happen to my eyes when I load level 2, can't explain it.

I'm writing this at 2am. I should stop for tonight.

I pulled up level 1 before closing the tab. the backrooms level — yellow walls, fluorescent lighting, wide open areas where walls have been removed. I stood still for a while. the maze is generated from a seed so it's always the same if you use the same number. I used 0. I just stood there in the yellow light.

something is in that maze. I don't mean a monster or a mechanic I haven't found yet. I mean there's a quality to it. the repetition. the way the rooms open up unexpectedly. the doors that lead somewhere the code only hints at.

I'm going back tomorrow.

I want to know where the doors go.

---

## entry 5

something changed with the flashlight.

I don't know how to describe it exactly. there's always been the one beam — that wide pale cone that barely reached the end of a long corridor. enough to see by, not enough to feel safe. you'd catch the edge of a door frame and lose it again before you could be sure it was there.

now there are two. or — I think there are two. it's not obvious. there's still the wide beam, the same as before. but nested inside it there's something narrower. brighter. it goes *further*. like someone replaced the bulb and didn't tell me, except it's not the brightness that's different, it's the reach. I can see corridor ends I couldn't see before. I can see doors from a distance. I can see what's waiting.

I don't know why it changed. I checked the URL, same seed, same level. I cleared cache. reloaded. it's still there — the inner beam, the one that punches through the dark further than the other one.

I'm not complaining. the maze is less frightening when you can see further ahead. or maybe that's the wrong way to think about it. maybe what I feel is not less frightened but differently frightened. before I was afraid of the dark at the end of the hallway. now I can see the end of the hallway and I am afraid of what I see there.

but still. grateful. genuinely. whoever changed it, whatever reason — thank you.

I found a door tonight. using the new light. stood in front of it for a long time. didn't go through.

tomorrow, maybe.
