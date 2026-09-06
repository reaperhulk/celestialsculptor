// Only literal local references are part of this small static application's contract.
export function localReferences(source){
 return [...source.matchAll(/(?:from\s*|import\s*\(|new URL\s*\(|fetch\s*\()(['"])(\.\.?\/[^'"]+)\1/g)].map(match=>match[2]);
}
