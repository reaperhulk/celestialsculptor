// Optional WebGPU comparison (View → GPU compute comparison); modules load on demand.
export function installGpuPanel(app) {
  const { $, send, download } = app;
  let report = null;
  $('run-gpu-benchmark').onclick = async () => {
    const button = $('run-gpu-benchmark');
    button.disabled = true;
    $('download-gpu-benchmark').disabled = true;
    const progress = (text) => ($('gpu-benchmark-status').textContent = text);
    try {
      await send('play', { value: false });
      const { runGpuBenchmark } = await import('./gpu-benchmark.js');
      report = await runGpuBenchmark({ progress });
      if (report.supported) {
        const { runGpuOrbitBenchmark } = await import('./gpu-orbit-benchmark.js');
        report.orbits = await runGpuOrbitBenchmark({ progress });
        const { runMixedBenchmark } = await import('./gpu-mixed-probe.js');
        progress('Measuring mixed precision with f64 orbital state…');
        report.mixed = await runMixedBenchmark();
        const { runGpuLifetime } = await import('./gpu-lifetime.js');
        report.lifetime = await runGpuLifetime({ progress });
      }
      progress(
        report.supported
          ? report.lifetime?.status === 'rejected'
            ? `GPU accuracy limit exceeded at year ${report.lifetime.completedYears}. Download the comparison results.`
            : 'Comparison complete. Download the force, moving-orbit and moon-drift results.'
          : report.reason,
      );
      $('download-gpu-benchmark').disabled = false;
    } catch (error) {
      progress(`Comparison could not finish: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  };
  $('download-gpu-benchmark').onclick = () => {
    if (report) download(JSON.stringify(report, null, 2), 'celestial-gpu-comparison.json');
  };
}
