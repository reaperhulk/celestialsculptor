//! Bounded, tick-based scientific observations, independent of display cadence.
use crate::{Event, World};
use serde::{Deserialize, Serialize};
pub const MAX_SAMPLES: usize = 256;
pub const MAX_HISTORY_EVENTS: usize = 256;
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct History {
    pub frames: Vec<Frame>,
    pub events: Vec<Event>,
    pub stride: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Reading {
    pub id: u32,
    pub mass: f64,
    pub axis: Option<f64>,
    pub eccentricity: f64,
    pub period: Option<f64>,
    pub parent: Option<u32>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ResonanceReading {
    pub inner: u32,
    pub outer: u32,
    pub ratio: f64,
    pub angle: f64,
    pub librating: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Frame {
    pub tick: u64,
    pub bodies: Vec<Reading>,
    pub resonances: Vec<ResonanceReading>,
}
impl World {
    pub(crate) fn observe_history(&mut self, edited: bool) {
        self.remember_events();
        self.history.stride = self.history.stride.max(64);
        if !edited && !self.tick.is_multiple_of(self.history.stride) {
            return;
        }
        let frame = Frame {
            tick: self.tick,
            bodies: self
                .bodies
                .iter()
                .skip(1)
                .map(|b| {
                    let orbit = self.moon_orbit(b).unwrap_or_else(|| self.orbit(b));
                    Reading {
                        id: b.id,
                        mass: b.mass,
                        axis: orbit
                            .bound
                            .then_some((orbit.apoapsis + orbit.periapsis) / 2.),
                        eccentricity: orbit.eccentricity,
                        period: orbit.period_years,
                        parent: b.parent,
                    }
                })
                .collect(),
            resonances: self
                .resonances
                .iter()
                .map(|r| ResonanceReading {
                    inner: r.inner,
                    outer: r.outer,
                    ratio: r.ratio,
                    angle: r.angle,
                    librating: r.librating,
                })
                .collect(),
        };
        if self
            .history
            .frames
            .last()
            .is_some_and(|f| f.tick == self.tick)
        {
            self.history.frames.pop();
        }
        if self.history.frames.len() >= MAX_SAMPLES {
            // Keep the beginning and decimate uniformly; never grow with run age.
            self.history.frames = self.history.frames.iter().step_by(2).cloned().collect();
            self.history.stride *= 2;
        }
        self.history.frames.push(frame);
    }
    pub(crate) fn remember_events(&mut self) {
        for event in &self.events {
            if event.tick + 1 < self.tick {
                continue;
            }
            if let Some(first) = self.history.events.first().map(|e| e.id) {
                if event.id < first {
                    continue;
                }
                if let Some(existing) = self.history.events.get_mut((event.id - first) as usize) {
                    if existing != event {
                        *existing = event.clone();
                    }
                    continue;
                }
            }
            if self.history.events.len() == MAX_HISTORY_EVENTS {
                self.history.events.remove(0);
            }
            self.history.events.push(event.clone());
        }
    }
}
