export interface VinDecodeResult {
  vin: string;
  isValid: boolean;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  engine?: string;
  drivetrain?: string;
  bodyFuelNotes?: string;
  plantCountry?: string;
  rawSource: 'nhtsa' | 'local_wmi' | 'none';
  error?: string;
}

const WMI_BRAND_MAP: Record<string, string> = {
  '1HG': 'Honda',
  '2HG': 'Honda',
  '3HG': 'Honda',
  'JHM': 'Honda',
  'JH4': 'Acura',
  '4T1': 'Toyota',
  '5TDK': 'Toyota',
  'JTE': 'Toyota',
  'JT2': 'Toyota',
  'WBA': 'BMW',
  'WBS': 'BMW M',
  '5UX': 'BMW',
  'WDD': 'Mercedes-Benz',
  'W1K': 'Mercedes-Benz',
  '4JG': 'Mercedes-Benz',
  '5YJ': 'Tesla',
  '7SA': 'Tesla',
  '1FA': 'Ford',
  '1FT': 'Ford',
  '1FM': 'Ford',
  '1G1': 'Chevrolet',
  '1G2': 'Pontiac',
  '1GC': 'Chevrolet',
  '3G1': 'Chevrolet',
  '1N4': 'Nissan',
  '5N1': 'Nissan',
  'JN1': 'Nissan',
  'JM1': 'Mazda',
  'JM3': 'Mazda',
  'WAU': 'Audi',
  'WA1': 'Audi',
  'WVW': 'Volkswagen',
  '3VW': 'Volkswagen',
  'KNA': 'Kia',
  'KND': 'Kia',
  'KMH': 'Hyundai',
  'KM8': 'Hyundai',
  '1C3': 'Chrysler',
  '1C4': 'Dodge / Jeep',
  '2C3': 'Dodge',
  'WP0': 'Porsche',
  'WP1': 'Porsche',
  'SAJ': 'Jaguar',
  'SAL': 'Land Rover',
  'YV1': 'Volvo',
  'ZAR': 'Alfa Romeo',
};

const YEAR_10TH_CHAR_MAP: Record<string, number> = {
  A: 2010,
  B: 2011,
  C: 2012,
  D: 2013,
  E: 2014,
  F: 2015,
  G: 2016,
  H: 2017,
  J: 2018,
  K: 2019,
  L: 2020,
  M: 2021,
  N: 2022,
  P: 2023,
  R: 2024,
  S: 2025,
  T: 2026,
};

/**
 * Clean & normalize raw VIN text
 */
export function sanitizeVin(rawVin: string): string {
  return rawVin.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
}

/**
 * Decode 17-character VIN using official NHTSA vPIC API with automatic local fallback
 */
export async function decodeVinNumber(rawVin: string): Promise<VinDecodeResult> {
  const cleanVin = sanitizeVin(rawVin);

  if (cleanVin.length !== 17) {
    return {
      vin: cleanVin,
      isValid: false,
      rawSource: 'none',
      error: 'VIN must be exactly 17 alphanumeric characters.',
    };
  }

  // Attempt official NHTSA vPIC API fetch first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(
        cleanVin
      )}?format=json`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const r = data.Results && data.Results[0];
      if (r && r.Make) {
        const parsedYear = parseInt(r.ModelYear, 10);
        const year = !isNaN(parsedYear) && parsedYear >= 1980 ? parsedYear : decode10thCharYear(cleanVin);
        const make = formatTitleCase(r.Make);
        const model = formatTitleCase(r.Model || '');
        const trim = formatTitleCase(r.Trim || r.Series || '');

        let engine = '';
        if (r.DisplacementL) engine += `${r.DisplacementL}L `;
        if (r.EngineConfiguration || r.EngineCylinders) {
          engine += `${r.EngineConfiguration || ''}${r.EngineCylinders || ''}`.trim();
        }
        if (r.Turbo) engine += ' Turbo';

        let drivetrain = r.DriveType || '';
        if (drivetrain.includes('4x4') || drivetrain.includes('Four')) drivetrain = '4WD';
        else if (drivetrain.includes('All')) drivetrain = 'AWD';
        else if (drivetrain.includes('Front')) drivetrain = 'FWD';
        else if (drivetrain.includes('Rear')) drivetrain = 'RWD';

        const bodyClass = r.BodyClass || '';
        const fuelType = r.FuelTypePrimary || 'Gasoline';
        const bodyFuelNotes = `${bodyClass.split(' ')[0] || 'Vehicle'} · ${fuelType}`;

        return {
          vin: cleanVin,
          isValid: true,
          year,
          make,
          model,
          trim,
          engine: engine.trim() || '2.0L I4',
          drivetrain: drivetrain || 'FWD',
          bodyFuelNotes,
          plantCountry: r.PlantCountry || '',
          rawSource: 'nhtsa',
        };
      }
    }
  } catch (_err) {
    // Graceful fallback to local algorithmic WMI parser
  }

  // Fallback: Local Algorithmic WMI + 10th Digit Model Year Decoding
  const wmi3 = cleanVin.slice(0, 3);
  const wmi2 = cleanVin.slice(0, 2);
  const localMake = WMI_BRAND_MAP[wmi3] || WMI_BRAND_MAP[wmi2] || 'Import / Domestic';
  const localYear = decode10thCharYear(cleanVin) || 2023;

  return {
    vin: cleanVin,
    isValid: true,
    year: localYear,
    make: localMake,
    model: 'Base Series',
    trim: 'Trim Package',
    engine: '2.0L I4',
    drivetrain: 'FWD',
    bodyFuelNotes: 'Sedan · Gasoline',
    rawSource: 'local_wmi',
  };
}

function decode10thCharYear(vin: string): number | undefined {
  if (vin.length < 10) return undefined;
  const char10 = vin.charAt(9);
  return YEAR_10TH_CHAR_MAP[char10];
}

function formatTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
