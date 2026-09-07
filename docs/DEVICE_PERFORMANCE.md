# Sustained device verification

Open View → Device performance test on the target iPhone or iPad. Select High
rendering detail and disable Reduce decorative motion for the quality target.
Prepare a scenario; this saves the current experiment in the notebook. Record
five minutes, pan/pinch/follow bodies, and open Observe while the simulation runs.

- 64 worlds: sustained gravity at ¼ speed stays inside the simulation work budget.
- Moon tracking: follow the host and a moon; pinch and pan between local/system views.
- Nursery: observe impacts and charts while bodies merge, graze or fragment.

Download the timing report. It includes exact replay conditions, browser,
viewport, DPR, rendering settings, build revision, playback speed, active duration, frame percentiles, slowest
frame, draw CPU and simulation tick throughput. Hidden and paused intervals are
excluded. A changed system, speed, rendering setting or viewport ends the recording; an early download is a partial
report. Histograms have fixed memory; delays over 250 ms have a separate overflow
count and the actual maximum is retained. Draw CPU is not GPU time.

Acceptance target: five active minutes at High on modern iPhone/iPad with roughly
60 rendered FPS, p95 frame spacing close to one display interval, responsive
navigation and continued simulation progress. Compare the same replay/device
before and after changes. CI software-rendered browser FPS cannot establish this
hardware result. The existing 30 FPS paused / 60 FPS active policy is intentional.

Automated gates cover native/WASM parity, conservation, seeded outcomes, bounded
histories and transport, payload limits, seven Chromium viewports and Firefox /
WebKit recipe execution. Actions retains timing reports and representative UI
screenshots; wall-clock runner speed remains informational.
