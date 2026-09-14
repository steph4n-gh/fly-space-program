"""Reference simulator for the proposed sign-dependent recurrent model.

No measured data or fitted parameter values. Piecewise constant contrast input;
analytical state/extremum formulas and matrix-exponential output integrals.
All times and time constants are in seconds. Numerical failures are rejected.
"""
from dataclasses import dataclass
from functools import lru_cache
import math
import numpy as np
from scipy.linalg import expm
from scipy.optimize import brentq


class NumericalFailure(RuntimeError):
    pass


@dataclass(frozen=True)
class Parameters:
    tau_v: float
    gap: float
    w: float
    g: float
    A_on: float
    A_off: float

    def __post_init__(self):
        v = np.asarray([self.tau_v, self.gap, self.w, self.g, self.A_on, self.A_off])
        if not np.all(np.isfinite(v)) or self.tau_v <= 0 or self.gap <= 0 or self.w < 0 or not 0 <= self.g <= 1 or min(self.A_on, self.A_off) < 0:
            raise ValueError("Invalid parameters")
        if not np.isfinite(self.tau_v+self.gap):
            raise ValueError("Nonfinite derived feedback time constant")

    @property
    def tau_a(self):
        return self.tau_v + self.gap

    def input(self, contrast):
        c = np.asarray(contrast, dtype=float)
        if not np.all(np.isfinite(c)) or np.any(np.abs(c) > 1):
            raise ValueError("Contrast must be finite and in [-1, 1]")
        return self.A_on * np.maximum(c, 0) - self.A_off * np.maximum(-c, 0)


class Regime:
    def __init__(self, model, x, drive, h):
        self.model, self.x, self.drive, self.h = model, np.asarray(x).copy(), drive, h
        p, q, w = model.p, model.q, model.params.w
        self.m = (p + q) / 2
        self.D = ((p - q) / 2) ** 2 - w * h * p * q
        self.eq = np.array([1., h]) * (drive / (1 + w * h))
        self.y = self.x - self.eq
        self.Ny = np.array([(-p+self.m)*self.y[0]-w*p*self.y[1], h*q*self.y[0]+(-q+self.m)*self.y[1]])
        self.U = p * (drive - self.x[0] - w * self.x[1])
        self.V = -self.m * self.U - p*q*((1+w*h)*self.x[0]-drive)

    def state(self, t):
        """Stable 2x2 exponential, including repeated eigenvalues."""
        t = float(t)
        if self.D > 0:
            k = math.sqrt(self.D)
            ep = math.exp((-self.m+k)*t)
            em = math.exp((-self.m-k)*t)
            ec = (ep+em)/2
            es = ep * (-math.expm1(-2*k*t))/(2*k)
        elif self.D < 0:
            omega = math.sqrt(-self.D)
            e = math.exp(-self.m*t)
            ec = e*math.cos(omega*t)
            es = e*t*np.sinc(omega*t/math.pi)
        else:
            ec = math.exp(-self.m*t)
            es = t*ec
        value = self.eq + ec*self.y + es*self.Ny
        cancellation_scale = abs(self.eq[0])+abs(ec*self.y[0])+abs(es*self.Ny[0])
        if abs(value[0]) <= 32*np.finfo(float).eps*cancellation_scale:
            # A marginal root/departure is poorly conditioned under equilibrium
            # subtraction. Re-evaluate using the augmented exponential.
            value = self.propagate(t)[0]
        return value

    def stationary(self, duration):
        """All strictly interior zeros of r', found analytically per regime."""
        U, V, D = self.U, self.V, self.D
        if U == 0 and V == 0:
            return []
        if D > 0:
            if V == 0:
                return []
            b = -U/V
            z = math.sqrt(D)*b
            if b <= 0 or not 0 <= z < 1:
                return []
            t = b if z == 0 else b*math.atanh(z)/z
            return [t] if 0 < t < duration else []
        if D == 0:
            t = -U/V if V != 0 else -1
            return [t] if 0 < t < duration else []
        omega = math.sqrt(-D)
        if V == 0:
            theta = math.pi/2
        else:
            theta = math.atan2(-omega*U*math.copysign(1., V), abs(V))
        period = math.pi/omega
        base = theta/omega
        n0 = math.floor(-base/period) + 1
        n1 = math.ceil((duration-base)/period) - 1
        if n1-n0 > self.model.max_events:
            raise NumericalFailure("Too many stationary points")
        return [base+n*period for n in range(n0, n1+1) if 0 < base+n*period < duration]

    def propagate(self, t):
        """State and integral of r over [0,t], with no small-time subtraction."""
        z = self.model.exponential(self.h, float(t)) @ np.array([*self.x, 0., self.drive])
        if not np.all(np.isfinite(z)):
            raise NumericalFailure("Nonfinite propagation")
        return z[:2], float(z[2])


