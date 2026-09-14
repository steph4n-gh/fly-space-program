# Positive amplitude scaling in the raw flash model

Static source review confirms the requested implication. This note uses the frozen
`sources/visual_recurrent.py` snapshot, whose SHA-256 is recorded in
`manifest.json` under `raw-model-source`. No model execution or response arrays
were needed.

The input map in lines 39–43 is

\[
I(u)=A_{\rm on}\max(u,0)-A_{\rm off}\max(-u,0).
\]

For positive \(c\), \(I(cu)=cI(u)\). In each sign branch, the state equations
encoded by the matrix at lines 210–214 are

\[
\dot r=p[I(u)-r-wa],\qquad \dot a=q[h(r)r-a].
\]

Here the branch coefficient is \(g\) or \(1-g\). The `_h` rule at lines 216–221
preserves its choice when \((r,a,I)\) is multiplied by \(c>0\): the sign of
\(r\) is unchanged, and at zero response the departure tests \(I-wa\) and then
\(I\) also retain their signs. Thus multiplying a solution and its initial state
by \(c\) satisfies the same branch sequence and the scaled-input equations.
Consequently the exact raw dynamical map obeys

\[
F_\theta(cu,cx_0)=cF_\theta(u,x_0).
\]

`simulate` defaults to a zero initial state (line 223), and `flash_predictions`
uses that default (lines 334–348). Its observation is a fixed bin integral divided
by width (line 351), which is linear. Zero initialization remains zero under any
positive scaling. Any subsequent fixed linear window average has the same
property.

For one base waveform and common high/low parameters within each treatment arm,
let a condition have amplitude multiplier \(c_j>0\), shared before and after
treatment. For the same observation bins,

\[
\Delta_j
=B F_{\theta_{\rm treated}}(c_j u,0)
 -B F_{\theta_{\rm control}}(c_j u,0)
=c_j\Delta_{\rm base}.
\]

Hence positive high/low amplitude multipliers alone cannot reverse a raw
predicted treatment-change sign between the two conditions. The conclusion
also holds with initial states that are scaled consistently within each arm.

Qualifications:

- This is an identity of the exact dynamical model, not a claim of bitwise
  equality for finite-precision event finding or nearly zero computed effects.
- `Parameters.input` rejects contrast outside `[-1,1]` (lines 39–42). Scaling
  must remain admissible. Both paths must also satisfy the `1+r` positivity
  check (lines 185–188 and 291–294); validity checks can reject a scaled path.
- The current `flash_predictions` API accepts polarity `-1` or `1`, with no
  amplitude argument (lines 334–347). The scaling statement concerns the
  underlying raw model with a scaled admissible waveform, not a claim that this
  wrapper already exposes that option. Scaling the appropriate input gain is
  mathematically equivalent for a fixed flash polarity.
- The same waveform timing, parameter values within each treatment arm,
  observation operator, and scaled/zero initialization are essential. Arbitrary
  non-scaled prehistories or initial states are outside this result.
- The natural-response normalization at lines 327–331 contains a periodic-mean
  denominator and is outside the raw linear observation used in this proof.

This establishes why a guessed positive luminance ratio alone cannot resolve
opposite raw predicted treatment-change signs under these assumptions. The
manifest therefore retains original stimulus history and observation context
as unresolved requirements; it does not assert which missing context explains
the measurements.
