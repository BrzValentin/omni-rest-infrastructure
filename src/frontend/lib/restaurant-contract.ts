export type HourInterval = { opensAt: string; closesAt: string; closesNextDay: boolean };
export type Address = {
  line1: string; line2: string | null; city: string; region: string;
  postalCode: string; countryCode: string; latitude: number | null; longitude: number | null;
};
export type RegularHoursDay = { dayOfWeek: number; intervals: HourInterval[] };
export type SpecialHours = { id: string; date: string; isClosed: boolean; note: string | null; intervals: HourInterval[] };
export type SocialLink = { platform: string; url: string };
export type MediaVariant = { url: string; width: number; height: number };
export type MainImage = { id: string; altText: string; processingStatus: string; variants: MediaVariant[] };
export type AdminMediaAsset = MainImage;
export type PublicationStatus = {
  operationId: string; status: string; draftVersion: string; attemptCount: number;
  errorCode: string | null; updatedAt: string;
};
export type AdminRestaurant = {
  id: string; name: string; description: string | null; phoneE164: string | null;
  phoneDisplay: string | null; email: string | null; timeZone: string; address: Address | null;
  regularHours: RegularHoursDay[]; specialHours: SpecialHours[]; socialLinks: SocialLink[];
  mainImage: MainImage | null; draftVersion: string; eTag: string; publicationStatus: PublicationStatus | null;
};
export type AdminMutation = { restaurant: AdminRestaurant; publication: PublicationStatus };
export type PublicRestaurant = {
  id: string; name: string; shortDescription: string | null;
  phone: { e164: string; display: string } | null; email: string | null; timeZone: string;
  address: ({ streetLine1: string; streetLine2: string | null; city: string; region: string;
    postalCode: string; countryCode: string; formatted: string; directionsUrl: string }) | null;
  regularHours: RegularHoursDay[]; specialHours: Omit<SpecialHours, "id">[];
  status: { state: string; label: string; nextChangeAt: string | null; source: string };
  socialLinks: SocialLink[]; mainImage: Omit<MainImage, "id" | "processingStatus"> | null;
  publicationVersion: string;
};
