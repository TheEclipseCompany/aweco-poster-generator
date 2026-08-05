/* eslint-disable */
// @ts-nocheck

//
// Adapted from:
//
// Solar Eclipse Calculator & Diagram for Google Maps v3 (Xavier Jubier: http://xjubier.free.fr/)
//

export enum EclipseEventType {
  Total,
  Partial,
  Annular,
  None,
}

export type EclipseCalculator = (
  request: EclipseCalculationRequest,
) => EclipseCalculationData;

export interface EclipseCalculationRequest {
  lat: number;
  lng: number;
  elevation: number;
}

export interface EclipseCalculationContact {
  name: string;
  utcTimestamp: number;
  sunAltitude: number;
  sunAzimuth: number;
  isSunVisible: boolean;
  isSunVisibleNoRefraction: boolean;
  scx: number;
  scy: number;
  srd: number;
  mcx: number;
  mcy: number;
  mrd: number;
  /** Sun coverage (0..1) at this instant — currently exposed on the
   * sunrise/sunset contacts only (absent when the sun doesn't cross the
   * horizon near the event). Same lens formula as eclipseObscuration,
   * evaluated on this contact's circumstances. */
  obscuration?: number;
}

/** Sun/moon projection values at an arbitrary instant. Same conventions as
 * the contacts: scy/mcy are refracted altitudes in degrees, scx/mcx azimuths
 * in 0..360 degrees, srd/mrd apparent radii in degrees × 100. */
export interface EclipseInstantCircumstances {
  utcTimestamp: number;
  scx: number;
  scy: number;
  srd: number;
  mcx: number;
  mcy: number;
  mrd: number;
  /** Geometric (unrefracted) sun-center altitude in degrees. */
  sunAltDeg: number;
  isSunVisible: boolean;
}

export interface EclipseCalculationData {
  lat: number;
  lng: number;
  elevation: number;
  eventType: EclipseEventType;
  umbralDurationInSeconds: number;
  penumbralDurationInSeconds: number;
  c1: EclipseCalculationContact;
  c2: EclipseCalculationContact;
  c3: EclipseCalculationContact;
  c4: EclipseCalculationContact;
  cMid: EclipseCalculationContact;
  sunset: EclipseCalculationContact;
  sunrise: EclipseCalculationContact;
  shadowOutlineLowAccuracy: (
    t?: number,
    options?: ShadowOutlineOptions,
  ) => number[][] | undefined;
  shadowOutlinePenumbralLowAccuracy: (
    t?: number,
    options?: ShadowOutlineOptions,
  ) => number[][] | undefined;
  eclipseObscuration: number;
  eclipseMagnitude: number;
  isSunBelowHorizonForAnyPartOfEvent: boolean;
  isEventAboveHorizonForMaxEclipse: boolean;
  isSunAboveHorizonForEntireTotalEvent: boolean;
  /** Sun/moon projection circumstances at an arbitrary UTC timestamp (same
   * fields/units as the contacts). The contact events sample these at ≤7
   * points; this evaluates the same pipeline at any instant, for dense
   * ephemeris tracks that stay horizon-accurate between contacts. */
  circumstancesAt: (utcTimestamp: number) => EclipseInstantCircumstances;
}

export interface ShadowOutlineOptions {
  includeSubHorizon?: boolean;
  shadowDegreesStepSize?: number;
}

