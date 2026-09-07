# Collision model development

Rules version 5 distinguishes gentle accretion, grazing survival and
disruptive impacts. This is a calibrated gameplay model, not a hydrodynamics
solver. Impact speed, geometry and mass ratio should matter; the player must be
able to inspect the outcome and rerun the encounter with a changed condition.

The physical motivation is the diversity of outcomes described by
[Leinhardt and Stewart](https://arxiv.org/abs/1106.6084) and
[Stewart and Leinhardt](https://arxiv.org/abs/1109.4588). These sources motivate
the regimes; the game's thresholds and bounded remnant representation are
explicit simplifications, not a claim to implement their fitted scaling laws.

Implementation requirements:

- Preserve versions 1–4 contact behavior. Introduce new rules for the new default.
- Resolve the swept contact geometry, including fast crossings and near misses.
- Keep stellar absorption and gentle accretion; allow solids to survive a graze.
- Represent disruptive outcomes with at most three remnants. At the body cap,
  distribute all material among the available remnants rather than discarding it.
- Preserve center of mass, linear momentum and angular momentum, including
  unresolved spin. Record the orbital-energy change separately from impact heat.
- Keep changed radii, material, lineage and orbital information in the event
  record. Fragment formation must not become a cheap shortcut to formation goals.
- Test head-on/grazing impacts, unequal masses, opposite directions, saturated
  capacity, conservation, replay equivalence and timestep convergence separately
  from the graphics. Tune generator and campaign fixtures after measuring outcomes.

Implemented in iteration 116. The binding-speed scale uses 2GM/(0.025R),
where R is the exaggerated contact-radius sum. Solids graze for impact parameter
above 0.65 and speed above that scale; more central impacts disrupt when specific
impact energy exceeds half the binding-speed squared. Otherwise they merge.
Grazing normal restitution is 0.45. Disruption retains 15% of relative kinetic
energy in two or three remnant trajectories; all material is retained. Stars and
giants accrete. The signed resolved orbital-energy ledger also includes contact
position/potential changes and must not be interpreted as physical heat.

Native tests exercise conservation and bounds independently of rendering. This
model intentionally omits vapor loss, interior structure and a fine debris cloud.