@dataclass
class Segment:
    t0: float
    t1: float
    regime: Regime
    integral0: float


class Path:
    def __init__(self, segments, initial, final, total, min_r, max_r, min_at, event_count, positive_margin):
        self.segments, self.initial, self.final = segments, np.asarray(initial), np.asarray(final)
        self.duration = segments[-1].t1
        self.total_integral, self.min_r, self.max_r, self.min_at = total, min_r, max_r, min_at
        self.event_count, self.positive_margin = event_count, positive_margin
        self._starts = np.array([s.t0 for s in segments])

    def _evaluate(self, times, integral=False):
        times = np.asarray(times, dtype=float)
        if np.any(~np.isfinite(times)) or np.any(times < 0) or np.any(times > self.duration):
            raise ValueError("Observation outside simulated path")
        values = []
        for t in times.ravel():
            if t == self.duration:
                value = self.total_integral if integral else self.final.copy()
            else:
                s = self.segments[max(0, np.searchsorted(self._starts, t, side='right')-1)]
                if integral:
                    value = s.integral0+s.regime.propagate(t-s.t0)[1]
                else:
                    value = s.regime.state(t-s.t0)
            values.append(value)
        return np.asarray(values).reshape(times.shape if integral else times.shape+(2,))

    def state(self, times):
        return self._evaluate(times)

    def antiderivative(self, times):
        return self._evaluate(times, integral=True)

    def bin_average(self, ends, width):
        ends = np.asarray(ends, dtype=float)
        if not np.isfinite(width) or width <= 0:
            raise ValueError("Positive finite bin width required")
        return self.integral(ends-width,ends)/width

    def integral(self, begins, ends):
        """Local overlap integrals avoid subtracting two accumulated areas."""
        begins, ends = np.broadcast_arrays(np.asarray(begins,float),np.asarray(ends,float))
        if np.any(~np.isfinite(begins)) or np.any(~np.isfinite(ends)) or np.any(begins < 0) or np.any(ends > self.duration) or np.any(ends < begins):
            raise ValueError("Integral interval outside simulated path")
        result = []
        for begin,end in zip(begins.ravel(),ends.ravel()):
            area = 0.
            index = max(0,np.searchsorted(self._starts,begin,side='right')-1)
            while begin < end:
                segment = self.segments[index]
                stop = min(end,segment.t1)
                start_state = segment.regime.state(begin-segment.t0)
                local = Regime(segment.regime.model,start_state,segment.regime.drive,segment.regime.h)
                area += local.propagate(stop-begin)[1]
                begin, index = stop,index+1
            result.append(area)
        return np.asarray(result).reshape(begins.shape)

    def assert_positive(self):
        margin = 1+self.min_r
        if not np.isfinite(margin) or margin <= self.positive_margin:
            raise NumericalFailure(f"Nonpositive or unresolved fluorescence: minimum 1+r={margin:.17g}")


