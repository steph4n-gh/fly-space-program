import assert from 'node:assert/strict';
import { meanFailedContactQuality as quality } from './ground-contact-progress.mjs';

const scenarios = [{ landingRadius: 11 }, { landingRadius: 7 },
  { landingRadius: 8 }, { landingRadius: 11, orbital: true }];
const endpoint = (touchdown = { error: 0, speed: 0, lateral: 0, tilt: 0 }, extra = {}) =>
  ({ scenario: 0, landed: false, censored: false, touchdown, ...extra });
const limits = { error: 11, speed: 3.6, lateral: 3, tilt: .2 };
let checks = 0;
const check = (name, test) => { test(); checks++; console.log(`PASS ${name}`); };

check('strict boundaries and yaw-only failures remain failed with quality one', () => {
  for (const [field, limit] of Object.entries(limits)) {
    const flight = endpoint({ error: 0, speed: 0, lateral: 0, tilt: 0, [field]: limit });
    assert.equal(quality([flight], scenarios), 1);
    assert.equal(flight.landed, false);
  }
  assert.equal(quality([endpoint(undefined, { reason: 'Unsettled rotation' })], scenarios), 1);
});

check('reported landings must satisfy every stored strict bound', () => {
  for (const [field, limit] of Object.entries(limits)) {
    for (const multiple of [1, 2]) {
      const contact = { error: 0, speed: 0, lateral: 0, tilt: 0, [field]: limit * multiple };
      assert.throws(() => quality([endpoint(contact, { landed: true })], scenarios));
      assert.equal(quality([endpoint(contact)], scenarios), 1 / multiple);
    }
  }
  assert.equal(quality([endpoint({ error: 10.9, speed: 3.5, lateral: 2.9, tilt: .19 },
    { landed: true })], scenarios), 0);
});

check('noncontacts count in the failed-case denominator', () => {
  assert.equal(quality([endpoint(null)], scenarios), 0);
  assert.equal(quality([endpoint(), endpoint(null)], scenarios), .5);
  assert.equal(quality([endpoint(), endpoint(null), endpoint(undefined, { landed: true })], scenarios), .5);
});

check('all-landed cohorts have the neutral zero key', () => {
  assert.equal(quality([endpoint(undefined, { landed: true })], scenarios), 0);
});

check('mission-specific radii are used', () => {
  const contact = { error: 14, speed: 0, lateral: 0, tilt: 0 };
  assert.equal(quality([endpoint(contact, { scenario: 1 })], scenarios), .5);
  assert.equal(quality([endpoint({ ...contact, error: 16 }, { scenario: 2 })], scenarios), .5);
});

check('quality decreases with each worst normalized violation and is flat below the maximum', () => {
  for (const [field, limit] of Object.entries(limits)) {
    const values = [1, 2, 4].map(multiple => quality([
      endpoint({ error: 0, speed: 0, lateral: 0, tilt: 0, [field]: limit * multiple }),
    ], scenarios));
    assert.deepEqual(values, [1, .5, .25]);
  }
  assert.equal(quality([endpoint({ error: 22, speed: 3.6, lateral: 0, tilt: 0 })], scenarios), .5);
  assert.equal(quality([endpoint({ error: 22, speed: 0, lateral: 0, tilt: 0 })], scenarios), .5);
});

check('mean aggregation permits a different tradeoff from the worst case', () => {
  const uneven = [endpoint(), endpoint(null)];
  const balanced = [endpoint({ error: 27.5, speed: 0, lateral: 0, tilt: 0 }),
    endpoint({ error: 27.5, speed: 0, lateral: 0, tilt: 0 })];
  assert.equal(quality(uneven, scenarios), .5);
  assert.equal(quality(balanced, scenarios), .4);
  assert(quality(uneven, scenarios) > quality(balanced, scenarios));
  assert(Math.min(...uneven.map(flight => quality([flight], scenarios)))
    < Math.min(...balanced.map(flight => quality([flight], scenarios))));
});

check('invalid and partial endpoints reject the entire cohort', () => {
  const missing = endpoint(); delete missing.touchdown;
  const invalid = [null, [], {}, endpoint(null, { landed: 0 }), endpoint(null, { censored: true }),
    endpoint(null, { censored: undefined }), endpoint(null, { scenario: -1 }),
    endpoint(null, { scenario: .5 }), endpoint(null, { scenario: '0' }),
    endpoint(null, { scenario: 99 }), endpoint(null, { scenario: 3 }), missing,
    endpoint(null, { landed: true }), endpoint({ error: 0, speed: 0, lateral: 0 }),
    endpoint({ error: 0, speed: 0, lateral: 0, tilt: '0' }), endpoint([])];
  for (const field of Object.keys(limits)) {
    for (const value of [NaN, Infinity, -Infinity, -1, null, '1']) {
      invalid.push(endpoint({ error: 0, speed: 0, lateral: 0, tilt: 0, [field]: value }));
    }
  }
  for (const flight of invalid) assert.throws(() => quality([endpoint(), flight], scenarios));
  for (const flights of [[], null, {}, Array(1)]) assert.throws(() => quality(flights, scenarios));
  for (const radius of [0, -1, NaN, Infinity, null, '11']) {
    assert.throws(() => quality([endpoint()], [{ landingRadius: radius }]));
  }
  assert.throws(() => quality([endpoint()], []));
  assert.throws(() => quality([endpoint()], null));
  assert.throws(() => quality([endpoint()], [{ landingRadius: 11, orbital: 'false' }]));
  assert.throws(() => quality([endpoint({ error: 0, speed: 0, lateral: 0, tilt: NaN }, { landed: true })], scenarios));
});

check('finite inputs that overflow during normalization are rejected', () => {
  assert.throws(() => quality([endpoint({ error: 0, speed: 0, lateral: 0, tilt: Number.MAX_VALUE })], scenarios));
  assert.throws(() => quality([endpoint({ error: Number.MAX_VALUE, speed: 0, lateral: 0, tilt: 0 })],
    [{ landingRadius: Number.MIN_VALUE }]));
});

check('inputs remain byte-identical and may be frozen', () => {
  const flights = [endpoint(), endpoint(null), endpoint(undefined, { landed: true })];
  const before = JSON.stringify({ flights, scenarios });
  for (const flight of flights) {
    if (flight.touchdown) Object.freeze(flight.touchdown);
    Object.freeze(flight);
  }
  Object.freeze(flights);
  scenarios.forEach(Object.freeze); Object.freeze(scenarios);
  assert.equal(quality(flights, scenarios), .5);
  assert.equal(JSON.stringify({ flights, scenarios }), before);
});

console.log(`All ${checks} check groups passed; synthetic arithmetic only.`);
