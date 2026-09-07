"""Independent DOP853 reference + long-run release gates. scipy==1.16.2."""
import argparse
import json
import math
from pathlib import Path
import numpy as np
from scipy.integrate import solve_ivp
import scipy

G = 39.47841760435743
BUDGETS = dict(relative_energy=2e-5, angular_residual=1e-9, momentum_residual=1e-9,
               axis_relative=2e-3, eccentricity=2e-3, phase_radians=.2, apsis_radians=.1,
               oracle_relative_state=2e-5, convergence_ratio=3.)

def state(values): return np.asarray(values, dtype=float).reshape(-1, 5)
def balances(s):
    mass = s[:, 4]; p = (mass[:, None] * s[:, 2:4]).sum(axis=0)
    angular = (mass * (s[:, 0]*s[:, 3]-s[:, 1]*s[:, 2])).sum()
    energy = (.5*mass*(s[:, 2:4]**2).sum(axis=1)).sum()
    for i in range(len(s)):
        for j in range(i+1, len(s)):
            energy -= G*mass[i]*mass[j]/math.sqrt(((s[i, :2]-s[j, :2])**2).sum()+1e-8)
    return np.array([energy, angular, *p])
def elements(s, moons=False):
    result=[]
    for i in range(1,len(s)):
        host=1 if moons and i>=2 else 0
        r=s[i,:2]-s[host,:2];v=s[i,2:4]-s[host,2:4];d=np.linalg.norm(r);mu=G*(s[i,4]+s[host,4]);dot=np.dot(r,v)
        e=((np.dot(v,v)-mu/d)*r-dot*v)/mu
        a=1/(2/d-np.dot(v,v)/mu)
        result.append([a,np.linalg.norm(e),math.atan2(r[1],r[0]),math.atan2(e[1],e[0])])
    return np.asarray(result)
def differences(a,b,moons=False):
    x,y=elements(a,moons),elements(b,moons);d=np.abs(x-y)
    for j in [2,3]: d[:,j]=np.abs(np.arctan2(np.sin(x[:,j]-y[:,j]),np.cos(x[:,j]-y[:,j])))
    d[:,0]/=np.maximum(abs(y[:,0]),1e-12)
    # Periapsis direction is undefined for nearly circular osculating orbits.
    d[(x[:,1]<1e-4)|(y[:,1]<1e-4),3]=0
    return dict(zip(['axis_relative','eccentricity','phase_radians','apsis_radians'],d.max(axis=0).tolist()))
def oracle(initial,years,tolerance):
    masses=initial[:,4].copy();n=len(initial)
    def rhs(_,flat):
        s=flat.reshape(n,4);d=s[None,:,:2]-s[:,None,:2]
        r2=(d*d).sum(axis=2)+1e-8;np.fill_diagonal(r2,np.inf)
        a=G*(d*(masses[None,:]/r2**1.5)[:,:,None]).sum(axis=1)
        return np.concatenate((s[:,2:4],a),axis=1).ravel()
    sol=solve_ivp(rhs,(0,float(years[-1])),initial[:,:4].ravel(),method='DOP853',rtol=tolerance,atol=tolerance*.01,t_eval=years)
    if not sol.success: raise RuntimeError(sol.message)
    return [np.column_stack((flat.reshape(n,4),masses)) for flat in sol.y.T]