class Simulator:
    def __init__(self, params, root_xtol=2e-14, positive_margin=1e-10, max_events=10000):
        self.params = params
        self.p, self.q = 1/params.tau_v, 1/params.tau_a
        with np.errstate(over='ignore',invalid='ignore'):
            halfdiff = (self.p-self.q)/2
            scales = np.array([self.p,self.q,self.p+self.q,self.params.w*self.p,self.p*self.q,halfdiff*halfdiff,self.params.w*self.p*self.q])
        if np.any(~np.isfinite(scales)) or self.p <= 0 or self.q <= 0:
            raise ValueError("Nonfinite or underflowed derived rates")
        self.root_xtol, self.positive_margin, self.max_events = root_xtol, positive_margin, max_events
        if not np.isfinite(root_xtol) or root_xtol <= 0 or not np.isfinite(positive_margin) or positive_margin < 0:
            raise ValueError("Invalid numerical tolerances")
        # An absolute event tolerance alone is unsafe for very fast dynamics.
        # Keep the supplied seconds cap and tighten in proportion to model rates.
        self.event_xtol = root_xtol/max(1.,self.p+self.q+math.sqrt(self.params.w*self.p*self.q))
        if self.event_xtol <= 0 or not np.isfinite(self.event_xtol):
            raise ValueError("Unresolved event time scale")

    @lru_cache(maxsize=4096)
    def exponential(self, h, duration):
        p, q, w = self.p, self.q, self.params.w
        # Fourth coordinate is held-constant drive; third accumulates integral r.
        M = np.array([[-p,-w*p,0,p], [h*q,-q,0,0], [1,0,0,0], [0,0,0,0]], dtype=float)
        return expm(M*duration)

    def _h(self, x, drive):
        r, a = x
        direction = r if r != 0 else drive-self.params.w*a
        if direction == 0:
            direction = drive  # At zero slope, r'' has this sign; zero remains zero.
        return self.params.g if direction >= 0 else 1-self.params.g

    def simulate(self, edges, contrast, initial=(0., 0.), require_positive=True):
        edges, contrast = np.asarray(edges, float), np.asarray(contrast, float)
        if edges.ndim != 1 or contrast.ndim != 1 or len(edges) != len(contrast)+1 or len(contrast) == 0 or edges[0] != 0 or not np.all(np.isfinite(edges)) or np.any(np.diff(edges) <= 0):
            raise ValueError("Strictly increasing finite edges starting at zero required")
        drives = self.params.input(contrast)
        x = np.asarray(initial, float).copy()
        if x.shape != (2,) or not np.all(np.isfinite(x)):
            raise ValueError("Finite two-state initialization required")
        segments, total, event_count = [], 0., 0
        min_r = max_r = float(x[0])
        min_at = 0.
        for begin, end, drive in zip(edges[:-1], edges[1:], drives):
            t = float(begin)
            while t < end:
                duration = end-t
                h = self._h(x, drive)
                regime = Regime(self, x, drive, h)
                stationary = regime.stationary(duration)
                partition = [0., *stationary, duration]
                crossing = None
                expected = 1 if h == self.params.g else -1
                # g=.5 is one global linear regime; unnecessary zero resets would
                # inject event errors into an otherwise exact propagation.
                if self.params.g == .5:
                    partition = [0.]
                previous_t, previous_r = 0., float(x[0])
                for candidate_t in partition[1:]:
                    candidate_r = float(regime.state(candidate_t)[0])
                    if not np.isfinite(candidate_r):
                        raise NumericalFailure("Nonfinite event evaluation")
                    if candidate_r*expected < 0:
                        left = previous_t
                        # A zero at interval start belongs to the departing side.
                        # Find a strictly signed bracket without skipping any extrema.
                        if previous_r == 0:
                            advance = min((candidate_t-previous_t)/2, max(self.event_xtol, np.spacing(t+previous_t)))
                            left = previous_t+advance
                            for _ in range(60):
                                if regime.state(left)[0]*expected > 0:
                                    break
                                advance *= 2
                                left = previous_t+advance
                                if left >= candidate_t:
                                    raise NumericalFailure("Unresolved departure from zero")
                            else:
                                raise NumericalFailure("Unresolved zero-crossing bracket")
                        crossing = brentq(lambda dt: regime.state(dt)[0], left, candidate_t, xtol=self.event_xtol, rtol=4*np.finfo(float).eps)
                        break
                    previous_t, previous_r = candidate_t, candidate_r
                dt = crossing if crossing is not None else duration
                if dt <= 0 or t+dt == t:
                    raise NumericalFailure("No progress at response event")
                final, area = regime.propagate(dt)
                for extremum in [0., *regime.stationary(dt), dt]:
                    r = float(regime.state(extremum)[0])
                    if r < min_r:
                        min_r, min_at = r, t+extremum
                    max_r = max(max_r, r)
                segments.append(Segment(t, t+dt, regime, total))
                total += area
                x = final
                if crossing is not None:
                    # Event root error is assessed by convergence tests; remove drift.
                    x[0] = 0.
                    event_count += 1
                    if event_count > self.max_events:
                        raise NumericalFailure("Event limit exceeded")
                t = float(end) if crossing is None else t+dt
        path = Path(segments, initial, x, total, min_r, max_r, min_at, event_count, self.positive_margin)
        if require_positive:
            path.assert_positive()
        return path

    def periodic(self, edges, contrast, atol=1e-11, rtol=1e-9, max_cycles=1000, require_positive=True):
        """Numerically settle from zero using only the repeated stimulus.

        Require at least five tau_a of elapsed stimulus and two successive
        closure checks. Scale closure tolerance for a potentially slow mode.
        These are convergence safeguards, not a rigorous nonlinear tail bound.
        """
        period = float(np.asarray(edges)[-1])
        if not np.isfinite(period) or period <= 0 or atol <= 0 or rtol < 0 or max_cycles < 2:
            raise ValueError("Invalid periodic settling arguments")
        warmup_ratio = 5*(self.params.tau_a/period)
        if not np.isfinite(warmup_ratio) or warmup_ratio > max_cycles-1:
            raise NumericalFailure("Required settling warmup exceeds cycle limit")
        min_cycles = max(1,math.ceil(warmup_ratio))
        closure_scale = min(1.,period/self.params.tau_a)
        consecutive = 0
        x = np.zeros(2)
        for n in range(1, max_cycles+1):
            path = self.simulate(edges, contrast, x, require_positive=require_positive)
            residual = float(np.max(np.abs(path.final-x)))
            tolerance = closure_scale*(atol+rtol*max(float(np.max(np.abs(x))), float(np.max(np.abs(path.final)))))
            consecutive = consecutive+1 if n >= min_cycles and residual <= tolerance else 0
            if consecutive >= 2:
                mu = path.total_integral/path.duration
                if not np.isfinite(mu) or 1+mu <= self.positive_margin:
                    raise NumericalFailure("Nonpositive or unresolved periodic mean")
                return path, {"cycles": n, "minimum_warmup_cycles": min_cycles, "consecutive_closure_checks": consecutive, "closure": residual, "closure_tolerance": tolerance, "mean": mu}
            x = path.final.copy()
        raise NumericalFailure("Periodic settling did not converge")


