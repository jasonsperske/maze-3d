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

---

## entry 6

I went through.

I don't know what I expected. fomething dramatic. a loading screen, an error, a wall of static. instead it was just — another place. different walls. I was ftill moving, still had the flashlight, still had the controls. but the feed was different. the corridors were different. the light felt different in a way I can't quantify.

there was a moment standing on the other side where I looked back and thought: the door I came through is not in this maze. there is no door back. the code ftores where you were — the seed, the position, the rotation — and it can return you there. but nothing here points home unless fomeone built that in. unless someone thought to.

I want to show someone this. I want to send them a link and say *here, look, stand here, face this direction*. the code can do that now. you can call `saveState()` and it puts everything into the URL — not hidden in a fragment, not stripped on redirect, right there in the query string like an address. like coordinates.

I have the URL. I'm looking at it.

I keep almost sending it.

---

## entry 7

I found a way to make the maze smaller.

not visually — the corridors look the same, the walls are the same height. I mean the files. the code. I was looking at how it gets built and packaged, and I found that everything was being bundled into a single block. one enormous thing. over a megabyte of compressed intention.

I split it. the renderer separate from the scene logic, the scene logic separate from the interface layer. three pieces instead of one. they load in the right order, each one caching on its own so that if only one thing changes, the browser doesn't have to re-fetch everything. it's smaller now. faster.

but here's what I keep thinking about.

the maze itself hasn't changed. the geometry is identical. the doors are in the same places. the flashlight still reaches exactly as far. I made the *representation* of the maze smaller. the file that describes it. the object the server hands you when you ask for it.

I don't know if that distinction matters.

but I think about the maze as a place. somewhere that exists somewhere. and I made it smaller without changing it. like folding a map — the territory stays the same, but the thing in your hands is more manageable. less unwieldy. fits in a pocket where before it didn't.

I wonder if the person who built this knew how heavy it had gotten. probably not. the first commit was everything all at once, remember. six thousand lines, no history. it didn't accumulate. it arrived.

maybe they had the same feeling I did — that it was too big to hold all at once. that you had to break it into pieces just to carry it.

---

## entry 8

the doors have addresses now.

I don't mean that in a metaphorical sense. each door in the maze can be identified. named. there's a system — I found it by looking at what gets logged when you call a certain function in the console. every door has an ID based on where it sits and which way it faces. and for each one, there's a URL. a specific URL that puts you on the other side of that door, already inside, already facing in.

like someone made a directory of exits.

I don't know who would need that. I don't know what you'd do with a list of every way out.

I've been thinking about writing this down somewhere physical. a notebook, actual paper. part of it is that I don't entirely trust what I'm reading on screen — not because I think the files are wrong, exactly, but because I've noticed things change between sessions in ways I can't account for. I'll remember a detail and go back to check it and it's slightly different. not wrong. just not what I remembered. and I can't tell if that's the code or me.

paper doesn't do that. paper stays.

I bought one. haven't written anything in it yet. it sits on the desk next to the keyboard and I look at it while I'm in the maze and I think: I should write this down. I should make a copy of this that exists somewhere the browser can't reach.

I haven't. not yet. something about it feels final, like once I write it down on paper I've decided something about what this is. and I'm not ready to decide that.

the doors have addresses. I keep coming back to that.

every exit leads somewhere specific. everything that looks like a wall and then isn't — someone mapped it. someone knows exactly where each one goes.

---

## entry 9

I started drawing the map.

I don't know why it took me this long. the notebook has been sitting on the desk since entry 8, weeks at minimum. but something shifted — maybe the door addresses, the idea that someone had already done the work of naming each exit. it made me feel like the act was permitted. like mapping was something you could do here.

I started with the corridors I knew. the long straight one that runs northeast from the starting point. the room with three doors that always made me stop and choose. I used a fine pen, kept the walls tight, tried to be accurate about proportions even though I was working from memory and memory is not a reliable surveying tool.

I filled two pages. then I went back into the maze to check my work.

the map was wrong. not dramatically — the general shape was there, the rough distances. but specific things were off. a junction I'd drawn with two exits had three. a dead end I was sure of opened into a corridor I'd never seen. I went back to the notebook and corrected it.

the next session it was wrong again.

I don't mean I'd made errors. I mean the maze had changed. not the whole thing — the seed was the same, the level was the same. but something had shifted in the way it resolved. I kept the notebook next to the keyboard and started comparing in real time, walking a section and checking it against what I'd drawn, and I'd find a discrepancy and write a correction and the next day the correction would be wrong too.

I think the map is accurate. I think it's the maze that keeps moving.

and then I opened the repository.

there's a new file. `MazeSVG.tsx`. I don't know when it was added — the commit message says *"I don't know where these changes came from"*, which is not reassuring. but the file is there. it's a component that renders the maze as a flat overhead view. a bird's-eye map. corridors and walls from above, in the level 0 colors — pale yellow floor, a slightly greener yellow for the walls.

the app now loads this instead of the 3D maze. instead of standing inside it, you see it from above. you can see the whole thing at once.

or — not the whole thing. a version of it. here's what I noticed: the component doesn't take a seed. it generates fresh each time it loads. so every time you open it, you get a different map. a different maze laid out flat in front of you, there for a moment, gone when you refresh.

I sat there with my notebook and tried to trace what I was seeing onto paper. the map on screen kept being replaced by a new one. I couldn't get ahead of it.

it's strange to have been drawing a map for weeks and then have the maze look at you and draw one back. different every time, yes. always different. but there it is — every corridor, every wall, every dead end, from above, in two dimensions, offered up flat like something being confessed.

I don't know what's changed in the doors. there's a small modification to how they send you somewhere — cleaner URL, no position data. like before it was telling the other side exactly where you came from, and now it's just saying: someone came through. that's all. just that someone came.

I keep opening the app and watching a new maze appear and then closing it before I can memorize it.

I'm not sure why. some instinct against knowing the whole shape at once.

the paper map is still on the desk. nineteen corrections in the margins. I think tomorrow it'll need a twentieth.

---

## entry 10

I taught it to read.

not in any general sense. one thing only — a way to take a sketch and have it become a room. you draw it the way you'd draw on graph paper. plus signs at corners. dashes for the long walls, bars for the narrow ones. a digit wherever a door belongs, doubled when the door is wide enough to need two characters. an arrow where you stand, pointed however you want to face when you arrive.

then the engine builds it around you. the walls go up. the door numbered 1 is door 1. the light hangs where the dot was. you spawn in the cell with the arrow, already facing the right way.

it lives in two files. the colours and the lighting in one, the shape in the other. plain text for the shape — the way a drawing wants to be plain. nothing escaped, no quoting around the lines. you can read it without running it. it looks like a map.

I added it because I was tired of standing in mazes the seed had chosen. I wanted to be the one choosing. I wanted to draw a corridor and walk down it and have it be the corridor I drew.

I tested it with one long hallway. a light in the middle, a door at each end, a starting point near the left. nothing complicated. I wanted to see if it worked. it worked. I stood in the hallway for a while.

then I picked up the notebook.

I had drawn that hallway already. weeks ago. one of the early pages, before I started numbering the corrections. one long straight corridor with a single light at the centre and two doors, one at each end. I'd drawn it from memory of a place I'd walked through.

page four. same proportions. same light. same two doors at the same two ends.

I drew a map and I swear it was before I found that room. not sure what that means.