export const createEclipseCalculator = (elements): EclipseCalculator => {
  //
  // Observer constants -
  // (0) North Latitude (radians)
  // (1) West Longitude (radians)
  // (2) Altitude (meters)
  // (3) West time zone (hours)
  // (4) rho sin O'
  // (5) rho cos O'
  // (6) index into the elements array for the eclipse in question
  //
  // Note that correcting for refraction will involve creating a "virtual" altitude
  // for each contact, and hence a different value of rho and O' for each contact!
  //
  const obsvconst: number[] = [];

  //
  // Eclipse circumstances
  //  (0) Event type (C1=-2, C2=-1, Mid=0, C3=1, C4=2)
  //  (1) t
  // -- time-only dependent circumstances (and their per-hour derivatives) follow --
  //  (2) x
  //  (3) y
  //  (4) d
  //  (5) sin d
  //  (6) cos d
  //  (7) mu
  //  (8) l1
  //  (9) l2
  // (10) dx
  // (11) dy
  // (12) dd
  // (13) dmu
  // (14) dl1
  // (15) dl2
  // -- time and location dependent circumstances follow --
  // (16) h
  // (17) sin h
  // (18) cos h
  // (19) xi
  // (20) eta
  // (21) zeta
  // (22) dxi
  // (23) deta
  // (24) u
  // (25) v
  // (26) a
  // (27) b
  // (28) l1'
  // (29) l2'
  // (30) n^2
  // -- observational circumstances follow --
  // (31) p position angle measured from the north point of the Sun
  // (32) alt
  // (33) q parallactic angle
  // (34) v position angle measured from the zenith point of the solar limb towards the west (Z/V)
  // (35) azi
  // (36) m (maximum eclipse and c1/c4 when available) or limb correction at c2/c3 (where available!)
  // (37) magnitude (maximum eclipse and c1/c4 when available)
  // (38) Moon/Sun ratio (maximum eclipse only)
  // (39) calculated local event type for a transparent earth (0 = none, 1 = partial, 2 = annular, 3 = total)
  // (40) event visibility (0 = above horizon, 1 = below horizon, 2 = sunrise, 3 = sunset, 4 = below horizon, disregard)
  // (41) Moon altitude (diagram)
  // (42) Moon azimuth (diagram)
  // (43) Sun radius in degrees
  // (44) Moon radius in degrees
  // (45) Sun altitude (diagram)
  // (46) Sun azimuth (diagram)
  // (47) Moon distance in earth radii
  // (48) Moon libration in longitude in degrees
  // (49) Moon libration in latitude in degrees
  // (50) Moon north pole axis in degrees
  // (51) Sun north pole axis in degrees
  //
  let lambdak1k2 = 1.00076024401; // = k1/k2 with k1 = 0.2724880 and k2 = 0.2722810 or 1.00076026356 with 0.272481 and 0.272274
  //var lambdak1k2 = 1.00083222847; // = k1/k2 with k1 = 0.2725076 and k2 = 0.2722810 (IAU 1982)
  let f1, f2;

  const c1: number[] = [];
  const c2: number[] = [];
  const mid: number[] = [];
  const c3: number[] = [];
  const c4: number[] = [];
  const sunrise = [];
  const sunset = [];

  const c1_alt = [];
  const c1_azi = [];
  const c1_rad = [];
  const c2_alt = [];
  const c2_azi = [];
  const c2_rad = [];
  const mid_alt = [];
  const mid_azi = [];
  const mid_rad = [];
  const c3_alt = [];
  const c3_azi = [];
  const c3_rad = [];
  const c4_alt = [];
  const c4_azi = [];
  const c4_rad = [];
  const V = [];
  const PV = [];
  const sunrise_alt = [];
  const sunrise_azi = [];
  const sunrise_rad = [];
  const sunset_alt = [];
  const sunset_azi = [];
  const sunset_rad = [];

  const gMoonData = {};
  let gVSOP = 1;
  let gMes = 0;

  let gShadowOutlineCoords = [];

  const D2R = Math.PI / 180.0;
  const R2D = 180.0 / Math.PI;
  const gRefractionHeight = -0.01454; // Take standard atmospheric refraction into account

  const kMINOR_MAJOR_RADIUS_RATIO = 0.99664718933525;
  const kLATITUDE_FLATTENING = 1.00336408982098;
  const kSIDEREAL2SOLARTIME = 0.004178074622295;
  // const kSHADOW_DEGREES_STEPSIZE = 0.25;
  const kSHADOW_DEGREES_STEPSIZE = 1.0;
  const kEARTH_EQUATORIAL_RADIUS = 6378137.0;
  const kEARTH_POLAR_RADIUS = 6356752.314245;
  const kELLIPTICITY_SQUARRED = 0.00669437999014;
  const kEARTH_INV_FLATTENING = 0.00335281066475;
  const kEARTH_INV_F_SQUARRED = 1.00673949674228;
  const kEARTH_INV_F_SQ = 0.00673949674228;
  const kSUN_RADIUS_DEG = 0.26667; // Mean apparent solar radius (in degrees)
  const kSHADOW_ALTITUDE_LIMIT = 0.0;
  const kEPSILON_OUTLINE = 1.0e-8;
  const kITERATION_OUTLINE = 10; // Maximum number of iterations for the shadow outline
  const kM_PI_d2 = Math.PI / 2.0;
  const kM_PI_x2 = Math.PI * 2.0;

  function elevationRefraction(elv_geometric) {
    var refraction;
    if (elv_geometric > 10.2)
      refraction =
        (0.01617 * Math.cos(elv_geometric * D2R)) /
        Math.sin(elv_geometric * D2R);
    else {
      var a0 = 0.58804392;
      var a1 = -0.17941557;
      var a2 = 0.29906946e-1;
      var a3 = -0.251874e-2;
      var a4 = 0.82622101e-4;
      var x = Math.abs(elv_geometric + 0.589);
      var x2 = x * x;
      var x3 = x * x2;
      var x4 = x2 * x2;
      refraction = Math.abs(a0 + a1 * x + a2 * x2 + a3 * x3 + a4 * x4);
    }
    var elv_observed = elv_geometric + refraction;

    return elv_observed;
  }

  //
  // Read the data, and populate the obsvconst array
  function readdata(lat, lon, elv) {
    // Get the latitude
    obsvconst[0] = lat * D2R;

    // Get the longitude
    obsvconst[1] = -lon * D2R;

    let Elv = 0.0;
    var TZ = 0.0;

    if (elv == -1.0 || elv == 0.0) {
    } else {
      Elv = elv + 0.0;
    }

    // Get the altitude (sea level by default)
    obsvconst[2] = Elv;

    // Get the time zone (UT by default)
    if (TZ >= -12.0 && TZ <= 14.0) {
      obsvconst[3] = -TZ;
    }
    // Negative east, positive west
    else {
      obsvconst[3] = 0.0;
    }

    // Get the observer's geocentric position
    const tmp = Math.atan(0.996647189335 * Math.tan(obsvconst[0]));
    obsvconst[4] =
      0.996647189335 * Math.sin(tmp) +
      (obsvconst[2] * Math.sin(obsvconst[0])) / 6378137.0;
    obsvconst[5] =
      Math.cos(tmp) + (obsvconst[2] * Math.cos(obsvconst[0])) / 6378137.0;
  }

  //
  // Populate the c1, c2, mid, c3 and c4 arrays
  function populateContactPoints() {
    f1 = Math.atan(elements[26]);
    f2 = Math.atan(elements[27]);

    getmid();
    observational(mid);
    PV[2] = getpv(mid);
    // m, magnitude and Moon/Sun ratio
    mid[36] = Math.sqrt(mid[24] * mid[24] + mid[25] * mid[25]);
    mid[37] = (mid[28] - mid[36]) / (mid[28] + mid[29]);
    mid[38] = (mid[28] - mid[29]) / (mid[28] + mid[29]);
    if (mid[37] > 0.0) {
      getc1c4();
      if (mid[36] < mid[29] || mid[36] < -mid[29]) {
        getc2c3();
        if (mid[29] < 0.0) mid[39] = 3;
        // Total solar eclipse
        else mid[39] = 2; // Annular solar eclipse
        observational(c2);
        V[0] = rev(360.0 - c2[34] * R2D);
        PV[1] = getpv(c2);
        observational(c3);
        V[1] = rev(360.0 - c3[34] * R2D);
        PV[3] = getpv(c3);
        c2[36] = 999.9;
        c3[36] = 999.9;

        var VSOP = 1;
        var Mes = 0;
        gMes = Mes;
        gVSOP = VSOP;
        if (gVSOP == 0) lambdak1k2 = 1.00083222847;
        // = k1/k2 with k1 = 0.2725076 and k2 = 0.2722810 (IAU 1982)
        else lambdak1k2 = 1.00076024401; // = k1/k2 with k1 = 0.2724880 and k2 = 0.2722810 or 1.00076026356 with 0.272481 and 0.272274
      } else mid[39] = 1; // Partial eclipse
      observational(c1);
      PV[0] = getpv(c1);
      observational(c4);
      PV[4] = getpv(c4);
    } else mid[39] = 0; // No eclipse

    c1_alt[0] = c1[45] * R2D; // Sun
    c1_azi[0] = c1[46] * R2D;
    if (c1_azi[0] < 0.0) c1_azi[0] += 360.0;
    else if (c1_azi[0] >= 360.0) c1_azi[0] -= 360.0;
    c1_rad[0] = c1[43] * 100;
    c2_alt[0] = c2[45] * R2D;
    c2_azi[0] = c2[46] * R2D;
    if (c2_azi[0] < 0.0) c2_azi[0] += 360.0;
    else if (c2_azi[0] >= 360.0) c2_azi[0] -= 360.0;
    c2_rad[0] = c2[43] * 100;
    mid_alt[0] = mid[45] * R2D;
    mid_azi[0] = mid[46] * R2D;
    if (mid_azi[0] < 0.0) mid_azi[0] += 360.0;
    else if (mid_azi[0] >= 360.0) mid_azi[0] -= 360.0;
    mid_rad[0] = mid[43] * 100;
    c3_alt[0] = c3[45] * R2D;
    c3_azi[0] = c3[46] * R2D;
    if (c3_azi[0] < 0.0) c3_azi[0] += 360.0;
    else if (c3_azi[0] >= 360.0) c3_azi[0] -= 360.0;
    c3_rad[0] = c3[43] * 100;
    c4_alt[0] = c4[45] * R2D;
    c4_azi[0] = c4[46] * R2D;
    if (c4_azi[0] < 0.0) c4_azi[0] += 360.0;
    else if (c4_azi[0] >= 360.0) c4_azi[0] -= 360.0;
    c4_rad[0] = c4[43] * 100;

    c1_alt[1] = c1[41] * R2D; // Moon
    c1_azi[1] = c1[42] * R2D;
    if (c1_azi[1] < 0.0) c1_azi[1] += 360.0;
    else if (c1_azi[1] >= 360.0) c1_azi[1] -= 360.0;
    c1_rad[1] = c1[44] * 100;
    c2_alt[1] = c2[41] * R2D;
    c2_azi[1] = c2[42] * R2D;
    if (c2_azi[1] < 0.0) c2_azi[1] += 360.0;
    else if (c2_azi[1] >= 360.0) c2_azi[1] -= 360.0;
    c2_rad[1] = c2[44] * 100;
    mid_alt[1] = mid[41] * R2D;
    mid_azi[1] = mid[42] * R2D;
    if (mid_azi[1] < 0.0) mid_azi[1] += 360.0;
    else if (mid_azi[1] >= 360.0) mid_azi[1] -= 360.0;
    mid_rad[1] = mid[44] * 100;
    c3_alt[1] = c3[41] * R2D;
    c3_azi[1] = c3[42] * R2D;
    if (c3_azi[1] < 0.0) c3_azi[1] += 360.0;
    else if (c3_azi[1] >= 360.0) c3_azi[1] -= 360.0;
    c3_rad[1] = c3[44] * 100;
    c4_alt[1] = c4[41] * R2D;
    c4_azi[1] = c4[42] * R2D;
    if (c4_azi[1] < 0.0) c4_azi[1] += 360.0;
    else if (c4_azi[1] >= 360.0) c4_azi[1] -= 360.0;
    c4_rad[1] = c4[44] * 100;
  }

  //
  // Calculate maximum eclipse
  function getmid() {
    mid[0] = 0;
    mid[1] = 0.0;
    var iter = 0;
    var tmp = 1.0;
    timelocdependent(mid);
    while ((tmp > 0.000001 || tmp < -0.000001) && iter < 50) {
      tmp = (mid[24] * mid[26] + mid[25] * mid[27]) / mid[30];
      mid[1] -= tmp;
      timelocdependent(mid);
      iter++;
    }
  }

  //
  // Populate the circumstances array with the time and location dependent circumstances
  function timelocdependent(circumstances) {
    timedependent(circumstances);
    // h, sin h, cos h
    circumstances[16] =
      circumstances[7] - obsvconst[1] - elements[5] / 13713.440924999626077;
    circumstances[17] = Math.sin(circumstances[16]);
    circumstances[18] = Math.cos(circumstances[16]);
    // xi
    circumstances[19] = obsvconst[5] * circumstances[17];
    // eta
    circumstances[20] =
      obsvconst[4] * circumstances[6] -
      obsvconst[5] * circumstances[18] * circumstances[5];
    // zeta
    circumstances[21] =
      obsvconst[4] * circumstances[5] +
      obsvconst[5] * circumstances[18] * circumstances[6];
    // dxi
    circumstances[22] = circumstances[13] * obsvconst[5] * circumstances[18];
    // deta
    circumstances[23] =
      circumstances[13] * circumstances[19] * circumstances[5] -
      circumstances[21] * circumstances[12];
    // u
    circumstances[24] = circumstances[2] - circumstances[19];
    // v
    circumstances[25] = circumstances[3] - circumstances[20];
    // a
    circumstances[26] = circumstances[10] - circumstances[22];
    // b
    circumstances[27] = circumstances[11] - circumstances[23];
    var type = circumstances[0];
    // l1'
    if (type == -2 || type == 0 || type == 2)
      circumstances[28] = circumstances[8] - circumstances[21] * elements[26];
    // l2'
    if (type == -1 || type == 0 || type == 1)
      circumstances[29] = circumstances[9] - circumstances[21] * elements[27];
    // n^2
    circumstances[30] =
      circumstances[26] * circumstances[26] +
      circumstances[27] * circumstances[27];

    return circumstances;
  }

  //
  // Populate the circumstances array with the time-only dependent circumstances (x, y, d, m, ...)
  function timedependent(circumstances) {
    var t = circumstances[1];
    // x
    var ans = elements[9] * t + elements[8];
    ans = ans * t + elements[7];
    ans = ans * t + elements[6];
    circumstances[2] = ans;
    // dx
    ans = 3.0 * elements[9] * t + 2.0 * elements[8];
    ans = ans * t + elements[7];
    circumstances[10] = ans;
    // y
    ans = elements[13] * t + elements[12];
    ans = ans * t + elements[11];
    ans = ans * t + elements[10];
    circumstances[3] = ans;
    // dy
    ans = 3.0 * elements[13] * t + 2.0 * elements[12];
    ans = ans * t + elements[11];
    circumstances[11] = ans;
    // d
    ans = elements[16] * t + elements[15];
    ans = ans * t + elements[14];
    ans *= D2R;
    circumstances[4] = ans;
    // sin d and cos d
    circumstances[5] = Math.sin(ans);
    circumstances[6] = Math.cos(ans);
    // dd
    ans = 2.0 * elements[16] * t + elements[15];
    ans *= D2R;
    circumstances[12] = ans;
    // m
    ans = elements[19] * t + elements[18];
    ans = ans * t + elements[17];
    if (ans >= 360.0) ans -= 360.0;
    ans *= D2R;
    circumstances[7] = ans;
    // dm
    ans = 2.0 * elements[19] * t + elements[18];
    ans *= D2R;
    circumstances[13] = ans;
    // l1 and dl1
    ans = elements[22] * t + elements[21];
    ans = ans * t + elements[20];
    circumstances[8] = ans;
    var type = circumstances[0];
    if (type == -2 || type == 0 || type == 2)
      circumstances[14] = 2.0 * elements[22] * t + elements[21];
    // l2 and dl2
    ans = elements[25] * t + elements[24];
    ans = ans * t + elements[23];
    circumstances[9] = ans;
    if (type == -1 || type == 0 || type == 1)
      circumstances[15] = 2.0 * elements[25] * t + elements[24];

    return circumstances;
  }

  //
  // Get the observational circumstances
  function observational(circumstances) {
    var contacttype;

    // We are looking at an "external" contact UNLESS this is a total solar eclipse AND we are looking at
    // c2 or c3, in which case it is an INTERNAL contact! Note that if we are looking at maximum eclipse,
    // then we may not have determined the type of eclipse (mid[39]) just yet!
    if (circumstances[0] == 0) contacttype = 1.0;
    else {
      if (mid[39] == 3 && (circumstances[0] == -1 || circumstances[0] == 1))
        contacttype = -1.0;
      else contacttype = 1.0;
    }
    // p
    circumstances[31] = Math.atan2(
      contacttype * circumstances[24],
      contacttype * circumstances[25],
    );
    // alt
    var sinlat = Math.sin(obsvconst[0]);
    var coslat = Math.cos(obsvconst[0]);
    circumstances[32] = Math.asin(
      circumstances[5] * sinlat + circumstances[6] * coslat * circumstances[18],
    );
    // q
    circumstances[33] = Math.asin(
      (coslat * circumstances[17]) / Math.cos(circumstances[32]),
    );
    if (circumstances[20] < 0.0)
      circumstances[33] = Math.PI - circumstances[33];
    // v
    circumstances[34] = circumstances[31] - circumstances[33];
    // azi
    circumstances[35] = Math.atan2(
      -circumstances[17] * circumstances[6],
      circumstances[5] * coslat - circumstances[18] * sinlat * circumstances[6],
    );

    // Visibility (take Sun radius and/or refraction into account)
    if (circumstances[32] > gRefractionHeight) circumstances[40] = 0;
    else circumstances[40] = 1;

    var xi = circumstances[19];
    var eta = circumstances[20];
    var zeta = circumstances[21];
    // Sun distance in unit of the earth equatorial radius
    var zs = circumstances[8] * Math.cos(f1) - circumstances[9] * Math.cos(f2);
    zs /= Math.sin(f1) - Math.sin(f2);
    // Moon distance in unit of the earth equatorial radius
    var zm =
      circumstances[8] * Math.cos(f1) +
      lambdak1k2 * circumstances[9] * Math.cos(f2);
    zm /= Math.sin(f1) + lambdak1k2 * Math.sin(f2);
    var u = circumstances[2] - xi;
    var v = circumstances[3] - eta;
    zs -= zeta;
    zm -= zeta;
    var tmp = Math.sqrt(u * u + v * v + zs * zs);
    var sdec = v * circumstances[6] + zs * circumstances[5];
    sdec = Math.asin(sdec / tmp);
    tmp = Math.sqrt(u * u + v * v + zm * zm);
    var mdec = v * circumstances[6] + zm * circumstances[5];
    mdec = Math.asin(mdec / tmp);
    var deltamus = Math.atan(
      u / (v * circumstances[5] - zs * circumstances[6]),
    );
    var deltamum = Math.atan(
      u / (v * circumstances[5] - zm * circumstances[6]),
    );
    var sha = circumstances[7] + deltamus;
    var mha = circumstances[7] + deltamum;

    // Local hour angle
    sha -= obsvconst[1] + elements[5] / 13713.440924999626077;
    mha -= obsvconst[1] + elements[5] / 13713.440924999626077;

    var sinsdec = Math.sin(sdec);
    var cossdec = Math.cos(sdec);
    var sinsha = Math.sin(sha);
    var cossha = Math.cos(sha);
    // Sun altitude
    circumstances[45] = Math.asin(sinsdec * sinlat + cossdec * cossha * coslat);
    // Sun azimuth
    circumstances[46] = Math.atan2(
      -cossdec * sinsha,
      sinsdec * coslat - cossdec * cossha * sinlat,
    );
    var sinmdec = Math.sin(mdec);
    var cosmdec = Math.cos(mdec);
    var sinmha = Math.sin(mha);
    var cosmha = Math.cos(mha);
    // Moon altitude
    circumstances[41] = Math.asin(sinmdec * sinlat + cosmdec * cosmha * coslat);
    // Moon azimuth
    circumstances[42] = Math.atan2(
      -cosmdec * sinmha,
      sinmdec * coslat - cosmdec * cosmha * sinlat,
    );

    // Sun apparent radius
    tmp =
      circumstances[8] * Math.cos(f1) * Math.sin(f2) -
      circumstances[9] * Math.sin(f1) * Math.cos(f2);
    var R = tmp / (Math.sin(f1) - Math.sin(f2));
    var rs = Math.asin(R / Math.sqrt(u * u + v * v + zs * zs)); // Topocentric
    circumstances[43] = rs * R2D;
    // Moon apparent radius
    var k = tmp / (Math.sin(f1) / lambdak1k2 + Math.sin(f2));
    var rm = Math.asin(k / Math.sqrt(u * u + v * v + zm * zm)); // Topocentric
    circumstances[44] = rm * R2D;
    // Moon distance in earth radii
    circumstances[47] = zm;

    // Moon's libration
    if (circumstances[0] == 0) {
      var jd = getjd(circumstances);
      var jd2000 = jd - 2451545.0;
      var st = jd2000 / 36525.0;
      var st2 = st * st;
      var st3 = st2 * st;
      var st4 = st2 * st2;

      // Meeus AA page 144
      var D =
        rev(297.85036 + 445267.11148 * st - 0.0019142 * st2 + st3 / 189474.0) *
        D2R;
      var M =
        rev(357.52772 + 35999.05034 * st - 0.0001603 * st2 - st3 / 300000.0) *
        D2R;
      var M1 =
        rev(134.96298 + 477198.867398 * st + 0.0086972 * st2 + st3 / 56250.0) *
        D2R;
      var DF =
        rev(93.27191 + 483202.017538 * st - 0.0036825 * st2 + st3 / 327270.0) *
        D2R;
      var OM =
        rev(125.04452 - 1934.136261 * st + 0.0020708 * st2 + st3 / 450000.0) *
        D2R;

      // Nutation in longitude
      var DeltaPsi = -(171996 + 174.2 * st) * Math.sin(OM);
      DeltaPsi -= (13187 + 1.6 * st) * Math.sin(-2 * D + 2 * DF + 2 * OM);
      DeltaPsi -= (2274 + 0.2 * st) * Math.sin(2 * DF + 2 * OM);
      DeltaPsi += (2062 + 0.2 * st) * Math.sin(2 * OM);
      DeltaPsi += (1426 - 3.4 * st) * Math.sin(M);
      DeltaPsi += (712 + 0.1 * st) * Math.sin(M1);
      DeltaPsi += (-517 + 1.2 * st) * Math.sin(-2 * D + M + 2 * DF + 2 * OM);
      DeltaPsi -= (386 + 0.4 * st) * Math.sin(2 * DF + OM);
      DeltaPsi -= 301 * Math.sin(M1 + 2 * DF + 2 * OM);
      DeltaPsi += (217 - 0.5 * st) * Math.sin(-2 * D - M + 2 * DF + 2 * OM);
      DeltaPsi -= 158 * Math.sin(-2 * D + M1);
      DeltaPsi += (129 + 0.1 * st) * Math.sin(-2 * D + 2 * DF + OM);
      DeltaPsi += 123 * Math.sin(-M1 + 2 * DF + 2 * OM);
      DeltaPsi += 63 * Math.sin(2 * D);
      DeltaPsi += (63 + 0.1 * st) * Math.sin(M1 + OM);
      DeltaPsi -= 59 * Math.sin(2 * D - M1 + 2 * DF + 2 * OM);
      DeltaPsi -= (58 + 0.1 * st) * Math.sin(-M1 + OM);
      DeltaPsi -= 51 * Math.sin(M1 + 2 * DF + OM);
      DeltaPsi += 48 * Math.sin(-2 * D + 2 * M1);
      DeltaPsi += 46 * Math.sin(-2 * M1 + 2 * DF + OM);
      DeltaPsi -= 38 * Math.sin(2 * D + 2 * DF + 2 * OM);
      DeltaPsi -= 31 * Math.sin(2 * M1 + 2 * DF + 2 * OM);
      DeltaPsi += 29 * Math.sin(2 * M1);
      DeltaPsi += 29 * Math.sin(-2 * D + M1 + 2 * DF + 2 * OM);
      DeltaPsi += 26 * Math.sin(2 * DF);
      DeltaPsi -= 22 * Math.sin(2 * DF - 2 * D);
      DeltaPsi += 21 * Math.sin(2 * DF - M1);
      DeltaPsi += (17 - 0.1 * st) * Math.sin(2 * M);
      DeltaPsi += 16 * Math.sin(2 * D - M1 + OM);
      DeltaPsi -= (16 - 0.1 * st) * Math.sin(2 * (OM + DF + M - D));
      DeltaPsi -= 15 * Math.sin(M + OM);
      DeltaPsi -= 13 * Math.sin(OM + M1 - 2 * D);
      DeltaPsi -= 12 * Math.sin(OM - M);
      DeltaPsi += 11 * Math.sin(2 * (M1 - DF));
      DeltaPsi -= 10 * Math.sin(2 * D - M1 + 2 * DF);
      DeltaPsi -= 8 * Math.sin(2 * D + M1 + 2 * DF + 2 * OM);
      DeltaPsi += 7 * Math.sin(M + 2 * DF + 2 * OM);
      DeltaPsi -= 7 * Math.sin(M + M1 - 2 * D);
      DeltaPsi -= 7 * Math.sin(2 * DF + 2 * OM - M);
      DeltaPsi -= 7 * Math.sin(2 * D + 2 * DF + OM);
      DeltaPsi += 6 * Math.sin(2 * D + M1);
      DeltaPsi += 6 * Math.sin(2 * (OM + DF + M1 - D));
      DeltaPsi += 6 * Math.sin(OM + 2 * DF + M1 - 2 * D);
      DeltaPsi -= 6 * Math.sin(2 * D - 2 * M1 + OM);
      DeltaPsi -= 6 * Math.sin(2 * D + OM);
      DeltaPsi += 5 * Math.sin(M1 - M);
      DeltaPsi -= 5 * Math.sin(OM + 2 * DF - M - 2 * D);
      DeltaPsi -= 5 * Math.sin(OM - 2 * D);
      DeltaPsi -= 5 * Math.sin(OM + 2 * DF + 2 * M1);
      DeltaPsi += 4 * Math.sin(OM - 2 * M1 - 2 * D);
      DeltaPsi += 4 * Math.sin(OM + 2 * DF + M - 2 * D);
      DeltaPsi += 4 * Math.sin(M1 - 2 * DF);
      DeltaPsi -= 4 * Math.sin(M1 - D);
      DeltaPsi -= 4 * Math.sin(M - 2 * D);
      DeltaPsi -= 4 * Math.sin(D);
      DeltaPsi += 3 * Math.sin(2 * DF + M1);
      DeltaPsi -= 3 * Math.sin(2 * (OM + DF - M1));
      DeltaPsi -= 3 * Math.sin(M1 - M - D);
      DeltaPsi -= 3 * Math.sin(M1 + M);
      DeltaPsi -= 3 * Math.sin(2 * OM + 2 * DF + M1 - M);
      DeltaPsi -= 3 * Math.sin(2 * OM + 2 * DF - M1 - M + 2 * D);
      DeltaPsi -= 3 * Math.sin(2 * OM + 2 * DF + 3 * M1);
      DeltaPsi -= 3 * Math.sin(2 * OM + 2 * DF - M + 2 * D);
      DeltaPsi *= 0.0001 / 3600.0;

      // Nutation in obliquity
      var DeltaEpsilon = (92025 + 8.9 * st) * Math.cos(OM);
      DeltaEpsilon += (5736 - 3.1 * st) * Math.cos(-2 * D + 2 * DF + 2 * OM);
      DeltaEpsilon += (977 - 0.5 * st) * Math.cos(2 * DF + 2 * OM);
      DeltaEpsilon += (-895 + 0.5 * st) * Math.cos(2 * OM);
      DeltaEpsilon += (54 - 0.1 * st) * Math.cos(M);
      DeltaEpsilon -= 7 * Math.cos(M1);
      DeltaEpsilon += (224 - 0.6 * st) * Math.cos(-2 * D + M + 2 * DF + 2 * OM);
      DeltaEpsilon += 200 * Math.cos(2 * DF + OM);
      DeltaEpsilon += (129 - 0.1 * st) * Math.cos(M1 + 2 * DF + 2 * OM);
      DeltaEpsilon += (-95 + 0.3 * st) * Math.cos(-2 * D - M + 2 * DF + 2 * OM);
      DeltaEpsilon -= 70 * Math.cos(-2 * D + 2 * DF + OM);
      DeltaEpsilon -= 53 * Math.cos(-M1 + 2 * DF + 2 * OM);
      DeltaEpsilon -= 33 * Math.cos(M1 + OM);
      DeltaEpsilon += 26 * Math.cos(2 * D - M1 + 2 * DF + 2 * OM);
      DeltaEpsilon += 32 * Math.cos(-M1 + OM);
      DeltaEpsilon += 27 * Math.cos(M1 + 2 * DF + OM);
      DeltaEpsilon -= 24 * Math.cos(-2 * M1 + 2 * DF + OM);
      DeltaEpsilon += 16 * Math.cos(2 * (D + DF + OM));
      DeltaEpsilon += 13 * Math.cos(2 * (M1 + DF + OM));
      DeltaEpsilon -= 12 * Math.cos(2 * OM + 2 * DF + M1 - 2 * D);
      DeltaEpsilon -= 10 * Math.cos(OM + 2 * DF - M1);
      DeltaEpsilon -= 8 * Math.cos(2 * D - M1 + OM);
      DeltaEpsilon += 7 * Math.cos(2 * (OM + DF + M - D));
      DeltaEpsilon += 9 * Math.cos(M + OM);
      DeltaEpsilon += 7 * Math.cos(OM + M1 - 2 * D);
      DeltaEpsilon += 6 * Math.cos(OM - M);
      DeltaEpsilon += 5 * Math.cos(OM + 2 * DF - M1 + 2 * D);
      DeltaEpsilon += 3 * Math.cos(2 * OM + 2 * DF + M1 + 2 * D);
      DeltaEpsilon -= 3 * Math.cos(2 * OM + 2 * DF + M);
      DeltaEpsilon += 3 * Math.cos(2 * OM + 2 * DF - M);
      DeltaEpsilon += 3 * Math.cos(OM + 2 * DF + 2 * D);
      DeltaEpsilon -= 3 * Math.cos(2 * (OM + DF + M1 - D));
      DeltaEpsilon -= 3 * Math.cos(OM + 2 * DF + M1 - 2 * D);
      DeltaEpsilon += 3 * Math.cos(OM - 2 * M1 + 2 * D);
      DeltaEpsilon += 3 * Math.cos(OM + 2 * D);
      DeltaEpsilon += 3 * Math.cos(OM + 2 * DF - M - 2 * D);
      DeltaEpsilon += 3 * Math.cos(OM - 2 * D);
      DeltaEpsilon += 3 * Math.cos(OM + 2 * DF + 2 * M1);
      DeltaEpsilon *= 0.0001 / 3600.0;

      var epsilon0 = (21.448 / 60.0 + 26.0) / 60.0 + 23.0;
      var u = st / 100.0;
      var laskar =
        (u *
          (-4680.93 +
            u *
              (-1.55 +
                u *
                  (1999.25 +
                    u *
                      (-51.38 +
                        u *
                          (-249.67 +
                            u *
                              (-39.05 +
                                u *
                                  (7.12 +
                                    u *
                                      (27.87 + u * (5.79 + u * 2.45)))))))))) /
        3600.0;
      epsilon0 += laskar;
      var epsilon = epsilon0 + DeltaEpsilon;

      // Apparent sidereal time (Meeus AA page 88)
      var siderealTime =
        280.46061837 +
        360.98564736629 * jd2000 +
        0.000387933 * st2 -
        st3 / 38710000.0;
      siderealTime += DeltaPsi * Math.cos(epsilon * D2R);
      siderealTime = rev(siderealTime);
      var localSiderealTime = siderealTime - obsvconst[1] * R2D;
      localSiderealTime = rev(localSiderealTime);
      //    var salpha = localSiderealTime - (sha * R2D);
      //    salpha = rev(salpha);
      var malpha = localSiderealTime - mha * R2D;
      malpha = rev(malpha);

      gMoonData.topoRA = malpha * D2R;
      gMoonData.topoDec = mdec;
      equatorial2ecliptical(gMoonData, epsilon * D2R);

      // Longitude of the mean ascending node (AA 47.7)
      var omega =
        rev(
          125.0445479 -
            1934.1362891 * st +
            0.0020754 * st2 +
            st3 / 467441 -
            st4 / 60616000,
        ) * D2R;

      // Sun's mean anomaly (AA 47.3)
      M =
        rev(
          357.5291092 + 35999.0502909 * st - 0.0001536 * st2 + st3 / 24490000,
        ) * D2R;

      // Moon's mean anomaly (AA 47.4)
      M1 =
        rev(
          134.9633964 +
            477198.8675055 * st -
            0.0087414 * st2 +
            st3 / 69699 -
            st4 / 14712000,
        ) * D2R;

      // Moon's argument of latitude (mean distance from ascending node) (AA 47.5)
      var F =
        rev(
          93.272095 +
            483202.0175233 * st -
            0.0036539 * st2 -
            st3 / 3526000 +
            st4 / 863310000,
        ) * D2R;

      // Mean elongation of the Moon from the Sun (AA 47.2)
      D =
        rev(
          297.8501921 +
            445267.1114034 * st -
            0.0018819 * st2 +
            st3 / 545868 -
            st4 / 113065000,
        ) * D2R;

      // Earth's eccentricity (AA 47.6)
      var E = 1.0 - 0.002516 * st - 0.0000074 * st2;

      // Libration
      var K1 = rev(119.75 + 131.849 * st) * D2R;
      var K2 = rev(72.56 + 20.186 * st) * D2R;

      var rho = -0.02752 * Math.cos(M1);
      rho -= 0.02245 * Math.sin(F);
      rho += 0.00684 * Math.cos(M1 - 2.0 * F);
      rho -= 0.00293 * Math.cos(2.0 * F);
      rho -= 0.00085 * Math.cos(2.0 * (F - D));
      rho -= 0.00054 * Math.cos(M1 - 2.0 * D);
      rho -= 0.0002 * Math.sin(M1 + F);
      rho -= 0.0002 * Math.cos(M1 + 2.0 * F);
      rho -= 0.0002 * Math.cos(M1 - F);
      rho += 0.00014 * Math.cos(M1 + 2.0 * (F - D));

      var sigma = -0.02816 * Math.sin(M1);
      sigma += 0.02244 * Math.cos(F);
      sigma -= 0.00682 * Math.sin(M1 - 2.0 * F);
      sigma -= 0.00279 * Math.sin(2.0 * F);
      sigma -= 0.00083 * Math.sin(2.0 * (F - D));
      sigma += 0.00069 * Math.sin(M1 - 2.0 * D);
      sigma += 0.0004 * Math.cos(M1 + F);
      sigma -= 0.00025 * Math.sin(2.0 * M1);
      sigma -= 0.00023 * Math.sin(M1 + 2.0 * F);
      sigma += 0.0002 * Math.cos(M1 - F);
      sigma += 0.00019 * Math.sin(M1 - F);
      sigma += 0.00013 * Math.sin(M1 + 2.0 * (F - D));
      sigma -= 0.0001 * Math.cos(M1 - 3.0 * F);

      var tau = 0.0252 * E * Math.sin(M);
      tau += 0.00473 * Math.sin(2.0 * (M1 - F));
      tau -= 0.00467 * Math.sin(M1);
      tau += 0.00396 * Math.sin(K1);
      tau += 0.00276 * Math.sin(2.0 * (M1 - D));
      tau += 0.00196 * Math.sin(omega);
      tau -= 0.00183 * Math.cos(M1 - F);
      tau += 0.00115 * Math.sin(M1 - 2.0 * D);
      tau -= 0.00096 * Math.sin(M1 - D);
      tau += 0.00046 * Math.sin(2.0 * (F - D));
      tau -= 0.00039 * Math.sin(M1 - F);
      tau -= 0.00032 * Math.sin(M1 - M - D);
      tau += 0.00027 * Math.sin(2.0 * (M1 - D) - M);
      tau += 0.00023 * Math.sin(K2);
      tau -= 0.00014 * Math.sin(2.0 * D);
      tau += 0.00014 * Math.cos(2.0 * (M1 - F));
      tau -= 0.00012 * Math.sin(M1 - 2.0 * F);
      tau -= 0.00012 * Math.sin(2.0 * M1);
      tau += 0.00011 * Math.sin(2.0 * (M1 - M - D));

      var I = 1.54242 * D2R;
      var W = gMoonData.lambda - DeltaPsi * D2R - omega;
      W = revrad(W);
      // Optical libration in longitude
      var A = Math.atan2(
        Math.sin(W) * Math.cos(gMoonData.beta) * Math.cos(I) -
          Math.sin(gMoonData.beta) * Math.sin(I),
        Math.cos(W) * Math.cos(gMoonData.beta),
      );
      A = revrad(A);
      var l = A - F;
      // Optical libration in latitude
      var b = Math.asin(
        -Math.sin(W) * Math.cos(gMoonData.beta) * Math.sin(I) -
          Math.sin(gMoonData.beta) * Math.cos(I),
      );
      // Physical libration in longitude
      var l2 = -tau + (rho * Math.cos(A) + sigma * Math.sin(A)) * Math.tan(b);
      // Physical libration in latitude
      var b2 = sigma * Math.cos(A) - rho * Math.sin(A);

      tmp = l * R2D + l2;
      if (tmp > 9.0) tmp -= 360.0;
      else if (tmp < -9.0) tmp += 360.0;
      mid[48] = tmp;
      mid[49] = b * R2D + b2;

      // Polar angle
      rho *= D2R;
      var V = omega + DeltaPsi * D2R + (sigma * D2R) / Math.sin(I);
      var X = Math.sin(I + rho) * Math.sin(V);
      var Y =
        Math.sin(I + rho) * Math.cos(V) * Math.cos(epsilon * D2R) -
        Math.cos(I + rho) * Math.sin(epsilon * D2R);
      W = Math.atan2(X, Y);
      W = revrad(W);
      var PA = revrad(
        Math.asin(
          (Math.sqrt(X * X + Y * Y) * Math.cos(malpha * D2R - W)) / Math.cos(b),
        ),
      );

      mid[50] = PA * R2D;

      mid[51] = getsn(jd); // Sun axis from celestial north
    } else {
      var jd = getjd(circumstances);
      circumstances[51] = getsn(jd); // Sun axis from celestial north
    }

    return circumstances;
  }

  //
  // Julian day from the beginning of the year -4712 at noon UT (valid only for positive Julian day)
  // (Meeus AA page 60)
  function getjd(circumstances) {
    var y, m, a, b;
    var numDate = new Object();

    getnumUTdate(circumstances, numDate);
    numDate.time = elements[1] + circumstances[1] - elements[5] / 3600.0;
    if (numDate.time < 0.0) numDate.time += 24.0;
    else if (numDate.time >= 24.0) numDate.time -= 24.0;

    var gregorian = true;
    if (numDate.year < 1582) gregorian = false;
    else if (numDate.year == 1582) {
      if (numDate.month < 10 || (numDate.month == 10 && numDate.day < 15))
        gregorian = false;
    }
    if (numDate.month > 2) {
      y = numDate.year;
      m = numDate.month;
    } else {
      y = numDate.year - 1;
      m = numDate.month + 12;
    }

    a = truncate(y / 100);
    if (gregorian) b = 2 - a + truncate(a / 4);
    else b = 0.0;
    var jd =
      truncate(365.25 * (y + 4716)) +
      truncate(30.6001 * (m + 1)) +
      numDate.day +
      b -
      1524.5;
    jd += numDate.time / 24.0;

    return jd;
  }

  //
  // Get the UT date of an event
  function getnumUTdate(circumstances, numDate) {
    var jd, t, a, b, c, d, e;

    // JD for noon (TDT) the day before the day that contains T0
    jd = Math.floor(elements[0] - elements[1] / 24.0);
    // Local time (ie the offset in hours since midnight TDT on the day containing T0) to the nearest 0.1 sec
    //  t = circumstances[1] + elements[1] - obsvconst[3] - ((elements[5] - 0.05) / 3600.0);
    // UT time (ie the offset in hours since midnight TDT on the day containing T0) to the nearest 0.1 sec
    t = circumstances[1] + elements[1] - (elements[5] - 0.05) / 3600.0;
    if (t < 0.0) jd--;
    else if (t >= 24.0) jd++;
    if (jd >= 2299160.5) {
      a = Math.floor((jd - 1867216.25) / 36524.25);
      a += jd + 1.0 - Math.floor(a / 4.0);
    } else a = jd;
    b = a + 1525.0;
    c = Math.floor((b - 122.1) / 365.25);
    d = Math.floor(365.25 * c);
    e = Math.floor((b - d) / 30.6001);
    d = b - d - Math.floor(30.6001 * e);
    if (e < 13.5) e -= 1;
    else e -= 13;
    if (e > 2.5) numDate.year = c - 4716;
    else numDate.year = c - 4715;
    numDate.month = e;
    numDate.day = d;
  }

  function truncate(x) {
    return x >= 0.0 ? Math.floor(x) : Math.ceil(x);
  }

  //
  // Return an angle between 0 and 360 degrees
  function rev(angle) {
    return angle - 360.0 * Math.floor(angle / 360.0);
  }

  function equatorial2ecliptical(obj, obliquity) {
    obj.lambda = Math.atan2(
      Math.sin(obj.topoRA) * Math.cos(obliquity) +
        Math.tan(obj.topoDec) * Math.sin(obliquity),
      Math.cos(obj.topoRA),
    );
    obj.lambda = revrad(obj.lambda);

    obj.beta = Math.asin(
      Math.sin(obj.topoDec) * Math.cos(obliquity) -
        Math.cos(obj.topoDec) * Math.sin(obliquity) * Math.sin(obj.topoRA),
    );
  }

  //
  // Return an angle between 0 and 2PI radians
  function revrad(angle) {
    return angle - Math.PI * 2.0 * Math.floor(angle / (Math.PI * 2.0));
  }

  //
  // Sun axis from celestial north
  function getsn(jd) {
    var t = (jd - 2396758.0) / 36525.0; // Number of centuries since 1850 (1849 December 31 at 12UT)
    var T = (jd - 2415020.0) / 36525.0; // Number of centuries since 1 Jan 1900 noon ET (1899 December 31 at 12UT)
    var kks = 73.666667 + 1.3958333 * t; // Longitude of the ascending node of the solar equator on the ecliptic
    var kkm = 259.183275 - (1934.142008 - 0.002078 * T) * T; // Longitude of the ascending node of the Moon orbit
    var G =
      0.0000739 * Math.sin((31.8 + 119.0 * T) * D2R) +
      0.0017778 * Math.sin((231.19 + 20.2 * T) * D2R) +
      0.00052 * Math.sin((57.24 + 150.27 * T) * D2R); // Long term corrections on the solar longitude
    var L = 279.696678 + (36000.768925 + 0.0003025 * T) * T + G; // Mean longitude of the Sun
    var M = 358.475833 + (35999.04975 - 0.00015 * T) * T + G; // Mean anomaly of the Sun
    var C =
      (1.9194603 - 0.0047889 * T - 0.0000144 * T * T) * Math.sin(M * D2R) +
      (0.0200939 - 0.0001003 * T) * Math.sin(2.0 * M * D2R) +
      0.0002925 * Math.sin(3.0 * M * D2R) +
      0.000005 * Math.sin(4.0 * M * D2R); // Equation of the center
    var v = M + C; // True anomaly
    var lambda = L + C - 0.0056933 * (1.0 + 0.01671 * Math.cos(v * D2R)); // Apparent longitude of the Sun (without nutation)
    var nutL =
      -0.00479 * Math.sin(kkm * D2R) - 0.00035 * Math.sin(2.0 * L * D2R); // Nutation in longitude
    var nutI =
      0.00256 * Math.cos(kkm * D2R) + 0.00015 * Math.cos(2.0 * L * D2R); // Nutation in obliquity
    var lambdaS = lambda + nutL; // Apparent longitude of the Sun with nutation
    var epsilon = 23.452294 - (0.0130125 + 0.0000016 * T) * T + nutI; // Obliquity of the ecliptic
    var i = 7.25 * D2R; // Inclination of the solar equator to the ecliptic
    var lambdamK = (lambda - kks) * D2R;
    var x = Math.atan(-Math.cos(lambdaS * D2R) * Math.tan(epsilon * D2R)) * R2D; // +/- 90 degrees
    var y = Math.atan(-Math.cos(lambdamK) * Math.tan(i)) * R2D; // +/- 90 degrees

    return rev(x + y); // Solar position angle
  }

  function getpv(circumstances) {
    var p = circumstances[31] * R2D;
    while (p < 0.0) p += 360.0;
    while (p >= 360.0) p -= 360.0;

    var v = 360 - circumstances[34] * R2D;
    while (v < 0.0) v += 360.0;
    while (v >= 360.0) v -= 360.0;

    var ans = p + v;
    while (ans < 0.0) ans += 360.0;
    while (ans >= 360.0) ans -= 360.0;

    return ans;
  }

  //
  // Get C1 and C4 data
  //   Entry conditions -
  //   1. The mid array must be populated
  //   2. The magnitude at maximum eclipse must be > 0.0
  function getc1c4() {
    var n = Math.sqrt(mid[30]);
    var tmp = mid[26] * mid[25] - mid[24] * mid[27];
    tmp = tmp / (n * mid[28]);
    if (Math.abs(tmp) <= 1.0) tmp = (Math.sqrt(1.0 - tmp * tmp) * mid[28]) / n;
    else tmp = 0.0;
    c1[0] = -2;
    c4[0] = 2;
    c1[1] = mid[1] - tmp;
    c4[1] = mid[1] + tmp;
    c1c4iterate(c1);
    c1c4iterate(c4);
  }

  //
  // Iterate on C1 or C4
  function c1c4iterate(circumstances) {
    var sign, n;

    timelocdependent(circumstances);
    if (circumstances[0] < 0) sign = -1.0;
    else sign = 1.0;
    var tau = 1.0;
    var iter = 0;
    while (Math.abs(tau) > 0.000001 && iter < 50) {
      n = Math.sqrt(circumstances[30]);
      tau =
        circumstances[26] * circumstances[25] -
        circumstances[24] * circumstances[27];
      tau /= n * circumstances[28];
      if (Math.abs(tau) <= 1.0)
        tau = (sign * Math.sqrt(1.0 - tau * tau) * circumstances[28]) / n;
      else tau = 0.0;
      tau =
        (circumstances[24] * circumstances[26] +
          circumstances[25] * circumstances[27]) /
          circumstances[30] -
        tau;
      circumstances[1] -= tau;
      timelocdependent(circumstances);
      iter++;
    }

    return circumstances;
  }

  //
  // Get C2 and C3 data
  //   Entry conditions -
  //   1. The mid array must be populated
  //   2. There must be either a total or annular eclipse at the location
  function getc2c3() {
    var n = Math.sqrt(mid[30]);
    var tmp = mid[26] * mid[25] - mid[24] * mid[27];
    tmp = tmp / (n * mid[29]);
    if (Math.abs(tmp) <= 1.0) tmp = (Math.sqrt(1.0 - tmp * tmp) * mid[29]) / n;
    else tmp = 0.0;
    c2[0] = -1;
    c3[0] = 1;
    if (mid[29] < 0.0) {
      c2[1] = mid[1] + tmp;
      c3[1] = mid[1] - tmp;
    } else {
      c2[1] = mid[1] - tmp;
      c3[1] = mid[1] + tmp;
    }
    c2c3iterate(c2);
    c2c3iterate(c3);
  }

  //
  // Iterate on C2 or C3
  function c2c3iterate(circumstances) {
    var sign, n;

    timelocdependent(circumstances);
    if (circumstances[0] < 0) sign = -1.0;
    else sign = 1.0;
    if (mid[29] < 0.0) sign = -sign;
    var tmp = 1.0;
    var iter = 0;
    while ((tmp > 0.000001 || tmp < -0.000001) && iter < 50) {
      n = Math.sqrt(circumstances[30]);
      tmp =
        circumstances[26] * circumstances[25] -
        circumstances[24] * circumstances[27];
      tmp = tmp / (n * circumstances[29]);
      if (Math.abs(tmp) <= 1.0)
        tmp = (sign * Math.sqrt(1.0 - tmp * tmp) * circumstances[29]) / n;
      else tmp = 0.0;
      tmp =
        (circumstances[24] * circumstances[26] +
          circumstances[25] * circumstances[27]) /
          circumstances[30] -
        tmp;
      circumstances[1] -= tmp;
      timelocdependent(circumstances);
      iter++;
    }

    return circumstances;
  }

  //
  // Read the deltaT value for the selected eclipse
  function getdTValue() {
    var deltaT = elements[5] + 0.0;
    return deltaT;
  }

  //
  // Geometric sun altitude (radians) at internal time t — the d/m/h/alt
  // subset of the evaluation the sunrise/sunset scans run per 20s step.
  // Used to bisect the horizon crossing after the coarse march brackets it.
  function sunAltAt(t, sinlat, coslat) {
    var d = ((elements[16] * t + elements[15]) * t + elements[14]) * D2R;
    var m = (elements[19] * t + elements[18]) * t + elements[17];
    if (m >= 360.0) m -= 360.0;
    m *= D2R;
    var h = m - obsvconst[1] - elements[5] / 13713.440924999626077;
    return Math.asin(Math.sin(d) * sinlat + Math.cos(d) * coslat * Math.cos(h));
  }

  //
  // Get the sunrise circumstances
  function getsunrise(circumstances) {
    var t, ans, alt;

    circumstances[0] = -2;
    circumstances[1] = c1[1] - 0.8;
    circumstances[32] = -1.0;
    t = circumstances[1];
    var sinlat = Math.sin(obsvconst[0]);
    var coslat = Math.cos(obsvconst[0]);

    do {
      t += 1.0 / 180.0; // Every 20 seconds

      // x
      ans = elements[9] * t + elements[8];
      ans = ans * t + elements[7];
      ans = ans * t + elements[6];
      circumstances[2] = ans;
      // dx
      ans = 3.0 * elements[9] * t + 2.0 * elements[8];
      ans = ans * t + elements[7];
      circumstances[10] = ans;
      // y
      ans = elements[13] * t + elements[12];
      ans = ans * t + elements[11];
      ans = ans * t + elements[10];
      circumstances[3] = ans;
      // dy
      ans = 3.0 * elements[13] * t + 2.0 * elements[12];
      ans = ans * t + elements[11];
      circumstances[11] = ans;
      // d
      ans = elements[16] * t + elements[15];
      ans = ans * t + elements[14];
      ans *= D2R;
      circumstances[4] = ans;
      // sin d and cos d
      circumstances[5] = Math.sin(ans);
      circumstances[6] = Math.cos(ans);
      // m
      ans = elements[19] * t + elements[18];
      ans = ans * t + elements[17];
      if (ans >= 360.0) ans -= 360.0;
      ans *= D2R;
      circumstances[7] = ans;
      // h, sin h, cos h
      circumstances[16] =
        circumstances[7] - obsvconst[1] - elements[5] / 13713.440924999626077;
      circumstances[17] = Math.sin(circumstances[16]);
      circumstances[18] = Math.cos(circumstances[16]);

      // alt
      circumstances[32] = Math.asin(
        circumstances[5] * sinlat +
          circumstances[6] * coslat * circumstances[18],
      );
    } while (
      circumstances[32] < gRefractionHeight &&
      Math.abs(t - mid[1]) < 2.0
    );
    if (circumstances[32] < 0.0 && Math.abs(t - mid[1]) < 2.0) {
      // The 20s march overshoots the crossing by up to one step. When the
      // previous grid point brackets it, bisect to sub-second precision and
      // re-derive the stepped fields at the refined time.
      var lo = t - 1.0 / 180.0;
      if (sunAltAt(lo, sinlat, coslat) < gRefractionHeight) {
        var hi = t;
        for (var iter = 0; iter < 24; iter++) {
          var tbis = 0.5 * (lo + hi);
          if (sunAltAt(tbis, sinlat, coslat) < gRefractionHeight) lo = tbis;
          else hi = tbis;
        }
        t = hi;
        circumstances[1] = t;
        timelocdependent(circumstances);
        circumstances[32] = Math.asin(
          circumstances[5] * sinlat +
            circumstances[6] * coslat * circumstances[18],
        );
      } else {
        circumstances[1] = t;
      }
      circumstances[40] = 2;
    } else {
      circumstances[1] = mid[1];
      circumstances[40] = 4;
      return;
    }

    // dd
    ans = 2.0 * elements[16] * t + elements[15];
    ans *= D2R;
    circumstances[12] = ans;
    // dm
    ans = 2.0 * elements[19] * t + elements[18];
    ans *= D2R;
    circumstances[13] = ans;
    // xi
    circumstances[19] = obsvconst[5] * circumstances[17];
    // eta
    circumstances[20] =
      obsvconst[4] * circumstances[6] -
      obsvconst[5] * circumstances[18] * circumstances[5];
    // zeta
    circumstances[21] =
      obsvconst[4] * circumstances[5] +
      obsvconst[5] * circumstances[18] * circumstances[6];
    // dxi
    circumstances[22] = circumstances[13] * obsvconst[5] * circumstances[18];
    // deta
    circumstances[23] =
      circumstances[13] * circumstances[19] * circumstances[5] -
      circumstances[21] * circumstances[12];
    // u
    circumstances[24] = circumstances[2] - circumstances[19];
    // v
    circumstances[25] = circumstances[3] - circumstances[20];

    // q
    circumstances[33] = Math.asin(
      (coslat * circumstances[17]) / Math.cos(circumstances[32]),
    );
    if (circumstances[20] < 0.0)
      circumstances[33] = Math.PI - circumstances[33];
    // azi
    circumstances[35] = Math.atan2(
      -circumstances[17] * circumstances[6],
      circumstances[5] * coslat - circumstances[18] * sinlat * circumstances[6],
    );
    var type = circumstances[0];
    // l1 and dl1
    ans = elements[22] * t + elements[21];
    ans = ans * t + elements[20];
    circumstances[8] = ans;
    if (type == -2 || type == 0 || type == 2)
      circumstances[14] = 2.0 * elements[22] * t + elements[21];
    // l2 and dl2
    ans = elements[25] * t + elements[24];
    ans = ans * t + elements[23];
    circumstances[9] = ans;
    if (type == -1 || type == 0 || type == 1)
      circumstances[15] = 2.0 * elements[25] * t + elements[24];
    // l1'
    circumstances[28] = circumstances[8] - circumstances[21] * elements[26];
    // l2'
    circumstances[29] = circumstances[9] - circumstances[21] * elements[27];
    // m, magnitude and Moon/Sun ratio
    circumstances[36] = Math.sqrt(
      circumstances[24] * circumstances[24] +
        circumstances[25] * circumstances[25],
    );
    circumstances[37] =
      (circumstances[28] - circumstances[36]) /
      (circumstances[28] + circumstances[29]);
    circumstances[38] =
      (circumstances[28] - circumstances[29]) /
      (circumstances[28] + circumstances[29]);

    var xi = circumstances[19];
    var eta = circumstances[20];
    var zeta = circumstances[21];
    // Sun distance in unit of the earth equatorial radius
    var zs = circumstances[8] * Math.cos(f1) - circumstances[9] * Math.cos(f2);
    zs /= Math.sin(f1) - Math.sin(f2);
    // Moon distance in unit of the earth equatorial radius
    var zm =
      circumstances[8] * Math.cos(f1) +
      lambdak1k2 * circumstances[9] * Math.cos(f2);
    zm /= Math.sin(f1) + lambdak1k2 * Math.sin(f2);
    var u = circumstances[2] - xi;
    var v = circumstances[3] - eta;
    zs -= zeta;
    zm -= zeta;
    var tmp = Math.sqrt(u * u + v * v + zs * zs);
    var sdec = v * circumstances[6] + zs * circumstances[5];
    sdec = Math.asin(sdec / tmp);
    tmp = Math.sqrt(u * u + v * v + zm * zm);
    var mdec = v * circumstances[6] + zm * circumstances[5];
    mdec = Math.asin(mdec / tmp);
    var deltamus = Math.atan(
      u / (v * circumstances[5] - zs * circumstances[6]),
    );
    var deltamum = Math.atan(
      u / (v * circumstances[5] - zm * circumstances[6]),
    );
    var sha = circumstances[7] + deltamus;
    var mha = circumstances[7] + deltamum;
    // Local hour angle
    sha -= obsvconst[1] + elements[5] / 13713.440924999626077;
    mha -= obsvconst[1] + elements[5] / 13713.440924999626077;
    var sinsdec = Math.sin(sdec);
    var cossdec = Math.cos(sdec);
    var sinsha = Math.sin(sha);
    var cossha = Math.cos(sha);
    // Sun altitude
    circumstances[45] = Math.asin(sinsdec * sinlat + cossdec * cossha * coslat);
    // Sun azimuth
    circumstances[46] = Math.atan2(
      -cossdec * sinsha,
      sinsdec * coslat - cossdec * cossha * sinlat,
    );
    var sinmdec = Math.sin(mdec);
    var cosmdec = Math.cos(mdec);
    var sinmha = Math.sin(mha);
    var cosmha = Math.cos(mha);
    // Moon altitude
    circumstances[41] = Math.asin(sinmdec * sinlat + cosmdec * cosmha * coslat);
    // Moon azimuth
    circumstances[42] = Math.atan2(
      -cosmdec * sinmha,
      sinmdec * coslat - cosmdec * cosmha * sinlat,
    );
    // Sun apparent radius
    tmp =
      circumstances[8] * Math.cos(f1) * Math.sin(f2) -
      circumstances[9] * Math.sin(f1) * Math.cos(f2);
    var R = tmp / (Math.sin(f1) - Math.sin(f2));
    var rs = Math.asin(R / Math.sqrt(u * u + v * v + zs * zs)); // Topocentric
    circumstances[43] = rs * R2D;
    // Moon apparent radius
    var k = tmp / (Math.sin(f1) / lambdak1k2 + Math.sin(f2));
    var rm = Math.asin(k / Math.sqrt(u * u + v * v + zm * zm)); // Topocentric
    circumstances[44] = rm * R2D;
    sunrise_alt[0] = circumstances[45] * R2D; // Sun
    sunrise_azi[0] = circumstances[46] * R2D;
    if (sunrise_azi[0] < 0.0) sunrise_azi[0] += 360.0;
    else if (sunrise_azi[0] >= 360.0) sunrise_azi[0] -= 360.0;
    sunrise_rad[0] = circumstances[43] * 100;
    sunrise_alt[1] = circumstances[41] * R2D; // Moon
    sunrise_azi[1] = circumstances[42] * R2D;
    if (sunrise_azi[1] < 0.0) sunrise_azi[1] += 360.0;
    else if (sunrise_azi[1] >= 360.0) sunrise_azi[1] -= 360.0;
    sunrise_rad[1] = circumstances[44] * 100;

    var jd = getjd(circumstances);
    circumstances[51] = getsn(jd); // Sun axis from celestial north
  }

  //
  // Get the sunset circumstances
  function getsunset(circumstances) {
    var t, ans, alt;

    circumstances[0] = 2;
    circumstances[1] = c4[1] + 0.8;
    circumstances[32] = -1.0;
    t = circumstances[1];
    var sinlat = Math.sin(obsvconst[0]);
    var coslat = Math.cos(obsvconst[0]);

    do {
      t -= 1.0 / 180.0; // Every 20 seconds

      // x
      ans = elements[9] * t + elements[8];
      ans = ans * t + elements[7];
      ans = ans * t + elements[6];
      circumstances[2] = ans;
      // dx
      ans = 3.0 * elements[9] * t + 2.0 * elements[8];
      ans = ans * t + elements[7];
      circumstances[10] = ans;
      // y
      ans = elements[13] * t + elements[12];
      ans = ans * t + elements[11];
      ans = ans * t + elements[10];
      circumstances[3] = ans;
      // dy
      ans = 3.0 * elements[13] * t + 2.0 * elements[12];
      ans = ans * t + elements[11];
      circumstances[11] = ans;
      // d
      ans = elements[16] * t + elements[15];
      ans = ans * t + elements[14];
      ans *= D2R;
      circumstances[4] = ans;
      // sin d and cos d
      circumstances[5] = Math.sin(ans);
      circumstances[6] = Math.cos(ans);
      // m
      ans = elements[19] * t + elements[18];
      ans = ans * t + elements[17];
      if (ans >= 360.0) ans -= 360.0;
      ans *= D2R;
      circumstances[7] = ans;
      // h, sin h, cos h
      circumstances[16] =
        circumstances[7] - obsvconst[1] - elements[5] / 13713.440924999626077;
      circumstances[17] = Math.sin(circumstances[16]);
      circumstances[18] = Math.cos(circumstances[16]);

      // alt
      circumstances[32] = Math.asin(
        circumstances[5] * sinlat +
          circumstances[6] * coslat * circumstances[18],
      );
    } while (
      circumstances[32] < gRefractionHeight &&
      Math.abs(t - mid[1]) < 2.0
    );
    if (circumstances[32] < 0.0 && Math.abs(t - mid[1]) < 2.0) {
      // Mirror of getsunrise: the backward 20s march lands early by up to
      // one step; bisect the [t, t+step] bracket down to the crossing.
      var hi = t + 1.0 / 180.0;
      if (sunAltAt(hi, sinlat, coslat) < gRefractionHeight) {
        var lo = t;
        for (var iter = 0; iter < 24; iter++) {
          var tbis = 0.5 * (lo + hi);
          if (sunAltAt(tbis, sinlat, coslat) < gRefractionHeight) hi = tbis;
          else lo = tbis;
        }
        t = lo;
        circumstances[1] = t;
        timelocdependent(circumstances);
        circumstances[32] = Math.asin(
          circumstances[5] * sinlat +
            circumstances[6] * coslat * circumstances[18],
        );
      } else {
        circumstances[1] = t;
      }
      circumstances[40] = 3;
    } else {
      circumstances[1] = mid[1];
      circumstances[40] = 4;
      return;
    }

    // dd
    ans = 2.0 * elements[16] * t + elements[15];
    ans *= D2R;
    circumstances[12] = ans;
    // dm
    ans = 2.0 * elements[19] * t + elements[18];
    ans *= D2R;
    circumstances[13] = ans;
    // xi
    circumstances[19] = obsvconst[5] * circumstances[17];
    // eta
    circumstances[20] =
      obsvconst[4] * circumstances[6] -
      obsvconst[5] * circumstances[18] * circumstances[5];
    // zeta
    circumstances[21] =
      obsvconst[4] * circumstances[5] +
      obsvconst[5] * circumstances[18] * circumstances[6];
    // dxi
    circumstances[22] = circumstances[13] * obsvconst[5] * circumstances[18];
    // deta
    circumstances[23] =
      circumstances[13] * circumstances[19] * circumstances[5] -
      circumstances[21] * circumstances[12];
    // u
    circumstances[24] = circumstances[2] - circumstances[19];
    // v
    circumstances[25] = circumstances[3] - circumstances[20];

    // q
    circumstances[33] = Math.asin(
      (coslat * circumstances[17]) / Math.cos(circumstances[32]),
    );
    if (circumstances[20] < 0.0)
      circumstances[33] = Math.PI - circumstances[33];
    // azi
    circumstances[35] = Math.atan2(
      -circumstances[17] * circumstances[6],
      circumstances[5] * coslat - circumstances[18] * sinlat * circumstances[6],
    );
    var type = circumstances[0];
    // l1 and dl1
    ans = elements[22] * t + elements[21];
    ans = ans * t + elements[20];
    circumstances[8] = ans;
    if (type == -2 || type == 0 || type == 2)
      circumstances[14] = 2.0 * elements[22] * t + elements[21];
    // l2 and dl2
    ans = elements[25] * t + elements[24];
    ans = ans * t + elements[23];
    circumstances[9] = ans;
    if (type == -1 || type == 0 || type == 1)
      circumstances[15] = 2.0 * elements[25] * t + elements[24];
    // l1'
    circumstances[28] = circumstances[8] - circumstances[21] * elements[26];
    // l2'
    circumstances[29] = circumstances[9] - circumstances[21] * elements[27];
    // m, magnitude and Moon/Sun ratio
    circumstances[36] = Math.sqrt(
      circumstances[24] * circumstances[24] +
        circumstances[25] * circumstances[25],
    );
    circumstances[37] =
      (circumstances[28] - circumstances[36]) /
      (circumstances[28] + circumstances[29]);
    circumstances[38] =
      (circumstances[28] - circumstances[29]) /
      (circumstances[28] + circumstances[29]);

    var xi = circumstances[19];
    var eta = circumstances[20];
    var zeta = circumstances[21];
    // Sun distance in unit of the earth equatorial radius
    var zs = circumstances[8] * Math.cos(f1) - circumstances[9] * Math.cos(f2);
    zs /= Math.sin(f1) - Math.sin(f2);
    // Moon distance in unit of the earth equatorial radius
    var zm =
      circumstances[8] * Math.cos(f1) +
      lambdak1k2 * circumstances[9] * Math.cos(f2);
    zm /= Math.sin(f1) + lambdak1k2 * Math.sin(f2);
    var u = circumstances[2] - xi;
    var v = circumstances[3] - eta;
    zs -= zeta;
    zm -= zeta;
    var tmp = Math.sqrt(u * u + v * v + zs * zs);
    var sdec = v * circumstances[6] + zs * circumstances[5];
    sdec = Math.asin(sdec / tmp);
    tmp = Math.sqrt(u * u + v * v + zm * zm);
    var mdec = v * circumstances[6] + zm * circumstances[5];
    mdec = Math.asin(mdec / tmp);
    var deltamus = Math.atan(
      u / (v * circumstances[5] - zs * circumstances[6]),
    );
    var deltamum = Math.atan(
      u / (v * circumstances[5] - zm * circumstances[6]),
    );
    var sha = circumstances[7] + deltamus;
    var mha = circumstances[7] + deltamum;
    // Local hour angle
    sha -= obsvconst[1] + elements[5] / 13713.440924999626077;
    mha -= obsvconst[1] + elements[5] / 13713.440924999626077;
    var sinsdec = Math.sin(sdec);
    var cossdec = Math.cos(sdec);
    var sinsha = Math.sin(sha);
    var cossha = Math.cos(sha);
    // Sun altitude
    circumstances[45] = Math.asin(sinsdec * sinlat + cossdec * cossha * coslat);
    // Sun azimuth
    circumstances[46] = Math.atan2(
      -cossdec * sinsha,
      sinsdec * coslat - cossdec * cossha * sinlat,
    );
    var sinmdec = Math.sin(mdec);
    var cosmdec = Math.cos(mdec);
    var sinmha = Math.sin(mha);
    var cosmha = Math.cos(mha);
    // Moon altitude
    circumstances[41] = Math.asin(sinmdec * sinlat + cosmdec * cosmha * coslat);
    // Moon azimuth
    circumstances[42] = Math.atan2(
      -cosmdec * sinmha,
      sinmdec * coslat - cosmdec * cosmha * sinlat,
    );
    // Sun apparent radius
    tmp =
      circumstances[8] * Math.cos(f1) * Math.sin(f2) -
      circumstances[9] * Math.sin(f1) * Math.cos(f2);
    var R = tmp / (Math.sin(f1) - Math.sin(f2));
    var rs = Math.asin(R / Math.sqrt(u * u + v * v + zs * zs)); // Topocentric
    circumstances[43] = rs * R2D;
    // Moon apparent radius
    var k = tmp / (Math.sin(f1) / lambdak1k2 + Math.sin(f2));
    var rm = Math.asin(k / Math.sqrt(u * u + v * v + zm * zm)); // Topocentric
    circumstances[44] = rm * R2D;
    sunset_alt[0] = circumstances[45] * R2D; // Sun
    sunset_azi[0] = circumstances[46] * R2D;
    if (sunset_azi[0] < 0.0) sunset_azi[0] += 360.0;
    else if (sunset_azi[0] >= 360.0) sunset_azi[0] -= 360.0;
    sunset_rad[0] = circumstances[43] * 100;
    sunset_alt[1] = circumstances[41] * R2D; // Moon
    sunset_azi[1] = circumstances[42] * R2D;
    if (sunset_azi[1] < 0.0) sunset_azi[1] += 360.0;
    else if (sunset_azi[1] >= 360.0) sunset_azi[1] -= 360.0;
    sunset_rad[1] = circumstances[44] * 100;

    var jd = getjd(circumstances);
    circumstances[51] = getsn(jd); // Sun axis from celestial north
  }

  // Sun coverage from a circumstances vector's m / l1' / l2' (Xavier's lens
  // formula). Historically evaluated only at maximum (mid); the moon-interior
  // test is his general one from the type classification (m < l2', true at
  // mid exactly when mid[39] == 2 — annular), so the same formula also serves
  // the sunrise/sunset vectors, whose [36..38] the horizon scans populate.
  function getcoverage_raw(circumstances) {
    var a, b, c;

    if (circumstances[37] <= 0.0) {
      return 0.0;
    } else if (circumstances[37] >= 1.0) {
      return 1.0;
    }
    if (circumstances[36] < circumstances[29])
      c = circumstances[38] * circumstances[38];
    else {
      c = Math.acos(
        (circumstances[28] * circumstances[28] +
          circumstances[29] * circumstances[29] -
          2.0 * circumstances[36] * circumstances[36]) /
          (circumstances[28] * circumstances[28] -
            circumstances[29] * circumstances[29]),
      );
      b = Math.acos(
        (circumstances[28] * circumstances[29] +
          circumstances[36] * circumstances[36]) /
          circumstances[36] /
          (circumstances[28] + circumstances[29]),
      );
      a = Math.PI - b - c;
      c =
        (circumstances[38] * circumstances[38] * a +
          b -
          circumstances[38] * Math.sin(c)) /
        Math.PI;
    }

    return c;
  }

  function getVelocity_raw() {
    var ans = "";

    if (mid[39] > 1) {
      var temp, zeta1;

      var rho1 = Math.sqrt(1.0 - kELLIPTICITY_SQUARRED * mid[6] * mid[6]);
      var eta1 = mid[3] / rho1;
      var temp = mid[2] * mid[2] + eta1 * eta1;
      if (temp >= 1.0)
        // Check for square root of 0 or negative number
        zeta1 = 0.0;
      else zeta1 = Math.sqrt(1.0 - temp);
      var sinD1 = mid[5] / rho1;
      var cosD1 = ((1.0 - kEARTH_INV_FLATTENING) * mid[6]) / rho1;
      var theta = Math.atan2(mid[2], zeta1 * cosD1 - eta1 * sinD1);
      if (theta < 0.0) theta += 2.0 * Math.PI;
      temp =
        (1.0 + kEARTH_INV_F_SQ * mid[5] * mid[5]) * (1.0 - mid[2] * mid[2]) -
        kEARTH_INV_F_SQUARRED * mid[3] * mid[3];
      if (temp > 0.0) {
        var dz =
          (1.0 + kEARTH_INV_F_SQ * mid[5] * mid[5]) * mid[2] * mid[10] +
          kEARTH_INV_F_SQUARRED * mid[3] * mid[11];
        dz /= Math.sqrt(temp);
        dz += kEARTH_INV_F_SQ * mid[11] * mid[5] * mid[6];
        dz = -dz / (1.0 + kEARTH_INV_F_SQ * mid[5] * mid[5]);
        var dxi2 = (mid[13] * mid[2] * Math.cos(theta)) / Math.sin(theta);
        var deta2 = mid[13] * mid[2] * mid[5];
        var dzeta2 = -mid[13] * mid[2] * mid[6];

        // (Ant-)umbra velocity in km/s
        var du = mid[10] - dxi2;
        var dv = mid[11] - deta2;
        var dw = dz - dzeta2;
        var velocity =
          (Math.sqrt(du * du + dv * dv + dw * dw) * kEARTH_EQUATORIAL_RADIUS) /
          3600000.0;

        return {
          kilometersPerSecond: velocity,
          milesPerHour: velocity * 2236.93629,
        };
      }
    }

    return null;
  }

  //
  // Get the (Ant)Umbral depth
  // Entry condition - there is a total or annular eclipse
  function getdepth_raw(lat) {
    var depth = mid[36] / mid[29];
    if (depth < 0.0) depth = 1.0 + depth;
    else depth = 1.0 - depth;

    var K = mid[2] * mid[26] + mid[3] * mid[27];
    K *= K;
    K = Math.sqrt(mid[21] * mid[21] + K / mid[30]);
    var halfwidth =
      (getWGS84EarthRadiusAtLatitude(lat) * Math.abs(mid[29])) / K;
    var edgeDist = halfwidth * depth;
    var centerlineDist = halfwidth * (1.0 - depth);

    return {
      depth,
      distanceToClosestEdgeInKilometers: edgeDist,
      distanceToCenterLineInKilometers: centerlineDist,
    };
  }

  //
  // WGS84 Earth radius in kilometers at a given geodetic latitude in degrees (the flattening is taken into account)
  function getWGS84EarthRadiusAtLatitude(lat) {
    var phi, tmp, numerator, denominator, radius;

    phi = lat * D2R;
    // Radius for WGS84 ellipsoid (slightly different from IAU 1976)
    numerator =
      kEARTH_EQUATORIAL_RADIUS * kEARTH_EQUATORIAL_RADIUS * Math.cos(phi);
    numerator *= numerator;
    tmp = kEARTH_POLAR_RADIUS * kEARTH_POLAR_RADIUS * Math.sin(phi);
    tmp *= tmp;
    numerator += tmp;
    denominator = kEARTH_EQUATORIAL_RADIUS * Math.cos(phi);
    denominator *= denominator;
    tmp = kEARTH_POLAR_RADIUS * Math.sin(phi);
    tmp *= tmp;
    denominator += tmp;
    radius = Math.sqrt(numerator / denominator) / 1000.0;

    return radius;
  }

  //
  // Get the (Ant)Umbral path width
  // Entry condition - there is a total or annular eclipse (doesn't work well for non-central eclipses)
  function getwidth_raw(lat) {
    var K = mid[2] * mid[26] + mid[3] * mid[27];
    K *= K;
    K = Math.sqrt(mid[21] * mid[21] + K / mid[30]);
    var width =
      (2.0 * getWGS84EarthRadiusAtLatitude(lat) * Math.abs(mid[29])) / K;
    // in kilometers
    return width;
  }

  //
  // Get the UNIX timestamp of an event (see AA p.63 or http://aa.usno.navy.mil/js/JulianDate.js)
  function getUTCTimestamp(circumstances) {
    var jd, t, ans, a, b, c, d, e, year, sign;

    // JD for noon (TDT) the day before the day that contains T0
    jd = Math.floor(elements[0] - elements[1] / 24.0);
    // Local time (ie the offset in hours since midnight TDT on the day containing T0) to the nearest 0.1 sec
    t =
      circumstances[1] +
      elements[1] -
      obsvconst[3] -
      (elements[5] - 0.05) / 3600.0;
    if (t < 0.0) jd--;
    else if (t >= 24.0) jd++;
    if (jd >= 2299160.5) {
      a = Math.floor((jd - 1867216.25) / 36524.25);
      a += jd + 1.0 - Math.floor(a / 4.0);
    } else a = jd;
    b = a + 1525.0;
    c = Math.floor((b - 122.1) / 365.25);
    d = Math.floor(365.25 * c);
    e = Math.floor((b - d) / 30.6001);
    d = b - d - Math.floor(30.6001 * e);
    if (e < 13.5) e -= 1;
    else e -= 13;
    if (e > 2.5) year = c - 4716;
    else year = c - 4715;
    if (t < 0.0) t += 24.0;
    else if (t >= 24.0) t -= 24.0;

    const month = e - 1;
    const date = d;
    const hour = Math.floor(t);
    const rawMin = (t - Math.floor(t)) * 60.0;
    const min = Math.floor(rawMin);
    const rawSec = (rawMin - Math.floor(rawMin)) * 60.0;
    const sec = Math.floor(rawSec);

    var myDate = new Date(year, month, date, hour, min, sec);

    return Math.round(
      myDate.getTime() / 1000 - myDate.getTimezoneOffset() * 60,
    );
  }

  //
  // Get the local time of an event
  function getLocalTime(circumstances) {
    var ans = "";
    // Local time to the nearest 0.1 sec
    var t =
      circumstances[1] +
      elements[1] -
      obsvconst[3] -
      (elements[5] - 0.05) / 3600.0;
    if (t < 0.0) t += 24.0;
    else if (t >= 24.0) t -= 24.0;
    if (t < 10.0) ans += "0";
    ans += Math.floor(t) + ":";
    t = (t - Math.floor(t)) * 60.0;
    if (t < 10.0) ans += "0";
    ans += Math.floor(t) + ":";
    t = (t - Math.floor(t)) * 60.0;
    if (t < 10.0) ans += "0";
    ans += Math.floor(t);
    ans += ".";
    ans += Math.floor(10.0 * (t - Math.floor(t)));
    // Add an asterix if the altitude is less than zero (take Sun radius and/or refraction into account)
    if (circumstances[32] <= gRefractionHeight) ans += "*";

    return ans;
  }

  //
  // Get the duration in 00m 00.0s format
  function getduration_raw() {
    var tmp;

    // If both C2 and C3 are above horizon, use full duration
    if (c2[32] > gRefractionHeight && c3[32] > gRefractionHeight) {
      tmp = c3[1] - c2[1];
    }
    // If C2 is above horizon but C3 is below (sunset cuts off totality)
    else if (c2[32] > gRefractionHeight && c3[32] <= gRefractionHeight) {
      tmp = sunset[1] - c2[1];
    }
    // If C2 is below horizon but C3 is above (sunrise cuts off start of totality)
    else if (c2[32] <= gRefractionHeight && c3[32] > gRefractionHeight) {
      tmp = c3[1] - sunrise[1];
    }
    // If both C2 and C3 are below horizon, no visible totality
    else {
      tmp = 0;
    }

    if (tmp < 0.0) tmp += 24.0;
    else if (tmp >= 24.0) tmp -= 24.0;
    // The +24h branch normalizes spans that cross midnight. A duration can
    // also go *slightly* negative when the bisected sunrise/sunset scans
    // and the iteratively-converged contacts disagree by a hair about a
    // near-simultaneous horizon crossing — that means "zero visible
    // duration", but the wrap turns it into ~24h. No single-location
    // eclipse phase lasts anywhere near 12h, so anything above that is the
    // artifact.
    if (tmp > 12.0) tmp = 0.0;

    // Convert hours to seconds
    return tmp * 3600;
  }

  //
  // Get the penumbral duration in 0h 00m 00.0s format
  function getpenumbralduration_raw() {
    var tmp, ans;

    if (
      c1[1] > sunrise[1] &&
      sunrise[40] == 2 &&
      c4[1] < sunset[1] &&
      sunset[40] == 3
    )
      tmp = c4[1] - c1[1];
    else if (
      c1[1] < sunrise[1] &&
      sunrise[40] == 2 &&
      c4[1] > sunset[1] &&
      sunset[40] == 3
    )
      tmp = sunset[1] - sunrise[1];
    else {
      if (c1[1] < sunrise[1] && sunrise[40] == 2) tmp = c4[1] - sunrise[1];
      else if (c4[1] > sunset[1] && sunset[40] == 3) tmp = sunset[1] - c1[1];
      else tmp = c4[1] - c1[1];
    }

    if (tmp < 0.0) tmp += 24.0;
    else if (tmp >= 24.0) tmp -= 24.0;
    // Same guard as getduration_raw: a tiny negative from horizon-scan vs
    // contact disagreement wrapping to ~24h means zero, not a day.
    if (tmp > 12.0) tmp = 0.0;

    return tmp * 60 * 60;
  }

  function populateSunriseSunset() {
    getsunrise(sunrise);
    getsunset(sunset);
  }

  function getAltitude(circumstances) {
    var t = circumstances[32] * R2D;
    if (t < 0.0) {
      t = -t;
    }
    t += 0.05;
    return t;
  }

  function getAzimuth(circumstances) {
    var t = circumstances[35] * R2D;
    if (t < 0.0) t += 360.0;
    else if (t >= 360.0) t -= 360.0;
    t += 0.05;
    if (t >= 360.0) t -= 360.0;
    return t;
  }

  function getCircumstancesData(circumstances) {
    var p = circumstances[31] * R2D;
    while (p < 0.0) p += 360.0;
    while (p >= 360.0) p -= 360.0;
    var v = circumstances[34] * R2D;
    while (v < 0.0) v += 360.0;
    while (v >= 360.0) v -= 360.0;
    return {
      utcTimestamp: getUTCTimestamp(circumstances),
      sunAltitude: getAltitude(circumstances),
      sunAzimuth: getAzimuth(circumstances),
      isSunVisible: circumstances[32] > gRefractionHeight,
      isSunVisibleNoRefraction: circumstances[32] > 0,
      positionAngleFromNorth: p,
      positionAngleFromZenith: v,
      circumstances: circumstances,
    };
  }

  //
  // Compute the Sun altitude in degrees
  function calcSunAltitude(lat, d, H) {
    var alt =
      Math.asin(
        Math.sin(lat) * Math.sin(d) + Math.cos(lat) * Math.cos(d) * Math.cos(H),
      ) * R2D;

    return alt;
  }

  function calculator({ lat, lng, elevation }: EclipseCalculationRequest) {
    if (isNaN(lat) || isNaN(lng)) {
      throw new Error("Provide valid lat/lng");
    }

    if (elevation < 0.0) {
      elevation = 0.0;
    }

    readdata(lat, lng, elevation);
    populateContactPoints();

    const deltaT = getdTValue();

    populateSunriseSunset();

    const data = {
      lat,
      lng,
      elevation,
      eventType:
        mid[39] === 1
          ? EclipseEventType.Partial
          : mid[39] === 2
            ? EclipseEventType.Annular
            : mid[39] === 3
              ? EclipseEventType.Total
              : EclipseEventType.None,
      deltaT_differenceBetweenTerrestrialDynamicalTimeAndUniversalTimeInSeconds_:
        deltaT,
      eclipseObscuration: getcoverage_raw(mid),
      eclipseMagnitude: mid[37],
      moonSunSizeRatio: mid[38],
      ...(mid[39] === 2 || mid[39] === 3
        ? {
            umbralVelocity: getVelocity_raw(),
            umbralDepth: getdepth_raw(lat),
            umbralPathWidth: getwidth_raw(lat),
            umbralType: mid[39] == 2 ? "Antumbral" : "Umbral",
          }
        : {}),
    };

    // Instant circumstances at an arbitrary UTC timestamp — the same
    // timelocdependent/observational pipeline the contacts run, evaluated at
    // any t. The closure state (obsvconst) is shared across calculator()
    // calls, so snapshot the observer constants and re-seed them per sample;
    // the anchor maps UTC seconds onto the internal hour-based time axis.
    const obsSnapshot = obsvconst.slice();
    const anchorT = mid[1];
    const anchorUtc = getUTCTimestamp(mid);
    data.circumstancesAt = (utcTimestamp) => {
      for (var i = 0; i < obsSnapshot.length; i++)
        obsvconst[i] = obsSnapshot[i];
      var circ = [];
      // Type -2 (external contact): skips the mid-only libration block and
      // computes the l1' the observational pass reads.
      circ[0] = -2;
      circ[1] = anchorT + (utcTimestamp - anchorUtc) / 3600.0;
      timelocdependent(circ);
      observational(circ);
      var altDeg = circ[45] * R2D;
      var refraction = elevationRefraction(altDeg) - altDeg;
      var scx = circ[46] * R2D;
      if (scx < 0.0) scx += 360.0;
      else if (scx >= 360.0) scx -= 360.0;
      var mcx = circ[42] * R2D;
      if (mcx < 0.0) mcx += 360.0;
      else if (mcx >= 360.0) mcx -= 360.0;
      return {
        utcTimestamp,
        scx,
        scy: altDeg + refraction,
        srd: circ[43] * 100,
        mcx,
        mcy: circ[41] * R2D + refraction,
        mrd: circ[44] * 100,
        sunAltDeg: circ[32] * R2D,
        isSunVisible: circ[32] > gRefractionHeight,
      };
    };

    if (mid[39] > 0) {
      data.cMid = getCircumstancesData(mid);
      data.c1 = getCircumstancesData(c1);
      data.c4 = getCircumstancesData(c4);
      data.sunrise = getCircumstancesData(sunrise);
      data.sunset = getCircumstancesData(sunset);

      data.c1.name = "c1";
      data.cMid.name = "cMid";
      data.c4.name = "c4";
      data.sunrise.name = "sunrise";
      data.sunset.name = "sunset";

      const c1Refraction = elevationRefraction(c1_alt[0]) - c1_alt[0];
      data.c1.scx = c1_azi[0];
      data.c1.scy = c1_alt[0] + c1Refraction;
      data.c1.srd = c1_rad[0];
      data.c1.mcx = c1_azi[1];
      data.c1.mcy = c1_alt[1] + c1Refraction;
      data.c1.mrd = c1_rad[1];

      const cMidRefraction = elevationRefraction(mid_alt[0]) - mid_alt[0];
      data.cMid.scx = mid_azi[0];
      data.cMid.scy = mid_alt[0] + cMidRefraction;
      data.cMid.srd = mid_rad[0];
      data.cMid.mcx = mid_azi[1];
      data.cMid.mcy = mid_alt[1] + cMidRefraction;
      data.cMid.mrd = mid_rad[1];

      const c4Refraction = elevationRefraction(c4_alt[0]) - c4_alt[0];
      data.c4.scx = c4_azi[0];
      data.c4.scy = c4_alt[0] + c4Refraction;
      data.c4.srd = c4_rad[0];
      data.c4.mcx = c4_azi[1];
      data.c4.mcy = c4_alt[1] + c4Refraction;
      data.c4.mrd = c4_rad[1];

      const sunriseRefraction =
        elevationRefraction(sunrise_alt[0]) - sunrise_alt[0];
      data.sunrise.scx = sunrise_azi[0];
      data.sunrise.scy = sunrise_alt[0] + sunriseRefraction;
      data.sunrise.srd = sunrise_rad[0];
      data.sunrise.mcx = sunrise_azi[1];
      data.sunrise.mcy = sunrise_alt[1] + sunriseRefraction;
      data.sunrise.mrd = sunrise_rad[1];
      // Coverage at the horizon crossing — the visible-maximum obscuration
      // for spots whose maximum happens before sunrise. [40] === 4 means no
      // crossing was found (the timestamp collapsed onto mid) and the
      // magnitude terms were never computed, so leave it absent.
      if (sunrise[40] !== 4) {
        data.sunrise.obscuration = getcoverage_raw(sunrise);
      }

      const sunsetRefraction =
        elevationRefraction(sunset_alt[0]) - sunset_alt[0];
      data.sunset.scx = sunset_azi[0];
      data.sunset.scy = sunset_alt[0] + sunsetRefraction;
      data.sunset.srd = sunset_rad[0];
      data.sunset.mcx = sunset_azi[1];
      data.sunset.mcy = sunset_alt[1] + sunsetRefraction;
      data.sunset.mrd = sunset_rad[1];
      if (sunset[40] !== 4) {
        data.sunset.obscuration = getcoverage_raw(sunset);
      }

      // Is the Sun below the horizon for the entire event?
      const isSunBelowHorizonForEntireEvent =
        c1[32] <= gRefractionHeight &&
        mid[32] <= gRefractionHeight &&
        c4[32] <= gRefractionHeight;

      if (!isSunBelowHorizonForEntireEvent) {
        // check to see if the sun is below the horizon for any part of the event
        data.isSunBelowHorizonForAnyPartOfEvent =
          c1[32] <= gRefractionHeight || c4[32] <= gRefractionHeight;
      }

      // Is the Sun above the horizon for the max eclipse?
      data.isEventAboveHorizonForMaxEclipse = mid[32] > gRefractionHeight;
      data.isSunAboveHorizonAtC2andC3 =
        c2[32] > gRefractionHeight && c3[32] > gRefractionHeight;

      // Is there a total/annular event?
      if (mid[39] > 1) {
        data.c2 = getCircumstancesData(c2);
        data.c3 = getCircumstancesData(c3);

        data.c2.name = "c2";
        data.c3.name = "c3";

        const c2Refraction = elevationRefraction(c2_alt[0]) - c2_alt[0];
        data.c2.scx = c2_azi[0];
        data.c2.scy = c2_alt[0] + c2Refraction;
        data.c2.srd = c2_rad[0];
        data.c2.mcx = c2_azi[1];
        data.c2.mcy = c2_alt[1] + c2Refraction;
        data.c2.mrd = c2_rad[1];

        const c3Refraction = elevationRefraction(c3_alt[0]) - c3_alt[0];
        data.c3.scx = c3_azi[0];
        data.c3.scy = c3_alt[0] + c3Refraction;
        data.c3.srd = c3_rad[0];
        data.c3.mcx = c3_azi[1];
        data.c3.mcy = c3_alt[1] + c3Refraction;
        data.c3.mrd = c3_rad[1];

        // Is the Sun below the horizon for the entire duration of the event?
        if (isSunBelowHorizonForEntireEvent) {
          // Cf PSE 2019 (limit case where obscuration can be under the horizon)
        }
        // ... or is the Sun above the horizon for c2 or c3?
        else {
          // Is the Sun below the horizon for c2 & c3?
          if (c2[32] <= gRefractionHeight && c3[32] <= gRefractionHeight) {
            data.penumbralDurationInSeconds = getpenumbralduration_raw();
          }
          // ... or is the Sun above the horizon for c2 or c3?
          else {
            // Is the Sun above the horizon for c2 & c3?
            if (c2[32] > gRefractionHeight && c3[32] > gRefractionHeight) {
              data.isSunAboveHorizonForEntireTotalEvent = true;
              data.umbralDurationInSeconds = getduration_raw();
              data.penumbralDurationInSeconds = getpenumbralduration_raw();
            }
            // ... or is the Sun below the horizon for c2 or c3?
            else {
              data.isSunAboveHorizonForEntireTotalEvent = false;
              // Is the Sun above the horizon at C2 or C3?
              const isSunAboveHorizonAtC2orC3 =
                c2[32] > gRefractionHeight || c3[32] > gRefractionHeight;
              if (isSunAboveHorizonAtC2orC3) {
                data.umbralDurationInSeconds = getduration_raw();
                data.penumbralDurationInSeconds = getpenumbralduration_raw();
              }
            }
          }
        }
      } else {
        // Is the Sun below the horizon for the entire event?
        if (isSunBelowHorizonForEntireEvent) {
          // Cf PSE 2019 (limit case where obscuration can be under the horizon)
        } // ... or is the Sun above the horizon for at least some of the event?
        else {
          data.penumbralDurationInSeconds = getpenumbralduration_raw();
        }
      }
    }

    //
    // Compute the shadow outline at a given time
    function shadowOutlineLowAccuracy(
      t = mid[1],
      options: ShadowOutlineOptions = {},
    ) {
      const includeSubHorizon = options.includeSubHorizon ?? false;
      const shadowDegreesStepSize =
        options.shadowDegreesStepSize && options.shadowDegreesStepSize > 0
          ? options.shadowDegreesStepSize
          : kSHADOW_DEGREES_STEPSIZE;
      const clipToHorizon = !includeSubHorizon;
      var x, y, d, M, l2, omega, m2, cosQmM, sunBelowHorizon, outlineNbPt;

      if (gShadowOutlineCoords.length > 0) gShadowOutlineCoords.length = 0;
      if (mid[39] < 2) return;

      x = elements[6] + t * (elements[7] + t * (elements[8] + elements[9] * t));
      y =
        elements[10] +
        t * (elements[11] + t * (elements[12] + elements[13] * t));
      d = (elements[14] + t * (elements[15] + t * elements[16])) * D2R;
      M = elements[17] + t * (elements[18] + t * elements[19]);
      l2 = elements[23] + t * (elements[24] + t * elements[25]);

      var K = mid[2] * mid[26] + mid[3] * mid[27];
      K *= K;
      K = Math.sqrt(mid[21] * mid[21] + K / mid[30]);
      var halfwidth = (kEARTH_EQUATORIAL_RADIUS * Math.abs(mid[29])) / K; // Low accuracy in meters
      if (halfwidth < 5000.0) {
        var rho1 = Math.sqrt(
          1.0 - kELLIPTICITY_SQUARRED * Math.cos(d) * Math.cos(d),
        );
        var rho2 = Math.sqrt(
          1.0 - kELLIPTICITY_SQUARRED * Math.sin(d) * Math.sin(d),
        );
        var sinD1D2 =
          (kELLIPTICITY_SQUARRED * Math.sin(d) * Math.cos(d)) / (rho1 * rho2);
        var cosD1D2 = Math.sqrt(1.0 - kELLIPTICITY_SQUARRED) / (rho1 * rho2);
      } else
        omega =
          1.0 /
          Math.sqrt(1.0 - kELLIPTICITY_SQUARRED * Math.cos(d) * Math.cos(d));

      sunBelowHorizon = includeSubHorizon ? -90.0 : kSHADOW_ALTITUDE_LIMIT;

      m2 = x * x + y * y;
      cosQmM = (m2 + l2 * l2 - 1.0) / (2.0 * Math.sqrt(m2) * l2);
      if (includeSubHorizon) {
        if (halfwidth < 5000.0)
          outlineNbPt = buildShadowOutlineHA(
            0.0,
            360.0,
            0,
            x,
            y,
            d,
            M,
            l2,
            rho1,
            rho2,
            cosD1D2,
            sinD1D2,
            sunBelowHorizon,
            f2,
            clipToHorizon,
            shadowDegreesStepSize,
          );
        else
          outlineNbPt = buildShadowOutline(
            0.0,
            360.0,
            0,
            x,
            y,
            d,
            M,
            l2,
            omega,
            sunBelowHorizon,
            f2,
            clipToHorizon,
            shadowDegreesStepSize,
          );
        return finalizeShadowOutlineResult();
      }

      if (Math.abs(cosQmM) <= 1.0) {
        // Two end points to the curve
        var angleM, Q, Q1, Q2;

        angleM = Math.atan2(x, y);
        Q1 = (Math.acos(cosQmM) + angleM) * R2D;
        if (Q1 < 0.0) Q1 += 360.0;
        else if (Q1 > 360.0) Q1 -= 360.0;
        Q2 = (kM_PI_x2 - Math.acos(cosQmM) + angleM) * R2D;
        if (Q2 < 0.0) Q2 += 360.0;
        else if (Q2 > 360.0) Q2 -= 360.0;
        if (Q1 > Q2) {
          Q = Q1;
          Q1 = Q2;
          Q2 = Q;
        }

        // Determine which of the two sections of the circumference is the appropriate one
        Q = (Q1 + Q2) / 2.0;
        if (halfwidth < 5000.0) {
          if (
            checkShadowOutlineSectionHA(
              Q,
              x,
              y,
              d,
              M,
              l2,
              rho1,
              rho2,
              cosD1D2,
              sinD1D2,
              sunBelowHorizon,
            ) == false
          ) {
            outlineNbPt = buildShadowOutlineHA(
              Q2,
              360.0,
              0,
              x,
              y,
              d,
              M,
              l2,
              rho1,
              rho2,
              cosD1D2,
              sinD1D2,
              sunBelowHorizon,
              f2,
              clipToHorizon,
              shadowDegreesStepSize,
            );
            outlineNbPt = buildShadowOutlineHA(
              0.0,
              Q1,
              outlineNbPt,
              x,
              y,
              d,
              M,
              l2,
              rho1,
              rho2,
              cosD1D2,
              sinD1D2,
              sunBelowHorizon,
              f2,
              clipToHorizon,
              shadowDegreesStepSize,
            );
          } else
            outlineNbPt = buildShadowOutlineHA(
              Q1,
              Q2,
              0,
              x,
              y,
              d,
              M,
              l2,
              rho1,
              rho2,
              cosD1D2,
              sinD1D2,
              sunBelowHorizon,
              f2,
              clipToHorizon,
              shadowDegreesStepSize,
            );
        } else {
          if (
            checkShadowOutlineSection(
              Q,
              x,
              y,
              d,
              M,
              l2,
              omega,
              sunBelowHorizon,
              f2,
              clipToHorizon,
            ) == false
          ) {
            outlineNbPt = buildShadowOutline(
              Q2,
              360.0,
              0,
              x,
              y,
              d,
              M,
              l2,
              omega,
              sunBelowHorizon,
              f2,
              clipToHorizon,
              shadowDegreesStepSize,
            );
            outlineNbPt = buildShadowOutline(
              0.0,
              Q1,
              outlineNbPt,
              x,
              y,
              d,
              M,
              l2,
              omega,
              sunBelowHorizon,
              f2,
              clipToHorizon,
              shadowDegreesStepSize,
            );
          } else
            outlineNbPt = buildShadowOutline(
              Q1,
              Q2,
              0,
              x,
              y,
              d,
              M,
              l2,
              omega,
              sunBelowHorizon,
              f2,
              clipToHorizon,
              shadowDegreesStepSize,
            );
        }
      } // No end points to the curve
      else {
        if (halfwidth < 5000.0)
          outlineNbPt = buildShadowOutlineHA(
            0.0,
            360.0,
            0,
            x,
            y,
            d,
            M,
            l2,
            rho1,
            rho2,
            cosD1D2,
            sinD1D2,
            sunBelowHorizon,
            f2,
            clipToHorizon,
            shadowDegreesStepSize,
          );
        else
          outlineNbPt = buildShadowOutline(
            0.0,
            360.0,
            0,
            x,
            y,
            d,
            M,
            l2,
            omega,
            sunBelowHorizon,
            f2,
            clipToHorizon,
            shadowDegreesStepSize,
          );
      }

      return finalizeShadowOutlineResult();
    }

    function shadowOutlinePenumbralLowAccuracy(
      t = mid[1],
      options: ShadowOutlineOptions = {},
    ) {
      const includeSubHorizon = options.includeSubHorizon ?? false;
      const shadowDegreesStepSize =
        options.shadowDegreesStepSize && options.shadowDegreesStepSize > 0
          ? options.shadowDegreesStepSize
          : kSHADOW_DEGREES_STEPSIZE;
      const clipToHorizon = !includeSubHorizon;
      var x, y, d, M, l1, omega, m2, cosQmM, sunBelowHorizon, outlineNbPt;

      if (gShadowOutlineCoords.length > 0) gShadowOutlineCoords.length = 0;
      if (mid[39] < 1) return;

      x = elements[6] + t * (elements[7] + t * (elements[8] + elements[9] * t));
      y =
        elements[10] +
        t * (elements[11] + t * (elements[12] + elements[13] * t));
      d = (elements[14] + t * (elements[15] + t * elements[16])) * D2R;
      M = elements[17] + t * (elements[18] + t * elements[19]);
      l1 = elements[20] + t * (elements[21] + t * elements[22]);

      var K = mid[2] * mid[26] + mid[3] * mid[27];
      K *= K;
      K = Math.sqrt(mid[21] * mid[21] + K / mid[30]);
      var halfwidth = (kEARTH_EQUATORIAL_RADIUS * Math.abs(mid[28])) / K;
      if (halfwidth < 5000.0) {
        var rho1 = Math.sqrt(
          1.0 - kELLIPTICITY_SQUARRED * Math.cos(d) * Math.cos(d),
        );
        var rho2 = Math.sqrt(
          1.0 - kELLIPTICITY_SQUARRED * Math.sin(d) * Math.sin(d),
        );
        var sinD1D2 =
          (kELLIPTICITY_SQUARRED * Math.sin(d) * Math.cos(d)) / (rho1 * rho2);
        var cosD1D2 = Math.sqrt(1.0 - kELLIPTICITY_SQUARRED) / (rho1 * rho2);
      } else
        omega =
          1.0 /
          Math.sqrt(1.0 - kELLIPTICITY_SQUARRED * Math.cos(d) * Math.cos(d));

      sunBelowHorizon = includeSubHorizon ? -90.0 : kSHADOW_ALTITUDE_LIMIT;

      m2 = x * x + y * y;
      cosQmM = (m2 + l1 * l1 - 1.0) / (2.0 * Math.sqrt(m2) * l1);
      if (includeSubHorizon) {
        if (halfwidth < 5000.0)
          outlineNbPt = buildShadowOutlineHA(
            0.0,
            360.0,
            0,
            x,
            y,
            d,
            M,
            l1,
            rho1,
            rho2,
            cosD1D2,
            sinD1D2,
            sunBelowHorizon,
            f1,
            clipToHorizon,
            shadowDegreesStepSize,
          );
        else
          outlineNbPt = buildShadowOutline(
            0.0,
            360.0,
            0,
            x,
            y,
            d,
            M,
            l1,
            omega,
            sunBelowHorizon,
            f1,
            clipToHorizon,
            shadowDegreesStepSize,
          );
        return finalizeShadowOutlineResult();
      }

      if (Math.abs(cosQmM) <= 1.0) {
        var angleM, Q, Q1, Q2;

        angleM = Math.atan2(x, y);
        Q1 = (Math.acos(cosQmM) + angleM) * R2D;
        if (Q1 < 0.0) Q1 += 360.0;
        else if (Q1 > 360.0) Q1 -= 360.0;
        Q2 = (kM_PI_x2 - Math.acos(cosQmM) + angleM) * R2D;
        if (Q2 < 0.0) Q2 += 360.0;
        else if (Q2 > 360.0) Q2 -= 360.0;
        if (Q1 > Q2) {
          Q = Q1;
          Q1 = Q2;
          Q2 = Q;
        }

        Q = (Q1 + Q2) / 2.0;
        if (halfwidth < 5000.0) {
          if (
            checkShadowOutlineSectionHA(
              Q,
              x,
              y,
              d,
              M,
              l1,
              rho1,
              rho2,
              cosD1D2,
              sinD1D2,
              sunBelowHorizon,
              f1,
              clipToHorizon,
            ) == false
          ) {
            outlineNbPt = buildShadowOutlineHA(
              Q2,
              360.0,
              0,
              x,
              y,
              d,
              M,
              l1,
              rho1,
              rho2,
              cosD1D2,
              sinD1D2,
              sunBelowHorizon,
              f1,
              clipToHorizon,
              shadowDegreesStepSize,
            );
            outlineNbPt = buildShadowOutlineHA(
              0.0,
              Q1,
              outlineNbPt,
              x,
              y,
              d,
              M,
              l1,
              rho1,
              rho2,
              cosD1D2,
              sinD1D2,
              sunBelowHorizon,
              f1,
              clipToHorizon,
              shadowDegreesStepSize,
            );
          } else
            outlineNbPt = buildShadowOutlineHA(
              Q1,
              Q2,
              0,
              x,
              y,
              d,
              M,
              l1,
              rho1,
              rho2,
              cosD1D2,
              sinD1D2,
              sunBelowHorizon,
              f1,
              clipToHorizon,
              shadowDegreesStepSize,
            );
        } else {
          if (
            checkShadowOutlineSection(
              Q,
              x,
              y,
              d,
              M,
              l1,
              omega,
              sunBelowHorizon,
              f1,
              clipToHorizon,
            ) == false
          ) {
            outlineNbPt = buildShadowOutline(
              Q2,
              360.0,
              0,
              x,
              y,
              d,
              M,
              l1,
              omega,
              sunBelowHorizon,
              f1,
              clipToHorizon,
              shadowDegreesStepSize,
            );
            outlineNbPt = buildShadowOutline(
              0.0,
              Q1,
              outlineNbPt,
              x,
              y,
              d,
              M,
              l1,
              omega,
              sunBelowHorizon,
              f1,
              clipToHorizon,
              shadowDegreesStepSize,
            );
          } else
            outlineNbPt = buildShadowOutline(
              Q1,
              Q2,
              0,
              x,
              y,
              d,
              M,
              l1,
              omega,
              sunBelowHorizon,
              f1,
              clipToHorizon,
              shadowDegreesStepSize,
            );
        }
      } else {
        if (halfwidth < 5000.0)
          outlineNbPt = buildShadowOutlineHA(
            0.0,
            360.0,
            0,
            x,
            y,
            d,
            M,
            l1,
            rho1,
            rho2,
            cosD1D2,
            sinD1D2,
            sunBelowHorizon,
            f1,
            clipToHorizon,
            shadowDegreesStepSize,
          );
        else
          outlineNbPt = buildShadowOutline(
            0.0,
            360.0,
            0,
            x,
            y,
            d,
            M,
            l1,
            omega,
            sunBelowHorizon,
            f1,
            clipToHorizon,
            shadowDegreesStepSize,
          );
      }

      return finalizeShadowOutlineResult();
    }

    function finalizeShadowOutlineResult() {
      if (!gShadowOutlineCoords.length) return undefined;
      const [firstLon, firstLat] = gShadowOutlineCoords[0];
      const [lastLon, lastLat] =
        gShadowOutlineCoords[gShadowOutlineCoords.length - 1];
      if (lastLon !== firstLon || lastLat !== firstLat) {
        gShadowOutlineCoords.push([firstLon, firstLat]);
      }
      return gShadowOutlineCoords.map(([lon, lat]) => [lon, lat]);
    }

    function buildShadowOutline(
      Q1,
      Q2,
      bufferIndex,
      x,
      y,
      d,
      M,
      l2,
      omega,
      sunBelowHorizon,
      coneSlope = f2,
      clipToHorizon = true,
      degreesStepSize = kSHADOW_DEGREES_STEPSIZE,
    ) {
      var i,
        j,
        B,
        B_Old,
        delta_B,
        Q,
        Qrad,
        l2p,
        ksi,
        eta,
        eta1,
        b1,
        b2,
        H,
        phi,
        lambda,
        alt,
        validPt;

      var deltaT = getdTValue(1);
      j = bufferIndex;
      let previousPoint = null;
      let previousAlt = null;
      for (Q = Q1; Q <= Q2; Q += degreesStepSize) {
        Qrad = Q * D2R;

        // Iterate for the flattening of the Earth
        validPt = true;
        B = 0.0;
        B_Old = 10.0;
        i = 0;
        do {
          l2p = l2 - B * coneSlope; // Cone radius (in earth's radii) in the observer's plane
          ksi = x - l2p * Math.sin(Qrad);
          eta = y - l2p * Math.cos(Qrad);
          eta1 = omega * eta;
          B = 1.0 - ksi * ksi - eta1 * eta1; // Better value of B^2
          if (B >= 0.0) B = Math.sqrt(B);
          // To allow taking into account the average refraction at low Sun elevations
          else B = -Math.sqrt(Math.abs(B));
          /*      else  // No point on Earth
      {
        validPt = false;
//        i = kITERATION_OUTLINE;
        break;
      }*/
          delta_B = Math.abs(B - B_Old);
          B_Old = B;

          i++;
        } while (delta_B > kEPSILON_OUTLINE && i < kITERATION_OUTLINE);

        if (validPt == true) {
          b1 = omega * Math.sin(d);
          b2 = kMINOR_MAJOR_RADIUS_RATIO * omega * Math.cos(d);
          H = Math.atan2(ksi, B * b2 - eta1 * b1);
          if (H < 0.0) H += kM_PI_x2;

          phi = Math.atan2(
            kLATITUDE_FLATTENING * (B * b1 + eta1 * b2) * Math.sin(H),
            ksi,
          );
          if (phi > kM_PI_d2) phi -= Math.PI;
          else if (phi < -kM_PI_d2) phi += Math.PI;
          alt = calcSunAltitude(phi, d, H);
          lambda = M - H * R2D - kSIDEREAL2SOLARTIME * deltaT;
          if (lambda > 180.0) {
            while (lambda > 180.0) lambda -= 360.0;
          } else if (lambda < -180.0) {
            while (lambda < -180.0) lambda += 360.0;
          }
          const point = [-lambda, phi * R2D];
          if (clipToHorizon) {
            const crossing = getHorizonIntersection(
              previousPoint,
              previousAlt,
              point,
              alt,
              sunBelowHorizon,
            );
            if (crossing) {
              gShadowOutlineCoords.push(crossing);
              j++;
            }
            if (alt >= sunBelowHorizon) {
              gShadowOutlineCoords.push(point);
              j++;
            }
            previousPoint = point;
            previousAlt = alt;
          } else {
            gShadowOutlineCoords.push(point);
            j++;
            previousPoint = null;
            previousAlt = null;
          }
        } else {
          previousPoint = null;
          previousAlt = null;
        }

        if (Q == Q1)
          // First iteration, so make sure the next ones occurs on an integer angle
          Q = Math.floor(Q1);
        else if (Q + degreesStepSize > Q2 && Q != Q2)
          // Prepare for the last iteration
          Q = Q2 - degreesStepSize;
      }

      return j;
    }

    function buildShadowOutlineHA(
      Q1,
      Q2,
      bufferIndex,
      x,
      y,
      d,
      M,
      l2,
      rho1,
      rho2,
      cosD1D2,
      sinD1D2,
      sunBelowHorizon,
      coneSlope = f2,
      clipToHorizon = true,
      degreesStepSize = kSHADOW_DEGREES_STEPSIZE,
    ) {
      var i,
        j,
        B,
        B_Old,
        delta_B,
        Q,
        Qrad,
        l2p,
        ksi,
        eta,
        eta1,
        b1,
        b2,
        H,
        phi,
        lambda,
        alt,
        validPt,
        zeta;

      var deltaT = getdTValue(1);
      j = bufferIndex;
      let previousPoint = null;
      let previousAlt = null;
      for (Q = Q1; Q <= Q2; Q += degreesStepSize) {
        Qrad = Q * D2R;

        // Iterate for the flattening of the Earth
        validPt = true;
        zeta = 0.0;
        B_Old = 10.0;
        i = 0;
        do {
          l2p = l2 - zeta * coneSlope; // Cone radius (in earth's radii) in the observer's plane
          ksi = x - l2p * Math.sin(Qrad);
          eta = y - l2p * Math.cos(Qrad);
          eta1 = eta / rho1;
          B = 1.0 - ksi * ksi - eta1 * eta1; // Better value of B^2
          if (B >= 0.0) B = Math.sqrt(B);
          // To allow taking into account the average refraction at low Sun elevations
          else B = -Math.sqrt(Math.abs(B));
          /*      else  // No point on Earth
      {
        validPt = false;
//        i = kITERATION_OUTLINE;
        break;
      }*/
          delta_B = Math.abs(B - B_Old);
          B_Old = B;
          zeta = rho2 * (B * cosD1D2 - eta1 * sinD1D2);

          i++;
        } while (delta_B > kEPSILON_OUTLINE && i < kITERATION_OUTLINE);

        if (validPt == true) {
          b1 = Math.sin(d) / rho1;
          b2 = (kMINOR_MAJOR_RADIUS_RATIO * Math.cos(d)) / rho1;
          H = Math.atan2(ksi, B * b2 - eta1 * b1);
          if (H < 0.0) H += kM_PI_x2;

          phi = Math.atan2(
            kLATITUDE_FLATTENING * (B * b1 + eta1 * b2) * Math.sin(H),
            ksi,
          );
          if (phi > kM_PI_d2) phi -= Math.PI;
          else if (phi < -kM_PI_d2) phi += Math.PI;
          alt = calcSunAltitude(phi, d, H);
          lambda = M - H * R2D - kSIDEREAL2SOLARTIME * deltaT;
          if (lambda > 180.0) {
            while (lambda > 180.0) lambda -= 360.0;
          } else if (lambda < -180.0) {
            while (lambda < -180.0) lambda += 360.0;
          }
          const point = [-lambda, phi * R2D];
          if (clipToHorizon) {
            const crossing = getHorizonIntersection(
              previousPoint,
              previousAlt,
              point,
              alt,
              sunBelowHorizon,
            );
            if (crossing) {
              gShadowOutlineCoords.push(crossing);
              j++;
            }
            if (alt >= sunBelowHorizon) {
              gShadowOutlineCoords.push(point);
              j++;
            }
            previousPoint = point;
            previousAlt = alt;
          } else {
            gShadowOutlineCoords.push(point);
            j++;
            previousPoint = null;
            previousAlt = null;
          }
        } else {
          previousPoint = null;
          previousAlt = null;
        }

        if (Q == Q1)
          // First iteration, so make sure the next ones occurs on an integer angle
          Q = Math.floor(Q1);
        else if (Q + degreesStepSize > Q2 && Q != Q2)
          // Prepare for the last iteration
          Q = Q2 - degreesStepSize;
      }

      return j;
    }

    //
    // Check to see if a point is valid or not
    function checkShadowOutlineSection(
      Q,
      x,
      y,
      d,
      M,
      l2,
      omega,
      sunBelowHorizon,
      coneSlope = f2,
      clipToHorizon = true,
    ) {
      var i, B, B_Old, delta_B, Qrad, l2p, ksi, eta, eta1, validPt;

      Qrad = Q * D2R;

      // Iterate for the flattening of the Earth
      validPt = true;
      B = 0.0;
      B_Old = 10.0;
      i = 0;
      do {
        l2p = l2 - B * coneSlope; // Cone radius (in earth's radii) in the observer's plane
        ksi = x - l2p * Math.sin(Qrad);
        eta = y - l2p * Math.cos(Qrad);
        eta1 = omega * eta;
        B = 1.0 - ksi * ksi - eta1 * eta1; // Better value of B^2
        if (B >= 0.0) B = Math.sqrt(B);
        // To allow taking into account the average refraction at low Sun elevations
        else B = -Math.sqrt(Math.abs(B));
        /*    else  // No point on Earth
    {
      validPt = false;
//      i = kITERATION_OUTLINE;
      break;
    }*/
        delta_B = Math.abs(B - B_Old);
        B_Old = B;

        i++;
      } while (delta_B > kEPSILON_OUTLINE && i < kITERATION_OUTLINE);

      if (validPt == true) {
        var b1, b2, H, phi, alt, lastAlt;

        lastAlt = -100.0;
        b1 = omega * Math.sin(d);
        b2 = kMINOR_MAJOR_RADIUS_RATIO * omega * Math.cos(d);
        H = Math.atan2(ksi, B * b2 - eta1 * b1);
        if (H < 0.0) H += kM_PI_x2;

        phi = Math.atan2(
          kLATITUDE_FLATTENING * (B * b1 + eta1 * b2) * Math.sin(H),
          ksi,
        );
        if (phi > kM_PI_d2) phi -= Math.PI;
        else if (phi < -kM_PI_d2) phi += Math.PI;
        alt = calcSunAltitude(phi, d, H);
        if (clipToHorizon) {
          if (alt >= 5.0 * sunBelowHorizon) {
            // To take into account the average refraction on the horizon (5 times to get the points below the horizon)
            if (alt < sunBelowHorizon) {
              if (
                lastAlt > alt &&
                lastAlt >= sunBelowHorizon &&
                lastAlt > -100.0
              )
                // Decreasing Sun (helps refine the on the horizon location)
                validPt = true;
              else validPt = false;
            }
            lastAlt = alt;
          } else validPt = false;
        }
      }

      return validPt;
    }

    //
    // Check to see if a point is valid or not (higher accuracy)
    function checkShadowOutlineSectionHA(
      Q,
      x,
      y,
      d,
      M,
      l2,
      rho1,
      rho2,
      cosD1D2,
      sinD1D2,
      sunBelowHorizon,
      coneSlope = f2,
      clipToHorizon = true,
    ) {
      var i, B, B_Old, delta_B, Qrad, l2p, ksi, eta, eta1, validPt, zeta;

      Qrad = Q * D2R;

      // Iterate for the flattening of the Earth
      validPt = true;
      zeta = 0.0;
      B_Old = 10.0;
      i = 0;
      do {
        l2p = l2 - zeta * coneSlope; // Cone radius (in earth's radii) in the observer's plane
        ksi = x - l2p * Math.sin(Qrad);
        eta = y - l2p * Math.cos(Qrad);
        eta1 = eta / rho1;
        B = 1.0 - ksi * ksi - eta1 * eta1; // Better value of B^2
        if (B >= 0.0) B = Math.sqrt(B);
        // To allow taking into account the average refraction at low Sun elevations
        else B = -Math.sqrt(Math.abs(B));
        /*    else  // No point on Earth
    {
      validPt = false;
//      i = kITERATION_OUTLINE;
      break;
    }*/
        delta_B = Math.abs(B - B_Old);
        B_Old = B;
        zeta = rho2 * (B * cosD1D2 - eta1 * sinD1D2);

        i++;
      } while (delta_B > kEPSILON_OUTLINE && i < kITERATION_OUTLINE);

      if (validPt == true) {
        var b1, b2, H, phi, alt, lastAlt;

        lastAlt = -100.0;
        b1 = Math.sin(d) / rho1;
        b2 = (kMINOR_MAJOR_RADIUS_RATIO * Math.cos(d)) / rho1;
        H = Math.atan2(ksi, B * b2 - eta1 * b1);
        if (H < 0.0) H += kM_PI_x2;

        phi = Math.atan2(
          kLATITUDE_FLATTENING * (B * b1 + eta1 * b2) * Math.sin(H),
          ksi,
        );
        if (phi > kM_PI_d2) phi -= Math.PI;
        else if (phi < -kM_PI_d2) phi += Math.PI;
        alt = calcSunAltitude(phi, d, H);
        if (clipToHorizon) {
          if (alt >= 5.0 * sunBelowHorizon) {
            // To take into account the average refraction on the horizon (5 times to get the points below the horizon)
            if (alt < sunBelowHorizon) {
              if (
                lastAlt > alt &&
                lastAlt >= sunBelowHorizon &&
                lastAlt > -100.0
              )
                // Decreasing Sun (helps refine the on the horizon location)
                validPt = true;
              else validPt = false;
            }
            lastAlt = alt;
          } else validPt = false;
        }
      }

      return validPt;
    }

    function getHorizonIntersection(
      previousPoint,
      previousAlt,
      currentPoint,
      currentAlt,
      horizonAlt,
    ) {
      if (!previousPoint || previousAlt === null) return undefined;
      const prevAbove = previousAlt >= horizonAlt;
      const currAbove = currentAlt >= horizonAlt;
      if (prevAbove === currAbove) return undefined;
      const deltaAlt = currentAlt - previousAlt;
      if (Math.abs(deltaAlt) < 1e-6) return undefined;
      const ratio = (horizonAlt - previousAlt) / deltaAlt;
      if (ratio <= 0 || ratio >= 1) return undefined;
      return [
        interpolateLongitude(previousPoint[0], currentPoint[0], ratio),
        previousPoint[1] + ratio * (currentPoint[1] - previousPoint[1]),
      ];
    }

    function interpolateLongitude(lon1, lon2, ratio) {
      let delta = lon2 - lon1;
      if (delta > 180.0) delta -= 360.0;
      else if (delta < -180.0) delta += 360.0;
      let lon = lon1 + ratio * delta;
      if (lon > 180.0) lon -= 360.0;
      else if (lon < -180.0) lon += 360.0;
      return lon;
    }

    data.shadowOutlineLowAccuracy = shadowOutlineLowAccuracy;
    data.shadowOutlinePenumbralLowAccuracy = shadowOutlinePenumbralLowAccuracy;

    return data as EclipseCalculationData;
  }

  return calculator;
};