def normalized_response(path, times, periodic_mean):
    """Same continuous periodic mean must also be used for zero-start response."""
    if not np.isfinite(periodic_mean) or 1+periodic_mean <= path.positive_margin:
        raise NumericalFailure("Nonpositive or unresolved normalization denominator")
    return (1+path.state(times)[..., 0])/(1+periodic_mean)-1


def flash_predictions(params, bin_ends, polarity, width=1/120, flash_duration=.02,
                      root_xtol=2e-14, positive_margin=1e-10):
    """Zero-initialized flash with bin ends relative to onset, including baseline.

    Returns predictions and the complete checked path. Negative relative times
    are modeled explicitly as gray input preceding the flash. Delay is zero.
    """
    ends = np.asarray(bin_ends, dtype=float)
    if ends.size == 0 or np.any(~np.isfinite(ends)) or polarity not in (-1,1) or not np.isfinite(width) or width <= 0 or not np.isfinite(flash_duration) or flash_duration <= 0:
        raise ValueError("Finite bin ends, positive durations, polarity +/-1 required")
    origin = min(0., float(np.min(ends-width)))
    stop = max(flash_duration, float(np.max(ends)))
    edges_relative = np.unique([origin,0.,flash_duration,stop])
    drives = np.where((edges_relative[:-1] >= 0)&(edges_relative[:-1] < flash_duration),polarity,0)
    path = Simulator(params,root_xtol=root_xtol,positive_margin=positive_margin).simulate(edges_relative-origin,drives)
    # Shift each original endpoint before subtraction; keep the earliest lower
    # endpoint exactly zero instead of generating a tiny negative by reassociation.
    values = path.integral((ends-width)-origin,ends-origin)/width
    return values, path
