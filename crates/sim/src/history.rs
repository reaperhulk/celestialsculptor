//! Bounded, tick-based scientific observations, independent of display cadence.
use crate::{Event, World};
use serde::{Deserialize, Serialize};
pub const MAX_SAMPLES: usize = 256;
pub const MAX_HISTORY_EVENTS: usize = 256;
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct History {
    #[serde(default)]
    pub pinned_ids: Vec<u32>,
    #[serde(default)]
    pub encounters: Vec<crate::encounters::Encounter>,
    #[serde(default)]
    pub approaching: Vec<crate::encounters::Encounter>,
    pub frames: Vec<Frame>,
    pub events: Vec<Event>,
    pub stride: u64,
    #[serde(default)]
    pub detailed: Vec<Frame>,
    #[serde(default)]
    pub recent: Vec<Frame>,
    #[serde(default)]
    pub detail_stride: u64,
    #[serde(default)]
    pub priority_ids: Vec<u32>,
    #[serde(default)]
    pub population: Vec<Population>,
    #[serde(default)]
    pub population_stride: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Population {
    pub tick: u64,
    pub count: usize,
    pub mass: f64,
    pub mean_eccentricity: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Reading {
    pub id: u32,
    pub mass: f64,
    pub axis: Option<f64>,
    pub eccentricity: f64,
    pub period: Option<f64>,
    pub parent: Option<u32>,
    #[serde(default)]
    pub periapsis_angle: f64,
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
    fn detailed_history(&mut self, edited: bool) {
        if edited || self.history.priority_ids.is_empty() || self.tick.is_multiple_of(512) {
            let mut ranked: Vec<_> = self.bodies.iter().skip(1).collect();
            ranked.sort_by(|a, b| {
                (!self.history.pinned_ids.contains(&a.id))
                    .cmp(&(!self.history.pinned_ids.contains(&b.id)))
                    .then((a.kind == crate::Kind::Dust).cmp(&(b.kind == crate::Kind::Dust)))
                    .then(b.mass.total_cmp(&a.mass))
                    .then(a.id.cmp(&b.id))
            });
            self.history.priority_ids = ranked.iter().take(32).map(|b| b.id).collect();
        }
        if !edited && !self.tick.is_multiple_of(8) {
            return;
        }
        let frame = Frame {
            tick: self.tick,
            bodies: self
                .bodies
                .iter()
                .filter(|b| self.history.priority_ids.contains(&b.id))
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
                        periapsis_angle: orbit.periapsis_angle,
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
            .recent
            .last()
            .is_some_and(|f| f.tick == self.tick)
        {
            self.history.recent.pop();
        }
        if self.history.recent.len() >= 128 {
            self.history.recent.remove(0);
        }
        self.history.recent.push(frame.clone());
        self.history.detail_stride = self.history.detail_stride.max(8);
        if edited || self.tick.is_multiple_of(self.history.detail_stride) {
            if self
                .history
                .detailed
                .last()
                .is_some_and(|f| f.tick == self.tick)
            {
                self.history.detailed.pop();
            }
            if self.history.detailed.len() >= MAX_SAMPLES {
                self.history.detailed = self.history.detailed.iter().step_by(2).cloned().collect();
                self.history.detail_stride *= 2;
            }
            self.history.detailed.push(frame);
        }
    }
    fn observe_population(&mut self, edited: bool) {
        self.history.population_stride = self.history.population_stride.max(64);
        if !edited && !self.tick.is_multiple_of(self.history.population_stride) {
            return;
        }
        let mut mass = 0.;
        let mut eccentricity = 0.;
        for b in self.bodies.iter().skip(1) {
            mass += b.mass;
            eccentricity += b.mass
                * self
                    .moon_orbit(b)
                    .unwrap_or_else(|| self.orbit(b))
                    .eccentricity;
        }
        if self
            .history
            .population
            .last()
            .is_some_and(|p| p.tick == self.tick)
        {
            self.history.population.pop();
        }
        if self.history.population.len() >= MAX_SAMPLES {
            self.history.population = self.history.population.iter().step_by(2).cloned().collect();
            self.history.population_stride *= 2;
        }
        self.history.population.push(Population {
            tick: self.tick,
            count: self.bodies.len() - 1,
            mass,
            mean_eccentricity: eccentricity / mass.max(1e-30),
        });
    }
    pub(crate) fn observe_history(&mut self, edited: bool) {
        self.remember_events();
        self.observe_population(edited);
        self.detailed_history(edited);
        if !edited && self.tick.is_multiple_of(8) {
            self.observe_encounters();
        }
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
                        periapsis_angle: orbit.periapsis_angle,
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
        while self.history.frames.len() >= MAX_SAMPLES
            || (self.history.frames.len() > 1
                && self
                    .history
                    .frames
                    .iter()
                    .map(|f| f.bodies.len())
                    .sum::<usize>()
                    + frame.bodies.len()
                    > 65_536)
        {
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

#[derive(Serialize)]
pub struct HistoryView<'a> {
    body_ids: Vec<u32>,
    pairs: Vec<String>,
    frames: Vec<ViewFrame<'a>>,
    events: &'a [Event],
    stride: u64,
    detail: bool,
    recent_stride: u64,
    population: &'a [Population],
    pinned_ids: &'a [u32],
    encounters: &'a [crate::encounters::Encounter],
}
#[derive(Serialize)]
struct ViewFrame<'a> {
    body_sample: bool,
    tick: u64,
    bodies: Vec<&'a Reading>,
    resonances: Vec<&'a ResonanceReading>,
}
impl History {
    pub fn valid_bounds(&self) -> bool {
        self.frames.len() <= MAX_SAMPLES
            && self.detailed.len() <= MAX_SAMPLES
            && self.recent.len() <= 128
            && self.priority_ids.len() <= 32
            && self.pinned_ids.len() <= 8
            && self.encounters.len() <= 64
            && self.approaching.len() <= 64
            && self
                .encounters
                .iter()
                .chain(&self.approaching)
                .all(|e| e.valid())
            && self.population.len() <= MAX_SAMPLES
            && self
                .detailed
                .iter()
                .chain(&self.recent)
                .all(|f| f.bodies.len() <= 32 && f.resonances.len() <= 16)
            && self.events.len() <= MAX_HISTORY_EVENTS
            && self.frames.iter().map(|f| f.bodies.len()).sum::<usize>() <= 65_536
            && self.population.iter().all(|p| {
                p.tick <= crate::MAX_TICKS
                    && p.count <= crate::MAX_BODIES
                    && p.mass.is_finite()
                    && p.mean_eccentricity.is_finite()
            })
            && self
                .frames
                .iter()
                .chain(&self.detailed)
                .chain(&self.recent)
                .all(|f| {
                    f.tick <= crate::MAX_TICKS
                        && f.resonances.len() <= 16
                        && f.bodies.iter().all(|b| {
                            b.mass.is_finite()
                                && b.mass > 0.
                                && b.eccentricity.is_finite()
                                && b.periapsis_angle.is_finite()
                                && b.axis.is_none_or(f64::is_finite)
                                && b.period.is_none_or(f64::is_finite)
                        })
                })
    }

    pub fn view(&self, body: u32, inner: u32, outer: u32) -> HistoryView<'_> {
        let ids: std::collections::BTreeSet<_> = self
            .frames
            .iter()
            .chain(&self.detailed)
            .chain(&self.recent)
            .flat_map(|f| f.bodies.iter().map(|b| b.id))
            .collect();
        let pairs: std::collections::BTreeSet<_> = self
            .frames
            .iter()
            .chain(&self.detailed)
            .chain(&self.recent)
            .flat_map(|f| f.resonances.iter().map(|r| (r.inner, r.outer)))
            .collect();
        let body = if ids.contains(&body) {
            body
        } else {
            ids.first().copied().unwrap_or(0)
        };
        let pair = if pairs.contains(&(inner, outer)) {
            (inner, outer)
        } else {
            pairs.first().copied().unwrap_or((0, 0))
        };
        let detailed = self
            .detailed
            .iter()
            .chain(&self.recent)
            .any(|f| f.bodies.iter().any(|b| b.id == body));
        let mut frames = std::collections::BTreeMap::new();
        for (index, frame) in self
            .frames
            .iter()
            .chain(&self.detailed)
            .chain(&self.recent)
            .enumerate()
        {
            let entry = frames.entry(frame.tick).or_insert(ViewFrame {
                tick: frame.tick,
                body_sample: detailed || index < self.frames.len(),
                bodies: vec![],
                resonances: vec![],
            });
            if let Some(b) = frame.bodies.iter().find(|b| b.id == body) {
                entry.bodies = vec![b];
            }
            if let Some(r) = frame.resonances.iter().find(|r| (r.inner, r.outer) == pair) {
                entry.resonances = vec![r];
            }
        }
        HistoryView {
            body_ids: ids.into_iter().collect(),
            pairs: pairs.into_iter().map(|(i, o)| format!("{i}:{o}")).collect(),
            frames: frames.into_values().collect(),
            events: &self.events,
            stride: self.stride,
            detail: self.priority_ids.contains(&body),
            recent_stride: 8,
            population: &self.population,
            pinned_ids: &self.pinned_ids,
            encounters: &self.encounters,
        }
    }
}
