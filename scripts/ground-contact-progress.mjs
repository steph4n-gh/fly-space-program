// Outcome-only ordering key. The original landed flag remains authoritative.
export function meanFailedContactQuality(flights, scenarios) {
  if (!Array.isArray(flights) || flights.length === 0 || !Array.isArray(scenarios)) {
    throw new TypeError('Expected a nonempty flight array and a scenario array');
  }
  let failed = 0, total = 0;
  for (let i = 0; i < flights.length; i++) {
    const flight = flights[i];
    if (!flight || typeof flight !== 'object' || Array.isArray(flight)
        || typeof flight.landed !== 'boolean' || flight.censored !== false) {
      throw new TypeError(`Flight ${i} must be a completed endpoint with a boolean landed flag`);
    }
    const index = flight.scenario;
    const mission = Number.isInteger(index) && index >= 0 && index < scenarios.length ? scenarios[index] : null;
    if (!mission || typeof mission !== 'object' || Array.isArray(mission)
        || (mission.orbital !== undefined && mission.orbital !== false)
        || !Number.isFinite(mission.landingRadius) || mission.landingRadius <= 0) {
      throw new TypeError(`Flight ${i} must reference a ground scenario with a positive finite landing radius`);
    }
    if (!Object.hasOwn(flight, 'touchdown')) {
      throw new TypeError(`Flight ${i} is missing its explicit touchdown record`);
    }
    const contact = flight.touchdown;
    let quality = 0;
    if (contact !== null) {
      const fields = ['error', 'speed', 'lateral', 'tilt'];
      if (!contact || typeof contact !== 'object' || Array.isArray(contact)
          || !fields.every(name => Object.hasOwn(contact, name)
            && Number.isFinite(contact[name]) && contact[name] >= 0)) {
        throw new TypeError(`Flight ${i} has an incomplete or invalid touchdown record`);
      }
      const ratios = [contact.error / mission.landingRadius, contact.speed / 3.6,
        contact.lateral / 3, contact.tilt / .2];
      if (!ratios.every(Number.isFinite)) {
        throw new RangeError(`Flight ${i} has a nonfinite normalized contact metric`);
      }
      if (flight.landed && !(contact.error < mission.landingRadius && contact.speed < 3.6
          && contact.lateral < 3 && contact.tilt < .2)) {
        throw new RangeError(`Flight ${i} reports a landing outside a stored strict contact bound`);
      }
      quality = 1 / Math.max(1, ...ratios);
    } else if (flight.landed) {
      throw new TypeError(`Flight ${i} cannot be landed without a touchdown record`);
    }
    if (!flight.landed) {
      failed++;
      total += quality;
    }
  }
  return failed === 0 ? 0 : total / failed;
}
