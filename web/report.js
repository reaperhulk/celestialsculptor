import {archiveExperiment} from './storage.js';
export function diagnosticReport(replay,profile,build,environment){
 const archive=JSON.parse(archiveExperiment(replay,profile));
 archive.diagnostics={revision:build.revision,saveVersion:build.saveVersion,environment};
 return JSON.stringify(archive,null,2);
}
