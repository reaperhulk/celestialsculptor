# Sustained device verification

Open View → Device performance test on the target iPhone or iPad. Select High
rendering detail and disable Reduce decorative motion for the quality target.
Prepare a scenario; this saves the current experiment in the notebook. Record
five minutes, pan/pinch/follow bodies, and open Observe while the simulation runs.

- 64 worlds: sustained gravity at ¼ speed; denser systems have the same 600-year age range.
- 1,024 / 4,096 / 8,192 bodies: disordered physical swarms at requested 1×.
- Moon tracking: follow the host and a moon; pinch and pan between local/system views.
- Nursery: observe impacts and charts while bodies merge, graze or fragment.

Download the timing report. It includes exact replay conditions, browser,
viewport, DPR, rendering settings, build revision, playback speed, active duration, frame percentiles, slowest
frame, draw CPU, simulation tick throughput, achieved speed and requested speed.
Report version 2 includes `throughputRatio`: 1 means the simulation kept pace;
0.5 means it achieved half the requested warp. The FPS overlay shows the same
achieved/requested speed. A 60-FPS scene can still have a throughput ratio below 1. Hidden and paused intervals are
excluded. A changed system, speed, rendering setting or viewport ends the recording; an early download is a partial
report. Histograms have fixed memory; delays over 250 ms have a separate overflow
count and the actual maximum is retained. Draw CPU is not GPU time.

Acceptance target: five active minutes at High on modern iPhone/iPad with roughly
60 rendered FPS, p95 frame spacing close to one display interval, responsive
navigation and continued simulation progress. Compare the same replay/device
before and after changes. CI software-rendered browser FPS cannot establish this
hardware result. The existing 30 FPS paused / 60 FPS active policy is intentional.

WASM SIMD128 uses the browser's ARM64 NEON compilation path on Apple devices.
Actions separately runs native/WASM differential checks and recipe execution in
WebKit on Apple Silicon. Compare the new SIMD build against an earlier scalar
build on the same iPhone/iPad and replay. An ARM64 desktop result is not a phone
throughput, frame-rate or thermal measurement.

Automated gates cover native/WASM parity, conservation, seeded outcomes, bounded
histories and transport, payload limits, seven Chromium viewports and Firefox /
WebKit recipe execution. Actions retains timing reports and representative UI
screenshots; wall-clock runner speed remains informational.

## Aggregate evidence for one tested build

Enter the physical device model/browser, choose its category, and explicitly
mark that the recording uses physical hardware rather than emulation. Reports
include the clean/dirty build flag, exact WASM hash and fixed physics resolution.

```sh
npm run qualify:devices -- dist/build-info.json path/to/report.json
```

The aggregator requires a matching clean revision and WASM hash, an identified
physical device, a standard reproducible workload, five active minutes, High
quality (DPR cap 2 and decorative motion enabled), at least 55 FPS, p95 frame
spacing at most 20 ms, and at least 90% of requested simulation pace. Passing
applies only to that workload/device/build. Partial, mismatched, emulated and
slower reports remain useful evidence with explicit reasons for not qualifying.

The required desktop, iPhone and iPad matrix starts as **pending physical
evidence**. Browser-engine execution and responsive viewport tests do not turn
those rows into hardware support claims. No physical iPhone/iPad five-minute
recording was available during this implementation review.
