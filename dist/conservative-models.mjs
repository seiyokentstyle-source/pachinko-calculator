import { stHitProbability } from './spec-engine.mjs';
const edge=(p,gross,net,next=null)=>({p,gross,net,next});
const prize=(p,gross,next=null)=>edge(p,gross,gross*14/15,next);
const zero=(p,next=null)=>edge(p,0,0,next);
const qLyco=stHitProbability(97.1,132);
const qLow=stHitProbability(51.6,53),qHigh=stHitProbability(51.6,70);

// Reward averages and LT entry-state marginals suffice for the unconditional
// EV. This does NOT assign a guessed A/B split to each individual initial prize.
// After all 50% bonus additions, replace any remaining B state with lower A.
export const lycorisLowerStates={
  initial:[edge(.5,484,448),edge(.5,572.8,533.68,'entry')],
  entry:[zero(.7,'A'),zero(.3,'B')],
  A:[zero(1-qLyco),prize(qLyco*.5,750,'A'),prize(qLyco*.5,750,'B')],
  B:[zero(1-qLyco),prize(qLyco*.5,3000,'A'),prize(qLyco*.5,6000,'addition')],
  addition:[prize(.5,3000,'addition'),zero(.5,'A')],
};

// Keep published top-level probabilities; discard only unresolved nonnegative
// rewards. Initial/lower special wins keep their 3000-ball minimum, and do not
// assume the same distribution as an upper-RUSH DRIVE. Two unknown DRIVE
// categories retain their probability mass but receive zero counted reward.
export const saoLowerStates={
  initial:[prize(.5,300),prize(.485,300,'lower'),prize(.015,3000,'upper')],
  lower:[zero(1-qLow),prize(qLow*.78,1500,'lower'),prize(qLow*.11,1500,'upper'),prize(qLow*.11,3000,'upper')],
  upper:[zero(1-qHigh),prize(qHigh*.6,1500,'upper'),zero(qHigh*.4,'drive')],
  drive:[prize(.082,1500,'upper'),prize(.281,3000,'upper'),prize(.361,4500,'upper'),prize(.207,6000,'upper'),prize(.044,7500,'upper'),zero(.015,'upper'),zero(.01,'upper')],
};
