# Street Sweeper vs. the Scooter Freeloaders (PoC)

A silly browser game. You play Boris, a city street cleaner. The city's one rule is **one person per scooter**.

## Run
Open `index.html` in a browser. There are no dependencies and no build step.

## Play
- **WASD / arrow keys**: walk along the sidewalk
- **Mouse**: aim
- **Click / Space**: throw a wet sponge
- **P / Esc**: pause · **M**: mute
- **Phone**: tilt to walk (the pose you hold at start is neutral), tap to aim and throw. Tilt needs HTTPS or localhost; iOS asks for motion permission on the first tap.

## Rules
- Hit an **extra passenger** (anyone behind the driver): they fly off into orbit and you score +100. Hit several in a row for a combo multiplier of up to x5. When only the driver is left, the scooter is legal and you get +50.
- Hit the **driver**: a complaint is filed, the scooter crashes, and you lose 1 reputation.
- Solo riders are **delivery couriers** (NOM, GRUB, YUM!, ZOOM, BURP) with a branded box on their back. Splash one and the order flies everywhere: 1-star review, the scooter crashes, and you lose 1 reputation. Couriers are too busy to litter.
- If an overloaded scooter **leaves the screen**: you lose 1 reputation.
- Overloaded scooters carry grubby hooligans: stained clothes, stubble, stink lines and flies. Legit solo riders look clean.
- Riders throw **litter** onto the sidewalk. It shows a pulsing yellow ring, and Boris has a dashed green sweep zone around his feet. Walk over the litter to sweep it into the CITY cart (+25). If 8 pieces pile up, you lose 1 reputation. The top bar shows the litter count and warns you when the sidewalk gets filthy.
- At 0 reputation you're fired.

## Code
Everything is in `src/game.js`: canvas 2D drawing, procedural art, and 8-bit Web Audio sound (square, triangle and noise channels, plus a looping chiptune), with no asset files.
