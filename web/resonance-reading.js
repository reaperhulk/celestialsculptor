import {quantity} from './readings.js';
export function resonanceText(state){
 const orbits=new Map([...state.orbits,...state.moon_orbits]),bodies=new Map(state.bodies.map(b=>[b.id,b]));
 const scope='Detection covers neighboring prograde 2:1, 3:2 and 4:3 pairs. Clockwise or mixed-direction resonances are not assessed.';
 const rows=state.resonances.map(r=>{const inner=orbits.get(r.inner),outer=orbits.get(r.outer),duration=outer?.period_years?r.observed_years/outer.period_years:0;
 const needs=[];if(duration<8)needs.push(`${quantity(Math.max(0,8-duration))} more outer-periods of observation`);if((inner?.eccentricity||0)<.01)needs.push('inner eccentricity at least 0.01');if(r.turns<2)needs.push('two angle reversals');if(r.span<=.1)needs.push('a measurable angle swing');if(r.span>=Math.PI*1.7)needs.push('a bounded angle instead of circulation');
 return `Worlds ${r.inner} & ${r.outer} · ${r.p}:${r.q} · ratio ${quantity(r.ratio)}\n${r.librating?'Libration evidence detected':needs.join('; ')||'Observing'}\n${quantity(duration)} outer-periods observed · ${r.turns} reversals · ${quantity(r.span*180/Math.PI)}° angle range${bodies.get(r.inner)?.parent?` · around World ${bodies.get(r.inner).parent}`:''}`;});
 return (rows.length?rows.join('\n\n'):'No supported nearby period ratios yet. Place interacting neighbors and observe them over many orbits.')+'\n\n'+scope;
}