def qualify(raw, reference=True):
    failures=[];orbit_reports=[]
    for case in raw['collisionless']:
        initial=state(case['initial']);b0=balances(initial);runs=case['runs'];production=runs[0]['samples'];energy=[];angular=[];momentum=[]
        for sample in production:
            b=balances(state(sample['state']));energy.append(abs((b[0]-b0[0])/b0[0]));angular.append(abs(b[1]-b0[1]));momentum.append(float(np.linalg.norm(b[2:]-b0[2:])))
        checks=dict(relative_energy=max(energy),angular_residual=max(angular),momentum_residual=max(momentum))
        for metric,value in checks.items():
            if value>BUDGETS[metric]: failures.append(f"{case['name']}: {metric} {value} > {BUDGETS[metric]}")
        e1=np.linalg.norm(state(runs[0]['samples'][-1]['state'])[:,:4]-state(runs[2]['samples'][-1]['state'])[:,:4])
        e2=np.linalg.norm(state(runs[1]['samples'][-1]['state'])[:,:4]-state(runs[2]['samples'][-1]['state'])[:,:4])
        convergence=float(e1/max(e2,1e-30))
        if convergence<BUDGETS['convergence_ratio']:failures.append(f"{case['name']}: timestep refinement did not converge")
        report=dict(name=case['name'],years=case['years'],inner_periods=case['years']/(abs(elements(initial)[0,0])**1.5/math.sqrt(initial[:2,4].sum())),**checks,convergence_ratio=convergence,
                    final_refinement=differences(state(runs[0]['samples'][-1]['state']),state(runs[2]['samples'][-1]['state']),case['name']=='moons'))
        if reference:
            samples=[s for s in production if s['year']<=600];years=[s['year'] for s in samples]
            loose=oracle(initial,years,1e-13);tight=oracle(initial,years,3e-14)
            oracle_error=max(float(np.linalg.norm(a[:,:4]-b[:,:4])/np.linalg.norm(b[:,:4])) for a,b in zip(loose,tight))
            if oracle_error>BUDGETS['oracle_relative_state']:failures.append(f"{case['name']}: reference tolerance refinement failed")
            errors=[differences(state(s['state']),ref,case['name']=='moons') for s,ref in zip(samples,tight)]
            worst={key:max(row[key] for row in errors) for key in errors[0]}
            for metric,value in worst.items():
                if value>BUDGETS[metric]:failures.append(f"{case['name']}: reference {metric} {value} > {BUDGETS[metric]}")
            signed_apsis=[]
            for s,ref in zip(samples,tight):
                difference=elements(state(s['state']),case['name']=='moons')[:,3]-elements(ref,case['name']=='moons')[:,3]
                signed_apsis.append(np.arctan2(np.sin(difference),np.cos(difference)))
            rates=np.polyfit(years,np.unwrap(np.array(signed_apsis),axis=0),1)[0].tolist()
            report.update(apsis_error_slope_radians_per_year=rates,reference_years=years[-1],reference_tolerance_error=oracle_error,reference_errors=worst)
        orbit_reports.append(report);print(json.dumps(report),flush=True)
    worlds=[]
    for case in raw['worlds']:
        initial=case['initial'];samples=case['samples'];relative=max(abs((s['balances']['energy_balance']-initial['energy_balance'])/initial['energy_balance']) for s in samples)
        mass=max(abs(s['balances']['mass']-initial['mass']) for s in samples)
        momentum=max(math.hypot(*(s['balances']['momentum'][k]-initial['momentum'][k] for k in ['x','y'])) for s in samples)
        angular=max(abs(s['balances']['angular_momentum']-initial['angular_momentum']) for s in samples)
        for label,value,budget in [('energy_balance',relative,2e-5),('mass',mass,1e-10),('momentum',momentum,1e-9),('angular',angular,1e-9)]:
            if value>budget:failures.append(f"{case['name']}: {label} {value} > {budget}")
        if samples[-1]['year']!=600:failures.append(f"{case['name']}: incomplete horizon")
        if case['name']=='moons' and any(s['moons']!=2 for s in samples):failures.append('Long-lived moons were lost')
        if case['name']=='resonance' and not any(r['librating'] and r['p']==2 and r['q']==1 for r in samples[-1]['resonances']):failures.append('Resonance did not remain observed')
        worlds.append(dict(name=case['name'],years=600,max_relative_energy_balance=relative,max_mass_residual=mass,max_momentum_residual=momentum,max_angular_residual=angular,final_bodies=samples[-1]['bodies'],tree_years_observed=sum(s['bodies']>=512 for s in samples)*25))
    return dict(schema=1,physics=raw['physics'],reference=f'SciPy {scipy.__version__} DOP853, same softened force law; tolerance refinement 1e-13 → 3e-14' if reference else 'not run',budgets=BUDGETS,collisionless=orbit_reports,worlds=worlds,passed=not failures,failures=failures)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('input');parser.add_argument('--output',default='numerical-qualification.json');parser.add_argument('--skip-reference',action='store_true');args=parser.parse_args()
    report=qualify(json.loads(Path(args.input).read_text()),not args.skip_reference);Path(args.output).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2));raise SystemExit(0 if report['passed'] else 1)
