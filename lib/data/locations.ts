export interface Country {
  code: string;
  name: string;
  flag: string;
  phoneCode: string;
}

export const COUNTRIES: Country[] = [
  { code: "SO", name: "Somalia", flag: "🇸🇴", phoneCode: "+252" },
  { code: "KE", name: "Kenya", flag: "🇰🇪", phoneCode: "+254" },
  { code: "DJ", name: "Djibouti", flag: "🇩🇯", phoneCode: "+253" },
  { code: "ET", name: "Ethiopia", flag: "🇪🇹", phoneCode: "+251" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", phoneCode: "+971" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", phoneCode: "+44" },
  { code: "US", name: "United States", flag: "🇺🇸", phoneCode: "+1" },
  { code: "CA", name: "Canada", flag: "🇨🇦", phoneCode: "+1" },
  { code: "SE", name: "Sweden", flag: "🇸🇪", phoneCode: "+46" },
  { code: "NO", name: "Norway", flag: "🇳🇴", phoneCode: "+47" },
  { code: "DE", name: "Germany", flag: "🇩🇪", phoneCode: "+49" },
  { code: "TR", name: "Turkey", flag: "🇹🇷", phoneCode: "+90" },
  { code: "QA", name: "Qatar", flag: "🇶🇦", phoneCode: "+974" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦", phoneCode: "+966" },
  { code: "EG", name: "Egypt", flag: "🇪🇬", phoneCode: "+20" },
  { code: "UG", name: "Uganda", flag: "🇺🇬", phoneCode: "+256" },
  { code: "TZ", name: "Tanzania", flag: "🇹🇿", phoneCode: "+255" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", phoneCode: "+27" },
  { code: "AU", name: "Australia", flag: "🇦🇺", phoneCode: "+61" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱", phoneCode: "+31" },
  { code: "FR", name: "France", flag: "🇫🇷", phoneCode: "+33" },
  { code: "IT", name: "Italy", flag: "🇮🇹", phoneCode: "+39" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭", phoneCode: "+41" },
  { code: "FI", name: "Finland", flag: "🇫🇮", phoneCode: "+358" },
  { code: "DK", name: "Denmark", flag: "🇩🇰", phoneCode: "+45" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾", phoneCode: "+60" },
  { code: "IN", name: "India", flag: "🇮🇳", phoneCode: "+91" },
  { code: "CN", name: "China", flag: "🇨🇳", phoneCode: "+86" },
];

export interface RegionCities {
  region: string;
  cities: string[];
}

export const SOMALI_REGIONS_CITIES: RegionCities[] = [
  {
    region: "Banaadir",
    cities: ["Mogadishu (Xamar)", "Hodan", "Karaan", "Wadajir", "Howlwadaag", "Yaaqshiid", "Shibis", "Waaberi", "Dayniile", "Kaxda", "Dharkenley"],
  },
  {
    region: "Somaliland & North",
    cities: ["Hargeisa", "Berbera", "Borama (Boorama)", "Burco (Burao)", "Erigavo (Ceerigaabo)", "Las Anod (Laas Caanood)", "Gabiley", "Zeila (Saylac)", "Sheikh", "Badhan", "Buhoodle"],
  },
  {
    region: "Puntland",
    cities: ["Garowe", "Bosaso (Boosaaso)", "Galkayo (Gaalkacyo)", "Qardho", "Eyl", "Galdogob", "Dhahar", "Bandar Beyla"],
  },
  {
    region: "Jubaland",
    cities: ["Kismayo", "Bardhere (Baardheere)", "Luuq", "Garbahaarreey", "Bu'aale", "Jilib", "Jamame (Jammaame)", "Afmadow", "Dhobley"],
  },
  {
    region: "South West State",
    cities: ["Baidoa (Baydhabo)", "Barawe (Baraawe)", "Merca (Marka)", "Afgooye", "Dinsoor (Diinsoor)", "Wajid (Waajid)", "Hudur (Xudur)", "Qoryoley", "Wanlaweyn"],
  },
  {
    region: "Hirshabelle",
    cities: ["Beledweyne", "Jowhar", "Buloburde (Buuloburde)", "Jalalaqsi", "Balad (Bal'ad)", "Mahaday"],
  },
  {
    region: "Galmudug",
    cities: ["Dhusamareb (Dhuusamareeb)", "Adado (Cadaado)", "Guricel (Guriceel)", "Abudwak (Caabudwaaq)", "Hobyo", "Harardhere", "Elbuur (Ceelbuur)"],
  },
];

/** Flat list of all Somali cities for easy dropdown mapping */
export const ALL_SOMALI_CITIES: string[] = Array.from(
  new Set(SOMALI_REGIONS_CITIES.flatMap((r) => r.cities))
).sort();

/** Popular international cities for key countries */
export const GLOBAL_CITIES: Record<string, string[]> = {
  KE: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Malindi", "Garissa", "Wajir", "Mandera"],
  DJ: ["Djibouti City", "Ali Sabieh", "Tadjoura", "Dikhil", "Obock"],
  ET: ["Addis Ababa", "Dire Dawa", "Jigjiga", "Hawassa", "Gondar", "Mekelle"],
  AE: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Al Ain"],
  GB: ["London", "Birmingham", "Manchester", "Bristol", "Leeds", "Glasgow", "Liverpool", "Sheffield"],
  US: ["Minneapolis", "Columbus", "Seattle", "Atlanta", "Dallas", "Houston", "Chicago", "Los Angeles", "New York", "Washington D.C."],
  CA: ["Toronto", "Edmonton", "Calgary", "Vancouver", "Ottawa", "Montreal"],
  SE: ["Stockholm", "Gothenburg", "Malmö", "Uppsala", "Örebro"],
  NO: ["Oslo", "Bergen", "Trondheim", "Stavanger"],
  DE: ["Berlin", "Frankfurt", "Munich", "Hamburg", "Cologne"],
  TR: ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya"],
};
